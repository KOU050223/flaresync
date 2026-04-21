type MapPatch = { op: "set"; key: unknown; value: unknown } | { op: "delete"; key: unknown };

export class DurableSync<T extends object> {
  private dirtyKeys = new Set<string>();
  private dirtyMapPatches = new Map<string, MapPatch[]>();
  private alarmScheduled = false;
  private proxyCache = new WeakMap<object, object>();
  private mapProxyCache = new Map<string, Map<unknown, unknown>>();
  private rawTarget: T;
  readonly state: T;

  constructor(
    initial: T,
    private ctx: DurableObjectState,
  ) {
    this.rawTarget = initial;
    this.state = this.proxify(initial, "") as T;
  }

  static async create<T extends object>(
    initial: T,
    ctx: DurableObjectState,
  ): Promise<DurableSync<T>> {
    const stored = await ctx.storage.get<T>("__state");
    return new DurableSync<T>(stored ?? initial, ctx);
  }

  private markDirty(): void {
    if (!this.alarmScheduled) {
      this.alarmScheduled = true;
      void this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }

  private addMapPatch(path: string, patch: MapPatch): void {
    if (!this.dirtyMapPatches.has(path)) this.dirtyMapPatches.set(path, []);
    this.dirtyMapPatches.get(path)!.push(patch);
    this.dirtyKeys.add(path);
    this.markDirty();
  }

  private proxifyMap(map: Map<unknown, unknown>, path: string): Map<unknown, unknown> {
    const cached = this.mapProxyCache.get(path);
    if (cached) return cached;

    const proxy = new Proxy(map, {
      get: (target, prop) => {
        if (prop === "set") {
          return (key: unknown, value: unknown): Map<unknown, unknown> => {
            target.set(key, value);
            this.addMapPatch(path, { op: "set", key, value });
            return proxy;
          };
        }
        if (prop === "delete") {
          return (key: unknown): boolean => {
            const deleted = target.delete(key);
            this.addMapPatch(path, { op: "delete", key });
            return deleted;
          };
        }
        const val = Reflect.get(target, prop, target);
        return typeof val === "function" ? val.bind(target) : val;
      },
    });

    this.mapProxyCache.set(path, proxy);
    return proxy;
  }

  private proxify(obj: object, basePath: string): object {
    if (this.proxyCache.has(obj)) return this.proxyCache.get(obj)!;

    const proxy = new Proxy(obj, {
      get: (target, prop) => {
        if (typeof prop !== "string") return Reflect.get(target, prop);
        const val = (target as Record<string, unknown>)[prop];
        if (val instanceof Map) {
          const path = basePath ? `${basePath}.${prop}` : prop;
          return this.proxifyMap(val as Map<unknown, unknown>, path);
        }
        if (val !== null && typeof val === "object") {
          const path = basePath ? `${basePath}.${prop}` : prop;
          return this.proxify(val as object, path);
        }
        return val;
      },
      set: (target, prop, value) => {
        (target as Record<string | symbol, unknown>)[prop] = value;
        if (typeof prop === "string") {
          const path = basePath ? `${basePath}.${prop}` : prop;
          this.dirtyKeys.add(path);
          this.markDirty();
        }
        return true;
      },
    });

    this.proxyCache.set(obj, proxy);
    return proxy;
  }

  private getNestedValue(path: string): unknown {
    const keys = path.split(".");
    let cur: unknown = this.state;
    for (const k of keys) {
      if (cur instanceof Map) {
        cur = cur.get(k);
      } else {
        cur = (cur as Record<string, unknown>)[k];
      }
      if (cur === undefined) return undefined;
    }
    return cur;
  }

  private async broadcastDirtyKeys(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;

    const patch: Record<string, unknown> = {};
    for (const path of this.dirtyKeys) {
      if (this.dirtyMapPatches.has(path)) {
        const patches = this.dirtyMapPatches.get(path)!;
        patch[path] = patches.length === 1 ? patches[0] : patches;
      } else {
        patch[path] = this.getNestedValue(path);
      }
    }
    this.dirtyKeys.clear();
    this.dirtyMapPatches.clear();

    const message = JSON.stringify({ type: "patch", data: patch });
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(message);
    }
  }

  async alarm(): Promise<void> {
    this.alarmScheduled = false;
    await this.broadcastDirtyKeys();
    await this.ctx.storage.put("__state", this.rawTarget);
    if (this.ctx.getWebSockets().length > 0) {
      this.alarmScheduled = true;
      await this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }
}
