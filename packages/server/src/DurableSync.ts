export class DurableSync<T extends object> {
  private dirtyKeys = new Set<string>();
  private alarmScheduled = false;
  private proxyCache = new WeakMap<object, object>();
  readonly state: T;

  constructor(
    initial: T,
    private ctx: DurableObjectState,
  ) {
    this.state = this.proxify(initial, "") as T;
  }

  private markDirty(): void {
    if (!this.alarmScheduled) {
      this.alarmScheduled = true;
      void this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }

  private proxify(obj: object, basePath: string): object {
    if (this.proxyCache.has(obj)) return this.proxyCache.get(obj)!;

    const proxy = new Proxy(obj, {
      get: (target, prop) => {
        if (typeof prop !== "string") return Reflect.get(target, prop);
        const val = (target as Record<string, unknown>)[prop];
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
      cur = (cur as Record<string, unknown>)[k];
      if (cur === undefined) return undefined;
    }
    return cur;
  }

  private async broadcastDirtyKeys(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;

    const patch: Record<string, unknown> = {};
    for (const path of this.dirtyKeys) {
      patch[path] = this.getNestedValue(path);
    }
    this.dirtyKeys.clear();

    const message = JSON.stringify({ type: "patch", data: patch });
    for (const ws of this.ctx.getWebSockets()) {
      ws.send(message);
    }
  }

  async alarm(): Promise<void> {
    this.alarmScheduled = false;
    await this.broadcastDirtyKeys();
    if (this.ctx.getWebSockets().length > 0) {
      this.alarmScheduled = true;
      await this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }
}
