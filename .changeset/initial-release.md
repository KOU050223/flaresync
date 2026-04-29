---
"flaresync": minor
---

Initial release of flaresync v0.1.0

- Cloudflare Durable Objects 向けのリアルタイム状態同期ライブラリ
- `DurableSync` クラス：Proxy による変更検知 + alarm() で 50ms バッファリング配信
- `flaresync/client` サブパス：WebSocket クライアント (`DurableSyncClient`)
- MessagePack (`msgpackr`) によるバイナリ通信
- changesets による npm publish フロー整備
