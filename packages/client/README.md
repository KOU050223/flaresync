# flaresync-client

[![npm version](https://img.shields.io/npm/v/flaresync-client)](https://www.npmjs.com/package/flaresync-client)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/KOU050223/flaresync/blob/main/LICENSE)

[flaresync](https://www.npmjs.com/package/flaresync) のクライアントライブラリ。WebSocket で Durable Object に接続し、状態変更を自動受信する。

## インストール

```bash
npm install flaresync-client
```

## 使い方

```typescript
import { DurableSyncClient } from "flaresync-client";

const client = new DurableSyncClient("wss://your-worker.example.com/room", {
  hp: 100,
});

client.onChange((state) => {
  console.log("state updated:", state);
});

client.onKeyChange("hp", (value) => {
  console.log("hp changed:", value);
});
```

サーバー側は [`flaresync`](https://www.npmjs.com/package/flaresync) を参照してください。

## ライセンス

MIT — [KOU050223](https://github.com/KOU050223)
