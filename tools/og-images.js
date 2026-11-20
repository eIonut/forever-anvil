// Draws the social-share pictures (Open Graph images, 1200×630) into public/og/.
// Run once after changing the logo or a title here:  node tools/og-images.js
// Uses sharp, which Astro already installs. The PNGs are committed, so builds don't need this.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const OUT = path.join(process.cwd(), "public", "og");
fs.mkdirSync(OUT, { recursive: true });

// The crest from public/img/logo.svg, without its outer <svg> tag, so it can be placed and scaled.
const logo = fs.readFileSync(path.join(process.cwd(), "public", "img", "logo.svg"), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "");

const IMAGES = {
  default: ["Auction prices, crafting & talent tools", "Live Auction House data for WoW: Forever"],
  prices: ["Auction House prices", "Market price, history and sell-or-vendor for every item"],
  economy: ["The Economy", "Trade board, where the gold is and Blackwater flips"],
  flips: ["Vendor flips", "Listings cheaper than what a vendor pays"],
  crates: ["Waylaid Crates", "The cheapest Merchant's Favor, priced every hour"],
  items: ["Item prices", "Every traded item, with 30 days of price history"],
  crafting: ["Craft profit calculator", "Which recipes make gold after materials and the AH cut"],
  planner: ["Crafting planner", "One shopping list for everything you want to craft"],
  recipes: ["Recipes & professions", "Material cost and profit on every Auction House"],
  talents: ["Talent calculator", "The real WoW: Forever talent trees for every class"],
  character: ["Character lookup", "Gear, professions and reputations for any character"],
};

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function svg(title, sub) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="bg" cx=".3" cy=".35" r=".9"><stop offset="0" stop-color="#2a1d10"/><stop offset=".6" stop-color="#120e0a"/><stop offset="1" stop-color="#070605"/></radialGradient>
    <linearGradient id="gt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe39a"/><stop offset="1" stop-color="#c29a4a"/></linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="28" y="28" width="1144" height="574" fill="none" stroke="#c29a4a" stroke-opacity=".55" stroke-width="2"/>
  <rect x="40" y="40" width="1120" height="550" fill="none" stroke="#c29a4a" stroke-opacity=".25" stroke-width="1"/>
  <g transform="translate(90 150) scale(5)">${logo}</g>
  <text x="440" y="200" font-family="Georgia, 'Times New Roman', serif" font-size="34" letter-spacing="6" fill="#c29a4a">FOREVER ANVIL</text>
  <text x="440" y="300" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.min(66, Math.floor(700 / (title.length * 0.6)))}" font-weight="bold" fill="url(#gt)">${esc(title)}</text>
  <text x="440" y="370" font-family="Georgia, 'Times New Roman', serif" font-size="${Math.min(30, Math.floor(700 / (sub.length * 0.5)))}" fill="#f2eadb">${esc(sub)}</text>
  <text x="440" y="470" font-family="Georgia, 'Times New Roman', serif" font-size="26" fill="#a99d86">Free tools for World of Warcraft: Forever · foreveranvil.com</text>
</svg>`;
}

for (const [name, [title, sub]] of Object.entries(IMAGES)) {
  const file = path.join(OUT, name + ".png");
  await sharp(Buffer.from(svg(title, sub))).png({ compressionLevel: 9, palette: true }).toFile(file);
  console.log("wrote", path.relative(process.cwd(), file));
}
