// Local-only routes for `npm run dev`, so the tools work on your own computer:
//   /out/<file>.json   the price job's data files (in production the tools read them from the Worker)
//   /api/character     the character lookup, using your .env keys (in production: the Worker)
// Nothing here is part of the built site.
import fs from "node:fs";
import path from "node:path";
import type { AstroIntegration } from "astro";
import { createCharacterApi } from "../pipeline/character-api.js";

export default function devApi(): AstroIntegration {
  return {
    name: "forever-tome-dev-api",
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

          const m = url.pathname.match(/^\/out\/([\w.-]+\.json)$/);
          if (m) {
            const file = path.join(outDir, m[1]);
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
