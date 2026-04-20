# flaresync

Cloudflare Durable Objects 専用の状態同期ライブラリ。サーバー側で変数に代入するだけで、接続中の全クライアントに差分が届く。

```typescript
// サーバー側（Durable Object）
this.state.hp -= 10;
// → 全クライアントに { hp: 90 } が自動で届く
```

## インストール

```bash
npm install flaresync          # サーバー（DO）側
npm install flaresync-client   # クライアント側
```

## 最小サンプル

### サーバー（`src/Room.ts`）

```typescript
import { DurableSync } from "flaresync";
import { DurableObject } from "cloudflare:workers";

type State = { hp: number };

export class BattleRoom extends DurableObject {
  private sync: DurableSync<State>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sync = new DurableSync({ hp: 100 }, ctx);
  }

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm() {
    await this.sync.alarm();
  }

  damage(amount: number) {
    this.sync.state.hp -= amount; // これだけで全クライアントに届く
  }
}
```

### クライアント

```typescript
import { DurableSyncClient } from "flaresync-client";

const client = new DurableSyncClient("wss://your-worker.example.com/room");
client.onChange((state) => {
  console.log("hp:", state.hp);
});
```

### `wrangler.toml`

```toml
name = "my-app"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[[durable_objects.bindings]]
name = "ROOM"
class_name = "BattleRoom"

[[migrations]]
tag = "v1"
new_classes = ["BattleRoom"]
```

## 特徴

- **代入するだけ** — `send` / `broadcast` を一行も書かなくていい
- **ティックベース配信** — `alarm()` API で 50ms ごとに差分をまとめて送信
- **型安全** — TypeScript ジェネリクスでタイポをコンパイル時に検出
- **Cloudflare 特化** — `getWebSockets()` / `alarm()` / `ctx.storage` をフル活用

## ロードマップ

- [x] Phase 0 — リポジトリ基盤
- [ ] Phase 1 — フラットなオブジェクトの同期
- [ ] Phase 2 — ネストと Map 対応
- [ ] Phase 3 — 永続化
- [ ] Phase 4 — バイナリ通信（MessagePack）
- [ ] Phase 5 — npm 公開

## ライセンス

MIT
