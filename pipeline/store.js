// Where the pipeline saves its results.
//   local (default): JSON files in ./out — for testing on your own computer
//   kv:              Cloudflare Workers KV — used in production (added in the deploy step)
// Both expose the same two functions, so run.js doesn't care which one is used.
"use strict";
const fs = require("fs");
const path = require("path");

function localStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = (key) => path.join(dir, key.replace(/[^a-z0-9_.-]/gi, "_") + ".json");
  let writes = 0;
  return {
    kind: "local",
    async getJSON(key) {
      try { return JSON.parse(fs.readFileSync(file(key), "utf8")); } catch (e) { return null; }
    },
    async putJSON(key, value) {
      const text = JSON.stringify(value);
      fs.writeFileSync(file(key), text);
      writes++;
      return text.length;
    },
    writeCount: () => writes
  };
}

module.exports = { localStore };
