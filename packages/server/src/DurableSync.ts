export class DurableSync<T extends object> {
  private dirtyKeys = new Set<string>();
  private alarmScheduled = false;
  readonly state: T;

  constructor(
    initial: T,
    private ctx: DurableObjectState,
  ) {
    this.state = this.proxify(initial) as T;
  }

  private proxify(obj: object): object {
    return new Proxy(obj, {
      set: (target, prop, value) => {
        (target as Record<string | symbol, unknown>)[prop] = value;
        if (typeof prop === "string") {
          this.dirtyKeys.add(prop);
          if (!this.alarmScheduled) {
            this.alarmScheduled = true;
            void this.ctx.storage.setAlarm(Date.now() + 50);
          }
        }
        return true;
      },
    });
  }

  private async broadcastDirtyKeys(): Promise<void> {
    if (this.dirtyKeys.size === 0) return;

    const patch: Record<string, unknown> = {};
    for (const key of this.dirtyKeys) {
      patch[key] = (this.state as Record<string, unknown>)[key];
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
