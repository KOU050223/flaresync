import { DurableObject } from "cloudflare:workers";
import { DurableSync } from "flaresync";

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}

type State = { hp: number; tick: number };

export class BattleRoom extends DurableObject {
  private sync: DurableSync<State>;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sync = new DurableSync<State>({ hp: 100, tick: 0 }, ctx);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/ws") {
      const { 0: client, 1: server } = new WebSocketPair();
      this.ctx.acceptWebSocket(server);

      const initial = JSON.stringify({ type: "init", data: this.sync.state });
      server.send(initial);

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname === "/damage" && request.method === "POST") {
      const amount = Number(new URL(request.url).searchParams.get("amount") ?? 10);
      this.sync.state.hp -= amount;
      this.sync.state.tick += 1;
      return new Response("ok");
    }

    return new Response("not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    await this.sync.alarm();
  }
}
