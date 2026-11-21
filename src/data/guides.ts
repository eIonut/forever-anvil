// The guides (src/pages/guides/*.astro). One entry per guide: the /guides page, the footer,
// the home page and each guide's "More guides" list read this, so a new guide only needs a line
// here and its page.
import type { IconName } from "../lib/icons";

export interface Guide {
  slug: string;
  title: string;
  /** one sentence for the guide list and the search snippet */
  desc: string;
  icon: IconName;
  /** the tool the guide explains */
  tool: { href: string; label: string };
}

export const GUIDES: Guide[] = [
  { slug: "auction-house-prices", icon: "prices",
    title: "How to read WoW: Forever auction house prices",
    desc: "Market price vs lowest price, the three auction houses of each ruleset, and when to sell to a vendor instead.",
    tool: { href: "/prices", label: "Open Auction prices" } },
  { slug: "vendor-flips", icon: "flips",
    title: "Making gold with vendor flips and cross-house flips",
    desc: "Buy items listed below what a vendor pays, or move goods between auction houses, without getting burned.",
    tool: { href: "/flips", label: "Open Vendor flips" } },
  { slug: "crafting-for-profit", icon: "crafting",
    title: "Crafting for profit: picking recipes that make gold",
    desc: "How material cost, the AH cut and sales per day decide whether a recipe is worth crafting.",
    tool: { href: "/crafting", label: "Open Craft profits" } },
  { slug: "profession-leveling", icon: "leveling",
    title: "Leveling a profession 1–300 for the least gold",
    desc: "Why recipe colours matter, how expected skill points work, and how to turn a route into one shopping list.",
    tool: { href: "/leveling", label: "Open Profession leveling" } },
  { slug: "waylaid-crates", icon: "crates",
    title: "Waylaid Crates: the cheapest Merchant's Favor",
    desc: "Where crates come from, how to fill and hand them in, and how to work out gold per Favor.",
    tool: { href: "/waylaid-crates", label: "Open Waylaid Crates" } },
  { slug: "gear-upgrades", icon: "upgrades",
    title: "Finding cheap gear upgrades on the auction house",
    desc: "Look up your character, compare item levels slot by slot, and shortlist upgrades you can afford.",
    tool: { href: "/upgrades", label: "Open Gear upgrades" } },
  { slug: "watchlist", icon: "star",
    title: "Tracking prices with the watchlist and target prices",
    desc: "Star the items you trade, set a buy price, and let the site flag when the market reaches it.",
    tool: { href: "/watchlist", label: "Open My watchlist" } },
  { slug: "talent-calculator", icon: "talents",
    title: "Planning and sharing talent builds",
    desc: "How talent points, tree rows and levels work in the calculator, and how to send a build to your guild.",
    tool: { href: "/talents", label: "Open Talent calculator" } },
];

export const guideUrl = (slug: string) => `/guides/${slug}`;
export const guideBySlug = (slug: string) => GUIDES.find((g) => g.slug === slug);
