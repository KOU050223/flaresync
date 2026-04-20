import { BattleRoom } from "./Room";

export { BattleRoom };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/" || url.pathname === "/index.html") {
      return env.ASSETS.fetch(request);
    }

    const id = env.ROOM.idFromName("default");
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  },
};

interface Env {
  ROOM: DurableObjectNamespace;
  ASSETS: Fetcher;
}
