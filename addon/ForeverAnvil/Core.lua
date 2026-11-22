-- Forever Anvil: auction prices from foreveranvil.com in your tooltips, auction house and profession window.
-- Core: saved settings, loading the region's data, working out which auction house you're on, price lookups.
local addonName, ns = ...
local M = ns.Math

ns.SITE = "foreveranvil.com"
ns.DEFAULTS = {
  realms = {},   -- [realm name] = ruleset name ("PvP", …), when it can't be told from the realm name
  -- vendor is off: this client's tooltips already show the sell price
  show = { market = true, min = true, sold = true, region = true, de = true, vendor = false, flips = true, deAll = false, craft = true,
    -- version 2
    upgrades = true, crates = true, skillup = true, watch = true, shopping = true, minimap = true },
  minimap = { angle = 210 }, -- where the minimap button sits (degrees around the minimap)
  watch = {},    -- [itemID] = target price in copper (0: no target), from /fa import or /fa watch
  shopping = {}, -- { {itemID, units}, … }: materials for the crafting plan, from /fa import
  shoppingPos = nil,
  pricesPos = nil, -- where the prices window was left
  v = 2,
}

local f = CreateFrame("Frame")
ns.frame = f
ns.onAddon = {} -- [Blizzard addon name] = function, run once when that addon loads (auction and profession UIs)

function ns.Print(msg)
  DEFAULT_CHAT_FRAME:AddMessage("|cffe6a23cForever Anvil|r: " .. msg)
end

-- Runs fn, catching errors so one broken feature can't break the game's windows; each new error is shown once.
ns.errors = {}
function ns.Safe(where, fn, ...)
  local ok, err = pcall(fn, ...)
  if not ok then
    local msg = where .. ": " .. tostring(err)
    if not ns.errors[msg] then
      ns.errors[msg] = true
      ns.lastError = msg
      ns.Print("error (please report it): " .. msg)
    end
  end
end

-- Calls fn(frame, elementData) for each row a modern scroll list shows (now and whenever rows are reused).
-- Returns false when the list or the helper doesn't exist.
function ns.HookScrollRows(scrollBox, fn, where)
  if not (scrollBox and ScrollUtil and ScrollUtil.AddInitializedFrameCallback) then return false end
  -- rows shown later; not asking the helper for existing rows, which errors while the list isn't set up yet
  ScrollUtil.AddInitializedFrameCallback(scrollBox, function(_, frame, elementData)
    ns.Safe(where or "list", fn, frame, elementData)
  end, ns, false)
  -- rows already on screen, if the list is set up
  if scrollBox.GetView and scrollBox:GetView() and scrollBox.ForEachFrame then
    ns.Safe(where or "list", function()
      scrollBox:ForEachFrame(function(frame, elementData) fn(frame, elementData) end)
    end)
  end
  return true
end

-- Hooks a window now, and again a moment later: the game may load the window's code after our event handler runs
function ns.InitSoon(where, fn)
  if not fn then return end
  ns.Safe(where, fn)
  if C_Timer and C_Timer.After then C_Timer.After(0, function() ns.Safe(where, fn) end) end
end

local function copyDefaults(dst, src)
  for k, v in pairs(src) do
    if type(v) == "table" then
      if type(dst[k]) ~= "table" then dst[k] = {} end
      copyDefaults(dst[k], v)
    elseif dst[k] == nil then
      dst[k] = v
    end
  end
end

---------------------------------------------------------------------------------------------------
-- Data: one load-on-demand addon per region (ForeverAnvil_Data_EU, …)
local REGIONS = { [1] = "US", [3] = "EU" }

local function regionCode()
  local id = GetCurrentRegion and GetCurrentRegion()
  if REGIONS[id] then return REGIONS[id] end
  local portal = (GetCVar and GetCVar("portal") or ""):upper()
  if portal == "US" or portal == "EU" then return portal end
  return nil
end

local function loadAddon(name)
  if C_AddOns and C_AddOns.LoadAddOn then return C_AddOns.LoadAddOn(name) end
  return LoadAddOn(name)
end

function ns.LoadData()
  ns.regionCode = regionCode()
  if not ns.regionCode then ns.Print("this region isn't covered yet (Europe and the Americas are)."); return end
  if not (ForeverAnvilData and ForeverAnvilData[ns.regionCode]) then loadAddon("ForeverAnvil_Data_" .. ns.regionCode) end
  ns.data = ForeverAnvilData and ForeverAnvilData[ns.regionCode]
  if not ns.data then
    ns.Print("price data for " .. ns.regionCode .. " is missing. Reinstall or update the addon.")
    return
  end
  ns.houseCache = {}
  ns.regionMedian = nil
  ns.vendorBuy = nil
  ns.noDisenchant = nil
  ns.skill = nil
  ns.crates = nil
  ns.itemNames = nil
end

---------------------------------------------------------------------------------------------------
-- Which auction house: ruleset (from the realm name, or your choice) × faction, or the neutral house
-- while you're at the Blackwater auction house in Booty Bay, Gadgetzan or Everlook.
local function norm(s) return (s or ""):lower():gsub("[^%w]", "") end

function ns.FindRuleset(name)
  if not ns.data or not name then return nil end
  local n = norm(name)
  local aliases = { rp = "roleplay", roleplaypvp = "rppvp" }
  n = aliases[n] or n
  for _, r in ipairs(ns.data.rulesets) do
    if norm(r.name) == n then return r end
  end
  return nil
end

function ns.Ruleset()
  if not ns.data then return nil end
  local realm = GetRealmName()
  local chosen = ns.db.realms[realm]
  if chosen then return ns.FindRuleset(chosen) end
  local r = ns.FindRuleset(realm)
  if r then return r end
  local n, best = norm(realm), 0
  for _, rs in ipairs(ns.data.rulesets) do
    local k = norm(rs.name)
    if #k > best and n:find(k, 1, true) then r, best = rs, #k end -- longest match wins ("RP-PvP" over "PvP")
  end
  return r
end

function ns.SetRuleset(name)
  local r = ns.FindRuleset(name)
  if not r then return nil end
  ns.db.realms[GetRealmName()] = r.name
  return r
end

local NEUTRAL_MAPS = { [1434] = true, [1446] = true, [1452] = true } -- Stranglethorn Vale, Tanaris, Winterspring
local NEUTRAL_TOWNS = { ["Booty Bay"] = true, ["Gadgetzan"] = true, ["Everlook"] = true }

local function atNeutralAuctionHouse()
  local map = C_Map and C_Map.GetBestMapForUnit and C_Map.GetBestMapForUnit("player")
  if map and NEUTRAL_MAPS[map] then return true end
  return NEUTRAL_TOWNS[GetMinimapZoneText() or ""] or NEUTRAL_TOWNS[GetZoneText() or ""] or false
end

-- houseId, ruleset, side ("alliance" | "horde" | "neutral"), or nil when unknown
function ns.House()
  local r = ns.Ruleset()
  if not r then return nil end
  local side = ns.atNeutral and "neutral" or (UnitFactionGroup("player") or ""):lower()
  local id = r[side]
  if not id then return nil end
  return id, r, side
end

local function houseItems(id)
  if not id or not ns.data then return nil end
  local t = ns.houseCache[id]
  if not t then
    local h = ns.data.houses[id]
    t = h and M.DecodeHouse(h.data) or {}
    ns.houseCache[id] = t
  end
  return t
end

-- one house's items, { [itemID] = { min, market, qty, listings, sold } } (decoded once, when first asked)
function ns.HouseItems(id) return houseItems(id) or {} end

---------------------------------------------------------------------------------------------------
-- Lookups (all in copper)

-- { min, market, qty, listings, sold } on your auction house, or nil
function ns.Price(itemID)
  local items = houseItems((ns.House()))
  return items and items[itemID]
end

function ns.Market(itemID)
  local p = ns.Price(itemID)
  return p and p[2]
end

-- median market across the region's houses, and how many houses it's from
function ns.RegionMedian(itemID)
  if not ns.data then return nil end
  ns.regionMedian = ns.regionMedian or M.DecodePairs(ns.data.regionMedian)
  local r = ns.regionMedian[itemID]
  if r then return r[1], r[2] end
end

function ns.VendorBuy(itemID)
  if not ns.data then return nil end
  ns.vendorBuy = ns.vendorBuy or M.DecodePairs(ns.data.vendorBuy)
  local r = ns.vendorBuy[itemID]
  return r and r[1]
end

-- what a reagent costs: the AH market, or the vendor's price when it isn't on the AH
function ns.ReagentCost(itemID)
  return ns.Market(itemID) or ns.VendorBuy(itemID)
end

-- a material's price for disenchanting: only markets with a few listings count (one odd listing can't make a flip)
function ns.MatPrice(itemID)
  local p = ns.Price(itemID)
  if p and p[4] >= M.MIN_MAT_LISTINGS then return p[2] end
end

-- The client (build 71037) only has C_Item.GetItemInfo; older ones have the global
function ns.ItemInfo(item)
  local fn = (C_Item and C_Item.GetItemInfo) or GetItemInfo
  if fn then return fn(item) end
end

-- names, quality, category, level and icon of the items on sale ({ [id] = { name, quality, cat, level, icon } })
function ns.ItemNames()
  ns.itemNames = ns.itemNames or M.DecodeItems(ns.data and ns.data.items)
  return ns.itemNames
end

-- An item's name, quality and icon: the game's when it has loaded the item, else the shipped ones
-- (the icon falls back to a question mark).
function ns.ItemMeta(id)
  local e = ns.ItemNames()[id]
  local name, _, quality = ns.ItemInfo(id)
  local icon = e and e[5]
  if not icon then
    if C_Item and C_Item.GetItemIconByID then icon = C_Item.GetItemIconByID(id)
    elseif GetItemIcon then icon = GetItemIcon(id) end
  end
  return name or (e and e[1]), quality or (e and e[2]), icon or 134400 -- INV_Misc_QuestionMark
end

local QUALITY_HEX = { [0] = "9d9d9d", "ffffff", "1eff00", "0070dd", "a335ee", "ff8000", "e6cc80" }
function ns.QualityHex(q) return QUALITY_HEX[q or 1] or "ffffff" end

-- what disenchanting one item is worth: worth after the AH cut, value, complete, table (or nil)
function ns.Disenchant(itemID)
  -- the game files mark some items "can't be disenchanted" though they fit the rules (e.g. Greater Magic Wand)
  ns.noDisenchant = ns.noDisenchant or M.DecodeSet(ns.data and ns.data.noDisenchant)
  if ns.noDisenchant[itemID] then return nil end
  local _, _, quality, itemLevel, _, _, _, _, _, _, _, classID = ns.ItemInfo(itemID)
  if not quality then return nil end
  local tbl = M.DisenchantTable(quality, classID, itemLevel)
  if not tbl then return nil end
  local value, complete = M.DisenchantValue(tbl, ns.MatPrice)
  return math.floor(value * (1 - M.AH_CUT) + 0.5), value, complete, tbl
end

function ns.VendorSell(itemID)
  local sell = select(11, ns.ItemInfo(itemID))
  if sell and sell > 0 then return sell end
end

-- { req|nil, yellow, grey } for a recipe (by its spell, the modern window's recipe id), or nil
function ns.SkillInfo(spellID)
  if not (ns.data and spellID) then return nil end
  ns.skill = ns.skill or M.DecodeSkill(ns.data.skill)
  return ns.skill[spellID]
end

-- A Waylaid crate's Favor and bundles, and the cheapest bundle to fill it on your house or the neutral one
function ns.Crate(itemID)
  if not (ns.data and itemID) then return nil end
  ns.crates = ns.crates or M.DecodeCrates(ns.data.crates)
  local c = ns.crates[itemID]
  if not c then return nil end
  local id, r = ns.House()
  local houses = {}
  if id then houses[#houses + 1] = houseItems(id) end
  if r and r.neutral and r.neutral ~= id then houses[#houses + 1] = houseItems(r.neutral) end
  return c, M.CrateFill(c, houses)
end

---------------------------------------------------------------------------------------------------
-- Gear and upgrades. Rules use the site's names for subclasses and inventory types (src/lib/upgrades.js),
-- so the game's numbers are turned into those names here.
local WEAPON_SUB = { [0] = "Axe", [1] = "Axe", [2] = "Bow", [3] = "Gun", [4] = "Mace", [5] = "Mace", [6] = "Polearm", [7] = "Sword",
  [8] = "Sword", [10] = "Staff", [13] = "Fist Weapon", [14] = "Miscellaneous", [15] = "Dagger", [16] = "Thrown", [18] = "Crossbow",
  [19] = "Wand", [20] = "Fishing Pole" }
local ARMOR_SUB = { [0] = "Miscellaneous", [1] = "Cloth", [2] = "Leather", [3] = "Mail", [4] = "Plate", [5] = "Cosmetic", [6] = "Shield",
  [7] = "Libram", [8] = "Idol", [9] = "Totem" }
local SHEET = { HEAD = 1, NECK = 2, SHOULDER = 3, CHEST = 5, WAIST = 6, LEGS = 7, FEET = 8, WRIST = 9, HANDS = 10, FINGER_1 = 11,
  FINGER_2 = 12, TRINKET_1 = 13, TRINKET_2 = 14, BACK = 15, MAIN_HAND = 16, OFF_HAND = 17, RANGED = 18 }
ns.SLOT_NAMES = { HEAD = "head", NECK = "neck", SHOULDER = "shoulders", BACK = "back", CHEST = "chest", WRIST = "wrists",
  HANDS = "hands", WAIST = "waist", LEGS = "legs", FEET = "feet", FINGER = "ring", TRINKET = "trinket", MAIN_HAND = "main hand",
  OFF_HAND = "off hand", RANGED = "ranged" }

-- { id, ilvl, req, quality, cls, sub, inv } for an item ID or link, or nil (not gear, or not cached yet)
function ns.GearInfo(item)
  local _, link, quality, ilvl, req, _, _, _, equipLoc, _, _, classID, subclassID = ns.ItemInfo(item)
  if not (quality and equipLoc and equipLoc ~= "" and (classID == 2 or classID == 4)) then return nil end
  local inv = equipLoc:gsub("^INVTYPE_", "")
  if inv == "2HWEAPON" then inv = "TWOHWEAPON" end
  return { id = ns.ItemID(link) or ns.ItemID(item), ilvl = ilvl, req = req, quality = quality,
    cls = classID == 2 and "Weapon" or "Armor", sub = (classID == 2 and WEAPON_SUB or ARMOR_SUB)[subclassID], inv = inv }
end

-- What you wear, by character-sheet slot. Cached until your gear changes (or an item wasn't loaded yet).
local gearCache
function ns.Gear()
  if gearCache then return gearCache end
  local gear, complete = {}, true
  for name, slot in pairs(SHEET) do
    local link = GetInventoryItemLink("player", slot)
    if link then
      local g = ns.GearInfo(link)
      if g then gear[name] = g else complete = false end
    end
  end
  if complete then gearCache = gear end
  return gear
end
function ns.ResetGear() gearCache = nil end

-- slot, item-level gain and what you wear there when the item is an upgrade for you, or nil
function ns.Upgrade(item)
  local g = ns.GearInfo(item)
  if not g then return nil end
  local _, cls = UnitClass("player")
  return M.UpgradeFor(g, ns.Gear(), (cls or ""):lower(), UnitLevel("player") or 1)
end

---------------------------------------------------------------------------------------------------
-- Watchlist and shopping list (imported from the site, or /fa watch)

-- target price (copper) when the item is on your watchlist: 0 = watched without a target; nil = not watched
function ns.WatchTarget(itemID)
  return ns.db and itemID and ns.db.watch[itemID]
end

-- how many you have: bags, plus the bank once you've opened it this session
function ns.Count(itemID)
  local fn = (C_Item and C_Item.GetItemCount) or GetItemCount
  return fn and fn(itemID, true) or 0
end

-- units of a shopping-list material you still need, or nil when it isn't on the list
function ns.ShoppingNeed(itemID)
  if not (ns.db and itemID) then return nil end
  for _, e in ipairs(ns.db.shopping) do
    if e[1] == itemID then return math.max(0, e[2] - ns.Count(itemID)), e[2] end
  end
end

-- Pasted from the site: replaces the watchlist or the shopping list. Returns a message for the player.
function ns.Import(text)
  local kind, entries = M.DecodeImport(text)
  if not kind then return false, entries end
  if kind == "watch" then
    local watch, n = {}, 0
    for _, e in ipairs(entries) do watch[e[1]] = e[2] or 0; n = n + 1 end
    ns.db.watch = watch
    if ns.OnListsChanged then ns.OnListsChanged("watch") end
    return true, ("watchlist imported: %d items. Items at your target are tagged in the auction house."):format(n)
  end
  local list = {}
  for _, e in ipairs(entries) do list[#list + 1] = { e[1], e[2] } end
  ns.db.shopping = list
  if ns.OnListsChanged then ns.OnListsChanged("shopping") end
  return true, ("shopping list imported: %d materials. |cffffffff/fa list|r shows it."):format(#list)
end

function ns.DataAge()
  return ns.data and ns.data.updated and (time() - ns.data.updated)
end

function ns.ItemID(link)
  if type(link) == "number" then return link end
  return link and tonumber(link:match("item:(%d+)"))
end

---------------------------------------------------------------------------------------------------
local asked = false
local function askForRuleset()
  if asked or not ns.data or ns.Ruleset() then return end
  asked = true
  local names = {}
  for _, r in ipairs(ns.data.rulesets) do names[#names + 1] = r.name end
  ns.Print("which ruleset is this realm? Type |cffffffff/fa ruleset <name>|r, one of: " .. table.concat(names, ", ") .. ". Prices show once it's set.")
end
ns.AskForRuleset = askForRuleset

f:RegisterEvent("ADDON_LOADED")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("AUCTION_HOUSE_SHOW")
f:RegisterEvent("AUCTION_HOUSE_CLOSED")
f:RegisterEvent("TRADE_SKILL_SHOW")
f:RegisterEvent("PLAYER_EQUIPMENT_CHANGED")
f:RegisterEvent("PLAYER_LEVEL_UP")
f:SetScript("OnEvent", function(_, event, arg1)
  if event == "PLAYER_EQUIPMENT_CHANGED" or event == "PLAYER_LEVEL_UP" then
    ns.ResetGear()
  elseif event == "ADDON_LOADED" then
    if arg1 == addonName then
      ForeverAnvilDB = ForeverAnvilDB or {}
      if ForeverAnvilDB.show and not ForeverAnvilDB.v then ForeverAnvilDB.show.vendor = false end -- v1 had it on
      copyDefaults(ForeverAnvilDB, ns.DEFAULTS)
      ns.db = ForeverAnvilDB
    end
    local fn = ns.onAddon[arg1]
    if fn then ns.onAddon[arg1] = nil; ns.Safe(arg1, fn) end
  elseif event == "PLAYER_LOGIN" then
    ns.LoadData()
    -- the auction or profession UI may already be loaded (another addon loaded it first)
    for name, fn in pairs(ns.onAddon) do
      local loaded = (C_AddOns and C_AddOns.IsAddOnLoaded or IsAddOnLoaded)(name)
      if loaded then ns.onAddon[name] = nil; ns.Safe(name, fn) end
    end
    if ns.InitOptions then ns.InitOptions() end
    if ns.InitMinimap then ns.Safe("minimap", ns.InitMinimap) end
    askForRuleset()
  elseif event == "AUCTION_HOUSE_SHOW" then
    ns.atNeutral = atNeutralAuctionHouse()
    ns.InitSoon("auction", ns.InitAuction)
    askForRuleset()
    if ns.OnAuctionOpen then ns.Safe("lists", ns.OnAuctionOpen) end
  elseif event == "TRADE_SKILL_SHOW" then
    ns.InitSoon("profession", ns.InitProfession)
  elseif event == "AUCTION_HOUSE_CLOSED" then
    ns.atNeutral = false
  end
end)

---------------------------------------------------------------------------------------------------
SLASH_FOREVERANVIL1 = "/fa"
SLASH_FOREVERANVIL2 = "/foreveranvil"
SlashCmdList.FOREVERANVIL = function(msg)
  local cmd, rest = (msg or ""):match("^%s*(%S*)%s*(.-)%s*$")
  cmd = cmd:lower()
  if cmd == "ruleset" then
    if rest == "" then askForRuleset(); asked = false; return end
    local r = ns.SetRuleset(rest)
    if r then ns.Print("this realm now uses " .. r.name .. " prices.") else ns.Print("unknown ruleset: " .. rest) end
  elseif cmd == "debug" then
    -- what the tooltip hooks are doing, and a price lookup (default: Linen Cloth), for bug reports
    local id = ns.House()
    local items = id and houseItems(id)
    local n = 0
    for _ in pairs(items or {}) do n = n + 1 end
    local tip = ns.tip or { fired = {}, routes = {} }
    local fired = {}
    for route, count in pairs(tip.fired) do fired[#fired + 1] = route .. "=" .. count end
    ns.Print(("version %s, build %s, interface %s"):format(
      (C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata)(addonName, "Version") or "?",
      select(2, GetBuildInfo()) or "?", select(4, GetBuildInfo()) or "?"))
    ns.Print(("house %s with %d items; tooltip routes: %s; fired: %s"):format(tostring(id), n,
      table.concat(tip.routes, ", "), #fired > 0 and table.concat(fired, ", ") or "none yet"))
    if tip.lastError then ns.Print("last tooltip error: " .. tostring(tip.lastError)) end
    if ns.lastError then ns.Print("last error: " .. ns.lastError) end
    local isLoaded = C_AddOns and C_AddOns.IsAddOnLoaded or IsAddOnLoaded
    local ui = {}
    for _, name in ipairs({ "Blizzard_AuctionHouseUI", "Blizzard_AuctionUI", "Blizzard_Professions", "Blizzard_TradeSkillUI" }) do
      if isLoaded(name) then ui[#ui + 1] = name end
    end
    ns.Print("loaded window addons: " .. (#ui > 0 and table.concat(ui, ", ") or "none") ..
      "; frames: " .. (AuctionHouseFrame and "AuctionHouseFrame " or "") .. (AuctionFrame and "AuctionFrame " or "") ..
      (ProfessionsFrame and "ProfessionsFrame " or "") .. (TradeSkillFrame and "TradeSkillFrame" or ""))
    ns.Print(("windows: auction %s, professions %s; last auction row: %s"):format(ns.auctionUI or "not opened yet",
      ns.professionUI or "not opened yet", (ns.lastRow or "none yet") .. (ns.lastTagAnchor and (", tag at " .. ns.lastTagAnchor) or "")))
    local item = ns.ItemID(rest) or tonumber(rest) or 2589
    local p = ns.Price(item)
    ns.Print(("item %d: %s"):format(item, p and ("market " .. M.ShortMoney(p[2]) .. ", lowest " .. M.ShortMoney(p[1]) .. ", " .. p[4] .. " listings") or "no price on this house"))
  elseif cmd == "options" or cmd == "config" then
    if ns.OpenOptions then ns.OpenOptions() end
  elseif cmd == "import" then
    if rest ~= "" then
      local _, msg = ns.Import(rest)
      ns.Print(msg)
    elseif ns.ShowImport then
      ns.ShowImport()
    end
  elseif (cmd == "watch" or cmd == "unwatch") and ns.WatchCommand then
    ns.WatchCommand(cmd, rest)
  elseif cmd == "menu" and ns.ToggleMenu then
    ns.ToggleMenu(ns.minimapButton and ns.minimapButton:IsShown() and ns.minimapButton or nil)
  elseif cmd == "minimap" and ns.UpdateMinimapButton then
    ns.db.show.minimap = not ns.db.show.minimap
    ns.OnSetting("minimap")
    ns.Print(ns.db.show.minimap and "minimap button shown." or "minimap button hidden (|cffffffff/fa minimap|r brings it back).")
  elseif cmd == "list" and ns.ListCommand then
    ns.ListCommand(rest)
  elseif (cmd == "prices" or cmd == "price" or cmd == "p") and ns.ShowPrices then
    ns.ShowPrices(rest)
  else
    local id, r, side = ns.House()
    if not ns.data then
      ns.Print("no price data loaded.")
    elseif not id then
      ns.Print("prices from " .. M.Age(ns.DataAge()) .. ", but the ruleset for " .. GetRealmName() .. " isn't set.")
      askForRuleset(); asked = false
    else
      ns.Print(("%s %s auction house (%s), prices from %s."):format(r.name, side, ns.regionCode, M.Age(ns.DataAge())))
    end
    ns.Print("|cffffffff/fa ruleset <name>|r sets this realm's ruleset, |cffffffff/fa options|r opens the settings. More tools at " .. ns.SITE .. ".")
    ns.Print("|cffffffff/fa import|r pastes a watchlist or shopping list from the site, |cffffffff/fa watch|r and |cffffffff/fa list|r show them, |cffffffff/fa prices|r browses every price, |cffffffff/fa menu|r opens the menu.")
  end
end
