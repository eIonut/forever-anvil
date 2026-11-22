// Draws the addon's logo for CurseForge and Wago (square avatar, no text so it reads at small sizes):
// the site's crest (public/img/logo.svg) on the dark, warm background and faint gold circle work of the
// brand cover (docs/brand/ko-fi-cover.png).  node tools/addon-logo.js  →  docs/brand/addon-logo.png (512×512)
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SIZE = 512;
const OUT = path.join(process.cwd(), "docs", "brand", "addon-logo.png");

// the crest without its outer <svg> tag, so it can be placed and scaled (64×64 units)
const crest = fs.readFileSync(path.join(process.cwd(), "public", "img", "logo.svg"), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const c = SIZE / 2;
// six-pointed star and circles behind the crest, like the cover's arcane rings
const tri = (r, rot) => [0, 1, 2].map((i) => {
  const a = rot + (i * 2 * Math.PI) / 3;
  return `${(c + r * Math.sin(a)).toFixed(1)},${(c - r * Math.cos(a)).toFixed(1)}`;
}).join(" ");

const scale = 5.4;                       // crest: 64 × 5.4 ≈ 346 px
const off = (SIZE - 64 * scale) / 2;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">
  <defs>
    <radialGradient id="bg" cx=".5" cy=".45" r=".75"><stop offset="0" stop-color="#3a2612"/><stop offset=".55" stop-color="#160f09"/><stop offset="1" stop-color="#070605"/></radialGradient>
    <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#e6b84a" stop-opacity=".35"/><stop offset="1" stop-color="#e6b84a" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${SIZE}" height="${SIZE}" fill="url(#bg)"/>
  <g fill="none" stroke="#c29a4a">
    <circle cx="${c}" cy="${c}" r="228" stroke-opacity=".22" stroke-width="2"/>
    <circle cx="${c}" cy="${c}" r="214" stroke-opacity=".12" stroke-width="1" stroke-dasharray="3 7"/>
    <circle cx="${c}" cy="${c}" r="150" stroke-opacity=".14" stroke-width="1.5"/>
    <polygon points="${tri(228, 0)}" stroke-opacity=".16" stroke-width="1.5"/>
    <polygon points="${tri(228, Math.PI)}" stroke-opacity=".16" stroke-width="1.5"/>
  </g>
  <rect x="10" y="10" width="${SIZE - 20}" height="${SIZE - 20}" rx="18" fill="none" stroke="#c29a4a" stroke-opacity=".6" stroke-width="3"/>
  <circle cx="${c}" cy="${c + 6}" r="190" fill="url(#glow)"/>
  <g fill="#fbe39a">
    <circle cx="96" cy="120" r="2.5" opacity=".7"/><circle cx="410" cy="96" r="2" opacity=".6"/>
    <circle cx="430" cy="380" r="2.5" opacity=".5"/><circle cx="84" cy="400" r="2" opacity=".5"/>
  </g>
  <g transform="translate(${off} ${off + 4}) scale(${scale})">${crest}</g>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(OUT);
console.log("wrote", path.relative(process.cwd(), OUT));
