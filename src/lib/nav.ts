// Site menus. Change a link here and the header, footer and home page update on every page.
import type { IconName } from "./icons";

export interface NavLink {
  href: string;
  label: string;
  /** one line saying what's there: shown in the phone menu, the footer and the home page */
  desc?: string;
  icon?: IconName;
  /** page names (the `page` prop of BaseLayout) that mark this link as the current one */
  pages?: string[];
}

/** Header menu */
export const NAV: NavLink[] = [
  { href: "/prices", label: "Prices", icon: "prices", pages: ["prices", "items"],
    desc: "What every item sells for on the Auction House" },
  { href: "/economy", label: "Economy", icon: "economy", pages: ["economy"],
    desc: "Material prices, gold by category and cross-house flips" },
  { href: "/flips", label: "Flips", icon: "flips", pages: ["flips"],
    desc: "Listings cheaper than what a vendor pays" },
  { href: "/waylaid-crates", label: "Crates", icon: "crates", pages: ["crates"],
    desc: "The cheapest Merchant's Favor from Waylaid Crates" },
  { href: "/crafting", label: "Crafting", icon: "crafting", pages: ["crafting", "recipe", "recipes"],
    desc: "Which recipes make gold after materials and the AH cut" },
  { href: "/planner", label: "Planner", icon: "planner", pages: ["planner"],
    desc: "One shopping list for everything you want to craft" },
  { href: "/talents", label: "Talents", icon: "talents", pages: ["talents"],
    desc: "Plan a talent build for any class and share it" },
  { href: "/character", label: "Character", icon: "character", pages: ["character"],
    desc: "Any character's gear, professions and reputations" },
];

/** Footer: every tool, plus the browsable item and recipe pages */
export const FOOTER_TOOLS: NavLink[] = [
  { href: "/prices", label: "Auction prices" },
  { href: "/economy", label: "Economy" },
  { href: "/flips", label: "Vendor flips" },
  { href: "/waylaid-crates", label: "Waylaid Crates" },
  { href: "/item", label: "Item price pages" },
  { href: "/crafting", label: "Craft profits" },
  { href: "/planner", label: "Crafting planner" },
  { href: "/recipe", label: "Recipe pages" },
  { href: "/talents", label: "Talent calculator" },
  { href: "/character", label: "Character lookup" },
];

/** Footer: about the site */
export const FOOTER_SITE: NavLink[] = [
  { href: "/about", label: "About & credits" },
  { href: "/privacy", label: "Privacy policy" },
];
