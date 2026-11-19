// Temporary bridge while the site moves to Astro (see docs/astro-migration-plan.md, removed in step 5).
// The shared math is now an ES module in src/lib/, but the old site.js still reads it from globals.
import * as PriceMath from "../src/lib/pricemath.js";
import * as TalentMath from "../src/lib/talentmath.js";

window.PriceMath = PriceMath;
window.TalentMath = TalentMath;
