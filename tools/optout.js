// Hide a character from the character lookup (privacy / removal request).
// Usage:  node tools/optout.js eu "Firstname Lastname"
// Adds a SHA-256 fingerprint (not the name) to data/optout.json, which is published with the site.
"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { normalizeName } = require("../pipeline/character");

const [region, ...nameParts] = process.argv.slice(2);
const slug = normalizeName(nameParts.join(" "));
if (!["us", "eu", "kr", "tw"].includes((region || "").toLowerCase()) || !slug) {
  console.error('Usage: node tools/optout.js <us|eu|kr|tw> "Firstname Lastname"');
  process.exit(1);
}
const file = path.join(__dirname, "..", "data", "optout.json");
const list = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : [];
const hash = crypto.createHash("sha256").update(region.toLowerCase() + ":" + slug).digest("hex");
if (list.includes(hash)) { console.log("Already hidden."); process.exit(0); }
list.push(hash);
fs.writeFileSync(file, JSON.stringify(list, null, 1) + "\n");
console.log(`Hidden ${slug} (${region}). Commit and deploy to apply on the live site.`);
