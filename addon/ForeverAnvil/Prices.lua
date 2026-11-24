-- Prices window (version 2): the site's /prices page in game. Every item on an auction house of your ruleset
-- (yours, the other faction's or the neutral one), searched by name, filtered by category and sorted by any
-- column. Click a line for its details, where you can watch it, add it to your shopping list or search the
-- auction house for it. /fa prices [search], or the minimap menu.
local _, ns = ...
local M = ns.Math
local L = ns.L
-- a client in another language: show and search the game's item names (it loads them when the window opens)
local LOCALIZED = not (ns.LOCALE == "enUS" or ns.LOCALE == "enGB")

local ROWS, ROW_H = 18, 18
local LIST_X, LIST_W = 140, 470
local win
local state = { term = "", cat = "", sort = "value", dir = -1, side = nil, offset = 0, selected = nil }
local all, rows, counts = {}, {}, {} -- every match of the search, the ones in the category, items per category

-- column: sort key, heading, x, width
local COLS = {
  { "name", L["Item"], 0, 200 },
  { "market", L["Market"], 204, 72 },
  { "min", L["Lowest"], 280, 72 },
  { "qty", L["Listed"], 356, 50 },
  { "sold", L["Sold/day"], 410, 58 },
}

local function thousands(n)
  local s = tostring(math.floor(n))
  while true do
    local done
    s, done = s:gsub("^(%d+)(%d%d%d)", "%1,%2")
    if done == 0 then return s end
  end
end

-- the house shown: the side picked in the window, or the one you're on
local function shownHouse()
  local _, r, mySide = ns.House()
  r = r or ns.Ruleset()
  if not r then return nil end
  local side = state.side or mySide or "neutral"
  return r[side], r, side
end

-- the game's name for an item the data has no name for, when it has loaded it (never asks the server)
local function cachedName(id)
  local name = ns.ItemInfo(id)
  return name
end

local function priceText(c) return c and M.ShortMoney(c, true) or "|cff777777-|r" end

local function refreshDetail()
  local d = win.detail
  local id = state.selected
  if not id then d:Hide(); return end
  d:Show()
  local houseId = shownHouse()
  local p = houseId and ns.HouseItems(houseId)[id]
  local name, quality, icon = ns.ItemMeta(id)
  d.icon:SetTexture(icon)
  d.name:SetText("|cff" .. ns.QualityHex(quality) .. (name or ("item " .. id)) .. "|r")
  if p then
    d.line1:SetText(L["Market %s · Lowest %s · %s listed in %s listings"]:format(priceText(p[2]), priceText(p[1]),
      thousands(p[3] or 0), thousands(p[4] or 0)) .. (p[5] and (" · " .. L["Sold %d/day"]:format(p[5])) or ""))
  else
    d.line1:SetText("|cff999999" .. L["Not on this auction house right now."] .. "|r")
  end
  local bits = {}
  -- kept short: with all three it must fit on one line beside the buttons ("Region median" and "Vendor pays" wrapped)
  local med, n = ns.RegionMedian(id)
  if med then bits[#bits + 1] = L["Region"] .. " " .. priceText(med) .. " (" .. L["%d houses"]:format(n) .. ")" end
  local sell = ns.VendorSell(id)
  if sell then bits[#bits + 1] = L["Vendor"] .. " " .. priceText(sell) end
  local de = ns.Disenchant(id)
  if de then bits[#bits + 1] = L["Disenchant"] .. " ~" .. priceText(de) end
  d.line2:SetText("|cffbbbbbb" .. table.concat(bits, " · ") .. "|r")
  d.watch:SetText(ns.db.watch[id] and L["Unwatch"] or L["Watch"])
end

local function draw()
  local max = math.max(0, #rows - ROWS)
  if state.offset > max then state.offset = max end
  if state.offset < 0 then state.offset = 0 end
  for i, b in ipairs(win.rows) do
    local e = rows[state.offset + i]
    b.itemID = e and e.id
    if e then
      local p = e.p
      local name, quality, icon = ns.ItemMeta(e.id)
      b.icon:SetTexture(icon)
      b.name:SetText("|cff" .. ns.QualityHex(quality) .. (name or e.name or ("item " .. e.id)) .. "|r")
      b.market:SetText(priceText(p[2]))
      b.min:SetText(priceText(p[1]))
      b.qty:SetText(thousands(p[3] or 0))
      b.sold:SetText(p[5] and tostring(p[5]) or "|cff777777-|r")
      b.selected:SetShown(e.id == state.selected)
      b:Show()
    else
      b:Hide()
    end
  end
  win.scroll.updating = true
  win.scroll:SetMinMaxValues(0, max)
  win.scroll:SetValue(state.offset)
  win.scroll.updating = nil
  win.scroll:SetShown(max > 0)
  local houseId, r, side = shownHouse()
  if not houseId then
    win.status:SetText("|cffff5555" .. L["Set your realm's ruleset first: |cffffffff/fa ruleset PvP|r (or Normal, Roleplay, RP-PvP)."] .. "|r")
  elseif #rows == 0 then
    win.status:SetText("|cff999999" .. (state.term ~= "" and L["Nothing matches \"%s\"."]:format(state.term) or L["No items."]) .. "|r")
  else
    win.status:SetText(L["Showing %d–%d of %s items"]:format(state.offset + 1, math.min(#rows, state.offset + ROWS), thousands(#rows))
      .. ("  |cff999999%s %s · %s|r"):format(r.name, L[side], L["prices %s"]:format(M.Age(ns.DataAge()))))
  end
  for _, c in ipairs(win.cats) do
    c.count:SetText(counts[c.key] and thousands(counts[c.key]) or "")
    c.selected:SetShown(c.key == state.cat)
  end
  for _, h in ipairs(win.heads) do
    local on = h.key == state.sort
    h.arrow:SetShown(on)
    if on then h.arrow:SetTexCoord(0, 0.5625, state.dir > 0 and 0 or 1, state.dir > 0 and 1 or 0) end
    h.label:SetTextColor(on and 1 or 0.85, on and 0.82 or 0.85, on and 0 or 0.85)
  end
  for _, b in ipairs(win.sides) do
    if b.side == side then b:LockHighlight() else b:UnlockHighlight() end
    b:SetEnabled(r ~= nil and r[b.side] ~= nil)
  end
  refreshDetail()
end

-- A client in another language: asks the game for the names of the items on this house, a few at a time,
-- and redraws as they arrive (GET_ITEM_INFO_RECEIVED), so search and sorting use them.
local loading = {}
local function loadNames()
  local houseId = shownHouse()
  local request = C_Item and C_Item.RequestLoadItemDataByID
  if not (houseId and request) or loading[houseId] then return end
  loading[houseId] = true
  local ids = {}
  for id in pairs(ns.HouseItems(houseId)) do
    if not ns.ItemInfo(id) then ids[#ids + 1] = id end
  end
  local i = 0
  local function batch()
    for _ = 1, 50 do
      i = i + 1
      if not ids[i] then return end
      pcall(request, ids[i])
    end
    if C_Timer and C_Timer.After then C_Timer.After(0.1, batch) end
  end
  batch()
end

-- recomputes the list (search, house or sort changed); the category only narrows it
local function refresh(keepOffset)
  local houseId = shownHouse()
  all = houseId and M.PriceRows(ns.HouseItems(houseId), ns.ItemNames(), { term = state.term, sort = state.sort, dir = state.dir, gameFirst = LOCALIZED }, cachedName) or {}
  counts = { [""] = #all }
  rows = {}
  for _, e in ipairs(all) do
    local cat = e.info and e.info[3] or "o"
    counts[cat] = (counts[cat] or 0) + 1
    if state.cat == "" or cat == state.cat then rows[#rows + 1] = e end
  end
  if not keepOffset then state.offset = 0 end
  draw()
end
-- redraws an open window (a watch changed, items loaded)
ns.RefreshPrices = function() if win and win:IsShown() then draw() end end

-- names arriving from the game (another language): recompute once per burst
if LOCALIZED then
  local events, pending = CreateFrame("Frame"), false
  pcall(events.RegisterEvent, events, "GET_ITEM_INFO_RECEIVED")
  events:SetScript("OnEvent", function()
    if pending or not (win and win:IsShown()) then return end
    pending = true
    local function run() pending = false; ns.Safe("prices", refresh, true) end
    if C_Timer and C_Timer.After then C_Timer.After(0.5, run) else run() end
  end)
end

local function build()
  local fr = CreateFrame("Frame", "ForeverAnvilPrices", UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(640, 500)
  fr:SetFrameStrata("HIGH")
  fr:SetToplevel(true)
  fr:SetMovable(true)
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, rel, px, py = self:GetPoint()
    ns.db.pricesPos = { point, rel, px, py }
  end)
  local pos = ns.db.pricesPos
  if pos then fr:SetPoint(pos[1], UIParent, pos[2], pos[3], pos[4]) else fr:SetPoint("CENTER") end
  if fr.TitleText then fr.TitleText:SetText("Forever Anvil: " .. L["auction prices"]) end
  tinsert(UISpecialFrames, "ForeverAnvilPrices") -- Esc closes it
  win = fr

  -- search
  local label = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  label:SetPoint("TOPLEFT", 18, -36)
  label:SetText(L["Search"])
  fr.search = ns.InputBox(fr, 220)
  fr.search:SetPoint("LEFT", label, "RIGHT", 10, 0)
  fr.search:SetScript("OnTextChanged", function(self)
    local t = (self:GetText() or ""):lower():gsub("^%s+", ""):gsub("%s+$", "")
    if t == state.term then return end
    state.term = t
    ns.Safe("prices", refresh)
  end)
  fr.search:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)

  -- which house: your ruleset's three
  fr.sides = {}
  local prev
  for _, s in ipairs({ { "neutral", "Neutral" }, { "horde", "Horde" }, { "alliance", "Alliance" } }) do
    local b = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
    b:SetSize(76, 22)
    if prev then b:SetPoint("RIGHT", prev, "LEFT", -4, 0) else b:SetPoint("TOPRIGHT", -16, -31) end
    b:SetText(L[s[2]])
    b.side = s[1]
    b:SetScript("OnClick", function(self)
      state.side = self.side
      ns.Safe("prices", refresh)
    end)
    fr.sides[#fr.sides + 1] = b
    prev = b
  end

  -- categories
  fr.cats = {}
  for i, c in ipairs(M.CATEGORIES) do
    local b = CreateFrame("Button", nil, fr)
    b:SetSize(118, 21)
    b:SetPoint("TOPLEFT", 14, -62 - (i - 1) * 22)
    b.key = c[1]
    b.selected = b:CreateTexture(nil, "BACKGROUND")
    b.selected:SetAllPoints()
    b.selected:SetColorTexture(1, 0.82, 0, 0.18)
    local hl = b:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.08)
    b.label = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.label:SetPoint("LEFT", 6, 0)
    b.label:SetText(L[c[2]])
    b.count = b:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
    b.count:SetPoint("RIGHT", -4, 0)
    b:SetScript("OnClick", function(self)
      state.cat = self.key
      ns.Safe("prices", refresh)
    end)
    fr.cats[i] = b
  end

  -- column headings: click to sort, again to flip
  fr.heads = {}
  for i, col in ipairs(COLS) do
    local h = CreateFrame("Button", nil, fr)
    h:SetSize(col[4], 18)
    h:SetPoint("TOPLEFT", LIST_X + col[3], -60)
    h.key = col[1]
    h.label = h:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    h.arrow = h:CreateTexture(nil, "ARTWORK")
    h.arrow:SetSize(9, 8)
    h.arrow:SetTexture("Interface\\Buttons\\UI-SortArrow")
    if i == 1 then
      h.label:SetPoint("LEFT", 20, 0)
      h.arrow:SetPoint("LEFT", h.label, "RIGHT", 3, 0)
    else
      h.label:SetPoint("RIGHT")
      h.arrow:SetPoint("RIGHT", h.label, "LEFT", -3, 0)
    end
    h.label:SetText(col[2])
    local hl = h:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.06)
    h:SetScript("OnClick", function(self)
      if state.sort == self.key then state.dir = -state.dir
      else state.sort, state.dir = self.key, M.SORT_FIRST_DIR[self.key] end
      ns.Safe("prices", refresh)
    end)
    fr.heads[i] = h
  end

  -- rows
  local list = CreateFrame("Frame", nil, fr)
  list:SetPoint("TOPLEFT", LIST_X, -80)
  list:SetSize(LIST_W, ROWS * ROW_H)
  list:EnableMouseWheel(true)
  list:SetScript("OnMouseWheel", function(_, delta)
    state.offset = state.offset - delta * 3
    ns.Safe("prices", draw)
  end)
  fr.list = list
  fr.rows = {}
  for i = 1, ROWS do
    local b = CreateFrame("Button", nil, list)
    b:SetSize(LIST_W, ROW_H)
    b:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
    b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
    if i % 2 == 0 then
      local stripe = b:CreateTexture(nil, "BACKGROUND")
      stripe:SetAllPoints()
      stripe:SetColorTexture(1, 1, 1, 0.03)
    end
    b.selected = b:CreateTexture(nil, "BORDER")
    b.selected:SetAllPoints()
    b.selected:SetColorTexture(1, 0.82, 0, 0.16)
    local hl = b:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.1)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.icon:SetSize(16, 16)
    b.icon:SetPoint("LEFT", 1, 0)
    b.icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    local function cell(x, w, justify)
      local fs = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
      fs:SetPoint("LEFT", x, 0)
      fs:SetWidth(w)
      fs:SetJustifyH(justify)
      fs:SetWordWrap(false)
      return fs
    end
    b.name = cell(20, COLS[1][4] - 20, "LEFT")
    b.market = cell(COLS[2][3], COLS[2][4], "RIGHT")
    b.min = cell(COLS[3][3], COLS[3][4], "RIGHT")
    b.qty = cell(COLS[4][3], COLS[4][4], "RIGHT")
    b.sold = cell(COLS[5][3], COLS[5][4], "RIGHT")
    b:SetScript("OnClick", function(self, button)
      local id = self.itemID
      if not id then return end
      -- Shift: link in chat, Ctrl: try it on, Alt: watch (Lists.lua)
      local link = select(2, ns.ItemInfo(id))
      if link and IsModifiedClick and IsModifiedClick() and HandleModifiedItemClick then
        HandleModifiedItemClick(link)
        return
      end
      if state.selected == id and button ~= "RightButton" then state.selected = nil else state.selected = id end
      ns.Safe("prices", draw)
    end)
    b:SetScript("OnEnter", function(self)
      if not self.itemID then return end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetItemByID(self.itemID)
      GameTooltip:Show()
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    fr.rows[i] = b
  end

  -- scroll bar
  local bar = CreateFrame("Slider", nil, fr)
  bar:SetOrientation("VERTICAL")
  bar:SetPoint("TOPLEFT", list, "TOPRIGHT", 6, 0)
  bar:SetPoint("BOTTOMLEFT", list, "BOTTOMRIGHT", 6, 0)
  bar:SetWidth(12)
  local track = bar:CreateTexture(nil, "BACKGROUND")
  track:SetAllPoints()
  track:SetColorTexture(0, 0, 0, 0.35)
  bar:SetThumbTexture("Interface\\Buttons\\UI-ScrollBar-Knob")
  local thumb = bar:GetThumbTexture()
  if thumb then thumb:SetSize(16, 24) end
  bar:SetValueStep(1)
  if bar.SetObeyStepOnDrag then bar:SetObeyStepOnDrag(true) end
  bar:SetScript("OnValueChanged", function(self, value)
    if self.updating then return end
    state.offset = math.floor(value + 0.5)
    ns.Safe("prices", draw)
  end)
  fr.scroll = bar

  -- details of the selected item
  local d = CreateFrame("Frame", nil, fr)
  d:SetPoint("TOPLEFT", 14, -80 - ROWS * ROW_H - 8)
  d:SetPoint("TOPRIGHT", -14, -80 - ROWS * ROW_H - 8)
  d:SetHeight(58)
  local bg = d:CreateTexture(nil, "BACKGROUND")
  bg:SetAllPoints()
  bg:SetColorTexture(1, 1, 1, 0.04)
  d.icon = d:CreateTexture(nil, "ARTWORK")
  d.icon:SetSize(36, 36)
  d.icon:SetPoint("TOPLEFT", 6, -6)
  d.name = d:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  d.name:SetPoint("TOPLEFT", 50, -6)
  d.name:SetWidth(380)
  d.name:SetJustifyH("LEFT")
  d.line1 = d:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  d.line1:SetPoint("TOPLEFT", 50, -24)
  d.line1:SetWidth(390)
  d.line1:SetJustifyH("LEFT")
  d.line2 = d:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  d.line2:SetPoint("TOPLEFT", 50, -38)
  d.line2:SetWidth(390)
  d.line2:SetJustifyH("LEFT")
  local function button(text, w)
    local b = CreateFrame("Button", nil, d, "UIPanelButtonTemplate")
    b:SetSize(w, 22)
    b:SetText(L[text])
    return b
  end
  d.watch = button("Watch", 76)
  d.watch:SetPoint("TOPRIGHT", -6, -5)
  d.watch:SetScript("OnClick", function()
    local id = state.selected
    if not id then return end
    if ns.db.watch[id] then ns.db.watch[id] = nil; ns.Print(L["%s is off your watchlist."]:format(ns.ItemMeta(id) or ("item " .. id)))
    else ns.db.watch[id] = 0; ns.Print(L["%s added to your watchlist. Set a target price in |cffffffff/fa watch|r."]:format(ns.ItemMeta(id) or ("item " .. id))) end
    if ns.RefreshWatch then ns.RefreshWatch() end
    refreshDetail()
  end)
  d.search = button("Search AH", 82)
  d.search:SetPoint("RIGHT", d.watch, "LEFT", -4, 0)
  d.search:SetScript("OnClick", function()
    if not (state.selected and ns.SearchAuction and ns.SearchAuction(state.selected)) then
      ns.Print(L["open the auction house first, then press Search AH."])
    end
  end)
  d.add = button("Add to list", 96)
  d.add:SetPoint("TOPRIGHT", -6, -30)
  d.count = ns.InputBox(d, 34)
  d.count:SetPoint("RIGHT", d.add, "LEFT", -8, 0)
  d.count:SetNumeric(true)
  d.count:SetMaxLetters(4)
  d.count:SetText("1")
  local function add()
    local id = state.selected
    if not id then return end
    local n = M.ParseCount(d.count:GetText())
    if not n then ns.Print(L["how many? Type a number from 1 to 9999."]); return end
    ns.AddItemToShopping(id, n)
    d.count:SetText("1")
    d.count:ClearFocus()
  end
  d.add:SetScript("OnClick", add)
  d.count:SetScript("OnEnterPressed", add)
  fr.detail = d

  fr.status = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fr.status:SetPoint("BOTTOMLEFT", 18, 12)
  fr.status:SetPoint("BOTTOMRIGHT", -18, 12)
  fr.status:SetJustifyH("LEFT")

  fr:SetScript("OnShow", function()
    ns.Safe("prices", refresh)
    if LOCALIZED then ns.Safe("prices", loadNames) end
  end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

-- opens (or, with no search and already open, closes) the window; search: text to look for
function ns.ShowPrices(search)
  win = win or build()
  if search and search ~= "" then
    win.search:SetText(search)
    if not win:IsShown() then win:Show() end
    return
  end
  if win:IsShown() then win:Hide() return end
  win:Show()
  if ns.data and not ns.Ruleset() and ns.ShowRulesetPicker then ns.ShowRulesetPicker() end -- prices need it
end

function ns.PricesShown() return win ~= nil and win:IsShown() end

-- tests and the debug command
ns.PricesState = function() return state, rows, counts end
