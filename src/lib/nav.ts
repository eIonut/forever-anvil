// Site menus. Change a link here and the header and footer update on every page.

export interface NavLink {
  href: string;
  label: string;
  /** page names (the `page` prop of BaseLayout) that mark this link as the current one */
  pages?: string[];
}

/** Header menu */
export const NAV: NavLink[] = [
  { href: "/prices", label: "Prices", pages: ["prices", "items"] },
  { href: "/economy", label: "Economy", pages: ["economy"] },
  { href: "/flips", label: "Vendor flips", pages: ["flips"] },
  { href: "/crafting", label: "Craft profits", pages: ["crafting", "recipe", "recipes"] },
  { href: "/planner", label: "Planner", pages: ["planner"] },
  { href: "/talents", label: "Talents", pages: ["talents"] },
  { href: "/character", label: "Character", pages: ["character"] },
];

/** Footer: every tool, plus the browsable item and recipe pages */
export const FOOTER_TOOLS: NavLink[] = [
  { href: "/prices", label: "Auction prices" },
  { href: "/economy", label: "Economy" },
  { href: "/flips", label: "Vendor flips" },
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
