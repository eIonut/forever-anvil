// Draws Loot Comets' textures (lootcomets/LootComets/Media/*.tga): white shapes on transparent, tinted in game
// with each item's quality colour. The game loads TGA, not PNG. Run: node tools/lootcomets-media.js
//
//   Glow.tga   soft round glow: the comet's halo, its trail and the flash on the bag slot
//   Ring.tga   thin ring: the shockwave where a comet lands
//   Star.tga   four-point twinkle: sparkles on landing, and the dust trail
//   Edge.tga   glow around the screen's edges, stretched over the whole screen when an epic lands
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lootcomets/LootComets/Media");

const clamp = (v) => Math.max(0, Math.min(1, v));

/** Writes a size×size 32-bit TGA, white, alpha from fn(x, y) with x and y from -1 to 1. */
function tga(file, size, fn) {
  const header = Buffer.alloc(18);
  header[2] = 2; // uncompressed true colour
  header.writeUInt16LE(size, 12);
  header.writeUInt16LE(size, 14);
  header[16] = 32;
  header[17] = 8 | 0x20; // 8 alpha bits, top-left origin
  const px = Buffer.alloc(size * size * 4);
  for (let j = 0; j < size; j++) {
    for (let i = 0; i < size; i++) {
      const x = ((i + 0.5) / size) * 2 - 1;
      const y = ((j + 0.5) / size) * 2 - 1;
      const o = (j * size + i) * 4;
      px[o] = px[o + 1] = px[o + 2] = 255;
      px[o + 3] = Math.round(clamp(fn(x, y)) * 255);
    }
  }
  fs.writeFileSync(path.join(OUT, file), Buffer.concat([header, px]));
}

fs.mkdirSync(OUT, { recursive: true });

tga("Glow.tga", 64, (x, y) => {
  const r = Math.hypot(x, y);
  return Math.pow(clamp(1 - r), 2.2) * 0.85 + Math.exp(-r * r * 30) * 0.15;
});

tga("Ring.tga", 128, (x, y) => {
  const r = Math.hypot(x, y);
  return Math.exp(-Math.pow((r - 0.82) / 0.07, 2)) * clamp((1 - r) * 12);
});

tga("Edge.tga", 256, (x, y) => {
  const d = Math.max(Math.abs(x), Math.abs(y)) * 0.6 + Math.hypot(x, y) * 0.4 * 0.72;
  return Math.pow(clamp((d - 0.62) / 0.38), 1.8);
});

tga("Star.tga", 64, (x, y) => {
  const r = Math.hypot(x, y);
  const ax = Math.abs(x);
  const ay = Math.abs(y);
  const arms = Math.max(Math.exp(-ax * 22) * Math.pow(clamp(1 - ay), 2), Math.exp(-ay * 22) * Math.pow(clamp(1 - ax), 2));
  return Math.pow(clamp(1 - r), 3) + arms;
});

console.log("Wrote Glow.tga, Ring.tga, Edge.tga and Star.tga to", path.relative(process.cwd(), OUT));
