-- Landfall: the parts with no game calls, so they can be tested outside the game (pipeline/landfall.test.js).
-- Zone and dungeon level ranges, how a range fits your level, territory, and when a card should show.
local _, ns = ...
local L = {}
ns.Logic = L

---------------------------------------------------------------------------------------------------
-- Level ranges. The game gives none on Forever (C_Map.GetMapLevels is empty), so these are the long-known
-- ranges, by uiMapID for zones and by instance ID (GetInstanceInfo's 8th value) for dungeons and raids.
-- Zones also say their continent ("K" Kalimdor, "E" Eastern Kingdoms, nil not known) and whose land they are
-- ("A" Alliance, "H" Horde, "C" contested, "X" never suggested), for suggesting where to level.

L.ZONES = {
  -- Kalimdor
  [1411] = { 1, 10, "K", "H" },  -- Durotar
  [1412] = { 1, 10, "K", "H" },  -- Mulgore
  [1438] = { 1, 10, "K", "A" },  -- Teldrassil
  [1439] = { 10, 20, "K", "A" }, -- Darkshore
  [1413] = { 10, 25, "K", "H" }, -- The Barrens
  [1442] = { 15, 27, "K", "C" }, -- Stonetalon Mountains
  [1440] = { 18, 30, "K", "C" }, -- Ashenvale
  [1441] = { 25, 35, "K", "C" }, -- Thousand Needles
  [1443] = { 30, 40, "K", "C" }, -- Desolace
  [1445] = { 35, 45, "K", "C" }, -- Dustwallow Marsh
  [1444] = { 40, 50, "K", "C" }, -- Feralas
  [1446] = { 40, 50, "K", "C" }, -- Tanaris
  [1447] = { 45, 55, "K", "C" }, -- Azshara
  [1448] = { 48, 55, "K", "C" }, -- Felwood
  [1449] = { 48, 55, "K", "C" }, -- Un'Goro Crater
  [1451] = { 55, 60, "K", "C" }, -- Silithus
  [1452] = { 55, 60, "K", "C" }, -- Winterspring
  -- Eastern Kingdoms
  [1429] = { 1, 10, "E", "A" },  -- Elwynn Forest
  [1426] = { 1, 10, "E", "A" },  -- Dun Morogh
  [1420] = { 1, 10, "E", "H" },  -- Tirisfal Glades
  [1436] = { 10, 20, "E", "A" }, -- Westfall
  [1432] = { 10, 20, "E", "A" }, -- Loch Modan
  [1421] = { 10, 20, "E", "H" }, -- Silverpine Forest
  [1433] = { 15, 25, "E", "A" }, -- Redridge Mountains
  [1431] = { 18, 30, "E", "C" }, -- Duskwood
  [1437] = { 20, 30, "E", "C" }, -- Wetlands
  [1424] = { 20, 30, "E", "C" }, -- Hillsbrad Foothills
  [1416] = { 30, 40, "E", "C" }, -- Alterac Mountains
  [1417] = { 30, 40, "E", "C" }, -- Arathi Highlands
  [1434] = { 30, 45, "E", "C" }, -- Stranglethorn Vale
  [1418] = { 35, 45, "E", "C" }, -- Badlands
  [1435] = { 35, 45, "E", "C" }, -- Swamp of Sorrows
  [1425] = { 40, 50, "E", "C" }, -- The Hinterlands
  [1427] = { 43, 50, "E", "C" }, -- Searing Gorge
  [1419] = { 45, 55, "E", "C" }, -- Blasted Lands
  [1428] = { 50, 58, "E", "C" }, -- Burning Steppes
  [1422] = { 51, 58, "E", "C" }, -- Western Plaguelands
  [1423] = { 53, 60, "E", "C" }, -- Eastern Plaguelands
  [1430] = { 55, 60, "E", "C" }, -- Deadwind Pass
  -- new in Forever
  [2521] = { 1, 12, nil, "X" },  -- Zephras Isle (the client has two map IDs for it)
  [2665] = { 1, 12, nil, "X" },
  [2548] = { 35, 45, nil, "C" }, -- Riverglades
  [2482] = { 60, 60, "K", "C" }, -- Mount Hyjal
}

-- capital cities: no subzone cards there unless asked (every street has a name)
L.CITIES = { [1453] = true, [1454] = true, [1455] = true, [1456] = true, [1457] = true, [1458] = true }

L.INSTANCES = {
  [389] = { 13, 18 },  -- Ragefire Chasm
  [43] = { 17, 24 },   -- Wailing Caverns
  [36] = { 17, 26 },   -- The Deadmines
  [33] = { 22, 30 },   -- Shadowfang Keep
  [48] = { 24, 32 },   -- Blackfathom Deeps
  [34] = { 24, 32 },   -- The Stockade
  [90] = { 29, 38 },   -- Gnomeregan
  [47] = { 29, 38 },   -- Razorfen Kraul
  [189] = { 34, 45 },  -- Scarlet Monastery
  [129] = { 37, 46 },  -- Razorfen Downs
  [70] = { 41, 51 },   -- Uldaman
  [209] = { 44, 54 },  -- Zul'Farrak
  [349] = { 46, 55 },  -- Maraudon
  [109] = { 50, 56 },  -- Sunken Temple
  [230] = { 52, 60 },  -- Blackrock Depths
  [229] = { 55, 60 },  -- Blackrock Spire
  [429] = { 56, 60 },  -- Dire Maul
  [329] = { 58, 60 },  -- Stratholme
  [289] = { 58, 60 },  -- Scholomance
  [409] = { 60, 60 },  -- Molten Core
  [249] = { 60, 60 },  -- Onyxia's Lair
  [469] = { 60, 60 },  -- Blackwing Lair
  [309] = { 60, 60 },  -- Zul'Gurub
  [509] = { 60, 60 },  -- Ruins of Ahn'Qiraj
  [531] = { 60, 60 },  -- Temple of Ahn'Qiraj
  [533] = { 60, 60 },  -- Naxxramas
}

-- English names for instances, when the game can't name one (GetRealZoneText gives the client's language)
L.INSTANCE_NAMES = {
  [389] = "Ragefire Chasm", [43] = "Wailing Caverns", [36] = "The Deadmines", [33] = "Shadowfang Keep",
  [48] = "Blackfathom Deeps", [34] = "The Stockade", [90] = "Gnomeregan", [47] = "Razorfen Kraul",
  [189] = "Scarlet Monastery", [129] = "Razorfen Downs", [70] = "Uldaman", [209] = "Zul'Farrak", [349] = "Maraudon",
  [109] = "Sunken Temple", [230] = "Blackrock Depths", [229] = "Blackrock Spire", [429] = "Dire Maul",
  [329] = "Stratholme", [289] = "Scholomance", [409] = "Molten Core", [249] = "Onyxia's Lair", [469] = "Blackwing Lair",
  [309] = "Zul'Gurub", [509] = "Ruins of Ahn'Qiraj", [531] = "Temple of Ahn'Qiraj", [533] = "Naxxramas",
}

-- the dungeons and raids whose entrance is in a zone (Blackrock Mountain sits between two)
L.ZONE_INSTANCES = {
  [1454] = { 389 },                -- Orgrimmar: Ragefire Chasm
  [1413] = { 43, 47, 129 },        -- The Barrens: Wailing Caverns, Razorfen Kraul, Razorfen Downs
  [1436] = { 36 },                 -- Westfall: The Deadmines
  [1421] = { 33 },                 -- Silverpine Forest: Shadowfang Keep
  [1440] = { 48 },                 -- Ashenvale: Blackfathom Deeps
  [1453] = { 34 },                 -- Stormwind: The Stockade
  [1426] = { 90 },                 -- Dun Morogh: Gnomeregan
  [1420] = { 189 },                -- Tirisfal Glades: Scarlet Monastery
  [1418] = { 70 },                 -- Badlands: Uldaman
  [1446] = { 209 },                -- Tanaris: Zul'Farrak
  [1443] = { 349 },                -- Desolace: Maraudon
  [1435] = { 109 },                -- Swamp of Sorrows: Sunken Temple
  [1427] = { 230, 229, 409, 469 }, -- Searing Gorge: Blackrock Mountain
  [1428] = { 230, 229, 409, 469 }, -- Burning Steppes: Blackrock Mountain
  [1444] = { 429 },                -- Feralas: Dire Maul
  [1422] = { 289 },                -- Western Plaguelands: Scholomance
  [1423] = { 329, 533 },           -- Eastern Plaguelands: Stratholme, Naxxramas
  [1445] = { 249 },                -- Dustwallow Marsh: Onyxia's Lair
  [1434] = { 309 },                -- Stranglethorn Vale: Zul'Gurub
  [1451] = { 509, 531 },           -- Silithus: Ahn'Qiraj
}

-- A zone's instances, dungeons before raids, at most `max`: a list of instance IDs, and how many were left out.
function L.ZoneInstances(map, max)
  local list = {}
  for _, id in ipairs(L.ZONE_INSTANCES[map] or {}) do list[#list + 1] = id end
  table.sort(list, function(a, b)
    local ra, rb = L.INSTANCES[a], L.INSTANCES[b]
    local raidA, raidB = ra[1] >= 60, rb[1] >= 60
    if raidA ~= raidB then return not raidA end
    if ra[1] ~= rb[1] then return ra[1] < rb[1] end
    return a < b
  end)
  local extra = 0
  while max and #list > max do
    table.remove(list)
    extra = extra + 1
  end
  return list, extra
end

-- Zones that suit your level better than this one: up to n uiMapIDs, your own continent first, then the ones
-- your level sits nearest the middle of. Never the other faction's land, nor zones marked "X".
-- side: "A" or "H"; continent: "K" or "E" (or nil).
function L.Suggest(level, current, side, continent, n)
  if not level or level >= 60 then return {} end
  local enemy = side == "A" and "H" or (side == "H" and "A") or nil
  local list = {}
  for id, z in pairs(L.ZONES) do
    if id ~= current and z[4] ~= "X" and z[4] ~= enemy and level >= z[1] and level <= z[2] and z[1] < z[2] then
      list[#list + 1] = { id = id, home = continent and z[3] == continent, off = math.abs(level - (z[1] + z[2]) / 2) }
    end
  end
  table.sort(list, function(a, b)
    if a.home ~= b.home then return a.home end
    if a.off ~= b.off then return a.off < b.off end
    return a.id < b.id
  end)
  local out = {}
  for i = 1, math.min(n or 2, #list) do out[i] = list[i].id end
  return out
end

-- A place well above you: 5 or more levels under where it starts. Gets the red pulse and the warning sound.
function L.Danger(level, r)
  return (level and r and level <= r[1] - 5) and true or false
end

-- Rested time at an inn: "fully rested" or "fully rested in 3h 20m". rested: rested XP now (nil: none);
-- maxXP: XP for this level. Resting fills 5% of a level every 8 hours, up to 1.5 levels.
function L.RestedText(rested, maxXP)
  if not maxXP or maxXP <= 0 then return nil end
  local full = maxXP * 1.5
  rested = rested or 0
  if rested >= full - 1 then return "fully rested" end
  local perHour = maxXP * 0.05 / 8
  local minutes = math.ceil((full - rested) / perHour * 60)
  local h, m = math.floor(minutes / 60), minutes % 60
  if h >= 24 then
    local d = math.floor(h / 24)
    return ("fully rested in %d day%s %dh"):format(d, d == 1 and "" or "s", h % 24)
  end
  if h >= 1 then return ("fully rested in %dh %02dm"):format(h, m) end
  return ("fully rested in %dm"):format(m)
end

-- The sounds each moment can play: { file (Media/Sounds/<file>.mp3) or "none", name }. The first is the default.
L.SOUNDS = {
  arrive = { { "swell", "Swell" }, { "horn", "Horn call" }, { "bells", "Bells" }, { "harp", "Harp" }, { "none", "None" } },
  discover = { { "chime", "Chime" }, { "sparkle", "Sparkle" }, { "bells", "Bells" }, { "none", "None" } },
  danger = { { "drum", "War drums" }, { "horn", "Horn call" }, { "none", "None" } },
}
L.SOUND_MOMENTS = { { "arrive", "New zone" }, { "discover", "Discovery" }, { "danger", "Danger" } }

-- the next (dir 1) or previous (dir -1) entry after current in a list of { value, name }, wrapping around
function L.Cycle(list, current, dir)
  local at = 0
  for i, e in ipairs(list) do
    if e[1] == current then at = i end
  end
  if at == 0 then return list[1][1] end
  return list[(at - 1 + (dir or 1)) % #list + 1][1]
end

function L.ChoiceName(list, current)
  for _, e in ipairs(list) do
    if e[1] == current then return e[2] end
  end
  return list[1][2]
end

-- "Levels 30–40" (or "Level 60")
function L.RangeText(r)
  if not r then return nil end
  if r[1] == r[2] then return "Level " .. r[1] end
  return ("Levels %d-%d"):format(r[1], r[2])
end

-- How a range suits your level: key, words and colour.
--   danger: 3+ levels under its start · high: under its start · good: inside · low: past its end
L.FIT = {
  danger = { "dangerous for you", 1, 0.25, 0.2 },
  high = { "a little high for you", 1, 0.55, 0.15 },
  good = { "good for your level", 0.35, 1, 0.35 },
  low = { "below your level", 0.62, 0.62, 0.62 },
}

function L.Fit(level, r)
  if not (level and r) then return nil end
  if level < r[1] - 2 then return "danger" end
  if level < r[1] then return "high" end
  if level <= r[2] then return "good" end
  return "low"
end

---------------------------------------------------------------------------------------------------
-- Territory: GetZonePVPInfo's type, as words and a colour. friendly/hostile name the faction holding it.

L.TERRITORY = {
  sanctuary = { 0.41, 0.8, 0.94 },
  friendly = { 0.1, 1, 0.1 },
  hostile = { 1, 0.25, 0.2 },
  contested = { 1, 0.7, 0 },
  combat = { 1, 0.25, 0.2 },
  arena = { 1, 0.25, 0.2 },
}

-- strings: the game's own (localized) words when it has them: { sanctuary, contested, faction ("%s"), combat }
function L.TerritoryText(pvpType, faction, strings)
  strings = strings or {}
  local function clean(s) return s and (s:gsub("^%((.*)%)$", "%1")) end
  if pvpType == "sanctuary" then return clean(strings.sanctuary) or "Sanctuary" end
  if pvpType == "contested" then return clean(strings.contested) or "Contested Territory" end
  if pvpType == "combat" or pvpType == "arena" then return clean(strings.combat) or "Combat Zone" end
  if (pvpType == "friendly" or pvpType == "hostile") and faction and faction ~= "" then
    return (clean(strings.faction) or "%s Territory"):format(faction)
  end
  return nil
end

-- capital cities' sides (their maps aren't in ZONES: no level range)
L.CITY_SIDE = { [1453] = "A", [1455] = "A", [1457] = "A", [1454] = "H", [1456] = "H", [1458] = "H" }

-- When the game gives no territory type (it often doesn't on Forever), work it out from the zone's side:
-- returns "friendly" / "hostile" / "contested" (or nil) and which faction holds it ("Alliance" / "Horde").
-- mine: your faction, "Alliance" or "Horde".
function L.TerritoryFromSide(side, mine)
  if side == "C" then return "contested", nil end
  local holder = (side == "A" and "Alliance") or (side == "H" and "Horde") or nil
  if not holder or (mine ~= "Alliance" and mine ~= "Horde") then return nil, nil end
  return holder == mine and "friendly" or "hostile", holder
end

-- the zone's side from the tables ("A", "H", "C", or nil when it isn't known)
function L.SideOf(map)
  if not map then return nil end
  local z = L.ZONES[map]
  local side = (z and z[4]) or L.CITY_SIDE[map]
  if side == "X" then return nil end
  return side
end

-- whether you can be attacked: the zone allows it and you're flagged (always so on PvP realms there)
function L.PvPWarning(pvpType, flagged)
  return flagged and (pvpType == "contested" or pvpType == "hostile" or pvpType == "combat") or false
end

---------------------------------------------------------------------------------------------------
-- Text for the cinematic style: CAPITALS WITH SPACES BETWEEN LETTERS (multi-byte letters kept whole)

function L.Spaced(text)
  if not text then return "" end
  local out = {}
  for ch in text:upper():gmatch("[\1-\127\194-\244][\128-\191]*") do
    out[#out + 1] = ch == " " and "  " or ch
  end
  return table.concat(out, " ")
end

---------------------------------------------------------------------------------------------------
-- When to show a card. Riding along a border flips the subzone back and forth: a subzone you saw in the
-- last 45 seconds shows again only if it's a discovery. A new zone always shows and clears that memory.

L.REPEAT = 45

function L.NewMemory() return { seen = {} } end

-- kind: "zone" | "sub"; name: the zone or subzone; returns whether to show it
function L.ShouldShow(mem, kind, name, now)
  if not name or name == "" then return false end
  if kind == "zone" then
    mem.seen = {}
    mem.zone = name
    return true
  end
  if name == mem.zone then return false end -- the subzone is the zone itself (its open country)
  local last = mem.seen[name]
  mem.seen[name] = now
  return not last or now - last > L.REPEAT
end

---------------------------------------------------------------------------------------------------
-- Discovery: areas explored at your position that weren't before

-- known: { [areaID] = true } before; here: area IDs explored where you stand now. Returns the new ones
-- (and adds them to known).
function L.NewAreas(known, here)
  local new = {}
  for _, id in ipairs(here or {}) do
    if not known[id] then
      known[id] = true
      new[#new + 1] = id
    end
  end
  return new
end

-- A zone is a first visit when nothing in it was explored apart from where you stand.
-- explored: all area IDs explored on the map; here: those at your position.
function L.FirstVisit(explored, here)
  local at = {}
  for _, id in ipairs(here or {}) do at[id] = true end
  for _, id in ipairs(explored or {}) do
    if not at[id] then return false end
  end
  return true
end

---------------------------------------------------------------------------------------------------
-- The card's timeline: how far each part is at time t of a card shown for `hold` seconds

L.FADE_OUT = 0.8

local function clamp(v) return v < 0 and 0 or (v > 1 and 1 or v) end
local function ease(v) v = clamp(v) return 1 - (1 - v) ^ 3 end

-- alpha of the whole card, title scale, divider reveal (0-1), subtitle alpha, done
function L.Timeline(t, hold)
  local alpha = clamp(t / 0.45)
  if t > hold then alpha = clamp(1 - (t - hold) / L.FADE_OUT) end
  local scale = 1 + 0.06 * (1 - ease(t / 0.6))
  local divider = ease((t - 0.15) / 0.7)
  local sub = clamp((t - 0.4) / 0.5)
  return alpha, scale, divider, sub, t >= hold + L.FADE_OUT
end

-- seconds a card stays, by the duration setting
L.DURATIONS = { short = 2.2, normal = 3.6, long = 5.5 }
function L.Hold(setting, kind)
  local h = L.DURATIONS[setting] or L.DURATIONS.normal
  if kind == "sub" then h = h * 0.7 end
  return h
end
