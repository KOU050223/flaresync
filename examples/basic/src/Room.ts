import { DurableObject } from "cloudflare:workers";
import { DurableSync } from "flaresync";

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

type Player = { x: number; y: number };
type State = { hp: number; tick: number; players: Map<string, Player> };

export class BattleRoom extends DurableObject<Env> {
  private sync: DurableSync<State> | undefined;
  private syncPromise: Promise<DurableSync<State>> | undefined;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
  }

  private getSync(): Promise<DurableSync<State>> {
    if (this.sync) return Promise.resolve(this.sync);
    if (!this.syncPromise) {
      this.syncPromise = DurableSync.create<State>(
        { hp: 100, tick: 0, players: new Map() },
        this.ctx,
      )
        .then((s) => {
          this.sync = s;
          return s;
        })
        .catch((err: unknown) => {
          this.syncPromise = undefined;
          throw err;
        });
    }
    return this.syncPromise;
  }

  async fetch(request: Request): Promise<Response> {
    const sync = await this.getSync();
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);

      // Mapはそのままでは JSON.stringify できないため変換して送る
      const initData = {
        hp: sync.state.hp,
        tick: sync.state.tick,
        players: Object.fromEntries(sync.state.players),
      };
      server.send(JSON.stringify({ type: "init", data: initData }));

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/damage" && request.method === "POST") {
      const amount = Number(url.searchParams.get("amount") ?? 10);
      if (!Number.isFinite(amount) || amount <= 0) {
        return new Response("amount must be a positive number", { status: 400 });
      }
      sync.state.hp -= amount;
      sync.state.tick += 1;
      return new Response("ok");
    }

    if (url.pathname === "/join" && request.method === "POST") {
      const id = url.searchParams.get("id") ?? `p${Date.now()}`;
      sync.state.players.set(id, { x: 0, y: 0 });
      return new Response(JSON.stringify({ id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (url.pathname === "/move" && request.method === "POST") {
      const id = url.searchParams.get("id");
      const x = Number(url.searchParams.get("x") ?? 0);
      const y = Number(url.searchParams.get("y") ?? 0);
      if (!id) return new Response("id required", { status: 400 });
      const player = sync.state.players.get(id as string);
      if (!player) return new Response("player not found", { status: 404 });
      sync.state.players.set(id as string, { x, y });
      return new Response("ok");
    }

    if (url.pathname === "/leave" && request.method === "POST") {
      const id = url.searchParams.get("id");
      if (!id) return new Response("id required", { status: 400 });
      sync.state.players.delete(id as string);
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    const sync = await this.getSync();
    await sync.alarm();
  }
}
