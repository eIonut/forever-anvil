-- Bag value (version 2): what everything in your bags is worth, and the best way to turn each item into
-- gold: the auction house (after its cut), disenchanting, or a vendor. Soulbound items can't go to the
-- auction house. /fa bags, or "Bag value" in the minimap menu.
local _, ns = ...
local M = ns.Math
local L = ns.L

local ROWS, ROW_H, WIDTH = 16, 20, 398
local win

local KIND = {
  ah = { "Auction house", "ffd100" },
  de = { "Disenchant", "c080ff" },
  vendor = { "Vendor", "bbbbbb" },
}

-- the last of your own bags: the reagent bag (bag 5) on clients that have one, else the fourth bag
local function lastBag()
  return NUM_TOTAL_EQUIPPED_BAG_SLOTS or (Enum and Enum.BagIndex and Enum.BagIndex.ReagentBag) or NUM_BAG_SLOTS or 4
end

-- the slots of your bags (backpack, the four bags and the reagent bag)
local function slots()
  local C = C_Container
  local numSlots = (C and C.GetContainerNumSlots) or GetContainerNumSlots
  local out = {}
  for bag = 0, lastBag() do
    for slot = 1, (numSlots and numSlots(bag) or 0) do out[#out + 1] = { bag, slot } end
  end
  return out
end

-- itemID, count, soulbound for one slot, or nil when it's empty
function ns.SlotItem(bag, slot)
  local C = C_Container
  if C and C.GetContainerItemInfo then
    local info = C.GetContainerItemInfo(bag, slot)
    if info and info.itemID then return info.itemID, info.stackCount or 1, info.isBound and true or false end
    return nil
  end
  if GetContainerItemInfo then
    local _, count, _, _, _, _, link, _, _, id, bound = GetContainerItemInfo(bag, slot)
    id = id or ns.ItemID(link)
    if id then return id, count or 1, bound and true or false end
  end
end

-- Items you keep (untick them in the window): left out of the totals and the sell marks.
function ns.BagIgnored(id) return ns.db.bagIgnore[id] == true end

function ns.SetBagIgnored(id, on)
  ns.db.bagIgnore[id] = on and true or nil
  if ns.RefreshBagMarks then ns.RefreshBagMarks() end
end

-- The best way to turn one of this item into gold: "ah", "de" or "vendor" (nil: none), what one is worth that
-- way, and its auction prices. Bound items can't go to the auction house.
function ns.BestUseOf(id, bound)
  local p = not bound and ns.Price(id) or nil
  local de = ns.db.show.de and ns.Disenchant(id) or nil
  local kind, unit = M.BestUse(p and p[2], de, ns.VendorSell(id))
  return kind, unit, p
end

local function dearest(a, b)
  if a.total ~= b.total then return a.total > b.total end
  return a.id < b.id
end

-- Everything in your bags, by item (bound and unbound copies apart), with its best use:
-- { { id, count, bound, kind, unit, total, thin }, … } dearest first, the totals per kind, and the items
-- you ignore (same shape, ignored = true), which the totals leave out; then how many items the game hasn't
-- loaded yet (their vendor and disenchant values come with them; they're asked for, and the window redraws).
function ns.BagItems()
  local by, order = {}, {}
  for _, s in ipairs(slots()) do
    local id, count, bound = ns.SlotItem(s[1], s[2])
    if id then
      local key = id .. (bound and "b" or "")
      local e = by[key]
      if not e then
        e = { id = id, count = 0, bound = bound }
        by[key] = e
        order[#order + 1] = e
      end
      e.count = e.count + count
    end
  end
  local totals, list, ignored, loading = { ah = 0, de = 0, vendor = 0, all = 0 }, {}, {}, 0
  for _, e in ipairs(order) do
    if not ns.ItemInfo(e.id) then
      loading = loading + 1
      if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, e.id) end
    end
    local p
    e.kind, e.unit, p = ns.BestUseOf(e.id, e.bound)
    if e.kind then
      e.total = e.unit * e.count
      e.thin = e.kind == "ah" and p[4] < M.THIN
      if ns.BagIgnored(e.id) then
        e.ignored = true
        ignored[#ignored + 1] = e
      else
        totals[e.kind] = totals[e.kind] + e.total
        totals.all = totals.all + e.total
        list[#list + 1] = e
      end
    end
  end
  table.sort(list, dearest)
  table.sort(ignored, dearest)
  return list, totals, ignored, loading
end

local draw
draw = function()
  local list, totals, ignored, loading = ns.BagItems()
  -- every item in one list, dearest first: the ones you untick keep their place, greyed out
  local shown = {}
  for _, e in ipairs(list) do shown[#shown + 1] = e end
  for _, e in ipairs(ignored) do shown[#shown + 1] = e end
  table.sort(shown, dearest)
  local max = math.max(0, #shown - ROWS)
  if win.offset > max then win.offset = max end
  if win.offset < 0 then win.offset = 0 end
  for i, b in ipairs(win.rows) do
    local e = shown[win.offset + i]
    b.itemID = e and e.id
    b.ignored = e and e.ignored
    if e then
      local name, quality, icon = ns.ItemMeta(e.id)
      b.check:SetChecked(not e.ignored)
      b.icon:SetTexture(icon)
      if b.icon.SetDesaturated then b.icon:SetDesaturated(e.ignored == true) end
      b.name:SetText("|cff" .. (e.ignored and "777777" or ns.QualityHex(quality)) .. (name or ("item " .. e.id)) .. "|r" .. (e.count > 1 and ("|cff999999 ×" .. e.count .. "|r") or ""))
      local k = KIND[e.kind]
      if e.ignored then
        b.kind:SetText("|cff777777" .. L[k[1]] .. (e.bound and (" · " .. L["bound"]) or "") .. "|r")
        b.value:SetText("|cff777777" .. M.CoinMoney(e.total) .. "|r")
      else
        b.kind:SetText("|cff" .. k[2] .. L[k[1]] .. "|r" .. (e.bound and ("|cff777777 · " .. L["bound"] .. "|r") or ""))
        b.value:SetText((e.thin and "|cff999999~|r" or "") .. M.CoinMoney(e.total))
      end
      b:Show()
    else
      b:Hide()
    end
  end
  -- items the game is still loading: say so (an empty list isn't "nothing has a price" yet), and look again
  -- in a second, for a while, in case the game's "item loaded" events don't cover them all
  local more = loading > 0 and ("  |cff999999" .. L["loading %d items"]:format(loading) .. "|r") or ""
  if #list == 0 and #ignored == 0 then
    win.total:SetText("|cff999999" .. (loading > 0 and L["Getting your items from the game…"] or L["Nothing in your bags has a price."]) .. "|r" .. more)
    win.split:SetText("")
  else
    win.total:SetText(L["Worth"] .. " |cffffffff" .. M.CoinMoney(totals.all) .. "|r" .. (#shown > ROWS and ("  |cff999999" .. L["%d items, scroll for more"]:format(#shown) .. "|r") or "") .. more)
    win.split:SetText(("|cffffd100%s|r %s   |cffc080ff%s|r %s   |cffbbbbbb%s|r %s"):format(L["Auction house"], M.CoinMoney(totals.ah),
      L["Disenchant"], M.CoinMoney(totals.de), L["Vendor"], M.CoinMoney(totals.vendor)))
  end
  win.hint:SetText("|cff777777" .. L["Untick items you keep to leave them out."] .. "|r")
  win.marks:SetChecked(ns.db.show.bagMarks)
  if loading > 0 and not win.retrying and (win.retries or 0) < 15 and C_Timer and C_Timer.After then
    win.retrying, win.retries = true, (win.retries or 0) + 1
    C_Timer.After(1, function()
      win.retrying = false
      if win:IsShown() then ns.Safe("bags", draw) end
    end)
  end
end

local function build()
  local fr = CreateFrame("Frame", "ForeverAnvilBags", UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(WIDTH, 58 + ROWS * ROW_H + 72)
  fr:SetFrameStrata("MEDIUM")
  fr:SetToplevel(true)
  fr:SetMovable(true)
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, rel, px, py = self:GetPoint()
    ns.db.bagsPos = { point, rel, px, py }
  end)
  local pos = ns.db.bagsPos
  if pos then fr:SetPoint(pos[1], UIParent, pos[2], pos[3], pos[4]) else fr:SetPoint("RIGHT", -380, 0) end
  if fr.TitleText then fr.TitleText:SetText(L["Bag value"]) end
  tinsert(UISpecialFrames, "ForeverAnvilBags")
  win = fr
  fr.offset = 0

  local function head(text, x, justify)
    local fs = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    if justify == "RIGHT" then fs:SetPoint("TOPRIGHT", fr, "TOPLEFT", x, -30) else fs:SetPoint("TOPLEFT", x, -30) end
    fs:SetText(text)
  end
  head(L["Item"], 54)
  head(L["Best"], 232)
  head(L["Value"], WIDTH - 16, "RIGHT")

  local area = CreateFrame("Frame", nil, fr)
  area:SetPoint("TOPLEFT", 14, -46)
  area:SetSize(WIDTH - 28, ROWS * ROW_H)
  area:EnableMouseWheel(true)
  area:SetScript("OnMouseWheel", function(_, delta)
    fr.offset = fr.offset - delta * 2
    ns.Safe("bags", draw)
  end)
  fr.rows = {}
  for i = 1, ROWS do
    local b = CreateFrame("Button", nil, area)
    b:SetSize(WIDTH - 28, ROW_H)
    b:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
    if i % 2 == 0 then
      local stripe = b:CreateTexture(nil, "BACKGROUND")
      stripe:SetAllPoints()
      stripe:SetColorTexture(1, 1, 1, 0.03)
    end
    local hl = b:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.1)
    -- the tick: counted in the worth (and marked in your bags) or not
    b.check = CreateFrame("CheckButton", nil, b, "UICheckButtonTemplate")
    b.check:SetSize(20, 20)
    b.check:SetPoint("LEFT", -2, 0)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.icon:SetSize(18, 18)
    b.icon:SetPoint("LEFT", 19, 0)
    b.icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    b.name = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.name:SetPoint("LEFT", 40, 0)
    b.name:SetWidth(176)
    b.name:SetJustifyH("LEFT")
    b.name:SetWordWrap(false)
    b.kind = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.kind:SetPoint("LEFT", 218, 0)
    b.kind:SetWidth(90)
    b.kind:SetJustifyH("LEFT")
    b.kind:SetWordWrap(false)
    b.value = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.value:SetPoint("RIGHT", -2, 0)
    b.value:SetWidth(72)
    b.value:SetJustifyH("RIGHT")
    -- the tick (or a right-click on the row) leaves the item out of the worth, or counts it again
    local function flip()
      if not b.itemID then return end
      ns.SetBagIgnored(b.itemID, not b.ignored)
      ns.Safe("bags", draw)
    end
    b.check:SetScript("OnClick", flip)
    b.check:SetScript("OnEnter", function(self)
      if not b.itemID then return end
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:AddLine(b.ignored and L["Tick it to count it in your bag value again."] or L["Untick it to leave it out of your bag value, like things you keep. It loses its sell mark too."], 1, 1, 1, true)
      GameTooltip:Show()
    end)
    b.check:SetScript("OnLeave", function() GameTooltip:Hide() end)
    -- click: search the auction house for it; Shift: link it in chat; right-click: untick or tick it
    b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    b:SetScript("OnClick", function(self, button)
      if not self.itemID then return end
      if button == "RightButton" then
        GameTooltip:Hide()
        flip()
        return
      end
      local link = select(2, ns.ItemInfo(self.itemID))
      if link and IsModifiedClick and IsModifiedClick() and HandleModifiedItemClick then HandleModifiedItemClick(link); return end
      if ns.SearchAuction then ns.SearchAuction(self.itemID) end
    end)
    b:SetScript("OnEnter", function(self)
      if not self.itemID then return end
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:SetItemByID(self.itemID)
      GameTooltip:AddLine(self.ignored and L["Tick it to count it in your bag value again."] or L["Untick it to leave it out of your bag value, like things you keep. It loses its sell mark too."], 0.6, 0.6, 0.6)
      GameTooltip:Show()
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    fr.rows[i] = b
  end

  fr.total = fr:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fr.total:SetPoint("BOTTOMLEFT", 16, 50)
  fr.total:SetJustifyH("LEFT")
  fr.split = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.split:SetPoint("BOTTOMLEFT", 16, 32)
  fr.split:SetJustifyH("LEFT")
  fr.hint = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.hint:SetPoint("BOTTOMLEFT", 16, 13)
  fr.hint:SetWidth(WIDTH - 150)
  fr.hint:SetJustifyH("LEFT")
  fr.hint:SetWordWrap(false)
  -- the same switch as "Sell marks in your bags" in the settings
  fr.marks = CreateFrame("CheckButton", nil, fr, "UICheckButtonTemplate")
  fr.marks:SetSize(22, 22)
  fr.marks:SetPoint("BOTTOMRIGHT", -112, 8)
  local marksLabel = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  marksLabel:SetPoint("LEFT", fr.marks, "RIGHT", 0, 0)
  marksLabel:SetText(L["Mark in bags"])
  fr.marks:SetHitRectInsets(0, -90, 0, 0) -- the label clicks too
  fr.marks:SetScript("OnClick", function(self) ns.SetBagMarks(self:GetChecked() and true or false) end)
  fr.marks:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:AddLine(L["Sell marks in your bags"])
    GameTooltip:AddLine(L["The auction house symbol on the items in your bags that sell best on the auction house: worth more there after its cut than to a vendor or disenchanted. Untick an item in the bag value window to take its mark off. Works with the game's bags and bag addons like Bagnon."], 1, 1, 1, true)
    GameTooltip:Show()
  end)
  fr.marks:SetScript("OnLeave", function() GameTooltip:Hide() end)
  fr:SetScript("OnShow", function() fr.retries = 0; ns.Safe("bags", draw) end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

function ns.ShowBags(on)
  win = win or build()
  if on == nil then on = not win:IsShown() end
  if on then win:Show() else win:Hide() end
end

function ns.BagsShown() return win ~= nil and win:IsShown() end

-- for the menu: the bags' total worth
function ns.BagWorth()
  local _, totals, _, loading = ns.BagItems()
  return totals.all, loading -- and how many items are still loading
end

-- bags change: redraw an open window (once per burst of changes)
local events = CreateFrame("Frame")
pcall(events.RegisterEvent, events, "BAG_UPDATE_DELAYED")
pcall(events.RegisterEvent, events, "GET_ITEM_INFO_RECEIVED") -- an item's details arrived: its vendor and disenchant values
local pending = false
events:SetScript("OnEvent", function()
  if pending or not (win and win:IsShown()) then return end
  pending = true
  local function run() pending = false; ns.Safe("bags", draw) end
  if C_Timer and C_Timer.After then C_Timer.After(0.2, run) else run() end
end)
