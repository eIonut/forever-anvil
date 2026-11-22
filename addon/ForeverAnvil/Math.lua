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

---------------------------------------------------------------------------------------------------
-- "3h ago" style age
function M.Age(seconds)
  if not seconds or seconds < 0 then return "?" end
  if seconds < 3600 then return floor(seconds / 60) .. "m ago" end
  if seconds < 86400 * 2 then return floor(seconds / 3600) .. "h ago" end
  return floor(seconds / 86400) .. "d ago"
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

return M
