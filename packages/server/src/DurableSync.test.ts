import { describe, it, expect, vi } from "vitest";
import { DurableSync } from "./DurableSync";

type MockWs = { send: ReturnType<typeof vi.fn> };

function makeCtx(wsSockets: MockWs[] = []) {
  return {
    storage: { setAlarm: vi.fn() },
    getWebSockets: vi.fn(() => wsSockets),
  } as unknown as DurableObjectState;
}

function sentPatches(ws: MockWs) {
  return ws.send.mock.calls.map((args) => JSON.parse(args[0] as string));
}

// ---------------------------------------------------------------------------
// 1. Proxy / dirtyKeys
// ---------------------------------------------------------------------------
describe("Proxy / dirtyKeys", () => {
  it("1-1: 代入が state に反映される", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    expect(sync.state.hp).toBe(90);
  });

  it("1-2: 変更キーが alarm 後のパッチに含まれる", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    expect(sentPatches(ws)[0]).toEqual({ type: "patch", data: { hp: 90 } });
  });

  it("1-3: 複数キーをまとめて 1 回の alarm で送信する", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100, x: 0 }, ctx);
    sync.state.hp = 90;
    sync.state.x = 5;
    await sync.alarm();
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(sentPatches(ws)[0].data).toEqual({ hp: 90, x: 5 });
  });

  it("1-4: 同じキーを複数回書いたとき最新値だけが送信される", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 80;
    sync.state.hp = 70;
    await sync.alarm();
    expect(ws.send).toHaveBeenCalledTimes(1);
    expect(sentPatches(ws)[0].data).toEqual({ hp: 70 });
  });

  it("1-5: Symbol キーは dirty に追加されない", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync<Record<string | symbol, unknown>>({}, ctx);
    (sync.state as Record<symbol, unknown>)[Symbol("foo")] = 1;
    await sync.alarm();
    expect(ws.send).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// 2. alarm スケジューリング
// ---------------------------------------------------------------------------
describe("alarm スケジューリング", () => {
  it("2-1: 初回 set で setAlarm が 1 回呼ばれる", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    expect(ctx.storage.setAlarm).toHaveBeenCalledTimes(1);
  });

  it("2-2: 2 回目の set では setAlarm が追加で呼ばれない", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    sync.state.hp = 80;
    expect(ctx.storage.setAlarm).toHaveBeenCalledTimes(1);
  });

  it("2-3: alarm 後の再 set で setAlarm が再び呼ばれる", async () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    sync.state.hp = 60;
    expect(ctx.storage.setAlarm).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// 3. broadcastDirtyKeys / 送信内容
// ---------------------------------------------------------------------------
describe("broadcastDirtyKeys / 送信内容", () => {
  it("3-1: dirty なキーのみ送信される（未変更キーは含まれない）", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100, tick: 0 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    expect(sentPatches(ws)[0].data).not.toHaveProperty("tick");
    expect(sentPatches(ws)[0].data).toHaveProperty("hp", 90);
  });

  it("3-2: alarm 後に dirtyKeys がクリアされ 2 回目の alarm では送信しない", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    await sync.alarm();
    expect(ws.send).toHaveBeenCalledTimes(1);
  });

  it("3-3: 複数 WebSocket 全員に送信される", async () => {
    const sockets = [{ send: vi.fn() }, { send: vi.fn() }, { send: vi.fn() }];
    const ctx = makeCtx(sockets);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    for (const ws of sockets) {
      expect(ws.send).toHaveBeenCalledTimes(1);
    }
  });

  it("3-4: dirty なし → ws.send が呼ばれない", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    await sync.alarm();
    expect(ws.send).not.toHaveBeenCalled();
  });

  it("3-5: 送信 JSON が { type: 'patch', data: { ... } } の構造を持つ", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    await sync.alarm();
    const msg = sentPatches(ws)[0];
    expect(msg).toHaveProperty("type", "patch");
    expect(msg).toHaveProperty("data");
    expect(typeof msg.data).toBe("object");
  });
});

// ---------------------------------------------------------------------------
// 4. alarm 再スケジュール
// ---------------------------------------------------------------------------
describe("alarm 再スケジュール", () => {
  it("4-1: 接続者あり → alarm 後に次の setAlarm が呼ばれる", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    const beforeCount = (ctx.storage.setAlarm as ReturnType<typeof vi.fn>).mock.calls.length;
    await sync.alarm();
    const afterCount = (ctx.storage.setAlarm as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(afterCount).toBe(beforeCount + 1);
  });

  it("4-2: 接続者ゼロ → alarm 後に setAlarm が呼ばれない", async () => {
    const ctx = makeCtx([]);
    const sync = new DurableSync({ hp: 100 }, ctx);
    sync.state.hp = 90;
    const beforeCount = (ctx.storage.setAlarm as ReturnType<typeof vi.fn>).mock.calls.length;
    await sync.alarm();
    const afterCount = (ctx.storage.setAlarm as ReturnType<typeof vi.fn>).mock.calls.length;
    expect(afterCount).toBe(beforeCount);
  });
});

// ---------------------------------------------------------------------------
// 5. ネストしたオブジェクトの Proxy 化（020）
// ---------------------------------------------------------------------------
describe("ネストしたオブジェクトの Proxy 化", () => {
  it("5-1: ネストした代入が state に反映される", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ player: { x: 0, y: 0 } }, ctx);
    sync.state.player.x = 10;
    expect(sync.state.player.x).toBe(10);
  });

  it("5-2: ネストした代入がパッチに含まれる（パスがキー）", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ player: { x: 0, y: 0 } }, ctx);
    sync.state.player.x = 10;
    await sync.alarm();
    const patch = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(patch.data).toHaveProperty("player.x", 10);
  });

  it("5-3: 深さ2以上のネストも正しく伝播する", async () => {
    const ws = { send: vi.fn() };
    const ctx = makeCtx([ws]);
    const sync = new DurableSync({ a: { b: { c: 0 } } }, ctx);
    sync.state.a.b.c = 99;
    await sync.alarm();
    const patch = JSON.parse(ws.send.mock.calls[0][0] as string);
    expect(patch.data).toHaveProperty("a.b.c", 99);
  });
});

// ---------------------------------------------------------------------------
// 6. WeakMap キャッシュによる参照等価性（021）
// ---------------------------------------------------------------------------
describe("WeakMap キャッシュによる参照等価性", () => {
  it("6-1: 同じネストオブジェクトへのアクセスは同一 Proxy を返す", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ player: { x: 0 } }, ctx);
    expect(sync.state.player).toBe(sync.state.player);
  });

  it("6-2: Proxy 越しに取得した値は元の値と等しい", () => {
    const ctx = makeCtx();
    const sync = new DurableSync({ player: { x: 42 } }, ctx);
    expect(sync.state.player.x).toBe(42);
  });
});
