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

/** A dropdown in the header menu: its label opens a list of links (in the phone menu they're listed in full) */
export interface NavGroup {
  label: string;
  icon?: IconName;
  children: NavLink[];
}

export const isGroup = (n: NavLink | NavGroup): n is NavGroup => "children" in n;

/** Header menu: the most-used tools as links, the rest grouped in dropdowns */
export const NAV: (NavLink | NavGroup)[] = [
  { href: "/prices", label: "Prices", icon: "prices", pages: ["prices", "items"],
    desc: "What every item sells for on the Auction House" },
  { href: "/leveling", label: "Profession leveling", icon: "leveling", pages: ["leveling"],
    desc: "What leveling a profession 1–300 costs at today's prices" },
  { href: "/upgrades", label: "Gear upgrades", icon: "upgrades", pages: ["upgrades"],
    desc: "Cheap gear upgrades for your character on the AH right now" },
  { label: "Gold", icon: "economy", children: [
    { href: "/watchlist", label: "My watchlist", icon: "star", pages: ["watchlist"],
      desc: "Your starred items with this hour's prices and target-price flags" },
    { href: "/economy", label: "Economy", icon: "economy", pages: ["economy"],
      desc: "Material prices, gold by category and cross-house flips" },
    { href: "/flips", label: "Vendor flips", icon: "flips", pages: ["flips"],
      desc: "Listings cheaper than what a vendor pays" },
    { href: "/disenchant", label: "Disenchant flips", icon: "disenchant", pages: ["disenchant"],
      desc: "Gear cheaper than the enchanting materials it gives" },
    { href: "/waylaid-crates", label: "Waylaid Crates", icon: "crates", pages: ["crates"],
      desc: "The cheapest Merchant's Favor from Waylaid Crates" },
  ] },
  { label: "Crafting", icon: "crafting", children: [
    { href: "/crafting", label: "Craft profits", icon: "crafting", pages: ["crafting"],
      desc: "Which recipes make gold after materials and the AH cut" },
    { href: "/planner", label: "Crafting planner", icon: "planner", pages: ["planner"],
      desc: "One shopping list for everything you want to craft" },
    { href: "/recipe", label: "Recipes by profession", icon: "recipes", pages: ["recipe", "recipes"],
      desc: "Every recipe with its materials, cost and profit" },
  ] },
  { label: "Characters", icon: "character", children: [
    { href: "/character", label: "Character lookup", icon: "character", pages: ["character"],
      desc: "Any character's gear, professions and reputations" },
    { href: "/talents", label: "Talent calculator", icon: "talents", pages: ["talents"],
      desc: "Plan a talent build for any class and share it" },
  ] },
];

/** Footer: every tool, plus the browsable item and recipe pages */
export const FOOTER_TOOLS: NavLink[] = [
  { href: "/prices", label: "Auction prices" },
  { href: "/watchlist", label: "My watchlist" },
  { href: "/economy", label: "Economy" },
  { href: "/flips", label: "Vendor flips" },
  { href: "/disenchant", label: "Disenchant flips" },
  { href: "/waylaid-crates", label: "Waylaid Crates" },
  { href: "/item", label: "Item price pages" },
  { href: "/crafting", label: "Craft profits" },
  { href: "/leveling", label: "Profession leveling cost" },
  { href: "/planner", label: "Crafting planner" },
  { href: "/recipe", label: "Recipe pages" },
  { href: "/talents", label: "Talent calculator" },
  { href: "/character", label: "Character lookup" },
  { href: "/upgrades", label: "AH gear upgrades" },
];

/** Footer: about the site */
export const FOOTER_SITE: NavLink[] = [
  { href: "/addon", label: "In-game addon" },
  { href: "/guides", label: "Guides" },
  { href: "/about", label: "About & credits" },
  { href: "/privacy", label: "Privacy policy" },
];
