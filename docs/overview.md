# flaresync — 概要

## 何をするライブラリか

Cloudflare Durable Objects専用の状態同期ライブラリ。
サーバー側で変数を代入するだけで、接続中の全クライアントに差分が届く。

```typescript
// サーバー側
this.state.hp -= 10;
// → 接続中の全クライアントに { hp: 90 } が自動で届く
```

## なぜ作るのか

2026年時点で、Cloudflare DO上で「スキーマ定義 → 自動差分配信」をワンセットで提供するライブラリが存在しない。

| 既存ライブラリ | 何が足りないか |
|---|---|
| PartyKit | 状態同期なし。broadcastは自分で書く必要あり |
| y-durableobjects | CRDT特化。ゲームロジックを乗せにくい |
| Colyseus | Cloudflare Workers/DOへの対応が不確実 |

## 差別化ポイント

- **Cloudflare特化** — `getWebSockets()` / `alarm()` / `ctx.storage` をフル活用
- **代入するだけ** — `send` や `broadcast` を一行も書かなくていい
- **ティックベース配信** — `alarm()` APIで50msごとに差分をまとめて送信
- **型安全** — TypeScriptジェネリクスでタイポをコンパイル時に検出

## ターゲット

- Cloudflare WorkersでリアルタイムゲームやコラボツールをつくるTypeScript開発者
- Colyseusを使いたいがサーバー管理したくない人

## パッケージ名

```
npm install flaresync          # サーバー（DO）側
npm install flaresync/client   # クライアント側
```
