# flaresync — TODO

## Phase 0 — リポジトリ基盤

- [ ] 001: pnpm workspaceで `packages/server` `packages/client` `examples/basic` ディレクトリを作成
- [ ] 002: `packages/server/package.json` を設定（name: flaresync, types, main, exports）
- [ ] 003: `packages/client/package.json` を設定（name: flaresync/client, types, main, exports）
- [ ] 004: `tsconfig.base.json` を作成し各パッケージから継承する構成にする
- [ ] 005: `examples/basic` に Wrangler を導入し `wrangler.toml` を作成（DO binding含む）

---

## Phase 1 — フラットなオブジェクトの同期

**ゴール:** `state.hp = 90` が全クライアントのコンソールに届く

- [ ] 010: `packages/server/src/DurableSync.ts` を作成（`initial: T`, `ctx: DurableObjectState` を受け取るクラス骨格）
- [ ] 011: フラットなオブジェクトを `Proxy` でラップし、`set` トラップで変更を `dirtyKeys: Set<string>` に記録する
- [ ] 012: `broadcastDirtyKeys()` を実装（dirtyなキーだけJSONにして `ctx.getWebSockets()` 全員に送信）
- [ ] 013: `set` トラップ内で alarm 未設定なら `ctx.storage.setAlarm(Date.now() + 50)` をセット
- [ ] 014: `alarm()` を実装（`broadcastDirtyKeys()` → 接続者がいれば次の alarm を再スケジュール、ゼロなら停止）
- [ ] 015: `examples/basic/src/Room.ts` に `BattleRoom extends DurableObject` を作成（`DurableSync` 初期化・WS受付・`alarm()` 委譲）
- [ ] 016: `examples/basic/public/index.html` を作成（WSに接続して受信JSONをコンソールに表示するだけのクライアント）
- [ ] 017: `wrangler dev` でローカル起動、ブラウザ2タブで片方の操作がもう片方に届くことを確認

---

## Phase 2 — ネストとMap対応

**ゴール:** `state.players.get(id).x = 10` が届く

- [ ] 020: `proxify()` を再帰対応にする（`get` トラップでネストしたオブジェクトを自動Proxy化、パスを引き継ぐ）
- [ ] 021: 参照等価性の問題を解決（`WeakMap` キャッシュで同じパスに同じProxyを返す）
- [ ] 022: `Map` の `set` / `delete` を検知する MapProxy ラッパーを実装
- [ ] 023: パッチフォーマットに `op: "set" | "delete"` を追加
- [ ] 024: `packages/client/src/DurableSyncClient.ts` を作成（WS接続・リコネクト・パッチ自動マージ・`onChange` / `onKeyChange` リスナー）
- [ ] 025: ネスト・Map・クライアントの動作確認（プレイヤーの追加・移動・退出が届く）

---

## Phase 3 — 永続化

**ゴール:** DOが冬眠・復活してもstateが失われない

- [ ] 030: コンストラクタで `ctx.storage.get("__state")` からstateを復元する
- [ ] 031: `broadcastDirtyKeys()` の後に `ctx.storage.put("__state", state)` で保存する
- [ ] 032: `wrangler dev` でDOを強制再起動してもstateが維持されることを確認

---

## Phase 4 — バイナリ通信

**ゴール:** JSONをやめてMessagePackで通信量を削減

- [ ] 040: `msgpackr` を追加し、サーバー送信・クライアント受信をMessagePackに切り替える
- [ ] 041: JSON vs MessagePack のペイロードサイズをサンプルで計測して記録する

---

## Phase 5 — npm公開

- [ ] 050: `README.md` を書く（インストール・wrangler.toml設定・最小サンプルコード）
- [ ] 051: `packages/server` / `packages/client` の公開ファイルを `package.json#files` で絞る
- [ ] 052: GitHub Actions で `tsc --noEmit` と `wrangler deploy --dry-run` を回すCIを設定
- [ ] 053: `npm publish --dry-run` で公開内容を確認してから `0.1.0` を公開
- [ ] 054: `examples/basic` を Cloudflare Workers にデプロイしてデモURLを作る
- [ ] 055: XやZennで告知
