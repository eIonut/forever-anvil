-- Bag value (version 2): what everything in your bags is worth, and the best way to turn each item into
-- gold: the auction house (after its cut), disenchanting, or a vendor. Soulbound items can't go to the
-- auction house. /fa bags, or "Bag value" in the minimap menu.
local _, ns = ...
local M = ns.Math
local L = ns.L

local ROWS, ROW_H, WIDTH = 16, 20, 380
local win

local KIND = {
  ah = { "Auction house", "ffd100" },
  de = { "Disenchant", "c080ff" },
  vendor = { "Vendor", "bbbbbb" },
}

-- the slots of your bags (backpack and the four bags)
local function slots()
  local C = C_Container
  local numSlots = (C and C.GetContainerNumSlots) or GetContainerNumSlots
  local out = {}
  for bag = 0, (NUM_BAG_SLOTS or 4) do
    for slot = 1, (numSlots and numSlots(bag) or 0) do out[#out + 1] = { bag, slot } end
  end
  return out
end

-- itemID, count, soulbound for one slot, or nil when it's empty
local function slotItem(bag, slot)
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

-- Everything in your bags, by item (bound and unbound copies apart), with its best use:
-- { { id, count, bound, kind, unit, total, thin }, … } dearest first, and the totals per kind.
function ns.BagItems()
  local by, order = {}, {}
  for _, s in ipairs(slots()) do
    local id, count, bound = slotItem(s[1], s[2])
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
  local totals, list = { ah = 0, de = 0, vendor = 0, all = 0 }, {}
  for _, e in ipairs(order) do
    local p = not e.bound and ns.Price(e.id) or nil
    local de = ns.db.show.de and ns.Disenchant(e.id) or nil
    e.kind, e.unit = M.BestUse(p and p[2], de, ns.VendorSell(e.id))
    if e.kind then
      e.total = e.unit * e.count
      e.thin = e.kind == "ah" and p[4] < M.THIN
      totals[e.kind] = totals[e.kind] + e.total
      totals.all = totals.all + e.total
      list[#list + 1] = e
    end
  end
  table.sort(list, function(a, b)
    if a.total ~= b.total then return a.total > b.total end
    return a.id < b.id
  end)
  return list, totals
end

local function draw()
  local list, totals = ns.BagItems()
  local max = math.max(0, #list - ROWS)
  if win.offset > max then win.offset = max end
  if win.offset < 0 then win.offset = 0 end
  for i, b in ipairs(win.rows) do
    local e = list[win.offset + i]
    b.itemID = e and e.id
    if e then
      local name, quality, icon = ns.ItemMeta(e.id)
      b.icon:SetTexture(icon)
      b.name:SetText("|cff" .. ns.QualityHex(quality) .. (name or ("item " .. e.id)) .. "|r" .. (e.count > 1 and ("|cff999999 ×" .. e.count .. "|r") or ""))
      local k = KIND[e.kind]
      b.kind:SetText("|cff" .. k[2] .. L[k[1]] .. "|r" .. (e.bound and ("|cff777777 · " .. L["bound"] .. "|r") or ""))
      b.value:SetText((e.thin and "|cff999999~|r" or "") .. M.ShortMoney(e.total, true))
      b:Show()
    else
      b:Hide()
    end
  end
  if #list == 0 then
    win.total:SetText("|cff999999" .. L["Nothing in your bags has a price."] .. "|r")
    win.split:SetText("")
  else
    win.total:SetText(L["Worth"] .. " " .. M.ShortMoney(totals.all) .. (#list > ROWS and ("  |cff999999" .. L["%d items, scroll for more"]:format(#list) .. "|r") or ""))
    win.split:SetText(("|cffffd100%s|r %s   |cffc080ff%s|r %s   |cffbbbbbb%s|r %s"):format(L["Auction house"], M.ShortMoney(totals.ah, true),
      L["Disenchant"], M.ShortMoney(totals.de, true), L["Vendor"], M.ShortMoney(totals.vendor, true)))
  end
end

local function build()
  local fr = CreateFrame("Frame", "ForeverAnvilBags", UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(WIDTH, 58 + ROWS * ROW_H + 52)
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
  head(L["Item"], 36)
  head(L["Best"], 214)
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
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.icon:SetSize(18, 18)
    b.icon:SetPoint("LEFT", 1, 0)
    b.icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    b.name = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.name:SetPoint("LEFT", 22, 0)
    b.name:SetWidth(176)
    b.name:SetJustifyH("LEFT")
    b.name:SetWordWrap(false)
    b.kind = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.kind:SetPoint("LEFT", 200, 0)
    b.kind:SetWidth(96)
    b.kind:SetJustifyH("LEFT")
    b.kind:SetWordWrap(false)
    b.value = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.value:SetPoint("RIGHT", -2, 0)
    b.value:SetWidth(60)
    b.value:SetJustifyH("RIGHT")
    -- click: search the auction house for it; Shift: link it in chat
    b:SetScript("OnClick", function(self)
      if not self.itemID then return end
      local link = select(2, ns.ItemInfo(self.itemID))
      if link and IsModifiedClick and IsModifiedClick() and HandleModifiedItemClick then HandleModifiedItemClick(link); return end
      if ns.SearchAuction then ns.SearchAuction(self.itemID) end
    end)
    b:SetScript("OnEnter", function(self)
      if not self.itemID then return end
      GameTooltip:SetOwner(self, "ANCHOR_LEFT")
      GameTooltip:SetItemByID(self.itemID)
      GameTooltip:Show()
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    fr.rows[i] = b
  end

  fr.total = fr:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fr.total:SetPoint("BOTTOMLEFT", 16, 30)
  fr.total:SetJustifyH("LEFT")
  fr.split = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.split:SetPoint("BOTTOMLEFT", 16, 12)
  fr.split:SetJustifyH("LEFT")
  fr:SetScript("OnShow", function() ns.Safe("bags", draw) end)
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
  local _, totals = ns.BagItems()
  return totals.all
end

-- bags change: redraw an open window (once per burst of changes)
local events = CreateFrame("Frame")
pcall(events.RegisterEvent, events, "BAG_UPDATE_DELAYED")
local pending = false
events:SetScript("OnEvent", function()
  if pending or not (win and win:IsShown()) then return end
  pending = true
  local function run() pending = false; ns.Safe("bags", draw) end
  if C_Timer and C_Timer.After then C_Timer.After(0.2, run) else run() end
end)
