import { pack } from "msgpackr";

type MapPatch = { op: "set"; key: string; value: unknown } | { op: "delete"; key: string };
type PatchMessage = { type: "patch"; data: Record<string, unknown | MapPatch | MapPatch[]> };

const encoder = new TextEncoder();

function measure(label: string, msg: PatchMessage) {
  const jsonBytes = encoder.encode(JSON.stringify(msg)).byteLength;
  const msgpack = pack(msg);
  const ratio = (((jsonBytes - msgpack.byteLength) / jsonBytes) * 100).toFixed(1);
  console.log(`${label}`);
  console.log(`  JSON:        ${jsonBytes} bytes`);
  console.log(`  MessagePack: ${msgpack.byteLength} bytes`);
  console.log(`  削減率:      ${ratio}%`);
  console.log();
  return { label, jsonBytes, msgpackBytes: msgpack.byteLength, reductionPct: Number(ratio) };
}

const results = [
  measure("フラットな単一キー", {
    type: "patch",
    data: { hp: 90 },
  }),
  measure("フラットな複数キー (3つ)", {
    type: "patch",
    data: { hp: 90, x: 5, y: 10 },
  }),
  measure("ネストしたパス", {
    type: "patch",
    data: { "player.x": 10, "player.y": 20 },
  }),
  measure("Map.set() 単一操作", {
    type: "patch",
    data: { players: { op: "set", key: "p1", value: { x: 5, y: 3 } } },
  }),
  measure("Map.set() 複数操作 (3件)", {
    type: "patch",
    data: {
      players: [
        { op: "set", key: "p1", value: { x: 5, y: 3 } },
        { op: "set", key: "p2", value: { x: 12, y: 7 } },
        { op: "delete", key: "p3" },
      ],
    },
  }),
  measure("大きめのゲームステート", {
    type: "patch",
    data: {
      hp: 75,
      mp: 50,
      tick: 1024,
      "player.x": 128,
      "player.y": 256,
      players: [
        { op: "set", key: "p1", value: { x: 10, y: 20 } },
        { op: "set", key: "p2", value: { x: 30, y: 40 } },
      ],
    },
  }),
];

const avgReduction = results.reduce((sum, r) => sum + r.reductionPct, 0) / results.length;
console.log(`平均削減率: ${avgReduction.toFixed(1)}%`);
