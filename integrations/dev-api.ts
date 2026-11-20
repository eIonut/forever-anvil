// Local-only routes for `npm run dev`, so the tools work on your own computer:
//   /api/<kind>/<region>[/<part>]  the price job's data files from ./out (on the live site: the Worker)
//   /api/character     the character lookup, using your .env keys (in production: the Worker)
// Nothing here is part of the built site.
import fs from "node:fs";
import path from "node:path";
import type { AstroIntegration } from "astro";
import { createCharacterApi } from "../pipeline/character-api.js";
import { dataRoute } from "../worker/routes.js";

export default function devApi(): AstroIntegration {
  return {
    name: "forever-anvil-dev-api",
    hooks: {
      "astro:server:setup": ({ server }) => {
        const root = process.cwd();
        const outDir = path.join(root, "out");
        const characterApi = createCharacterApi(root);

        server.middlewares.use(async (req, res, next) => {
          const url = new URL(req.url || "/", "http://localhost");

          if (url.pathname === "/api/character") {
            const { status, body } = await characterApi({
              region: url.searchParams.get("region"),
              name: url.searchParams.get("name"),
              ip: req.socket.remoteAddress || "",
            });
            res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
            res.end(JSON.stringify(body));
            return;
          }

          // /api/prices/eu/A → out/prices_eu_A.json (the same addresses the Worker answers on the live site),
          // and the older /out/prices_eu_A.json form
          const route = dataRoute(url.pathname);
          const m = route ? [null, route.key + ".json"] : url.pathname.match(/^\/out\/([\w.-]+\.json)$/);
          if (m) {
            const file = path.join(outDir, m[1]!);
            fs.readFile(file, (err, data) => {
              if (err) { res.writeHead(404); res.end("Not found"); return; }
              res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-cache" });
              res.end(data);
            });
            return;
          }

          next();
        });
      },
    },
  };
}
