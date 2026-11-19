// Original line icons for the menu, page banners and tool cards. All drawn on a 48×48 grid
// with `currentColor`, so they take the colour of the text around them.
// Use them with <Icon name="prices" /> (src/components/Icon.astro).

const s = 'fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"';

export const ICONS = {
  home: `<path d="M8 22L24 8l16 14" ${s}/><path d="M12 19v21h24V19" ${s}/><path d="M20 40V29h8v11" ${s}/>`,
  prices: `<circle cx="24" cy="24" r="17" ${s}/><circle cx="24" cy="24" r="11" ${s} stroke-width="2"/><path d="M24 17v14M20.5 20.5h5a2.5 2.5 0 0 1 0 5h-3a2.5 2.5 0 0 0 0 5h5" ${s} stroke-width="2.2"/>`,
  economy: `<path d="M8 40V8M8 40h32" ${s}/><path d="M14 32l8-9 6 5 11-13" ${s}/><path d="M33 15h6v6" ${s}/>`,
  flips: `<path d="M8 16h30l-7-7M40 32H10l7 7" ${s}/>`,
  items: `<path d="M11 6h21l6 6v30H11z" ${s}/><path d="M17 18h15M17 25h15M17 32h9" ${s}/>`,
  crafting: `<path d="M9 39l15-15" ${s}/><path d="M22 10l16 16-6 6-16-16z" ${s}/><path d="M6 42h14" ${s}/>`,
  planner: `<rect x="9" y="8" width="30" height="34" rx="3" ${s}/><path d="M16 19l3 3 6-6M16 31l3 3 6-6M29 20h4M29 32h4" ${s}/>`,
  recipes: `<path d="M12 6h20a4 4 0 0 1 4 4v32H16a4 4 0 0 1-4-4z" ${s}/><path d="M12 38a4 4 0 0 1 4-4h20" ${s}/><path d="M19 14h10M19 20h7" ${s}/>`,
  talents: `<circle cx="24" cy="10" r="5" ${s}/><circle cx="12" cy="37" r="5" ${s}/><circle cx="36" cy="37" r="5" ${s}/><path d="M21.5 14.5l-7 18M26.5 14.5l7 18" ${s}/>`,
  character: `<circle cx="24" cy="16" r="8" ${s}/><path d="M8 42c2-9 8-13 16-13s14 4 16 13" ${s}/>`,
  about: `<circle cx="24" cy="24" r="17" ${s}/><path d="M24 22v11" ${s}/><circle cx="24" cy="15.5" r="1.8" fill="currentColor"/>`,
  privacy: `<path d="M24 6l15 6v10c0 10-6.5 17-15 20C15.5 39 9 32 9 22V12z" ${s}/><path d="M18 24l4.5 4.5L31 20" ${s}/>`,
  clock: `<circle cx="24" cy="24" r="17" ${s}/><path d="M24 14v10l7 5" ${s}/>`,
  globe: `<circle cx="24" cy="24" r="17" ${s}/><path d="M7 24h34M24 7c5 5 7 11 7 17s-2 12-7 17c-5-5-7-11-7-17s2-12 7-17z" ${s}/>`,
  lock: `<rect x="11" y="21" width="26" height="20" rx="3" ${s}/><path d="M17 21v-6a7 7 0 0 1 14 0v6" ${s}/>`,
  link: `<path d="M21 27a7 7 0 0 0 10 0l7-7a7 7 0 0 0-10-10l-2 2" ${s}/><path d="M27 21a7 7 0 0 0-10 0l-7 7a7 7 0 0 0 10 10l2-2" ${s}/>`,
  database: `<ellipse cx="24" cy="12" rx="14" ry="5" ${s}/><path d="M10 12v24c0 2.8 6.3 5 14 5s14-2.2 14-5V12M10 24c0 2.8 6.3 5 14 5s14-2.2 14-5" ${s}/>`,
  arrow: `<path d="M10 24h28M28 14l10 10-10 10" ${s}/>`,
} as const;

export type IconName = keyof typeof ICONS;
