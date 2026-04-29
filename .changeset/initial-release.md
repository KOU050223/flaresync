---
"flaresync": minor
---

Initial release of flaresync v0.1.0

- Real-time state sync library for Cloudflare Durable Objects
- `DurableSync` class: change detection via Proxy + 50ms buffered broadcast using `alarm()`
- `flaresync/client` subpath export: WebSocket client (`DurableSyncClient`)
- Binary transport with MessagePack (`msgpackr`)
- Automated npm publish flow via changesets
