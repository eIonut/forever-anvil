-- Forever Anvil: auction prices from foreveranvil.com in your tooltips, auction house and profession window.
-- Core: saved settings, loading the region's data, working out which auction house you're on, price lookups.
local addonName, ns = ...
local M = ns.Math

ns.SITE = "foreveranvil.com"
ns.DEFAULTS = {
  realms = {},   -- [realm name] = ruleset name ("PvP", …), when it can't be told from the realm name
  -- vendor is off: this client's tooltips already show the sell price
  show = { market = true, min = true, sold = true, region = true, de = true, vendor = false, flips = true, deAll = false, craft = true },
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
f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" then
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
    askForRuleset()
  elseif event == "AUCTION_HOUSE_SHOW" then
    ns.atNeutral = atNeutralAuctionHouse()
    ns.InitSoon("auction", ns.InitAuction)
    askForRuleset()
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
  end
end
