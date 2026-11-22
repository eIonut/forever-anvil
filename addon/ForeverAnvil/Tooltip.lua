-- Item tooltips: market and lowest price on your auction house, sold per day, region median,
-- disenchant value and vendor price; since version 2 also a crate's Favor and cheapest fill, your watchlist
-- target, what your shopping list still needs, and upgrades over your gear. Works with both tooltip systems.
local _, ns = ...
local M = ns.Math

local GOLD, GREY, PURPLE = { 0.9, 0.64, 0.24 }, { 0.6, 0.6, 0.6 }, { 0.74, 0.55, 1 }
local STALE = 6 * 3600 -- older data is shown grey

local coins = GetCoinTextureString or (C_CurrencyInfo and C_CurrencyInfo.GetCoinTextureString)
local function money(c) return coins and coins(c) or M.ShortMoney(c) end

local function addLines(tt, itemID)
  if not itemID or not ns.db then return end
  -- several hooks can fire for one tooltip: skip if our lines for this item are already on it
  if tt.foreverAnvilItem == itemID and tt:NumLines() >= (tt.foreverAnvilLines or 0) then return end
  local show = ns.db.show
  local p = ns.Price(itemID)
  local id, r, side = ns.House()
  local lines = {}
  local function add(l, rt, color) lines[#lines + 1] = { l, rt, color } end

  if id then
    if p and show.market and p[2] then add("Market", money(p[2])) end
    if p and show.min and p[1] then add("Lowest listed", money(p[1]) .. "  |cff999999x" .. p[3] .. "|r") end
    if p and show.sold then add("Sold per day", p[5] and tostring(p[5]) or "|cff999999none seen|r") end
    if not p and (show.market or show.min) then add("Market", "|cff999999not listed|r") end
  end
  if show.region then
    local m, n = ns.RegionMedian(itemID)
    if m then add("Region median", money(m) .. "  |cff999999" .. n .. " houses|r") end
  end
  if show.de and id then
    local worth, _, complete, tbl = ns.Disenchant(itemID)
    if worth and worth > 0 then
      local skill = tbl.skill and ("  |cff999999skill " .. tbl.skill .. "|r") or ""
      add("Disenchant", (complete and "" or "~") .. money(worth) .. skill, PURPLE)
    end
  end
  if show.vendor then
    local sell = ns.VendorSell(itemID)
    if sell then add("Vendor", money(sell)) end
  end
  if show.crates then
    local crate, fill = ns.Crate(itemID)
    if crate then
      local favor = (crate.confirmed and "" or "~") .. (crate.favor % 1 == 0 and string.format("%d", crate.favor) or tostring(crate.favor))
      add("Merchant's Favor", favor, GOLD)
      if fill then
        local name = ns.ItemInfo(fill.item) or ("item " .. fill.item)
        add("Cheapest fill", fill.qty .. " " .. name .. ", " .. money(fill.cost))
        add("Per Favor", money(math.floor(fill.cost / crate.favor + 0.5)))
      elseif id then
        add("Cheapest fill", "|cff999999not enough on sale|r")
      end
    end
  end
  if show.watch then
    local target = ns.WatchTarget(itemID)
    if target then
      local at = target > 0 and p and p[1] and p[1] <= target
      add("Watchlist", target > 0 and ("target " .. money(target) .. (at and "  |cff33dd55at target|r" or "")) or "watched", GOLD)
    end
  end
  if show.shopping then
    local need, total = ns.ShoppingNeed(itemID)
    if need then add("Shopping list", need > 0 and ("need " .. need .. " of " .. total) or ("|cff33dd55you have all " .. total .. "|r"), GOLD) end
  end
  if show.upgrades then
    local slot, gain, wearing = ns.Upgrade(itemID)
    if slot then
      local what = wearing and ("over your " .. ns.SLOT_NAMES[slot]) or ("empty " .. ns.SLOT_NAMES[slot] .. " slot")
      add("Upgrade", "|cff33dd55+" .. gain .. " item level|r  |cff999999" .. what .. "|r", { 0.4, 0.8, 1 })
    end
  end
  if #lines == 0 then return end

  local age = ns.DataAge()
  local head = id and (r.name .. " " .. side .. (r.likely and "?" or "")) or "set ruleset: /fa ruleset"
  tt:AddDoubleLine("Forever Anvil", head .. "  " .. M.Age(age), GOLD[1], GOLD[2], GOLD[3], GREY[1], GREY[2], GREY[3])
  local stale = age and age > STALE
  for _, l in ipairs(lines) do
    local c = l[3] or (stale and GREY) or { 1, 1, 1 }
    tt:AddDoubleLine("  " .. l[1], l[2], c[1], c[2], c[3], 1, 1, 1)
  end
  tt.foreverAnvilItem, tt.foreverAnvilLines = itemID, tt:NumLines()
  tt:Show()
end

-- Which hooks fired, and the last error (for /fa debug). Errors are caught so one bad tooltip can't break the rest.
ns.tip = { fired = {}, routes = {} }
local function run(route, tt, itemID)
  ns.tip.fired[route] = (ns.tip.fired[route] or 0) + 1
  local ok, err = pcall(addLines, tt, itemID)
  if not ok and ns.tip.lastError ~= err then
    ns.tip.lastError = err
    ns.Print("tooltip error (please report it): " .. tostring(err))
  end
end

local function itemOf(tt)
  if not tt.GetItem then return nil end
  local _, link = tt:GetItem()
  return ns.ItemID(link)
end

-- Every route the client may use; whichever fires first adds the lines.
-- 1. newer tooltip system: data post-calls
if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType and Enum.TooltipDataType.Item then
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tt, data)
    if tt and tt.AddDoubleLine then run("data", tt, (data and data.id) or itemOf(tt)) end
  end)
  ns.tip.routes[#ns.tip.routes + 1] = "data"
end

local TOOLTIPS = { GameTooltip, ItemRefTooltip, ShoppingTooltip1, ShoppingTooltip2 }
-- 2. classic: the OnTooltipSetItem script
for _, tt in ipairs(TOOLTIPS) do
  if tt and tt.HasScript and tt:HasScript("OnTooltipSetItem") then
    tt:HookScript("OnTooltipSetItem", function(self) run("script", self, itemOf(self)) end)
    if tt == GameTooltip then ns.tip.routes[#ns.tip.routes + 1] = "script" end
  end
end
-- 3. fallback: after any of the tooltip's Set…Item calls
local SETTERS = { "SetBagItem", "SetInventoryItem", "SetHyperlink", "SetMerchantItem", "SetBuybackItem", "SetAuctionItem",
  "SetAuctionSellItem", "SetLootItem", "SetLootRollItem", "SetQuestItem", "SetQuestLogItem", "SetInboxItem", "SetSendMailItem",
  "SetTradePlayerItem", "SetTradeTargetItem", "SetTradeSkillItem", "SetCraftItem", "SetItemByID" }
for _, tt in ipairs(TOOLTIPS) do
  if tt then
    for _, name in ipairs(SETTERS) do
      if type(tt[name]) == "function" then
        hooksecurefunc(tt, name, function(self) run("set", self, itemOf(self)) end)
      end
    end
  end
end
ns.tip.routes[#ns.tip.routes + 1] = "set"
