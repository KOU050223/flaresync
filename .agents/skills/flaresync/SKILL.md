---
name: flaresync
description: Use when integrating flaresync into a Cloudflare Durable Objects project. TRIGGER when code imports from 'flaresync' or 'flaresync/client', or the user asks about real-time state sync on Cloudflare Workers. Covers server setup, client setup, Map/nested state, persistence, and wrangler config.
---

# flaresync Skill

Real-time state sync library for Cloudflare Durable Objects. Assign a property on the server and every connected client receives the diff automatically — no `send()` or `broadcast()` calls needed.

```typescript
this.sync.state.hp -= 10;
// → all clients receive { type: "patch", data: { hp: 90 } }
```

## Installation

```bash
npm install flaresync
# if @cloudflare/workers-types is not yet installed
npm install -D @cloudflare/workers-types
```

The client entry point is the `flaresync/client` subpath — no separate package needed.

## wrangler.toml

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

---

## Server API

### `new DurableSync(initial, ctx)`

Synchronous constructor. Use when persistence across hibernation is not required.

```typescript
import { DurableObject } from "cloudflare:workers";
import { DurableSync } from "flaresync";

type State = { hp: number; tick: number };

export class BattleRoom extends DurableObject {
  private sync: DurableSync<State>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sync = new DurableSync({ hp: 100, tick: 0 }, ctx);
  }

  async fetch(request: Request): Promise<Response> {
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // Required: delegate alarm() to sync
  async alarm(): Promise<void> {
    await this.sync.alarm();
  }
}
```

### `DurableSync.create(initial, ctx)` — with persistence

Async factory. Restores state from `ctx.storage` after hibernation or restart.

```typescript
export class BattleRoom extends DurableObject<Env> {
  private sync: DurableSync<State> | undefined;
  private syncPromise: Promise<DurableSync<State>> | undefined;

  private getSync(): Promise<DurableSync<State>> {
    if (this.sync) return Promise.resolve(this.sync);
    if (!this.syncPromise) {
      this.syncPromise = DurableSync.create<State>(
        { hp: 100, tick: 0, players: new Map() },
        this.ctx,
      )
        .then((s) => { this.sync = s; return s; })
        .catch((err) => { this.syncPromise = undefined; throw err; });
    }
    return this.syncPromise;
  }

  async fetch(request: Request): Promise<Response> {
    const sync = await this.getSync();
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  async alarm(): Promise<void> {
    const sync = await this.getSync();
    await sync.alarm();
  }
}
```

### `sync.state`

Proxy-wrapped state object. Plain assignments trigger dirty tracking and schedule a patch broadcast in ~50 ms via `alarm()`.

```typescript
// flat property
sync.state.hp -= 10;

// nested object  (patch key becomes "player.x")
sync.state.player.x = 10;

// Map — set
sync.state.players.set("p1", { x: 0, y: 0 });

// Map — delete
sync.state.players.delete("p1");
```

### `sync.alarm()`

Must be called from the Durable Object's `alarm()` handler. Broadcasts dirty keys to all connected WebSockets, saves state to storage, and reschedules itself as long as connections remain.

---

## Client API

### `new DurableSyncClient(url, initial)`

```typescript
import { DurableSyncClient } from "flaresync/client";

type State = { hp: number };

const client = new DurableSyncClient<State>(
  "wss://your-worker.example.com/ws",
  { hp: 100 },
);
```

Reconnects automatically (1 s delay) on WebSocket close.

### `client.getState(): T`

Returns the current state snapshot.

### `client.onChange(fn): () => void`

Fires on every patch. Returns an unsubscribe function.

```typescript
const off = client.onChange((state) => {
  console.log("hp:", state.hp);
});
off(); // unsubscribe
```

### `client.onKeyChange(path, fn): () => void`

Fires only when the value at `path` changes (shallow equality check).

```typescript
const off = client.onKeyChange("player.x", (value) => {
  console.log("player.x:", value);
});
```

### `client.close()`

Closes the WebSocket and stops reconnection.

---

## Patch message format

Messages are sent as MessagePack (binary). After decoding:

```typescript
// flat / nested property
{ type: "patch", data: { hp: 90, "player.x": 10 } }

// Map.set() — single operation
{ type: "patch", data: { players: { op: "set", key: "p1", value: { x: 5 } } } }

// Map.set() — multiple operations in the same tick (array)
{ type: "patch", data: { players: [
  { op: "set", key: "p1", value: 1 },
  { op: "set", key: "p1", value: 2 },
] } }

// Map.delete()
{ type: "patch", data: { players: { op: "delete", key: "p1" } } }
```

`DurableSyncClient` applies patches automatically — manual parsing is only needed for custom client implementations.

---

## Sending initial state on connect

`Map` values are not directly serializable. Send an init message manually when a client connects:

```typescript
async fetch(request: Request): Promise<Response> {
  const sync = await this.getSync();
  const { 0: client, 1: server } = new WebSocketPair();
  this.ctx.acceptWebSocket(server);

  server.send(JSON.stringify({
    type: "init",
    data: {
      hp: sync.state.hp,
      players: Object.fromEntries(sync.state.players),
    },
  }));

  return new Response(null, { status: 101, webSocket: client });
}
```

---

## Constraints

| Constraint | Detail |
|-----------|--------|
| Cloudflare Workers only | Requires `DurableObjectState`, `alarm()`, and `getWebSockets()` — not available on Node.js or Bun |
| `alarm()` delegation is required | Without it, no patches are ever broadcast |
| ~50 ms batch delay | Changes are coalesced and sent once per tick, not immediately |
| structured-clone safe values only | Storing `Response`, `Function`, etc. in state causes a runtime error on `storage.put` |
| Last Write Wins | No conflict resolution — the last assignment wins |
