// Entry point for the old (pre-Astro) pages. Modules run in import order:
// first the globals site.js expects, then site.js itself. Removed in step 5 of docs/astro-migration-plan.md.
import "./legacy-globals.js";
import "./site.js";
