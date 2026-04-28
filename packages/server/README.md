# flaresync

[![npm version](https://img.shields.io/npm/v/flaresync)](https://www.npmjs.com/package/flaresync)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/KOU050223/flaresync/blob/main/LICENSE)

Cloudflare Durable Objects 専用の状態同期ライブラリ（サーバー側）。Durable Object 内で変数に代入するだけで、接続中の全クライアントに差分が届く。

```typescript
this.sync.state.hp -= 10;
// → 全クライアントに { hp: 90 } が自動で届く
```

## インストール

```bash
npm install flaresync
```

`@cloudflare/workers-types` を peer dependency として使用します（Cloudflare Workers プロジェクトでは通常インストール済み）。

## 使い方

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
}
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

クライアント側は [`flaresync-client`](https://www.npmjs.com/package/flaresync-client) を参照してください。

## ライセンス

MIT — [KOU050223](https://github.com/KOU050223)
