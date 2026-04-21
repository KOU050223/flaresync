import { unpack } from "msgpackr";

type MapPatch = { op: "set"; key: string; value: unknown } | { op: "delete"; key: string };

type PatchMessage = {
  type: "patch";
  data: Record<string, unknown | MapPatch>;
};

type ChangeListener<T> = (state: T) => void;
type KeyChangeListener = (value: unknown) => void;

function applyPatch<T extends Record<string, unknown>>(state: T, data: Record<string, unknown>): T {
  const next: Record<string, unknown> = { ...state };
  for (const [path, value] of Object.entries(data)) {
    const keys = path.split(".");
    if (keys.length === 1) {
      if (value !== null && typeof value === "object" && "op" in (value as object)) {
        const mp = value as MapPatch;
        const existing = next[path];
        const map: Map<string, unknown> = existing instanceof Map ? new Map(existing) : new Map();
        if (mp.op === "set") {
          map.set(mp.key, mp.value);
        } else {
          map.delete(mp.key);
        }
        next[path] = map;
      } else {
        next[path] = value;
      }
    } else {
      // nested path: "a.b.c" → set deep
      let cur: Record<string, unknown> = next;
      for (let i = 0; i < keys.length - 1; i++) {
        const k = keys[i]!;
        if (!(k in cur) || typeof cur[k] !== "object" || cur[k] === null) {
          cur[k] = {};
        }
        cur[k] = { ...(cur[k] as Record<string, unknown>) };
        cur = cur[k] as Record<string, unknown>;
      }
      cur[keys[keys.length - 1]!] = value;
    }
  }
  return next as T;
}

export class DurableSyncClient<T extends Record<string, unknown>> {
  private ws: WebSocket | null = null;
  private state: T;
  private changeListeners: ChangeListener<T>[] = [];
  private keyListeners = new Map<string, KeyChangeListener[]>();
  private reconnectDelay = 1000;
  private closed = false;

  constructor(
    private url: string,
    initial: T,
  ) {
    this.state = { ...initial };
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    this.ws = new WebSocket(this.url);
    this.ws.addEventListener("message", (ev) => this.handleMessage(ev));
    this.ws.addEventListener("close", () => {
      if (!this.closed) {
        setTimeout(() => this.connect(), this.reconnectDelay);
      }
    });
  }

  private handleMessage(ev: MessageEvent): void {
    let msg: PatchMessage;
    try {
      msg = unpack(new Uint8Array(ev.data as ArrayBuffer)) as PatchMessage;
    } catch {
      return;
    }
    if (msg.type !== "patch") return;

    const prev = this.state;
    this.state = applyPatch(this.state, msg.data as Record<string, unknown>);

    this.changeListeners.forEach((fn) => fn(this.state));

    for (const [key, listeners] of this.keyListeners) {
      const prevVal = this.getDeep(prev, key);
      const nextVal = this.getDeep(this.state, key);
      if (prevVal !== nextVal) {
        listeners.forEach((fn) => fn(nextVal));
      }
    }
  }

  private getDeep(obj: Record<string, unknown>, path: string): unknown {
    return path
      .split(".")
      .reduce<unknown>(
        (cur, k) =>
          cur !== null && typeof cur === "object" ? (cur as Record<string, unknown>)[k] : undefined,
        obj,
      );
  }

  getState(): T {
    return this.state;
  }

  onChange(fn: ChangeListener<T>): () => void {
    this.changeListeners.push(fn);
    return () => {
      this.changeListeners = this.changeListeners.filter((l) => l !== fn);
    };
  }

  onKeyChange(key: string, fn: KeyChangeListener): () => void {
    if (!this.keyListeners.has(key)) this.keyListeners.set(key, []);
    this.keyListeners.get(key)!.push(fn);
    return () => {
      const arr = this.keyListeners.get(key) ?? [];
      this.keyListeners.set(
        key,
        arr.filter((l) => l !== fn),
      );
    };
  }

  close(): void {
    this.closed = true;
    this.ws?.close();
  }
}
