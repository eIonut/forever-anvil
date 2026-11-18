/* ------------------------------------------------------------------
   ALL SITE CONTENT LIVES HERE.
   Rules for adding content (keeps the site legal and ad-friendly):
     1. Write summaries in your OWN words (1–3 sentences). Never paste
        paragraphs from another site.
     2. Always add the source name + link so readers go to the original.
     3. Game facts (names, levels, dates) are fine to list — credit where
        you learned them.
   ------------------------------------------------------------------ */

window.CODEX = {};

/* ---------------- NEWS ----------------
   tag: hotfix | official | launch | community | roadmap   (newest first) */
CODEX.news = [
  {
    date: "2026-11-18", tag: "hotfix",
    title: "Dungeon XP rules loosened, auction house deposit cut",
    summary: "German site PC Games Hardware reports that Blizzard eased the recent dungeon XP restriction and that the auction house minimum deposit drops from 1 silver to 1 copper. It also covers players' complaints about overcrowded quest areas and frame drops.",
    source: "PC Games Hardware (DE)", url: "https://www.pcgameshardware.de/World-of-Warcraft-Forever-Spiel-78891/News/update-18-november-2026-auktionshaus-schattenpriester-1560336/"
  },
  {
    date: "2026-11-17", tag: "hotfix",
    title: "Upper Blackrock Spire buffed, camping and profession tweaks",
    summary: "UBRS enemies had much less health and damage than intended, so they were buffed. The same patch brought profession and camping improvements, quest fixes, and lets Shadow Priests hold the Night Watchman's Torch.",
    source: "Icy Veins", url: "https://icy-veins.com/wow-forever/news/ubrs-buffs-profession-and-camping-improvements-quest-fixes-wow-forever-hotfixes-november-17th"
  },
  {
    date: "2026-11-17", tag: "hotfix",
    title: "Hotfixes: faction buffs, Flurry and Spectral Iron Ore",
    summary: "Might of Stormwind and Warchief's Blessing now always drop on death and no longer land on non-players. Flurry stops losing stacks to Windfury Totem hits, the paladin tank dungeon set (Soulforge Armor) swaps Strength for Spell Power, and Spectral Iron Ore spawns more often. Vendor prices for some crafted armour were cut.",
    source: "Blizzard", url: "https://worldofwarcraft.blizzard.com/en-us/news/24315281"
  },
  {
    date: "2026-11-16", tag: "hotfix",
    title: "Item Restoration disabled, Riverglades enemies toned down",
    summary: "Blizzard switched off the Item Restoration service while it fixes a critical bug, so double-check before selling or destroying gear. Several Riverglades mobs were nerfed — the Twilight Enforcer's Smash most of all. Developers also confirmed there is no XP-to-gold conversion for quests at level 60.",
    source: "Blizzard News", url: "https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-16-2026"
  },
  {
    date: "2026-11-15", tag: "hotfix",
    title: "Dungeon kill XP changed again",
    summary: "Blizzard adjusted the experience from dungeon enemy kills once more — the third XP tweak in a week as it hunts for the right balance between dungeon grinding and questing.",
    source: "Warcraft Tavern", url: "https://www.warcrafttavern.com/forever/news/dungeon-kill-experience-changed-again-in-wow-forever/"
  },
  {
    date: "2026-11-13", tag: "hotfix",
    title: "No dungeon XP from enemies that are gray to anyone in the party",
    summary: "Dungeon kills now give zero experience if the enemy is gray (trivial) to any party member — aimed at high-level players boosting lowbies. The patch also touched stun diminishing returns, Wild Growth and Judgement of Command.",
    source: "AccountShark", url: "https://accountshark.net/blog/wow-forever-hotfixes-november-13-dungeon-xp-trivial-enemies-stun-diminishing-returns-wild-growth-judgement-of-command"
  },
  {
    date: "2026-11-11", tag: "hotfix",
    title: "November 11 hotfix thread",
    summary: "Another round of WoW: Forever fixes went live; the official forum thread collects the notes and player bug reports.",
    source: "Blizzard Forums", url: "https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-11-2026/2403040"
  },
  {
    date: "2026-11-10", tag: "hotfix",
    title: "Class and economy hotfixes; dungeon XP rebalanced",
    summary: "The November 10 hotfixes changed several Shaman abilities, fixed Hunter pet health and announced a lower auction house deposit (later delayed). Dungeon mob XP went up 50% while dungeon quest XP went down 50%.",
    source: "Warcraft Tavern", url: "https://www.warcrafttavern.com/forever/news/class-economy-changes-wow-forever-hotfixes-for-november-10/"
  },
  {
    date: "2026-11-09", tag: "hotfix",
    title: "Fewer players per zone",
    summary: "To ease crowded starting areas, Blizzard lowered how many players share a zone at once.",
    source: "Warcraft Tavern", url: "https://www.warcrafttavern.com/forever/news/player-population-reduction-in-zones-wow-forever-hotfixes-for-november-9/"
  },
  {
    date: "2026-11-07", tag: "official",
    title: "The hardware behind launch night",
    summary: "Blizzard says the November 4 launch ran on 3,924 virtual machines with 251,136 GB of RAM and 70,480 CPU cores. Launch queues were mostly minutes long, versus 20,000+ player queues in beta.",
    source: "TweakTown", url: "https://www.tweaktown.com/news/114533/wow-forever-ran-on-251136gb-of-ram-and-70480-cpu-cores-to-survive-its-launch-night/index.html"
  },
  {
    date: "2026-11-06", tag: "official",
    title: "Blizzard: 'biggest launch in WoW history'",
    summary: "Blizzard says Forever set the record for peak concurrent players in WoW's history — but hasn't shared an exact number. Third-party estimates vary wildly.",
    source: "Timesaver.gg", url: "https://timesaver.gg/blog/wow-forever-player-count"
  },
  {
    date: "2026-11-06", tag: "hotfix",
    title: "First post-launch hotfixes",
    summary: "The first wave of live fixes after launch arrived on November 5–6.",
    source: "Blizzard", url: "https://worldofwarcraft.blizzard.com/en-us/news/24307310/"
  },
  {
    date: "2026-11-04", tag: "launch",
    title: "WoW: Forever is live",
    summary: "Forever launched worldwide on November 4 at 3:00 p.m. PST (23:00 UTC; November 5 in Europe and Asia). Levels 1–60, 1,000+ new quests, nine new dungeons and the new Skyborne race.",
    source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-launch-details"
  },
  {
    date: "2026-10-29", tag: "roadmap",
    title: "Roadmap: raids Dec 9, Hardcore this winter, more in 2027",
    summary: "Barrow Deeps, Hyjal Summit and Onyxia's Lair open December 9. Hardcore follows in winter, then new raids, dungeons, zones and a legendary questline in spring and summer 2027 (exact dates not announced).",
    source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-roadmap-new-zones-raids-dungeons-and-more"
  },
  {
    date: "2026-10-14", tag: "official",
    title: "Temporary Economy Holds against gold buying",
    summary: "Accounts suspected of real-money gold trading can have trading, mail, guild banks and the auction house locked while Blizzard investigates. Gold buyers risk gold removal, suspension or a permanent ban.",
    source: "GosuGamers", url: "https://www.gosugamers.net/entertainment/news/79353-world-of-warcraft-introduces-temporary-trading-restrictions-to-combat-real-money-gold-buying"
  },
  {
    date: "2026-09-17", tag: "official",
    title: "Beta opens",
    summary: "The WoW: Forever beta started days after the BlizzCon 2026 reveal, with login queues above 20,000 players on day one.",
    source: "Blizzard Forums", url: "https://eu.forums.blizzard.com/en/wow/t/22000-login-queue-during-the-beta-%E2%80%94-what-happens-at-launch/629259"
  }
];

/* ---------------- QUICK TIPS (each backed by a source) ---------------- */
CODEX.tips = [
  { text: "Don't hoard quests for gold at 60 — Forever has no XP-to-gold conversion for max-level quest turn-ins.", source: "Blizzard hotfix notes, Nov 16", url: "https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-16-2026" },
  { text: "Item Restoration is switched off right now. Think twice before vendoring or deleting gear you might want back.", source: "Blizzard hotfix notes, Nov 16", url: "https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-16-2026" },
  { text: "Save 50 gold for level 40: that's when Dual Specialization unlocks at your class trainer. Swapping is free outside combat, and respec fees decay back to 1 gold over time.", source: "Warcraft Wiki", url: "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" },
  { text: "Miners: Spectral Iron Ore now spawns more often after the Nov 17 hotfix.", source: "Blizzard hotfix notes, Nov 17", url: "https://worldofwarcraft.blizzard.com/en-us/news/24315281" },
  { text: "Onyxia's Lair needs prerequisite steps — start the attunement before raids open on December 9.", source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-launch-details" },
  { text: "Legacy progress is account-wide and horizontal, so you never have to level an alt to keep up.", source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-launch-details" },
  { text: "Camp Feature buffs from the camping system can conflict with some class buffs — check before a pull.", source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-launch-details" },
  { text: "Classic or Enhanced? The first-login preset (HD models, quest markers, one-bag, transmog) can be changed later in settings, so don't stress the choice.", source: "Maxroll", url: "https://maxroll.gg/wow-forever/news/wow-forever-launch-details" },
  { text: "Grouping with a much higher-level friend? Dungeon enemies give zero XP if they're gray to anyone in the party, so run dungeons with players near your level.", source: "Hotfixes, Nov 13", url: "https://accountshark.net/blog/wow-forever-hotfixes-november-13-dungeon-xp-trivial-enemies-stun-diminishing-returns-wild-growth-judgement-of-command" },
  { text: "Never buy gold. Suspected accounts get trading, mail and auction house locked during investigation, and confirmed buyers can be banned.", source: "GosuGamers", url: "https://www.gosugamers.net/entertainment/news/79353-world-of-warcraft-introduces-temporary-trading-restrictions-to-combat-real-money-gold-buying" },
  { text: "World buffs from the Chronoboon Displacer only work in the open world — they're removed when you enter dungeons and raids.", source: "Warcraft Wiki", url: "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" },
  { text: "There are no realms to pick: each ruleset (Normal, PvP, RP, RP-PvP) is one mega-realm per region, and character names are first + last and unique per region.", source: "Warcraft Wiki", url: "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" }
];

/* ---------------- QUICK FACTS ---------------- */
CODEX.facts = [
  { value: "60", label: "Level cap (permanent)" },
  { value: "9", label: "Classes" },
  { value: "9", label: "Races, incl. Skyborne" },
  { value: "9", label: "New dungeons" },
  { value: "3", label: "Raids open Dec 9" },
  { value: "1,000+", label: "New quests" }
];

/* ---------------- ROADMAP ---------------- */
CODEX.roadmap = [
  { when: "September 2026", date: "2026-09-12", title: "Announced at BlizzCon 2026", items: ["World of Warcraft: Forever revealed as a permanent new version of WoW"] },
  { when: "September 17, 2026", date: "2026-09-17", title: "Beta", items: ["Beta opens; huge login queues on day one"] },
  { when: "October 21, 2026", date: "2026-10-21", title: "Stress test", items: ["Final server stress test before launch"] },
  { when: "October 27, 2026", date: "2026-10-27", title: "Name reservation", items: ["Reserve up to three characters per account"] },
  { when: "November 4, 2026 — 23:00 UTC", date: "2026-11-04T23:00:00Z", title: "Launch", items: ["Levels 1–60, new zones, nine new dungeons", "Skyborne race and new race/class combinations", "Darkspear Islands 15v15 battleground"] },
  { when: "December 9, 2026", date: "2026-12-09", title: "Raids unlock", countdown: true, items: ["Barrow Deeps (10 players)", "Hyjal Summit (20 players)", "Onyxia's Lair (40 players, needs prerequisites)"] },
  { when: "Winter 2026/27", date: "2027-01-15", title: "Hardcore mode", items: ["Hardcore ruleset joins the mega-realm lineup"] },
  { when: "Spring 2027", date: "2027-04-15", title: "Major update", items: ["2 new raids and 2 new dungeons", "New quests and playable area", "New legendary questline", "PvP season refresh"] },
  { when: "Summer 2027", date: "2027-07-15", title: "Major update", items: ["A revamped iconic raid plus a new raid", "Expanded world content and 2 new dungeons", "PvP season refresh", "Profession and Legacy updates"] }
];

/* ---------------- CLASSES ----------------
   races: names; prefix "*" marks a combination that is NEW in Forever. */
CODEX.classes = [
  { id: "druid", name: "Druid", roles: ["Tank", "Healer", "Damage"], specs: "Balance · Feral Combat · Restoration",
    blurb: "Shapeshifter that can fill every role — bear tank, cat or caster damage, or tree-hugging healer.",
    races: ["Night Elf", "Tauren"],
    changes: [
      "Overgrowth — a Forever-specific Balance talent",
      "Teleport: Moonglade from a quest at level 10",
      "Frenzied Regeneration from the trainer at 36"
    ] },
  { id: "hunter", name: "Hunter", roles: ["Damage"], specs: "Beast Mastery · Marksmanship · Survival",
    blurb: "Ranged fighter with a loyal pet. Great solo leveller and one of the easiest classes to start with.",
    races: ["Dwarf", "Night Elf", "*Human", "Orc", "Tauren", "Troll"],
    changes: [
      "Lone Wolf — a Forever-specific first-row Marksmanship talent",
      "Barrage and Sniper Shot added to the Marksmanship tree",
      "Volley from the trainer at 40"
    ] },
  { id: "mage", name: "Mage", roles: ["Damage"], specs: "Arcane · Fire · Frost",
    blurb: "Glass-cannon caster with crowd control, portals and free food and water for the group.",
    races: ["Human", "Gnome", "*Skyborne (High Order)", "*Orc", "Troll", "Undead"],
    changes: [
      "Brand-new: Arcane Wrath (Arcane talent, needs Arcane Blast)",
      "Brand-new: Teleport: Dalaran at level 50",
      "Removed: Detect Magic",
      "Frostfire Bolt from the trainer at 40; Heating Up is a Fire talent"
    ] },
  { id: "paladin", name: "Paladin", roles: ["Healer", "Tank", "Damage"], specs: "Holy · Protection · Retribution",
    blurb: "Plate-wearing holy warrior with auras and blessings. Forever adds the Undead paladin for the Horde.",
    races: ["Human", "Dwarf", "*Undead"],
    changes: [
      "Horde paladins get their own level-60 mount: Summon Forsaken Charger",
      "Consecrated Ground (Holy) and Turn Evil (Retribution) — Forever-specific talents",
      "Repentance is a first-row Retribution talent"
    ] },
  { id: "priest", name: "Priest", roles: ["Healer", "Damage"], specs: "Discipline · Holy · Shadow",
    blurb: "The classic healer, or a Shadow damage dealer. Gnomes can now take up the Light.",
    races: ["Human", "Dwarf", "Night Elf", "*Gnome", "Troll", "Undead"],
    changes: [
      "Penance (Discipline) and Prayer of Mending (Holy) are in the talent trees",
      "Gnome priests learn Confounding Flash and Contingency Plan from race quests",
      "Night elf priests learn Starshards at level 10"
    ] },
  { id: "rogue", name: "Rogue", roles: ["Damage"], specs: "Assassination · Combat · Subtlety",
    blurb: "Stealthy melee striker with stuns, poisons and lockpicking.",
    races: ["Human", "Dwarf", "Night Elf", "Gnome", "Orc", "Troll", "Undead"],
    changes: [
      "Hack and Slash — a Forever-specific Combat talent",
      "Mutilate is the final Assassination talent",
      "Death Mark is the final Subtlety talent"
    ] },
  { id: "shaman", name: "Shaman", roles: ["Healer", "Damage"], specs: "Elemental Combat · Enhancement · Restoration",
    blurb: "Totem-dropping hybrid. Now available to Alliance Dwarves and Horde Windshaper Skyborne.",
    races: ["*Dwarf", "Orc", "*Skyborne (Windshaper)", "Tauren", "Troll"],
    changes: [
      "Totemic Call (Forever version) from the trainer at 22",
      "Riptide is the final Restoration talent",
      "Lightning Mastery (Forever version) is the final Elemental talent",
      "Call of the Spirits from the trainer at 40"
    ] },
  { id: "warlock", name: "Warlock", roles: ["Damage"], specs: "Affliction · Demonology · Destruction",
    blurb: "Demon-summoning caster with damage-over-time spells, fear and soul stones. Trolls join the ranks.",
    races: ["Human", "Gnome", "Orc", "*Troll", "Undead"],
    changes: [
      "The Sayaad demon (with Lash of Pain at 20) is among your minions",
      "Final talents: Wrack (Affliction), Demonic Pact (Demonology), Bane of Havoc (Destruction)",
      "Bane of Doom from the trainer at 60"
    ] },
  { id: "warrior", name: "Warrior", roles: ["Tank", "Damage"], specs: "Arms · Fury · Protection",
    blurb: "The iconic plate tank and melee damage dealer. Gear-hungry but very rewarding at 60.",
    races: ["Human", "Dwarf", "Night Elf", "Gnome", "Orc", "Tauren", "Troll", "Undead"],
    changes: [
      "Berserker Stance comes from the quest The Affray at 30",
      "Death Wish is the final Fury talent; Shield Slam the final Protection talent"
    ] }
];

/* ---------------- RACES ---------------- */
CODEX.races = [
  { name: "Human", faction: "Alliance", racials: ["Perception", "Ruthless", "The Human Spirit", "Will to Survive"] },
  { name: "Dwarf", faction: "Alliance", racials: ["Artisan's Precision", "Big Game Hunter", "Find Treasure", "Stoneform"] },
  { name: "Night Elf", faction: "Alliance", racials: ["Elune's Light", "Quickness", "Shadowmeld", "Wisp Spirit"] },
  { name: "Gnome", faction: "Alliance", racials: ["Engineering Specialization", "Escape Artist", "Eureka!", "Expansive Mind"] },
  { name: "Skyborne (High Order)", faction: "Alliance", isNew: true, racials: ["Elemental Insight", "Read Leyline", "Walk on Air", "Wind Blessed"] },
  { name: "Orc", faction: "Horde", racials: ["Blood Fury", "Command", "Hardiness", "Shatter Curse"] },
  { name: "Undead", faction: "Horde", racials: ["Cannibalize", "Touch of the Grave", "Underwater Breathing", "Will of the Forsaken"] },
  { name: "Tauren", faction: "Horde", racials: ["Cultivation", "Endurance", "Plainsrunning", "War Stomp"] },
  { name: "Troll", faction: "Horde", racials: ["Beast Slaying", "Berserking", "Rapid Regeneration", "Regeneration"] },
  { name: "Skyborne (Windshaper)", faction: "Horde", isNew: true, racials: ["Elemental Insight", "Skysight", "Walk on Air", "Wind Blessed"] }
];

/* ---------------- DUNGEONS & RAIDS ---------------- */
CODEX.dungeons = [
  { name: "Hall of Thanes", zone: "Ironforge", min: 13, max: 20, isNew: true },
  { name: "Ragefire Chasm", zone: "Orgrimmar", min: 13, max: 19 },
  { name: "Ruins of Lordaeron", zone: "Undercity", min: 15, max: 22, isNew: true },
  { name: "Wailing Caverns", zone: "The Barrens", min: 15, max: 24 },
  { name: "The Deadmines", zone: "Westfall", min: 17, max: 26 },
  { name: "Shadowfang Keep", zone: "Silverpine Forest", min: 20, max: 30 },
  { name: "The Stockade", zone: "Stormwind", min: 24, max: 32 },
  { name: "Blackfathom Deeps", zone: "Ashenvale", min: 24, max: 32 },
  { name: "Excavation Site: Wetlands", zone: "Wetlands", min: 26, max: 33, isNew: true },
  { name: "City of Dalaran", zone: "Alterac Mountains", min: 28, max: 35, isNew: true },
  { name: "Razorfen Kraul", zone: "The Barrens", min: 29, max: 38 },
  { name: "Gnomeregan", zone: "Dun Morogh", min: 29, max: 38 },
  { name: "Scarlet Monastery: Graveyard", zone: "Tirisfal Glades", min: 30, max: 38 },
  { name: "Scarlet Monastery: Library", zone: "Tirisfal Glades", min: 33, max: 41 },
  { name: "The Drowned City", zone: "Stranglethorn Vale", min: 35, max: 42, isNew: true },
  { name: "Scarlet Monastery: Armory", zone: "Tirisfal Glades", min: 36, max: 44 },
  { name: "Razorfen Downs", zone: "The Barrens", min: 37, max: 46 },
  { name: "Scarlet Monastery: Cathedral", zone: "Tirisfal Glades", min: 38, max: 46 },
  { name: "Krol'dok Stronghold", zone: "Riverglades", min: 40, max: 47, isNew: true },
  { name: "Uldaman", zone: "Badlands", min: 41, max: 51 },
  { name: "Zul'Farrak", zone: "Tanaris", min: 44, max: 54 },
  { name: "Maraudon", zone: "Desolace", min: 46, max: 55 },
  { name: "Alcaz Prison", zone: "Dustwallow Marsh", min: 48, max: 55, isNew: true },
  { name: "Sunken Temple", zone: "Swamp of Sorrows", min: 50, max: 60 },
  { name: "Blackrock Depths", zone: "Blackrock Mountain", min: 52, max: 60 },
  { name: "Dire Maul: Warpwood Quarter", zone: "Feralas", min: 54, max: 60 },
  { name: "Lower Blackrock Spire", zone: "Blackrock Mountain", min: 55, max: 60 },
  { name: "Blackmaw Hold", zone: "Azshara", min: 55, max: 60, isNew: true },
  { name: "Dire Maul: Capital Gardens", zone: "Feralas", min: 56, max: 60 },
  { name: "Dire Maul: Gordok Commons", zone: "Feralas", min: 56, max: 60 },
  { name: "Shaper's Terrace", zone: "Un'Goro Crater", min: 58, max: 60, isNew: true },
  { name: "Stratholme: Main Gate", zone: "Eastern Plaguelands", min: 58, max: 60 },
  { name: "Stratholme: Service Gate", zone: "Eastern Plaguelands", min: 58, max: 60 },
  { name: "Scholomance", zone: "Western Plaguelands", min: 58, max: 60 },
  { name: "Upper Blackrock Spire", zone: "Blackrock Mountain", min: 59, max: 60 }
];

CODEX.raids = [
  { name: "Barrow Deeps", size: 10, isNew: true, opens: "Dec 9, 2026", note: "Caverns beneath Mount Hyjal. Listed as 10 players on the wiki's raid table; one wiki section says 20, so confirm at launch.",
    bosses: ["Deepscar Matriarch", "Khalith the Dreadspinner", "Amethrax", "Ravus and Darlissa", "Elder Tangleclaw", "Well of Sorrow", "Del'lynar Songwood", "Sonya Darkhallow"],
    url: "https://warcraft.wiki.gg/wiki/Barrow_Deeps_(instance)" },
  { name: "Hyjal Summit", size: 20, isNew: true, opens: "Dec 9, 2026", note: "A 13-boss climb up Mount Hyjal.",
    bosses: ["Bandalar", "Time-Lost Battalion", "Old Gloomlurker", "Kathris the Haunted", "Elder Minderel", "Council of Thorns", "The Wild King", "Ancient of Decay", "Sylvesteris Dusksong", "Gharalis the Abyssal", "Anara Chillwind", "Tracker Stillwind", "Nythus the Dreambound"],
    url: "https://warcraft.wiki.gg/wiki/Hyjal_Summit_(instance)" },
  { name: "Onyxia's Lair", size: 40, isNew: false, opens: "Dec 9, 2026", note: "The classic dragon lair in Dustwallow Marsh. Requires prerequisite steps (per Maxroll).",
    bosses: ["Onyxia"], url: "https://warcraft.wiki.gg/wiki/Onyxia%27s_Lair_(Classic)" }
];

/* New-dungeon spotlight (boss order from Warcraft Wiki instance pages) */
CODEX.newDungeons = [
  { name: "Hall of Thanes", where: "Beneath the High Seat in Ironforge", levels: "13–20",
    about: "Low-level dungeon under Ironforge, mostly Alliance quests. Horde can get in, but the city guards make it risky.",
    bosses: ["Faldrim Anvilmar", "Magmatus", "Plunder", "Durgen Dirgehammer"], url: "https://warcraft.wiki.gg/wiki/Hall_of_Thanes_(instance)" },
  { name: "Ruins of Lordaeron", where: "The ruined city above the Undercity, Tirisfal Glades", levels: "15–22",
    about: "Plague-and-undead themed dungeon with quests for both factions.",
    bosses: ["Witherfang", "The Baron", "Viktor the Vile", "The Abandoned", "Bjork", "Rath'mael"], url: "https://warcraft.wiki.gg/wiki/Ruins_of_Lordaeron_(instance)" },
  { name: "Excavation Site: Wetlands", where: "Wetlands", levels: "26–33",
    about: "A dig site full of relics. Quests start around 24; the last boss is level 31.",
    bosses: ["Saltspine", "Shadetooth", "Relic Guardian"], url: "https://warcraft.wiki.gg/wiki/Excavation_Site:_Wetlands" },
  { name: "City of Dalaran", where: "Western Dalaran, Alterac Mountains", levels: "28–35",
    about: "Sewer dungeon beneath Dalaran with arcane and undead foes. You need a Dalaran Sewer Key; Horde have a five-quest attunement.",
    bosses: ["Atrexis the Grave Knight", "Arcane Anomaly", "Arcanic Enigma", "Unstable Sentinel", "Mana Devourer", "Fel Ancient", "Lyn the Ignored", "Shade of the Archmage"], url: "https://warcraft.wiki.gg/wiki/City_of_Dalaran" },
  { name: "The Drowned City", where: "Underwater entrance in Stranglethorn Vale", levels: "35–42",
    about: "A sunken troll city you reach by swimming down. Watch for the rares Umbra and Gill.",
    bosses: ["Zul'Alai", "Var'Taka", "Primeval Elemental", "Captain Dreadrise", "Deathless Marrow", "Min'loth the Serpent"], url: "https://warcraft.wiki.gg/wiki/Drowned_City" },
  { name: "Krol'dok Stronghold", where: "Riverglades, north of Sunnyglade", levels: "40–47",
    about: "Ogre stronghold run by the Twilight's Hammer.",
    bosses: ["Slavecrusher Grox", "Twilight Commander Zarmok", "War Handler Ashka", "Nar'gurk", "Bossman Toof", "Overlord Mugg"], url: "https://warcraft.wiki.gg/wiki/Krol%27dok_Stronghold" },
  { name: "Alcaz Prison", where: "Alcaz Island, Dustwallow Marsh", levels: "48–55",
    about: "Island prison with quest lines for both Horde and Alliance prisoners.",
    bosses: ["The Questioner", "Tidemistress Ca'zass", "Overseer Wrex", "Katerina the Cleaner", "Blazeroar"], url: "https://warcraft.wiki.gg/wiki/Alcaz_Prison" },
  { name: "Blackmaw Hold", where: "Azshara", levels: "55–60",
    about: "Home of the Blackmaw furbolg tribe. Rares: Moontouched Wanderer and Tunnelweb Matriarch.",
    bosses: ["Bonesnout the Unbroken", "Elder Shaman Bloodmane", "Impaan the Imprisoner", "Unbound Spirit", "Varrox Bleakhoof", "Withermaw"], url: "https://warcraft.wiki.gg/wiki/Blackmaw_Hold_(instance)" },
  { name: "Shaper's Terrace", where: "Un'Goro Crater", levels: "58–60",
    about: "Endgame dungeon in Un'Goro Crater, a zone steeped in titan lore. Boss details aren't documented yet — check back soon.",
    bosses: [], url: "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" }
];

CODEX.zones = [
  { name: "Zephras Isle", text: "Brand-new starting island for levels 1–12." },
  { name: "Riverglades", text: "New mid-level zone with 150+ quests, aimed at roughly the mid-30s to mid-40s. Home of Krol'dok Stronghold." },
  { name: "Mount Hyjal", text: "Finally playable at launch, and site of the Hyjal Summit raid." },
  { name: "Shen'dralas", text: "One of Forever's brand-new zones." },
  { name: "Dalaran (Alterac Mountains)", text: "The mage city in its original location, with the City of Dalaran dungeon." }
];

/* ---------------- GUIDE DIRECTORY (external links) ---------------- */
CODEX.guideCategories = ["Class guides", "Talents", "Leveling", "Dungeons & raids", "Tier lists", "Database & wiki", "News & patch notes", "Server status"];

CODEX.guides = [
  { cat: "Class guides", site: "Icy Veins", title: "Class guides for all nine classes", desc: "Spec overviews, rotations, gear and talents — one of the most trusted WoW guide sites.", url: "https://www.icy-veins.com/wow-forever/class-guides" },
  { cat: "Class guides", site: "Mobalytics", title: "Class hub and leveling builds", desc: "Per-class pages with leveling builds and talent recommendations.", url: "https://mobalytics.gg/wow-forever/classes" },
  { cat: "Class guides", site: "Mobalytics", title: "Community class guides", desc: "Player-written guides, rated by the community.", url: "https://mobalytics.gg/wow-forever/community-class-guides" },
  { cat: "Class guides", site: "Skill Capped", title: "Forever class articles", desc: "Guides from a well-known coaching site, with rankings once players hit 60.", url: "https://www.skill-capped.com/wowarticles/forever/" },
  { cat: "Class guides", site: "Games.gg", title: "Every class's new abilities and talent changes", desc: "A single page summarising what changed for each class compared with original WoW.", url: "https://games.gg/world-of-warcraft/guides/wow-forever-every-class-new-ability-and-talent-change/" },
  { cat: "Talents", site: "Icy Veins", title: "Talent calculator", desc: "Plan and share talent builds for every class.", url: "https://www.icy-veins.com/wow-forever/talent-calculator" },
  { cat: "Talents", site: "Zockify", title: "Talent planner", desc: "Alternative talent calculator, updated as talents change.", url: "https://www.zockify.com/forever/talents/" },
  { cat: "Talents", site: "Power Up Gaming", title: "Talent changes vs. Classic", desc: "What's different in Forever's talent trees compared with Classic.", url: "https://powerupgaming.co.uk/2026/09/14/new-wow-forever-talents-changes-vs-classic-guide/" },
  { cat: "Leveling", site: "Mobalytics", title: "Community leveling guides", desc: "Route and leveling guides written by players.", url: "https://mobalytics.gg/wow-forever/community-leveling-guides" },
  { cat: "Leveling", site: "Warcraft Tavern", title: "Beginner guides", desc: "Starter guides for new and returning players.", url: "https://www.warcrafttavern.com/forever/guides/type/beginner/" },
  { cat: "Leveling", site: "Mobalytics", title: "Quest database", desc: "Look up quests, rewards and where to find them.", url: "https://mobalytics.gg/wow-forever/quests" },
  { cat: "Dungeons & raids", site: "Icy Veins", title: "Dungeon and raid guides", desc: "Boss strategies and loot for dungeons and raids.", url: "https://www.icy-veins.com/wow-forever/dungeon-and-raid-guides" },
  { cat: "Dungeons & raids", site: "Mobalytics", title: "Raid hub", desc: "Raid overviews ahead of the December 9 unlock.", url: "https://mobalytics.gg/wow-forever/raids" },
  { cat: "Tier lists", site: "Mobalytics", title: "Tier list", desc: "Class and spec rankings, updated as the meta settles.", url: "https://mobalytics.gg/wow-forever/tier-list" },
  { cat: "Database & wiki", site: "Wowhead", title: "Wowhead", desc: "The biggest WoW database: items, quests, NPCs, comments and news.", url: "https://www.wowhead.com/" },
  { cat: "Database & wiki", site: "Warcraft Wiki", title: "World of Warcraft: Forever", desc: "Community wiki page covering features, dungeons, races and the roadmap.", url: "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" },
  { cat: "Database & wiki", site: "Gamer Guides", title: "WoW Forever wiki", desc: "Zones, quests, dungeons, classes, professions and races.", url: "https://gamer-guides.com/wiki/wow-forever/" },
  { cat: "News & patch notes", site: "Blizzard", title: "Official WoW news", desc: "Patch notes, hotfixes and announcements straight from Blizzard.", url: "https://worldofwarcraft.blizzard.com/en-us/news" },
  { cat: "News & patch notes", site: "Blue Tracker", title: "Blue posts tracker", desc: "Every official Blizzard forum post in one feed.", url: "https://www.bluetracker.gg/wow/" },
  { cat: "News & patch notes", site: "PC Games (DE)", title: "WoW Forever overview (German)", desc: "German-language guide and tips round-up.", url: "https://www.pcgames.de/World-of-Warcraft-Spiel-42971/Specials/WoW-Forever-Guides-Tipps-Uebersicht-1555221/" },
  { cat: "Server status", site: "ForeverStatus", title: "Login queue tracker", desc: "Live queue sizes and wait times by ruleset.", url: "https://foreverstatus.com/queue/" },
  { cat: "Server status", site: "Blizzard Forums", title: "Forever bug report forum", desc: "Official place for known issues and hotfix threads.", url: "https://us.forums.blizzard.com/en/wow/t/wow-forever-hotfixes-november-11-2026/2403040" }
];

/* ---------------- JOURNEY CHECKLIST ---------------- */
CODEX.checklist = [
  { group: "First login", items: [
    { id: "preset", text: "Pick the Classic or Enhanced experience preset", hint: "Enhanced = HD models, quest markers, one-bag, transmog. Changeable later." },
    { id: "ruleset", text: "Choose your ruleset: Normal, PvP, Roleplay or RP-PvP", hint: "One mega-realm per ruleset per region." },
    { id: "name", text: "Grab a first + last name before someone else does", hint: "Names are unique across your whole region." }
  ]},
  { group: "Levels 1–30", items: [
    { id: "zephras", text: "Try the new Zephras Isle start (1–12)" },
    { id: "thanes", text: "Run Hall of Thanes (13–20) or Ruins of Lordaeron (15–22)", hint: "Two of the nine new dungeons." },
    { id: "camp", text: "Set up your first campsite", hint: "A Cooking campfire becomes a shared camp; others can add Camp Features." },
    { id: "wetlands", text: "Clear Excavation Site: Wetlands (26–33)" },
    { id: "dalaran", text: "Visit Dalaran in Alterac Mountains and run City of Dalaran (28–35)" }
  ]},
  { group: "Levels 30–50", items: [
    { id: "drowned", text: "Explore The Drowned City in Stranglethorn (35–42)" },
    { id: "riverglades", text: "Quest through the Riverglades (150+ quests)" },
    { id: "dualspec", text: "Buy Dual Specialization at 40 (50 gold)" },
    { id: "kroldok", text: "Take on Krol'dok Stronghold (40–47)" },
    { id: "alcaz", text: "Break into Alcaz Prison (48–55)" }
  ]},
  { group: "Level 60", items: [
    { id: "hit60", text: "Reach level 60" },
    { id: "blackmaw", text: "Clear Blackmaw Hold (Azshara)" },
    { id: "shaper", text: "Clear Shaper's Terrace (Un'Goro)" },
    { id: "legacy", text: "Start earning Legacy points (account-wide)" },
    { id: "darkspear", text: "Play a Darkspear Islands 15v15 battleground" },
    { id: "ony", text: "Finish the Onyxia's Lair prerequisites" }
  ]},
  { group: "Raids — December 9", items: [
    { id: "barrow", text: "Barrow Deeps (10-player)" },
    { id: "hyjal", text: "Hyjal Summit (20-player)" },
    { id: "onyxia", text: "Onyxia's Lair (40-player)" }
  ]}
];

/* ---------------- SYSTEMS GUIDE ----------------
   Each section: own-words explanation + source link. */
var WIKI_FOREVER = "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever";
var MAXROLL_LAUNCH = "https://maxroll.gg/wow-forever/news/wow-forever-launch-details";

CODEX.systems = [
  { id: "start", title: "Getting started: presets, rulesets and names", icon: "⚑", points: [
      "On first login you pick a <b>Classic</b> or <b>Enhanced</b> preset. Enhanced turns on HD character models, quest markers on the map, one-bag mode and transmog. Every option can be changed later.",
      "There's no realm list. Each ruleset — <b>Normal, PvP, Roleplay, RP-PvP</b> (and <b>Hardcore</b> later) — is a single mega-realm per region.",
      "Characters get a <b>first and last name</b> that's unique across the whole region."
    ], sources: [["Maxroll", MAXROLL_LAUNCH], ["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "dualspec", title: "Dual talent specialization", icon: "⚔", points: [
      "Unlocks at <b>level 40</b> from your class trainer for <b>50 gold</b>.",
      "Swap between your two specs any time you're out of combat and not in a battleground.",
      "Changing talents inside a spec still costs a respec fee. Each spec has its own fee, and it drops over time toward 1 gold."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "legacy", title: "Legacy (account-wide progress)", icon: "♛", points: [
      "Legacy replaces achievements. Completing <b>Legacy Challenges</b> — for example levelling a class to 25, 40 or 60 — earns account-wide Legacy Points.",
      "Points unlock perks and cosmetics. Launch rewards include a Spectral Bear companion, a Spectral Bear tabard and the Reins of the Spectral Bear mount.",
      "It's horizontal progression: you never <i>have</i> to level alts to stay competitive."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER], ["Maxroll", MAXROLL_LAUNCH]] },
  { id: "camping", title: "Camping", icon: "▲", points: [
      "Unlocked early (around level 5) through a quest chain that includes <b>The Great Outdoors</b>, started by an adventurer outside your starting area.",
      "A Cooking campfire becomes a <b>shared campsite</b>. Nearby players can add up to three profession-crafted Camp Features to it.",
      "Camp buffs don't stack with equivalent class buffs. Advanced camping abilities drop in dungeons and can add crafting stations."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER], ["Maxroll", MAXROLL_LAUNCH]] },
  { id: "professions", title: "Professions", icon: "⚒", points: [
      "Two primary professions plus the secondary skills Cooking, First Aid and Fishing.",
      "Extra recipes come from new trade vendors, and loot crates can be traded in for reputation and Merchant's Favor.",
      "Levelling crafting professions also earns Legacy Points.",
      "Minor Healing Potion moved from Alchemy to First Aid.",
      "<b>Reagent bags</b> from modern WoW are in, with their own bag slot."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "weekly", title: "Level-60 weekly quests", icon: "✦", points: [
      "Pix Xizzix in <b>Booty Bay</b> offers weekly quests for \"In Demand\" items such as Titan Relics and Plague Records.",
      "Level 55+ dungeon bosses drop <b>Tarnished Undermine Reals</b>, which you trade to Pix Xizzix.",
      "Rewards include an Undermine Satchel for clearing max-level dungeons."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "sod", title: "Returning Season of Discovery features", icon: "✧", points: [
      "<b>Cozy Sleeping Bag</b> — a stacking XP buff and extra rested XP; earned from a scavenger hunt starting at level 14.",
      "<b>Chronoboon Displacer</b> — stores world buffs, but they only work in the open world and are removed in dungeons and raids.",
      "<b>Library books</b> — any class can turn them in (in Stormwind or the Undercity) for reward quests.",
      "<b>Rune puzzles</b> return with different rewards."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "travel", title: "New travel routes", icon: "⛵", points: [
      "<b>Stormwind ⇄ Auberdine</b> (Darkshore) — a new Alliance boat.",
      "<b>Valanaar Skydocks ⇄ Zephras Isle</b> — the way to the new starting island.",
      "<b>Gadgetzan ⇄ Powderfuse Port</b> — the neutral link to the Riverglades.",
      "Dalaran is back in the Alterac Mountains; Mages learn Teleport: Dalaran at 50."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER]] },
  { id: "collections", title: "Collections and editions", icon: "❖", points: [
      "Transmog, toys, mounts and companions are <b>account-wide Collections</b>.",
      "Forever is included with a regular WoW subscription or game time.",
      "Playing <b>Skyborne</b> requires the optional Skyborne Heroic or Epic Pack (or the limited-time Warcraft Forever Collection), which also include cosmetics.",
      "Pack mounts: Cerulean Prideclaw and the Veteran Adventurer's Loyal Companion."
    ], sources: [["Warcraft Wiki", WIKI_FOREVER], ["Battle.net Shop", "https://us.shop.battle.net/en-us/product/world-of-warcraft-forever"]] },
  { id: "economy", title: "Economy rules and XP", icon: "⚖", points: [
      "Gold buying is actively punished: suspected accounts get a <b>Temporary Economy Hold</b> on trading, mail, guild bank and auction house; buyers risk gold removal, suspension or bans.",
      "Dungeon enemies give <b>no XP</b> if they're gray to anyone in the group. Blizzard is still tuning dungeon vs. quest XP.",
      "There's no XP-to-gold conversion for quests at 60, so don't hoard quests.",
      "Blizzard said before launch it has no plans for a WoW Token in Forever."
    ], sources: [["GosuGamers", "https://www.gosugamers.net/entertainment/news/79353-world-of-warcraft-introduces-temporary-trading-restrictions-to-combat-real-money-gold-buying"], ["Massively OP", "https://massivelyop.com/2026/09/14/world-of-warcraft-forever-aims-to-combat-dungeon-boosting-says-no-plans-for-wow-tokens/"], ["Blizzard", "https://news.blizzard.com/en-us/article/24315281/wow-forever-hotfixes-november-16-2026"]] }
];

/* ---------------- FAQ ---------------- */
CODEX.faq = [
  { q: "Is WoW: Forever free?", a: "It's included with a normal World of Warcraft subscription or game time — no separate box to buy. The Skyborne race needs an optional Skyborne pack.", src: "systems.html#collections" },
  { q: "When did WoW: Forever launch?", a: "November 4, 2026 at 3:00 p.m. PST (23:00 UTC), which was November 5 in Europe and Asia.", src: "roadmap.html" },
  { q: "What's the level cap?", a: "60 — and it stays at 60 indefinitely. Future updates add content sideways instead of raising the cap.", src: "roadmap.html" },
  { q: "When do the raids open?", a: "December 9, 2026: Barrow Deeps, Hyjal Summit (20 players) and Onyxia's Lair (40). Our raid prep page has boss order and an attunement tracker.", src: "raids.html" },
  { q: "When is Hardcore mode coming?", a: "Winter 2026/2027. No exact date yet.", src: "roadmap.html" },
  { q: "Which race/class combinations are new?", a: "Orc Mage, Troll Warlock, Undead Paladin, Human Hunter, Gnome Priest and Dwarf Shaman — plus the Skyborne race (High Order Skyborne Mages for the Alliance, Windshaper Skyborne Shamans for the Horde).", src: "classes.html#matrix-section" },
  { q: "Can I choose a realm?", a: "No. Each ruleset (Normal, PvP, RP, RP-PvP) is one mega-realm per region, and names are unique across the region.", src: "systems.html#start" },
  { q: "When do I get dual spec?", a: "At level 40, for 50 gold from your class trainer.", src: "systems.html#dualspec" },
  { q: "Do I have to level alts for Legacy?", a: "No. Legacy is account-wide horizontal progression — alts help, but they aren't required.", src: "systems.html#legacy" },
  { q: "Why am I getting no XP in dungeons?", a: "Since the November 13 hotfix, dungeon enemies give zero XP if they're gray to anyone in your group. Group with players near your level.", src: "news.html" },
  { q: "Is there a WoW Token?", a: "Blizzard said before launch it has no plans for one in Forever. Buying gold from third parties can get your account locked or banned.", src: "systems.html#economy" },
  { q: "Which dungeons are new?", a: "Hall of Thanes, Ruins of Lordaeron, Excavation Site: Wetlands, City of Dalaran, The Drowned City, Krol'dok Stronghold, Alcaz Prison, Blackmaw Hold and Shaper's Terrace.", src: "dungeons.html#spotlight" }
];

/* ---------------- WOWHEAD LINKS ----------------
   Ability names that appear in class notes get linked to Wowhead's WoW: Forever database.
   A number = confirmed spell ID (hover tooltip with icon). 0 = no confirmed ID yet → links to a Wowhead search.
   IDs come from the "External links" on each Warcraft Wiki (Forever) page. */
CODEX.spells = {
  "Teleport: Dalaran": 1297659, "Heating Up": 400624, "Consecrated Ground": 1310905, "Turn Evil": 1328370, "Totemic Call": 437009,
  "Arcane Wrath": 0, "Frostfire Bolt": 0, "Overgrowth": 0, "Lone Wolf": 0, "Barrage": 0, "Sniper Shot": 0, "Volley": 0,
  "Repentance": 0, "Summon Forsaken Charger": 0, "Penance": 0, "Prayer of Mending": 0, "Confounding Flash": 0,
  "Contingency Plan": 0, "Starshards": 0, "Hack and Slash": 0, "Mutilate": 0, "Death Mark": 0, "Riptide": 0,
  "Lightning Mastery": 0, "Call of the Spirits": 0, "Wrack": 0, "Demonic Pact": 0, "Bane of Havoc": 0, "Bane of Doom": 0,
  "Berserker Stance": 0, "Death Wish": 0, "Shield Slam": 0, "Frenzied Regeneration": 0, "Teleport: Moonglade": 0,
  "Lash of Pain": 0, "Detect Magic": 0
};

/* ---------------- RAID PREP ---------------- */
CODEX.raidPrep = [
  { id: "lvl60", text: "Reach level 60", hint: "All three raids are level 60 content." },
  { id: "attune", text: "Finish the Onyxia attunement (Drakefire Amulet)", hint: "Only needed for Onyxia's Lair — use the tracker below." },
  { id: "group", text: "Line up a group of the right size", hint: "Barrow Deeps 10 · Hyjal Summit 20 · Onyxia's Lair 40." },
  { id: "dungeons", text: "Gear up in level-60 dungeons", hint: "Blackmaw Hold, Shaper's Terrace, Stratholme, Scholomance and Blackrock Spire." },
  { id: "consumables", text: "Stock up on potions, food and bandages", hint: "First Aid now also makes Minor Healing Potions." },
  { id: "reagents", text: "Buy class reagents and ammo", hint: "Raids are long — bring more than you think." },
  { id: "repair", text: "Save gold for repairs", hint: "Wipes are expensive while learning new bosses." },
  { id: "addon", text: "Install a boss-warning addon", hint: "Timers for boss abilities help a lot on brand-new fights." }
];

CODEX.attunement = {
  intro: "You need the Drakefire Amulet in your bags to enter Onyxia's Lair. The chain is long and both versions end by killing General Drakkisath in Upper Blackrock Spire.",
  sources: [["wow.gg (Alliance)", "https://wow.gg/guides/onyxias-lair-attunement-alliance"], ["wow.gg (Horde)", "https://wow.gg/guides/onyxias-lair-attunement-horde"], ["Guided", "https://guided.news/en/guides/wow-forever-onyxia-attunement-alliance-horde/"], ["WoW Forever Guides", "https://wowforeverguides.com/raids/onyxia/attunement"]],
  alliance: {
    start: "Starts at level 48 in Morgan's Vigil, Burning Steppes.",
    steps: [
      ["a1", "Dragonkin Menace", "Helendis Riverhorn, Morgan's Vigil (Burning Steppes)", "Kill black dragonkin in the eastern Burning Steppes."],
      ["a2", "The True Masters (1)", "Helendis Riverhorn", "Take his letter to Magistrate Solomon in Lakeshire, Redridge."],
      ["a3", "The True Masters (2)", "Magistrate Solomon, Lakeshire", "Bring Solomon's plea to Highlord Bolvar in Stormwind Keep."],
      ["a4", "The True Masters (3)", "Highlord Bolvar, Stormwind Keep", "Talk to Lady Katrana Prestor, then report back to Bolvar."],
      ["a5", "The True Masters (4)", "Highlord Bolvar", "Carry Bolvar's decree back to Solomon."],
      ["a6", "The True Masters (5)", "Magistrate Solomon", "Go to Marshal Maxwell in Morgan's Vigil."],
      ["a7", "The True Masters (6)", "Marshal Maxwell, Morgan's Vigil", "Find Ragged John north of the Ruins of Thaurissan and hear his story."],
      ["a8", "Marshal Windsor", "Marshal Maxwell", "Find Windsor's cell in the Blackrock Depths Detention Block."],
      ["a9", "Abandoned Hope", "Windsor's cell (Blackrock Depths)", "Report Windsor's condition to Maxwell."],
      ["a10", "A Crumpled Up Note", "Item dropped in Blackrock Depths", "Bring the note to Windsor. (Level 50+)"],
      ["a11", "A Shred of Hope", "Marshal Windsor", "Kill General Angerforge and Golem Lord Argelmach in BRD for the lost information."],
      ["a12", "Jail Break!", "Marshal Windsor", "Escort Windsor out of the prison, then report to Maxwell."],
      ["a13", "Stormwind Rendezvous", "Marshal Maxwell", "Meet Squire Rowe at the Stormwind gates to summon Windsor."],
      ["a14", "The Great Masquerade", "Reginald Windsor, Stormwind", "Escort Windsor into Stormwind Keep, then report to Bolvar."],
      ["a15", "The Dragon's Eye", "Highlord Bolvar", "Take the fragment to Haleh through the Mazthoril cave in Winterspring."],
      ["a16", "Drakefire Amulet", "Haleh, Winterspring", "Kill General Drakkisath in Upper Blackrock Spire and bring Haleh his blood."]
    ],
    notes: ["One guide calls step 7's NPC \"Shaggy John\"; the others say Ragged John."]
  },
  horde: {
    start: "Starts at level 55 with Warlord Goretooth in Kargath, Badlands.",
    steps: [
      ["h1", "Warlord's Command", "Warlord Goretooth, Kargath (Badlands)", "Kill Highlord Omokk, War Master Voone and Overlord Wyrmthalak in Lower Blackrock Spire for the Blackrock documents."],
      ["h2", "Eitrigg's Wisdom", "Warlord Goretooth", "Speak with Eitrigg, then Thrall, in Orgrimmar's Valley of Wisdom."],
      ["h3", "For The Horde!", "Thrall, Orgrimmar", "Kill Warchief Rend Blackhand in Blackrock Spire and bring Thrall his head."],
      ["h4", "What the Wind Carries", "Thrall", "Listen to Thrall's story."],
      ["h5", "The Champion of the Horde", "Thrall", "Find Rexxar on his patrol through Desolace and Feralas."],
      ["h6", "The Testament of Rexxar", "Rexxar", "Deliver the testament to Myranda the Hag near Chillwind Camp, Western Plaguelands."],
      ["h7", "Oculus Illusions", "Myranda the Hag", "Collect 20 Black Dragonspawn Eyes in Blackrock Spire."],
      ["h8", "Emberstrife", "Myranda the Hag", "Wear the Amulet of Draconic Subversion and speak to Emberstrife in Dustwallow Marsh."],
      ["h9", "The Test of Skulls (Scryer, Somnus, Chronalis)", "Emberstrife", "Kill Scryer (Winterspring), Somnus (Swamp of Sorrows) and Chronalis (Tanaris)."],
      ["h10", "The Test of Skulls (Axtroz)", "Emberstrife", "Kill Axtroz on the road to Grim Batol in the Wetlands."],
      ["h11", "Ascension…", "Emberstrife", "Take the Dull Drakefire Amulet to Rexxar."],
      ["h12", "Blood of the Black Dragon Champion", "Rexxar", "Kill General Drakkisath in Upper Blackrock Spire and return to Rexxar for the amulet."]
    ],
    notes: [
      "Two guides add a short opener, Blood and Thunder (speak with Goretooth); a third doesn't list it.",
      "Guides disagree on whether Rend Blackhand is in Lower or Upper Blackrock Spire — check your quest log.",
      "Some guides say you need a way into Upper Blackrock Spire (the Seal of Ascension); this isn't confirmed for Forever."
    ]
  }
};

/* ---------------- WEEKLY RESET ----------------
   Forever's reset hasn't been officially announced. These are the standard WoW reset times by region. */
CODEX.resetRegions = [
  { id: "us", name: "Americas & Oceania", day: 2, hourUTC: 15, label: "Tuesday 15:00 UTC" },
  { id: "eu", name: "Europe", day: 3, hourUTC: 4, label: "Wednesday 04:00 UTC" }
];
CODEX.lockoutTasks = [
  { id: "bd", name: "Barrow Deeps", short: "BD" },
  { id: "hs", name: "Hyjal Summit", short: "HS" },
  { id: "ony", name: "Onyxia's Lair", short: "Ony" },
  { id: "weekly", name: "Booty Bay weeklies", short: "Weekly" }
];

/* ---------------- GLOSSARY (general MMO terms, written for this site) ---------------- */
CODEX.glossary = [
  ["Aggro", "A monster's attention. The tank tries to hold aggro so enemies don't attack healers."],
  ["AoE", "Area of effect — an ability that hits everything in an area."],
  ["Attunement", "A quest or item you need before you're allowed into a dungeon or raid."],
  ["BiS", "Best in slot — the best item available for a gear slot."],
  ["CC", "Crowd control — stuns, sheeps, fears and roots that stop an enemy from acting."],
  ["Cooldown (CD)", "The waiting time before you can use an ability again."],
  ["DPS", "Damage per second — also used for the damage-dealing role."],
  ["DoT / HoT", "Damage over time / heal over time effects."],
  ["Gray mob", "An enemy so far below your level that it gives no XP. In Forever dungeons, gray to anyone means no XP for the group."],
  ["Kiting", "Moving away from an enemy while attacking it so it can't hit back."],
  ["Mega-realm", "Forever's one-big-realm-per-ruleset setup. There's no realm list to choose from."],
  ["Pull", "Starting a fight with a group of enemies — usually the tank's job."],
  ["Rested XP", "Bonus experience you build up while logged out in an inn or city."],
  ["Respec", "Resetting your talent points for a fee at your class trainer."],
  ["Reset", "The weekly moment raid and dungeon lockouts clear, which depends on your region."],
  ["Tank / Healer / DPS", "The three group roles: take hits, keep everyone alive, deal damage."],
  ["Trash", "The non-boss enemies between bosses in a dungeon or raid."],
  ["Wipe", "When the whole group dies in a fight."],
  ["World buff", "A powerful temporary buff from an event in the world. In Forever these only work in the open world."]
];
