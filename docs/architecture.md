# flaresync — アーキテクチャ

## ディレクトリ構成

```
flaresync/
├── packages/
│   └── server/              # npm: flaresync（サーバー + flaresync/client サブパスを提供）
│       └── src/
│           ├── DurableSync.ts   # コアエンジン（Cloudflare Workers 専用）
│           ├── index.ts
│           └── client/          # flaresync/client サブパス（ブラウザ / Node.js 用）
│               ├── DurableSyncClient.ts
│               └── index.ts
├── examples/
│   └── basic/               # 動作確認用サンプル（wrangler dev で起動）
│       ├── src/
│       │   ├── index.ts     # Workerエントリ
│       │   └── Room.ts      # DurableObject本体
│       ├── public/
│       │   └── index.html   # ブラウザクライアント
│       └── wrangler.toml
└── docs/
```

## データフロー

```
クライアント（ブラウザ）
    │  WebSocket接続
    ▼
Cloudflare Worker（エントリ）
    │  DO IDでルーティング
    ▼
Durable Object（Room）
    │  ctx.acceptWebSocket()
    │
    ├─ webSocketMessage() でメッセージ受信
    │       ↓
    │   this.state.hp -= 10   ← ユーザーが書くコード
    │       ↓
    │   DurableSyncのProxyがset trapで検知
    │       ↓
    │   dirtyKeys に "hp" を追加
    │       ↓
    │   alarmが未セットなら setAlarm(now + 50ms)
    │
    └─ alarm() 発火（50ms後）
            ↓
        broadcastDirtyKeys()
            ↓
        ctx.getWebSockets().forEach(ws.send)
            ↓
        接続者がいれば次のalarmを再スケジュール
```

## なぜ setInterval ではなく alarm() なのか

DOには **Hibernation（冬眠）** がある。
`ctx.acceptWebSocket()` で接続を受けると、DOは接続中でも冬眠できる。
冬眠中は `setInterval` が**完全に停止**する。

`alarm()` はストレージに永続化されるため、Hibernation中でも確実に発火する。

| | `setInterval` | `alarm()` |
|---|---|---|
| Hibernation時 | 停止する（バグ） | Hibernationから復帰して実行される |
| DO再起動時 | 消える | ストレージに残るので生き続ける |
| Cloudflare公式 | 非推奨 | 推奨 |

## パッチフォーマット（JSON → 将来MessagePack）

```typescript
// Phase 1: フラット
{ type: "patch", data: { hp: 90, x: 10 } }

// Phase 2以降: ネスト・削除対応
{ type: "patch", data: [
  { op: "set",    path: "players.id1.x", value: 10 },
  { op: "delete", path: "players.id2" }
]}
```

## サーバー側コアクラス（DurableSync）

```typescript
export class DurableSync<T extends object> {
  private dirtyKeys = new Set<string>();
  public data: T;

  constructor(initial: T, private ctx: DurableObjectState) {
    this.data = this.proxify(initial) as T;
  }

  private proxify(obj: object): object { /* Proxyラップ */ }

  async alarm() {
    await this.broadcastDirtyKeys();
    if (this.ctx.getWebSockets().length > 0) {
      await this.ctx.storage.setAlarm(Date.now() + 50);
    }
  }

  private async broadcastDirtyKeys() { /* 差分送信 */ }
}
```

## クライアント側コアクラス（DurableSyncClient）

```typescript
export class DurableSyncClient<T extends object> {
  state: T;

  constructor(url: string) { /* WebSocket接続 */ }

  onChange(cb: (state: T) => void): void { /* 変更リスナー登録 */ }
  onKeyChange(path: string, cb: (value: unknown) => void): void { /* パス単位リスナー */ }
}
```
