import { describe, it, expect, vi, beforeEach } from "vitest";
import { pack } from "msgpackr";
import { DurableSyncClient } from "./DurableSyncClient";

type MockWs = {
  listeners: Record<string, ((ev: MessageEvent | CloseEvent) => void)[]>;
  addEventListener: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
  emit: (event: string, data?: unknown) => void;
};

function makeMockWs(): MockWs {
  const ws: MockWs = {
    listeners: {},
    addEventListener: vi.fn((event: string, fn: (ev: MessageEvent | CloseEvent) => void) => {
      ws.listeners[event] = ws.listeners[event] ?? [];
      ws.listeners[event]!.push(fn);
    }),
    close: vi.fn(),
    emit(event: string, data?: unknown) {
      for (const fn of ws.listeners[event] ?? []) {
        fn(data as MessageEvent);
      }
    },
  };
  return ws;
}

let mockWs: MockWs;

beforeEach(() => {
  mockWs = makeMockWs();
  // WebSocket をコンストラクタとして差し替え
  vi.stubGlobal("WebSocket", function MockWebSocket() {
    return mockWs;
  });
});

function sendPatch(data: Record<string, unknown>) {
  const u8 = pack({ type: "patch", data });
  // Node の Buffer は共有 ArrayBuffer を持つため slice でコピーして渡す
  const buf = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  mockWs.emit("message", { data: buf } as MessageEvent);
}

// ---------------------------------------------------------------------------
// 8. DurableSyncClient — パッチ受信とstate更新（024）
// ---------------------------------------------------------------------------
describe("DurableSyncClient — パッチ受信とstate更新", () => {
  it("8-1: フラットなパッチが getState() に反映される", () => {
    const client = new DurableSyncClient("ws://test", { hp: 100 });
    sendPatch({ hp: 90 });
    expect(client.getState().hp).toBe(90);
    client.close();
  });

  it("8-2: ネストしたパスのパッチが正しくマージされる", () => {
    const client = new DurableSyncClient("ws://test", { player: { x: 0, y: 0 } });
    sendPatch({ "player.x": 10 });
    expect((client.getState().player as Record<string, unknown>).x).toBe(10);
    expect((client.getState().player as Record<string, unknown>).y).toBe(0);
    client.close();
  });

  it("8-3: onChange コールバックがパッチごとに呼ばれる", () => {
    const client = new DurableSyncClient("ws://test", { hp: 100 });
    const fn = vi.fn();
    client.onChange(fn);
    sendPatch({ hp: 80 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn.mock.calls[0]![0]).toMatchObject({ hp: 80 });
    client.close();
  });

  it("8-4: onKeyChange は対象キーが変わったときだけ呼ばれる", () => {
    const client = new DurableSyncClient("ws://test", { hp: 100, mp: 50 });
    const fn = vi.fn();
    client.onKeyChange("hp", fn);
    sendPatch({ mp: 30 });
    expect(fn).not.toHaveBeenCalled();
    sendPatch({ hp: 80 });
    expect(fn).toHaveBeenCalledWith(80);
    client.close();
  });

  it("8-5: onChange の unsubscribe で呼ばれなくなる", () => {
    const client = new DurableSyncClient("ws://test", { hp: 100 });
    const fn = vi.fn();
    const unsub = client.onChange(fn);
    unsub();
    sendPatch({ hp: 70 });
    expect(fn).not.toHaveBeenCalled();
    client.close();
  });

  it("8-6: Map op:'set' パッチが Map に反映される", () => {
    const client = new DurableSyncClient("ws://test", { players: new Map<string, number>() });
    sendPatch({ players: { op: "set", key: "p1", value: 5 } });
    expect((client.getState().players as Map<string, number>).get("p1")).toBe(5);
    client.close();
  });

  it("8-7: Map op:'delete' パッチが Map に反映される", () => {
    const client = new DurableSyncClient("ws://test", {
      players: new Map<string, number>([["p1", 5]]),
    });
    sendPatch({ players: { op: "delete", key: "p1" } });
    expect((client.getState().players as Map<string, number>).has("p1")).toBe(false);
    client.close();
  });

  it("8-8: 配列の MapPatch が来たとき全 set 操作が順に適用される", () => {
    const client = new DurableSyncClient("ws://test", { players: new Map<string, number>() });
    sendPatch({
      players: [
        { op: "set", key: "p1", value: 1 },
        { op: "set", key: "p1", value: 2 },
      ],
    });
    expect((client.getState().players as Map<string, number>).get("p1")).toBe(2);
    client.close();
  });

  it("8-9: 配列内に set と delete が混ざっても順序通りに反映される", () => {
    const client = new DurableSyncClient("ws://test", {
      players: new Map<string, number>([["p1", 5]]),
    });
    sendPatch({
      players: [
        { op: "set", key: "p2", value: 9 },
        { op: "delete", key: "p1" },
        { op: "set", key: "p3", value: 7 },
      ],
    });
    const m = client.getState().players as Map<string, number>;
    expect(m.has("p1")).toBe(false);
    expect(m.get("p2")).toBe(9);
    expect(m.get("p3")).toBe(7);
    client.close();
  });

  it("8-10: 既存に Map が無くても配列 MapPatch から新規 Map が作られる", () => {
    const client = new DurableSyncClient("ws://test", {} as Record<string, unknown>);
    sendPatch({
      players: [
        { op: "set", key: "p1", value: 1 },
        { op: "set", key: "p2", value: 2 },
      ],
    });
    const m = client.getState().players as Map<string, number>;
    expect(m).toBeInstanceOf(Map);
    expect(m.get("p1")).toBe(1);
    expect(m.get("p2")).toBe(2);
    client.close();
  });

  it("8-11: 配列 MapPatch でも onChange は 1 回、onKeyChange は値変化で 1 回呼ばれる", () => {
    const client = new DurableSyncClient("ws://test", { players: new Map<string, number>() });
    const onChange = vi.fn();
    const onKey = vi.fn();
    client.onChange(onChange);
    client.onKeyChange("players", onKey);
    sendPatch({
      players: [
        { op: "set", key: "p1", value: 1 },
        { op: "set", key: "p1", value: 2 },
      ],
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onKey).toHaveBeenCalledTimes(1);
    expect((onKey.mock.calls[0]![0] as Map<string, number>).get("p1")).toBe(2);
    client.close();
  });
});
