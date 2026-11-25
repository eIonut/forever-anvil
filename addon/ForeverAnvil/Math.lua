-- Pure math, no game API: decoding the data strings, disenchanting, flip and craft rules.
-- Mirrors src/lib/demath.js and src/lib/pricemath.js; pipeline/addon.test.js checks the two agree.
local _, ns = ...
local M = {}
ns.Math = M

local floor, max = math.floor, math.max

-- "id,min,market,qty,listings,sold;…" → { [id] = { min, market, qty, listings, sold } }
function M.DecodeHouse(s)
  local t = {}
  for id, mn, mk, q, n, sold in (s or ""):gmatch("(%d+),(%d*),(%d*),(%d*),(%d*),(%d*);") do
    t[tonumber(id)] = { tonumber(mn), tonumber(mk), tonumber(q) or 0, tonumber(n) or 0, tonumber(sold) }
  end
  return t
end

-- "id,a,b;…" → { [id] = { a, b } }  (region medians: market, houses)
function M.DecodePairs(s)
  local t = {}
  for id, a, b in (s or ""):gmatch("(%d+),(%d+),?(%d*);") do
    t[tonumber(id)] = { tonumber(a), tonumber(b) }
  end
  return t
end

-- { [id] = { min, market, qty, listings, sold } } → "id,min,market,qty,listings,sold;…" (what DecodeHouse reads)
function M.EncodeHouse(t)
  local ids, out = {}, {}
  for id in pairs(t) do ids[#ids + 1] = id end
  table.sort(ids)
  local function n(x) return x == nil and "" or tostring(floor(x + 0.5)) end
  for _, id in ipairs(ids) do
    local a = t[id]
    out[#out + 1] = id .. "," .. n(a[1]) .. "," .. n(a[2]) .. "," .. n(a[3] or 0) .. "," .. n(a[4] or 0) .. "," .. n(a[5]) .. ";"
  end
  return table.concat(out)
end

-- Auction house scan (2.5): the site's aggregate (src/lib/pricemath.js) over the scanned listings.
-- listings: { [itemID] = { { unit price, quantity }, … } } → { [itemID] = { min, market, qty, listings } }, where
-- market is the quantity-weighted average of the cheapest 10% of units on sale (at least 1). Listings at
-- M.PLACEHOLDER_PRICE or more per unit are parking, not prices, and left out.
M.PLACEHOLDER_PRICE = 1000000 * 10000
function M.Aggregate(listings)
  local out = {}
  for id, arr in pairs(listings) do
    local list = {}
    for _, l in ipairs(arr) do
      if l[1] and l[1] >= 0 and l[1] < M.PLACEHOLDER_PRICE then list[#list + 1] = { l[1], l[2] or 1 } end
    end
    if #list > 0 then
      table.sort(list, function(a, b) return a[1] < b[1] end)
      local qty = 0
      for _, l in ipairs(list) do qty = qty + l[2] end
      local want = max(1, math.ceil(qty * 0.1))
      local taken, sum = 0, 0
      for _, l in ipairs(list) do
        local use = math.min(l[2], want - taken)
        sum = sum + l[1] * use
        taken = taken + use
        if taken >= want then break end
      end
      out[id] = { floor(list[1][1] + 0.5), floor(sum / taken + 0.5), qty, #list }
    end
  end
  return out
end

-- A scanned house over the shipped one: scanned items take the scan's min, market, quantity and listings and
-- keep the shipped sold per day (one scan can't tell sales); items the scan didn't see keep the shipped prices.
function M.MergeScan(shipped, scanned)
  local t = {}
  for id, a in pairs(shipped) do t[id] = a end
  for id, s in pairs(scanned) do
    local old = shipped[id]
    t[id] = { s[1], s[2], s[3], s[4], old and old[5] }
  end
  return t
end

-- "id;id;…" → { [id] = true }
function M.DecodeSet(s)
  local t = {}
  for id in (s or ""):gmatch("(%d+);") do t[tonumber(id)] = true end
  return t
end

---------------------------------------------------------------------------------------------------
-- Disenchanting (src/lib/demath.js). Brackets match WoW: Forever's game files; chances are Classic Era's.
local D = {
  strangeDust = 10940, soulDust = 11083, visionDust = 11137, dreamDust = 11176, illusionDust = 16204,
  lesserMagic = 10938, greaterMagic = 10939, lesserAstral = 10998, greaterAstral = 11082,
  lesserMystic = 11134, greaterMystic = 11135, lesserNether = 11174, greaterNether = 11175,
  lesserEternal = 16202, greaterEternal = 16203,
  smallGlimmering = 10978, largeGlimmering = 11084, smallGlowing = 11138, largeGlowing = 11139,
  smallRadiant = 11177, largeRadiant = 11178, smallBrilliant = 14343, largeBrilliant = 14344, nexus = 20725,
}
M.MATS = D

-- { maxItemLevel, dust, dustMin, dustMax, essence, essMin, essMax, shard|false, shardChance, skill }
local GREEN = {
  { 15, D.strangeDust, 1, 2, D.lesserMagic, 1, 2, false, 0, 1 },
  { 20, D.strangeDust, 2, 3, D.greaterMagic, 1, 2, D.smallGlimmering, 0.05, 1 },
  { 25, D.strangeDust, 4, 6, D.lesserAstral, 1, 2, D.smallGlimmering, 0.10, 25 },
  { 30, D.soulDust, 1, 2, D.greaterAstral, 1, 2, D.largeGlimmering, 0.05, 50 },
  { 35, D.soulDust, 2, 5, D.lesserMystic, 1, 2, D.smallGlowing, 0.05, 75 },
  { 40, D.visionDust, 1, 2, D.greaterMystic, 1, 2, D.largeGlowing, 0.05, 100 },
  { 45, D.visionDust, 2, 5, D.lesserNether, 1, 2, D.smallRadiant, 0.05, 125 },
  { 50, D.dreamDust, 1, 2, D.greaterNether, 1, 2, D.largeRadiant, 0.05, 150 },
  { 55, D.dreamDust, 2, 5, D.lesserEternal, 1, 2, D.smallBrilliant, 0.05, 175 },
  { 60, D.illusionDust, 1, 2, D.greaterEternal, 1, 2, D.largeBrilliant, 0.05, 200 },
  { 99, D.illusionDust, 2, 5, D.greaterEternal, 2, 3, D.largeBrilliant, 0.05, 225 },
}
-- { maxItemLevel, shard, skill }
local BLUE = {
  { 25, D.smallGlimmering, 25 }, { 30, D.largeGlimmering, 50 }, { 35, D.smallGlowing, 75 }, { 40, D.largeGlowing, 100 },
  { 45, D.smallRadiant, 125 }, { 50, D.largeRadiant, 150 }, { 55, D.smallBrilliant, 175 }, { 99, D.largeBrilliant, 200 },
}
-- { minItemLevel, maxItemLevel, mat, min, max }
local EPIC = {
  { 40, 45, D.smallRadiant, 2, 4 }, { 46, 50, D.largeRadiant, 2, 4 }, { 51, 55, D.smallBrilliant, 2, 4 },
  { 56, 60, D.nexus, 1, 1 }, { 61, 99, D.nexus, 1, 2 },
}

local function drop(id, chance, mn, mx) return { id = id, chance = chance, min = mn, max = mx } end

-- quality: 2 uncommon, 3 rare, 4 epic (the game's numbers); classID: 2 weapon, 4 armor.
-- Returns { skill = n|nil, drops = { {id, chance, min, max}, … } }, or nil when it can't be disenchanted.
function M.DisenchantTable(quality, classID, itemLevel)
  if (classID ~= 2 and classID ~= 4) or not itemLevel or itemLevel < 5 then return nil end
  local weapon = classID == 2
  if quality == 2 then
    for _, b in ipairs(GREEN) do
      if itemLevel <= b[1] then
        local main = b[1] == 15 and 0.8 or 0.75
        local other = floor((1 - main - b[9]) * 1000 + 0.5) / 1000
        local dustChance, essChance = main, other
        if weapon then dustChance, essChance = other, main end
        local drops = { drop(b[2], dustChance, b[3], b[4]), drop(b[5], essChance, b[6], b[7]) }
        if b[8] and b[9] > 0 then drops[#drops + 1] = drop(b[8], b[9], 1, 1) end
        return { skill = b[10], drops = drops }
      end
    end
  elseif quality == 3 then
    for _, b in ipairs(BLUE) do
      if itemLevel <= b[1] then
        if b[2] == D.largeBrilliant and itemLevel >= 56 then
          return { skill = b[3], drops = { drop(D.largeBrilliant, 0.995, 1, 1), drop(D.nexus, 0.005, 1, 1) } }
        end
        return { skill = b[3], drops = { drop(b[2], 1, 1, 1) } }
      end
    end
  elseif quality == 4 then
    for _, b in ipairs(EPIC) do
      if itemLevel >= b[1] and itemLevel <= b[2] then
        return { skill = nil, drops = { drop(b[3], 1, b[4], b[5]) } }
      end
    end
  end
  return nil
end

-- Expected value of one disenchant. priceOf(id) → copper or nil. Returns value, complete (or nil).
function M.DisenchantValue(tbl, priceOf)
  if not tbl then return nil end
  local value, complete = 0, true
  for _, d in ipairs(tbl.drops) do
    local p = priceOf(d.id)
    if p then value = value + d.chance * ((d.min + d.max) / 2) * p else complete = false end
  end
  return floor(value + 0.5), complete
end

---------------------------------------------------------------------------------------------------
-- Flips (pricemath.js computeFlips, demath.js pays): a buy must earn at least 10c and 5% per unit.
M.AH_CUT = 0.05
M.MIN_PROFIT, M.MIN_PCT, M.MIN_MAT_LISTINGS = 10, 0.05, 3

function M.Pays(unit, worth)
  return unit and worth and unit <= worth - max(M.MIN_PROFIT, worth * M.MIN_PCT)
end

---------------------------------------------------------------------------------------------------
-- Craft profit (pricemath.js craftProfit). reagents: { {id, count}, … }; costOf(id) → copper or nil;
-- sellPrice: the product's market price; made: average number made. Returns cost, complete, profit|nil.
function M.CraftProfit(reagents, costOf, sellPrice, made)
  local cost, complete = 0, true
  for _, r in ipairs(reagents) do
    local p = costOf(r[1])
    if p then cost = cost + p * r[2] else complete = false end
  end
  local profit
  if sellPrice and complete then profit = floor(sellPrice * (made or 1) * (1 - M.AH_CUT) - cost + 0.5) end
  return floor(cost + 0.5), complete, profit
end

-- "item,made|reagent:count,…;" (pipeline/addon-data.js encodeCrafts) → { [item] = { { made, { {reagent, count}, … } }, … } }
function M.DecodeCrafts(s)
  local t = {}
  for item, made, list in (s or ""):gmatch("(%d+),([%d%.]+)|([^;]*);") do
    local mats = {}
    for id, n in list:gmatch("(%d+):(%d+)") do mats[#mats + 1] = { tonumber(id), tonumber(n) } end
    item = tonumber(item)
    t[item] = t[item] or {}
    t[item][#t[item] + 1] = { tonumber(made), mats }
  end
  return t
end

-- What one item costs to craft, by its cheapest recipe: cost per item, complete, made per craft, or nil when
-- no reagent has a price. A recipe priced in full beats one with an unpriced reagent, however cheap.
function M.CraftCost(recipes, costOf)
  local best, bestComplete, bestMade
  for _, r in ipairs(recipes or {}) do
    local made = (r[1] and r[1] > 0) and r[1] or 1
    local cost, complete = M.CraftProfit(r[2], costOf)
    if complete or cost > 0 then
      local per = cost / made
      if best == nil or (complete and not bestComplete) or (complete == bestComplete and per < best) then
        best, bestComplete, bestMade = per, complete, made
      end
    end
  end
  if best then return floor(best + 0.5), bestComplete, bestMade end
end

---------------------------------------------------------------------------------------------------
-- Profession leveling (src/lib/levelmath.js skillUpChance): 100% while the recipe is orange, then
-- (grey − skill) / (grey − yellow) through yellow and green, 0 once grey. req: the skill a pattern needs
-- (nil for trainer recipes, which count from their yellow skill).
function M.SkillUpChance(req, yellow, grey, skill)
  if not grey or grey == 0 or not yellow or not skill then return 0 end
  local from = req or yellow
  if skill < from or skill >= grey then return 0 end
  if skill < yellow then return 1 end
  return (grey - skill) / (grey - yellow)
end

-- "spell,req,yellow,grey;…" (req empty for trainer recipes) → { [spell] = { req|nil, yellow, grey } }
function M.DecodeSkill(s)
  local t = {}
  for id, req, y, g in (s or ""):gmatch("(%d+),(%d*),(%d+),(%d+);") do
    t[tonumber(id)] = { tonumber(req), tonumber(y), tonumber(g) }
  end
  return t
end

-- The recipe to craft for the next skill point: the lowest reagent cost per expected point.
-- recipes: { { id, cost, chance }, … } (cost: one craft's reagents, chance 0–1). Ties: the surer recipe.
-- Returns the winning entry and its cost per point, or nil.
function M.CheapestSkillUp(recipes)
  local best, bestPer
  for _, r in ipairs(recipes) do
    if r[3] and r[3] > 0 and r[2] then
      local per = r[2] / r[3]
      if not bestPer or per < bestPer - 1e-9 or (math.abs(per - bestPer) < 1e-9 and r[3] > best[3]) then
        best, bestPer = r, per
      end
    end
  end
  return best, bestPer
end

---------------------------------------------------------------------------------------------------
-- Waylaid crates (src/lib/cratemath.js rankCrates, for one crate).
-- "crate,favor,confirmed|item:qty,item:qty;…" → { [crate] = { favor, confirmed, bundles = { {item, qty}, … } } }
function M.DecodeCrates(s)
  local t = {}
  for id, favor, ok, list in (s or ""):gmatch("(%d+),([%d%.]+),(%d)|([^;]*);") do
    local bundles = {}
    for item, qty in list:gmatch("(%d+):(%d+)") do bundles[#bundles + 1] = { tonumber(item), tonumber(qty) } end
    t[tonumber(id)] = { favor = tonumber(favor), confirmed = ok == "1", bundles = bundles }
  end
  return t
end

-- The cheapest way to fill a crate, at market price. houses: a list of house item tables (your house and the
-- neutral one, each { [item] = { min, market, qty, … } }). A house listing fewer units than a bundle needs
-- can't fill it alone. Returns { item, qty, cost, unit } or nil when no bundle can be bought.
function M.CrateFill(crate, houses)
  local best
  for _, b in ipairs(crate.bundles) do
    for _, items in ipairs(houses) do
      local p = items[b[1]]
      if p and p[2] and p[3] >= b[2] then
        local cost = p[2] * b[2]
        if not best or cost < best.cost then best = { item = b[1], qty = b[2], cost = cost, unit = p[2] } end
      end
    end
  end
  return best
end

---------------------------------------------------------------------------------------------------
-- Upgrades (src/lib/upgrades.js): is this item a higher item level than what you wear in its slot,
-- usable by your class at your level? A shortlist, not a verdict: stats aren't compared.
-- weapons: subclass → 1 one-handed, 2 two-handed, 3 either
local ALL_RANGED = { Bow = true, Crossbow = true, Gun = true, Thrown = true }
local WAND = { Wand = true }
local function from40(a, b) return function(l) if l >= 40 then return a end return b end end
local function always(a) return function() return a end end
local CLASSES = {
  warrior = { armor = from40("Plate", "Mail"), weapons = { Axe = 3, Mace = 3, Sword = 3, Dagger = 1, ["Fist Weapon"] = 1, Polearm = 2, Staff = 2 }, ranged = ALL_RANGED, shield = true, dual = true },
  paladin = { armor = from40("Plate", "Mail"), weapons = { Axe = 3, Mace = 3, Sword = 3, Polearm = 2 }, ranged = {}, relic = "Libram", shield = true, holdable = true },
  hunter = { armor = from40("Mail", "Leather"), weapons = { Axe = 3, Sword = 3, Dagger = 1, ["Fist Weapon"] = 1, Polearm = 2, Staff = 2 }, ranged = ALL_RANGED, dual = true },
  rogue = { armor = always("Leather"), weapons = { Dagger = 1, ["Fist Weapon"] = 1, Mace = 1, Sword = 1 }, ranged = ALL_RANGED, dual = true },
  priest = { armor = always("Cloth"), weapons = { Dagger = 1, Mace = 1, Staff = 2 }, ranged = WAND, holdable = true },
  shaman = { armor = from40("Mail", "Leather"), weapons = { Axe = 3, Mace = 3, Dagger = 1, ["Fist Weapon"] = 1, Staff = 2 }, ranged = {}, relic = "Totem", shield = true, holdable = true },
  mage = { armor = always("Cloth"), weapons = { Dagger = 1, Sword = 1, Staff = 2 }, ranged = WAND, holdable = true },
  warlock = { armor = always("Cloth"), weapons = { Dagger = 1, Sword = 1, Staff = 2 }, ranged = WAND, holdable = true },
  druid = { armor = always("Leather"), weapons = { Dagger = 1, ["Fist Weapon"] = 1, Mace = 3, Staff = 2 }, ranged = {}, relic = "Idol", holdable = true },
}
M.CLASSES = CLASSES

local ARMOR_SLOTS = { HEAD = { HEAD = true }, SHOULDER = { SHOULDER = true }, CHEST = { CHEST = true, ROBE = true }, WAIST = { WAIST = true },
  LEGS = { LEGS = true }, FEET = { FEET = true }, WRIST = { WRIST = true }, HANDS = { HAND = true } }
local JEWELRY = { NECK = "NECK", FINGER = "FINGER", TRINKET = "TRINKET" }
local ONE_HAND = { WEAPON = true, WEAPONMAINHAND = true, WEAPONOFFHAND = true }

-- Can this class (at this level) use the item in this slot? item: { cls = "Armor"|"Weapon"|…,
-- sub = subclass name ("Plate", "Sword", …), inv = inventory type ("HEAD", "TWOHWEAPON", …) }
function M.Fits(slot, item, cls, level, equippedInv)
  local rules = CLASSES[cls]
  local sub, inv = item.sub, item.inv
  if not rules or not inv then return false end
  if ARMOR_SLOTS[slot] then return item.cls == "Armor" and ARMOR_SLOTS[slot][inv] == true and sub == rules.armor(level) end
  if JEWELRY[slot] then return JEWELRY[slot] == inv end
  if slot == "BACK" then return inv == "CLOAK" end
  local function weapon()
    local allowed = item.cls == "Weapon" and rules.weapons[sub]
    if not allowed then return 0 end
    local hands = (inv == "TWOHWEAPON" and 2) or (ONE_HAND[inv] and 1) or 0
    if hands > 0 and (allowed == 3 or allowed == hands) then return hands end
    return 0
  end
  if slot == "MAIN_HAND" then
    local h = weapon()
    if h == 0 or inv == "WEAPONOFFHAND" then return false end
    -- like for like: a two-hander for a two-hander, a one-hander for a one-hander; either for an empty hand
    if equippedInv == "TWOHWEAPON" then return h == 2 end
    if equippedInv then return h == 1 end
    return true
  end
  if slot == "OFF_HAND" then
    if (equippedInv == "SHIELD" or (not equippedInv and rules.shield)) and inv == "SHIELD" then return rules.shield == true end
    if (equippedInv == "HOLDABLE" or (not equippedInv and rules.holdable)) and inv == "HOLDABLE" then return rules.holdable == true end
    if rules.dual and (not equippedInv or ONE_HAND[equippedInv]) then return weapon() == 1 and inv ~= "WEAPONMAINHAND" end
    return false
  end
  if slot == "RANGED" then
    if inv == "RELIC" then return rules.relic ~= nil and sub == rules.relic end
    return (inv == "RANGED" or inv == "RANGEDRIGHT" or inv == "THROWN") and rules.ranged[sub] == true
  end
  return false
end

-- The slots, with the character-sheet slots they cover (an upgrade must beat the weaker ring or trinket)
M.SLOTS = {
  { "HEAD", { "HEAD" } }, { "NECK", { "NECK" } }, { "SHOULDER", { "SHOULDER" } }, { "BACK", { "BACK" } }, { "CHEST", { "CHEST" } },
  { "WRIST", { "WRIST" } }, { "HANDS", { "HANDS" } }, { "WAIST", { "WAIST" } }, { "LEGS", { "LEGS" } }, { "FEET", { "FEET" } },
  { "FINGER", { "FINGER_1", "FINGER_2" } }, { "TRINKET", { "TRINKET_1", "TRINKET_2" } },
  { "MAIN_HAND", { "MAIN_HAND" } }, { "OFF_HAND", { "OFF_HAND" } }, { "RANGED", { "RANGED" } },
}

-- Is the item an upgrade? item: { id, ilvl, req, quality (0 poor … 4 epic), cls, sub, inv };
-- gear: { [sheet slot] = { id, ilvl, inv } }; cls: "warrior", …; level: the character's.
-- Returns the slot with the biggest item-level gain, the gain and what you wear there (nil: no upgrade).
function M.UpgradeFor(item, gear, cls, level)
  if not CLASSES[cls] or not item.ilvl or not item.inv then return nil end
  local req = item.req or 0
  if req > level or item.quality == 0 then return nil end
  -- real gear past the starting zones has a level requirement; a high item level without one is a gadget
  -- or profession item (parachute cloaks, goggles that need Engineering), not an upgrade
  if req <= 1 and item.ilvl > 15 then return nil end
  local main = gear.MAIN_HAND
  local bestSlot, bestGain, bestWearing
  for _, s in ipairs(M.SLOTS) do
    local slot, sheet = s[1], s[2]
    if not (slot == "OFF_HAND" and main and main.inv == "TWOHWEAPON") then
      local worn, wearsIt, wearing = 0, false, nil
      for _, name in ipairs(sheet) do
        local g = gear[name]
        if g then
          worn = worn + 1
          if g.id == item.id then wearsIt = true end
          if not wearing or (g.ilvl or 0) < (wearing.ilvl or 0) then wearing = g end
        end
      end
      if worn < #sheet then wearing = nil end -- an empty ring or trinket slot counts as nothing worn
      local gain = item.ilvl - (wearing and wearing.ilvl or 0)
      if not wearsIt and gain > 0 and (not bestGain or gain > bestGain)
        and M.Fits(slot, item, cls, level, wearing and wearing.inv or nil) then
        bestSlot, bestGain, bestWearing = slot, gain, wearing
      end
    end
  end
  return bestSlot, bestGain, bestWearing
end

---------------------------------------------------------------------------------------------------
-- Import strings from the site (the "Copy for the addon" buttons on /watchlist and /planner):
--   watchlist:     "FA1W:id,id:below,…"   (below: target price in copper, optional)
--   shopping list: "FA1S:id:qty,…"        (materials for the whole crafting plan)
-- Returns kind ("watch" | "shopping") and entries ({ {id, n|nil}, … }), or nil and the reason.
function M.DecodeImport(s)
  s = (s or ""):gsub("%s+", "")
  local kind, body = s:match("^FA1([WS]):(.*)$")
  if not kind then return nil, "that isn't a Forever Anvil string" end
  local out, seen = {}, {}
  for part in body:gmatch("[^,]+") do
    local id, n = part:match("^(%d+):?(%d*)$")
    id, n = tonumber(id), tonumber(n)
    if not id then return nil, "the string is damaged (copy it again from the site)" end
    if kind == "S" and not (n and n > 0) then return nil, "the string is damaged (copy it again from the site)" end
    if id > 0 and not seen[id] then
      seen[id] = true
      out[#out + 1] = { id, (n and n > 0) and n or nil }
    end
  end
  if #out == 0 then return nil, "the list is empty" end
  return kind == "W" and "watch" or "shopping", out
end

-- Adds materials to a shopping list ({ {id, units}, … }, kept in order; amounts of an item already on it
-- are added up). mats: { {id, units}, … } for one craft; times: how many crafts. Returns the list.
function M.AddMaterials(list, mats, times)
  times = times or 1
  for _, m in ipairs(mats) do
    local units = m[2] * times
    local found = false
    for _, e in ipairs(list) do
      if e[1] == m[1] then e[2] = e[2] + units; found = true; break end
    end
    if not found and units > 0 then list[#list + 1] = { m[1], units } end
  end
  return list
end

-- A whole number from 1 to 9999 typed in a box ("5", " 12 "), or nil
function M.ParseCount(s)
  local n = tonumber(((s or ""):gsub("%s+", "")):match("^%d+$") or "")
  if n and n >= 1 and n <= 9999 then return n end
  return nil
end

-- Copper from "1g 20s 5c", "1g20s", "50s", "75c" or a plain number of copper; nil when it isn't money.
function M.ParseMoney(s)
  s = (s or ""):lower():gsub("%s+", "")
  if s:match("^%d+$") then return tonumber(s) end
  local total, rest, any = 0, s, false
  for _, u in ipairs({ { "g", 10000 }, { "s", 100 }, { "c", 1 } }) do
    local n, after = rest:match("^(%d+)" .. u[1] .. "(.*)$")
    if n then total, rest, any = total + tonumber(n) * u[2], after, true end
  end
  if not any or rest ~= "" then return nil end
  return total
end

---------------------------------------------------------------------------------------------------
-- The prices window (src/tools/Prices.svelte): every item on one auction house, searched, filtered and sorted.

-- "id,quality,category,level,icon,name\n…" → { [id] = { name, quality|nil, category, level|nil, icon|nil } }
-- (pipeline/addon-data.js encodeItems; category is one letter, see M.CATEGORIES)
function M.DecodeItems(s)
  local t = {}
  for id, q, cat, lvl, icon, name in (s or ""):gmatch("(%d+),(%d*),(%a),(%d*),(%d*),([^\n]*)\n") do
    t[tonumber(id)] = { name, tonumber(q), cat, tonumber(lvl), tonumber(icon) }
  end
  return t
end

-- the category list, in the site's order (src/lib/itemfilters.ts CATEGORIES)
M.CATEGORIES = {
  { "", "All items" }, { "w", "Weapons" }, { "a", "Armor" }, { "c", "Consumables" }, { "t", "Trade goods" },
  { "r", "Recipes" }, { "b", "Bags & quivers" }, { "p", "Ammo" }, { "o", "Other" },
}

M.THIN = 3 -- fewer listings than this is a thin market: "Biggest market" puts it last, however much gold it asks

-- sorts that start biggest first; names start A to Z
M.SORT_FIRST_DIR = { value = -1, name = 1, market = -1, min = -1, qty = -1, sold = -1 }

local function sortValue(r, key)
  local p = r.p
  if key == "name" then return r.lower end
  if key == "market" then return p[2] end
  if key == "min" then return p[1] end
  if key == "qty" then return p[3] end
  if key == "sold" then return p[5] or 0 end
  if p[2] then return p[2] * (p[3] or 0) end -- "value": the gold listed
  return nil
end

-- items: one house's decoded prices; names: M.DecodeItems' table; nameOf(id): a name for items the data lacks
-- (the game's, when it has loaded the item). o: { term = lower-case search text, cat = category letter or "",
-- sort = a M.SORT_FIRST_DIR key, dir = 1 | -1, gameFirst = true to show the game's name when it has one (a
-- client in another language: the shipped names are English, and the search matches either) }.
-- Returns rows { id, p (the prices), name, lower, info }, sorted.
function M.PriceRows(items, names, o, nameOf)
  o = o or {}
  local term, cat = o.term or "", o.cat or ""
  local key, dir = o.sort or "value", o.dir or M.SORT_FIRST_DIR[o.sort or "value"] or -1
  local out = {}
  for id, p in pairs(items or {}) do
    local info = names and names[id]
    local english = info and info[1]
    local name = (o.gameFirst and nameOf and nameOf(id)) or english or (nameOf and nameOf(id)) or nil
    local lower = name and name:lower()
    local ok = cat == "" or (info and info[3] or "o") == cat
    if ok and term ~= "" then
      ok = (lower and lower:find(term, 1, true) ~= nil) or tostring(id) == term
        or (english ~= nil and english ~= name and english:lower():find(term, 1, true) ~= nil)
    end
    if ok then out[#out + 1] = { id = id, p = p, name = name, lower = lower, info = info } end
  end
  local function byName(a, b)
    if a.lower ~= b.lower then
      if not a.lower then return false end
      if not b.lower then return true end
      return a.lower < b.lower
    end
    return a.id < b.id
  end
  table.sort(out, function(a, b)
    if key == "value" then
      local ta, tb = (a.p[4] or 0) < M.THIN, (b.p[4] or 0) < M.THIN
      if ta ~= tb then return tb end
    end
    local x, y = sortValue(a, key), sortValue(b, key)
    if x == nil or y == nil then
      if x == nil and y == nil then return byName(a, b) end
      return y == nil
    end
    if x ~= y then
      if dir > 0 then return x < y end
      return x > y
    end
    return byName(a, b)
  end)
  return out
end

---------------------------------------------------------------------------------------------------
-- Upgrade finder (src/lib/upgrades.js findUpgrades): gear on sale that beats what you wear, slot by slot.

-- "id,subclass,inventoryType,itemLevel;…" → { [id] = { sub, inv, ilvl } } (pipeline/addon-data.js encodeGear)
function M.DecodeGear(s)
  local t = {}
  for id, sub, inv, ilvl in (s or ""):gmatch("(%d+),([^,;]*),([^,;]*),(%d+);") do
    t[tonumber(id)] = { sub ~= "" and sub or nil, inv, tonumber(ilvl) }
  end
  return t
end

-- gear: what you wear, by character-sheet slot ({ id, ilvl, inv }); cls, level: yours.
-- houses: { { items = one house's decoded prices, side = "horde" | … }, … } (yours and the neutral one).
-- gearOf(id): { id, cls = "Weapon" | "Armor", sub, inv, ilvl, req, quality } of an item on sale, or nil.
-- opts: { maxPrice = copper or nil, perSlot = how many per slot (3) }.
-- Returns { { slot, wearing = gear entry or nil, options = { { id, ilvl, gain, req, price, side, quality }, … } }, … }
-- for each slot with an upgrade, in character-sheet order; options highest item level first, then cheapest.
function M.FindUpgrades(gear, cls, level, houses, gearOf, opts)
  opts = opts or {}
  if not CLASSES[cls] then return {} end
  level = level or 1
  local perSlot, maxPrice = opts.perSlot or 3, opts.maxPrice
  local mainInv = gear.MAIN_HAND and gear.MAIN_HAND.inv or nil
  -- the cheapest listing of each item across the houses
  local cheapest = {}
  for _, h in ipairs(houses) do
    for id, p in pairs(h.items or {}) do
      local c = cheapest[id]
      if p[1] and (not c or p[1] < c.price) then cheapest[id] = { price = p[1], side = h.side } end
    end
  end
  -- gear you could use at all (level, quality, budget), looked up once rather than once per slot
  local candidates = {}
  for id, c in pairs(cheapest) do
    local item = gearOf(id)
    if item and item.ilvl and (item.req or 0) <= level and item.quality ~= 0
      and not ((item.req or 0) <= 1 and item.ilvl > 15) -- gadgets and profession items, not upgrades
      and not (maxPrice and c.price > maxPrice) then
      candidates[#candidates + 1] = { id, item, c }
    end
  end
  local out = {}
  for _, s in ipairs(M.SLOTS) do
    local slot, sheet = s[1], s[2]
    if not (slot == "OFF_HAND" and mainInv == "TWOHWEAPON") then
      local worn, wornIds, wearing = 0, {}, nil
      for _, name in ipairs(sheet) do
        local g = gear[name]
        if g then
          worn = worn + 1
          wornIds[g.id] = true
          if not wearing or (g.ilvl or 0) < (wearing.ilvl or 0) then wearing = g end
        end
      end
      if worn < #sheet then wearing = nil end -- an empty ring or trinket slot counts as nothing worn
      local baseline = wearing and wearing.ilvl or 0
      local equippedInv = wearing and wearing.inv or nil
      local options = {}
      for _, cand in ipairs(candidates) do
        local id, item, c = cand[1], cand[2], cand[3]
        if not wornIds[id] and item.ilvl > baseline and M.Fits(slot, item, cls, level, equippedInv) then
          options[#options + 1] = { id = id, ilvl = item.ilvl, gain = item.ilvl - baseline, req = item.req or 0,
            price = c.price, side = c.side, quality = item.quality }
        end
      end
      if #options > 0 then
        table.sort(options, function(a, b)
          if a.ilvl ~= b.ilvl then return a.ilvl > b.ilvl end
          if a.price ~= b.price then return a.price < b.price end
          return a.id < b.id
        end)
        for i = #options, perSlot + 1, -1 do options[i] = nil end
        out[#out + 1] = { slot = slot, wearing = wearing, options = options }
      end
    end
  end
  return out
end

---------------------------------------------------------------------------------------------------
-- Upgrades for your spec: item stats (read from the game), what each talent spec values, and the gain.

-- The game's stat keys (GetItemStats: ITEM_MOD_AGILITY_SHORT, RESISTANCE0_NAME, …) → short keys.
-- Matched by pattern, so the classic ("+1% crit") and rating spellings both count; anything else is skipped.
local STAT_PATTERNS = {
  { "RANGED_ATTACK_POWER", "rap" }, { "ATTACK_POWER", "ap" }, { "STRENGTH", "str" }, { "AGILITY", "agi" },
  { "STAMINA", "sta" }, { "INTELLECT", "int" }, { "SPIRIT", "spi" }, { "HEALING", "heal" },
  { "SPELL_POWER", "sp" }, { "SPELL_DAMAGE", "sp" }, { "SPELL_HIT", "hit" }, { "SPELL_CRIT", "crit" },
  { "CRIT", "crit" }, { "HIT", "hit" }, { "DEFENSE", "def" }, { "DODGE", "dodge" }, { "PARRY", "parry" },
  { "BLOCK", "block" }, { "MANA_REGENERATION", "mp5" }, { "POWER_REGEN0", "mp5" }, { "DAMAGE_PER_SECOND", "dps" },
  { "RESISTANCE0_NAME", "armor" },
}
function M.ParseItemStats(raw)
  local t = {}
  for key, value in pairs(raw or {}) do
    if type(key) == "string" and type(value) == "number" and not key:find("TAKEN") then
      for _, p in ipairs(STAT_PATTERNS) do
        if key:find(p[1], 1, true) then t[p[2]] = (t[p[2]] or 0) + value; break end
      end
    end
  end
  return t
end

-- What each spec values, per point (rough leveling weights: enough to drop wrong-stat gear and order the
-- rest). crit and hit are per 1%; dps: weapon damage per second in a melee slot, rdps in the ranged slot.
local MELEE_STR = { str = 1, agi = 0.5, ap = 0.5, crit = 10, hit = 10, sta = 0.3, armor = 0.01, dps = 7, rdps = 0.5 }
local MELEE_AGI = { agi = 1, str = 0.55, ap = 0.5, crit = 10, hit = 10, sta = 0.3, armor = 0.01, dps = 7, rdps = 0.5 }
local TANK = { sta = 1, str = 0.6, agi = 0.6, def = 1.5, armor = 0.05, block = 0.5, dodge = 10, parry = 10, hit = 5, ap = 0.2, dps = 2, rdps = 0.2 }
local CASTER = { sp = 1, int = 0.6, spi = 0.3, crit = 8, hit = 10, mp5 = 1, sta = 0.4, armor = 0.005, dps = 0.2, rdps = 0.2 }
local HEALER = { heal = 0.7, int = 1, spi = 0.6, mp5 = 1.5, sp = 0.3, crit = 5, sta = 0.3, armor = 0.005, dps = 0.2, rdps = 0.2 }
local HUNTER = { agi = 1, rap = 0.45, ap = 0.1, int = 0.3, sta = 0.3, crit = 10, hit = 10, str = 0.05, armor = 0.01, dps = 0.5, rdps = 7 }
local function with(base, changes)
  local t = {}
  for k, v in pairs(base) do t[k] = v end
  for k, v in pairs(changes) do t[k] = v end
  return t
end
-- [class] = { default tree, { name, weights } × 3 }, trees in the talent window's order
M.SPECS = {
  warrior = { 1, { "Arms", MELEE_STR }, { "Fury", MELEE_STR }, { "Protection", TANK } },
  paladin = { 3, { "Holy", HEALER }, { "Protection", with(TANK, { int = 0.3, sp = 0.3 }) }, { "Retribution", with(MELEE_STR, { int = 0.2 }) } },
  hunter = { 2, { "Beast Mastery", HUNTER }, { "Marksmanship", HUNTER }, { "Survival", HUNTER } },
  rogue = { 2, { "Assassination", MELEE_AGI }, { "Combat", MELEE_AGI }, { "Subtlety", MELEE_AGI } },
  priest = { 3, { "Discipline", HEALER }, { "Holy", HEALER }, { "Shadow", with(CASTER, { spi = 0.5 }) } },
  shaman = { 2, { "Elemental", with(CASTER, { spi = 0.2 }) }, { "Enhancement", with(MELEE_STR, { int = 0.3 }) }, { "Restoration", with(HEALER, { spi = 0.3 }) } },
  mage = { 3, { "Arcane", CASTER }, { "Fire", CASTER }, { "Frost", CASTER } },
  warlock = { 1, { "Affliction", with(CASTER, { sta = 0.6 }) }, { "Demonology", with(CASTER, { sta = 0.6 }) }, { "Destruction", with(CASTER, { sta = 0.6 }) } },
  druid = { 2, { "Balance", CASTER }, { "Feral Combat", with(MELEE_AGI, { str = 1, sta = 0.6, armor = 0.03, def = 0.5, dodge = 5, dps = 0, rdps = 0 }) }, { "Restoration", HEALER } },
}

-- the spec to gear for: the tree with the most talent points (points: { tree1, tree2, tree3 }), the class's
-- usual leveling tree while none are spent; chosen (1-3) wins when set
function M.SpecIndex(cls, points, chosen)
  local spec = M.SPECS[cls]
  if not spec then return nil end
  if chosen and spec[chosen + 1] then return chosen end
  local best, most = nil, 0
  for i = 1, 3 do
    local p = points and points[i] or 0
    if p > most then best, most = i, p end
  end
  return best or spec[1]
end

-- how much an item's stats are worth to a spec; dps counts in the weapon slots only
function M.StatScore(stats, weights, slot)
  local score = 0
  for k, v in pairs(stats or {}) do
    local w = weights[k]
    if k == "dps" then w = (slot == "RANGED" and weights.rdps) or ((slot == "MAIN_HAND" or slot == "OFF_HAND") and weights.dps) or 0 end
    if w then score = score + w * v end
  end
  return score
end

-- stats beyond armor and weapon damage (an uncommon item without any rolls them when it drops: "of the Monkey")
function M.HasStats(stats)
  for k, v in pairs(stats or {}) do
    if k ~= "armor" and k ~= "dps" and v ~= 0 then return true end
  end
  return false
end

-- gear made for someone else: more of its main-stat points go to stats this spec doesn't use than to ones it does
local MAIN = { "str", "agi", "int", "spi", "sp", "heal", "ap", "rap" }
function M.OffSpec(stats, weights)
  local wasted, useful = 0, 0
  for _, k in ipairs(MAIN) do
    local v = stats and stats[k] or 0
    if v > 0 then
      if (weights[k] or 0) >= 0.2 then useful = useful + v else wasted = wasted + v end
    end
  end
  return wasted > useful
end

-- the stats worth showing on a line, most valuable to the spec first: { {key, value}, … } (at most n)
function M.KeyStats(stats, weights, n)
  local list = {}
  for k, v in pairs(stats or {}) do
    if k ~= "armor" and k ~= "dps" and v ~= 0 and (weights[k] or 0) > 0 then list[#list + 1] = { k, v, (weights[k] or 0) * v } end
  end
  table.sort(list, function(a, b) if a[3] ~= b[3] then return a[3] > b[3] end return a[1] < b[1] end)
  for i = #list, (n or 3) + 1, -1 do list[i] = nil end
  return list
end

-- Like M.FindUpgrades, but ranked for a spec by stats instead of item level.
-- statsOf(id): parsed stats of an item (M.ParseItemStats), nil while the game hasn't loaded it, or false when
-- the game never will (left out).
-- weights: the spec's (M.SPECS). opts: { maxPrice, perSlot, showAll = keep gear made for other specs }.
-- An option is an upgrade when its stats are worth more to the spec than what you wear there. Uncommon or
-- better gear without stats rolls them when it drops: kept when its item level is higher, marked random.
-- Returns slots like M.FindUpgrades (options: { id, ilvl, req, price, side, quality, stats, score, gain, random }),
-- then how many items are still loading and how many were left out as gear for other specs.
function M.SpecUpgrades(gear, cls, level, houses, gearOf, statsOf, weights, opts)
  opts = opts or {}
  if not CLASSES[cls] then return {}, 0, 0 end
  level = level or 1
  local perSlot, maxPrice = opts.perSlot or 3, opts.maxPrice
  local mainInv = gear.MAIN_HAND and gear.MAIN_HAND.inv or nil
  local cheapest = {}
  for _, h in ipairs(houses) do
    for id, p in pairs(h.items or {}) do
      local c = cheapest[id]
      if p[1] and (not c or p[1] < c.price) then cheapest[id] = { price = p[1], side = h.side } end
    end
  end
  local candidates = {}
  for id, c in pairs(cheapest) do
    local item = gearOf(id)
    if item and item.ilvl and (item.req or 0) <= level and item.quality ~= 0
      and not ((item.req or 0) <= 1 and item.ilvl > 15)
      and not (maxPrice and c.price > maxPrice) then
      candidates[#candidates + 1] = { id, item, c }
    end
  end
  local out, pendingIds, offIds = {}, {}, {}
  for _, s in ipairs(M.SLOTS) do
    local slot, sheet = s[1], s[2]
    if not (slot == "OFF_HAND" and mainInv == "TWOHWEAPON") then
      local worn, wornIds, wearing, wornScore = 0, {}, nil, nil
      for _, name in ipairs(sheet) do
        local g = gear[name]
        if g then
          worn = worn + 1
          wornIds[g.id] = true
          local sc = M.StatScore(statsOf(g.id), weights, slot)
          if not wearing or sc < wornScore then wearing, wornScore = g, sc end
        end
      end
      if worn < #sheet then wearing, wornScore = nil, 0 end
      wornScore = wornScore or 0
      local baseline = wearing and wearing.ilvl or 0
      local equippedInv = wearing and wearing.inv or nil
      local options = {}
      for _, cand in ipairs(candidates) do
        local id, item, c = cand[1], cand[2], cand[3]
        if not wornIds[id] and M.Fits(slot, item, cls, level, equippedInv) then
          local stats = statsOf(id)
          if stats == nil then
            if item.ilvl > baseline then pendingIds[id] = true end
          elseif stats == false then
            -- the game never sent this item's details: left out rather than loading forever
          elseif item.quality >= 2 and not M.HasStats(stats) then
            if item.ilvl > baseline then
              options[#options + 1] = { id = id, ilvl = item.ilvl, req = item.req or 0, price = c.price, side = c.side,
                quality = item.quality, stats = stats, random = true, gain = 0 }
            end
          elseif not opts.showAll and M.OffSpec(stats, weights) then
            if item.ilvl > baseline then offIds[id] = true end
          else
            local score = M.StatScore(stats, weights, slot)
            if score > wornScore then
              options[#options + 1] = { id = id, ilvl = item.ilvl, req = item.req or 0, price = c.price, side = c.side,
                quality = item.quality, stats = stats, score = score, gain = score - wornScore }
            end
          end
        end
      end
      if #options > 0 then
        table.sort(options, function(a, b)
          if (a.random or false) ~= (b.random or false) then return not a.random end
          if a.random then
            if a.ilvl ~= b.ilvl then return a.ilvl > b.ilvl end
          elseif a.gain ~= b.gain then
            return a.gain > b.gain
          end
          if a.price ~= b.price then return a.price < b.price end
          return a.id < b.id
        end)
        for i = #options, perSlot + 1, -1 do options[i] = nil end
        out[#out + 1] = { slot = slot, wearing = wearing, wornScore = wornScore, options = options }
      end
    end
  end
  local pending, off = 0, 0
  for _ in pairs(pendingIds) do pending = pending + 1 end
  for _ in pairs(offIds) do off = off + 1 end
  return out, pending, off
end

---------------------------------------------------------------------------------------------------
-- Bag value: the best way to turn an item into gold.
-- market: its auction house market price (nil when not listed, or when it's soulbound and can't be sold
-- there); de: disenchanting one, after the auction cut (nil when it can't be); vendor: what a vendor pays for one.
-- Returns "ah" | "de" | "vendor" and the gold per item (the auction house after its 5% cut), or nil.
function M.BestUse(market, de, vendor)
  local kind, best
  local ah = market and market > 0 and floor(market * (1 - M.AH_CUT) + 0.5) or nil
  for _, o in ipairs({ { "ah", ah }, { "de", de }, { "vendor", vendor } }) do
    if o[2] and o[2] > 0 and (not best or o[2] > best) then kind, best = o[1], o[2] end
  end
  return kind, best
end

---------------------------------------------------------------------------------------------------
-- "3h ago" style age
M.AGE = { m = "%dm ago", h = "%dh ago", d = "%dd ago" } -- Locale.lua translates these
function M.Age(seconds)
  if not seconds or seconds < 0 then return "?" end
  if seconds < 3600 then return M.AGE.m:format(floor(seconds / 60)) end
  if seconds < 86400 * 2 then return M.AGE.h:format(floor(seconds / 3600)) end
  return M.AGE.d:format(floor(seconds / 86400))
end

---------------------------------------------------------------------------------------------------
-- Price freshness (Freshness.lua): the addon can't download, so it says when its prices are old, and copies
-- in your guild and group tell each other the time of their prices over the hidden addon channel.
M.OLD_AFTER = 172800 -- prices older than two days get a note at login (releases go out once a day; scans in between)
M.NEWER_BY = 3600    -- someone's prices count as newer when they're at least an hour newer (a later release)
M.SYNC_PREFIX = "ForeverAnvil"

function M.SyncMessage(updated) return "1:" .. floor(updated) end
-- the time in a copy's message, or nil when it isn't one (a later version may add fields after it)
function M.ParseSync(text)
  local v = type(text) == "string" and text:match("^1:(%d+)")
  return v and tonumber(v) or nil
end

-- what to do with a copy's prices time: "newer" (tell the player), "older" (answer with ours), or nil
function M.SyncVerdict(ours, theirs)
  if not (ours and theirs) then return nil end
  if theirs >= ours + M.NEWER_BY then return "newer" end
  if theirs <= ours - M.NEWER_BY then return "older" end
  return nil
end

-- Compact money with at most two units, e.g. "12g 5s" (gold/silver/copper coloured unless plain),
-- no coin icons, for tight spaces
function M.ShortMoney(copper, plain)
  if not copper then return "?" end
  local sign = copper < 0 and "-" or ""
  copper = floor(math.abs(copper) + 0.5)
  local g, s, c = floor(copper / 10000), floor(copper / 100) % 100, copper % 100
  local function u(n, unit, color)
    if plain then return n .. unit end
    return "|cff" .. color .. n .. unit .. "|r"
  end
  local G, S, C = "ffd700", "c7c7cf", "eda55f"
  if g > 0 then
    if g >= 100 or s == 0 then return sign .. u(g, "g", G) end
    return sign .. u(g, "g", G) .. " " .. u(s, "s", S)
  end
  if s > 0 then
    if c == 0 then return sign .. u(s, "s", S) end
    return sign .. u(s, "s", S) .. " " .. u(c, "c", C)
  end
  return sign .. u(c, "c", C)
end

-- Like ShortMoney, with the game's gold, silver and copper coins in place of g / s / c, e.g. "1(g) 66(s)"
M.COINS = { g = "Interface\\MoneyFrame\\UI-GoldIcon", s = "Interface\\MoneyFrame\\UI-SilverIcon",
  c = "Interface\\MoneyFrame\\UI-CopperIcon" }
function M.CoinMoney(copper)
  return (M.ShortMoney(copper, true):gsub("(%d+)([gsc])", function(n, unit)
    return n .. "|T" .. M.COINS[unit] .. ":0:0:2:0|t"
  end))
end

-- Gold earned today (Earnings.lua): one character's record { day, earned, spent, last }, updated with its money
-- now. A new day starts again from 0; the first change of a day still counts for that day. fresh: don't count
-- the change since last (logging in: the money may differ from what was saved, but nothing was earned offline).
function M.MoneyDay(rec, day, money, fresh)
  if type(rec) ~= "table" or rec.day ~= day then
    rec = { day = day, earned = 0, spent = 0, last = type(rec) == "table" and rec.last or nil }
  end
  if money then
    local d = (not fresh and rec.last) and money - rec.last or 0
    if d > 0 then rec.earned = rec.earned + d elseif d < 0 then rec.spent = rec.spent - d end
    rec.last = money
  end
  return rec
end

return M
