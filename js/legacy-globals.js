// Temporary bridge while the site moves to Astro (see docs/astro-migration-plan.md, removed in step 5).
// Settings and shared math are ES modules in src/, but the old site.js still reads them from globals.
import config from "../src/config.js";
import * as PriceMath from "../src/lib/pricemath.js";
import * as TalentMath from "../src/lib/talentmath.js";

window.SITE_CONFIG = config;
window.PriceMath = PriceMath;
window.TalentMath = TalentMath;
