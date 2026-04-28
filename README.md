# flaresync

[![npm version](https://img.shields.io/npm/v/flaresync)](https://www.npmjs.com/package/flaresync)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Cloudflare Durable Objects 専用の状態同期ライブラリ。サーバー側で変数に代入するだけで、接続中の全クライアントに差分が届く。

```typescript
// サーバー側（Durable Object）
this.state.hp -= 10;
// → 全クライアントに { hp: 90 } が自動で届く
```

## インストール

```bash
npm install flaresync
```

クライアント側は同じパッケージの `flaresync/client` サブパスから import します（別途インストール不要）。

`flaresync` は `@cloudflare/workers-types` を peer dependency として使用します。Cloudflare Workers プロジェクトではすでにインストール済みのはずですが、もし未インストールの場合は別途追加してください。

```bash
npm install -D @cloudflare/workers-types
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
import { DurableSyncClient } from "flaresync/client";

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
- **MessagePack 通信** — JSON より小さいバイナリ形式で通信量を削減
- **Cloudflare 特化** — `getWebSockets()` / `alarm()` / `ctx.storage` をフル活用

## ロードマップ

- [x] Phase 0 — リポジトリ基盤
- [x] Phase 1 — フラットなオブジェクトの同期
- [x] Phase 2 — ネストと Map 対応
- [x] Phase 3 — 永続化
- [x] Phase 4 — バイナリ通信（MessagePack）
- [x] Phase 5 — npm 公開

## ライセンス

MIT
