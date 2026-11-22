-- Auction house Browse list: tags listings you can buy for less than a vendor pays ("Vendor +X")
-- or less than disenchanting them is worth ("DE +X"), by the site's flip rules (at least 10c and 5%).
-- Two windows: the modern one (Blizzard_AuctionHouseUI, which the Forever client most likely uses) tags each
-- item in the browse results by its lowest price per unit; the classic one (Blizzard_AuctionUI) tags each listing.
local _, ns = ...
local M = ns.Math

local tags = {}

local function tagFor(button)
  local t = tags[button]
  if t then return t end
  t = {}
  t.bg = button:CreateTexture(nil, "BACKGROUND")
  t.bg:SetAllPoints(button)
  t.bg:SetColorTexture(0, 0, 0, 0)
  local name = button:GetName() and _G[button:GetName() .. "Name"]
  if not button:GetName() then
    -- modern rows: the columns are child frames drawn over the row, so the tag sits on its own frame above them,
    -- right-aligned at the end of the Name column (placed by placeTag, since the columns change per search), on a dark plate
    local holder = CreateFrame("Frame", nil, button)
    holder:SetAllPoints(button)
    holder:SetFrameLevel(button:GetFrameLevel() + 10)
    t.text = holder:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    t.text:SetJustifyH("RIGHT")
    t.plate = holder:CreateTexture(nil, "BACKGROUND")
    t.plate:SetPoint("TOPLEFT", t.text, "TOPLEFT", -4, 2)
    t.plate:SetPoint("BOTTOMRIGHT", t.text, "BOTTOMRIGHT", 4, -2)
    t.plate:SetColorTexture(0, 0, 0, 0)
  else
    -- classic rows: under the item name
    t.text = button:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    if name then
      t.text:SetPoint("BOTTOMLEFT", name, "BOTTOMLEFT", 0, -1)
    else
      t.text:SetPoint("BOTTOMLEFT", button, "BOTTOMLEFT", 46, 2)
    end
  end
  tags[button] = t
  return t
end

-- "vendor" | "de" | nil, and the profit per unit
function ns.FlipOf(itemID, unit)
  if not itemID or not unit or unit <= 0 then return nil end
  local vendor = ns.VendorSell(itemID)
  local best, kind = 0, nil
  if vendor and M.Pays(unit, vendor) then best, kind = vendor - unit, "vendor" end
  local worth, _, complete = ns.Disenchant(itemID)
  if worth and complete and M.Pays(unit, worth) and worth - unit > best then best, kind = worth - unit, "de" end
  return kind, best
end

-- What a row's tag shows for an item at a unit price: a flip ("vendor" | "de", profit per unit), or, with
-- "disenchant value on every row" on, "worth" and the disenchant value (complete: every material priced)
function ns.RowTag(itemID, unit)
  local kind, profit = ns.FlipOf(itemID, unit)
  if kind then return kind, profit, true end
  if ns.db.show.deAll and itemID then
    local worth, _, complete = ns.Disenchant(itemID)
    if worth and worth > 0 then return "worth", worth, complete end
  end
end

-- shows a row's tag (modern rows: per item; classic rows: for the whole listing)
local function paint(t, kind, amount, complete)
  local money = M.ShortMoney(amount)
  if kind == "vendor" then
    t.text:SetText("|cff33dd55Vendor +|r" .. money)
    t.bg:SetColorTexture(0.2, 0.8, 0.3, 0.12)
  elseif kind == "de" then
    t.text:SetText("|cffbb8cffDE +|r" .. money)
    t.bg:SetColorTexture(0.7, 0.5, 1, 0.12)
  elseif kind == "worth" then
    -- not a flip: what disenchanting it gives, grey and without the tint ("~": some materials unpriced)
    t.text:SetText("|cff999999DE " .. (complete and "" or "~") .. M.ShortMoney(amount, true) .. "|r")
    t.bg:SetColorTexture(0, 0, 0, 0)
  else
    t.text:SetText("")
    t.bg:SetColorTexture(0, 0, 0, 0)
  end
  if t.plate then t.plate:SetColorTexture(0, 0, 0, kind and 0.8 or 0) end
end

local function update()
  local on = ns.db and ns.db.show.flips and ns.House()
  local offset = FauxScrollFrame_GetOffset(BrowseScrollFrame)
  for i = 1, (NUM_BROWSE_TO_DISPLAY or 8) do
    local button = _G["BrowseButton" .. i]
    if button then
      local t = tagFor(button)
      t.text:SetText("")
      t.bg:SetColorTexture(0, 0, 0, 0)
      if on and button:IsShown() then
        local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemID = GetAuctionItemInfo("list", offset + i)
        if buyout and buyout > 0 and count and count > 0 then
          local kind, amount, complete = ns.RowTag(itemID, buyout / count)
          if kind then paint(t, kind, amount * count, complete) end
        end
      end
    end
  end
end

local list

-- The row's Name column: the cell showing the item's icon. Rows keep their cells in .cells (the table builder);
-- otherwise look through the row's child frames.
local function nameCell(frame)
  for _, cell in ipairs(type(frame.cells) == "table" and frame.cells or {}) do
    if type(cell) == "table" and cell.Icon then return cell end
  end
  if frame.GetChildren then
    for _, child in ipairs({ frame:GetChildren() }) do
      if type(child) == "table" and child.Icon and child.Text then return child end
    end
  end
end

-- The item name the row shows, without colour codes or a trailing item level ("Feathermoon Headdress (58)")
local function shownName(frame)
  local cell = nameCell(frame)
  local fs = cell and (cell.Text or cell.Name)
  local s = fs and fs.GetText and fs:GetText()
  if type(s) ~= "string" or s == "" then return nil end
  s = s:gsub("|c%x%x%x%x%x%x%x%x", "")
  s = s:gsub("|r", "")
  s = s:gsub("%s*%(%d+%)%s*$", "")
  return s
end

-- Names of a browse result: the auction house's name for it (may be the full "…of the Owl" or just the base
-- name, depending on the item) and the item's base name
local function namesOf(r)
  local info = C_AuctionHouse and C_AuctionHouse.GetItemKeyInfo and C_AuctionHouse.GetItemKeyInfo(r.itemKey)
  return info and info.itemName, (ns.ItemInfo(r.itemKey.itemID))
end

-- Could this result be the row showing `shown`? Its full name, or its base name followed by a suffix
-- ("Peerless Leggings" + " of the Boar"), but not a different suffix the auction house names in full.
local function fits(r, shown)
  local ah, base = namesOf(r)
  if ah == shown then return true end
  if ah and ah ~= base and ah ~= shown and ah:sub(1, #(base or "")) == base and #ah > #(base or "") then return false end
  local b = base or ah
  return b ~= nil and shown:sub(1, #b) == b
end

-- The current search's results, fetched once and indexed by name. Rebuilt when the results change (events
-- below) or the window swaps its list. Asking the game for all results on every row made scrolling lag.
local cache
local function results()
  local browse = AuctionHouseFrame and AuctionHouseFrame.BrowseResultsFrame
  local own = browse and type(browse.browseResults) == "table" and #browse.browseResults > 0 and browse.browseResults
  if cache and (not own or (cache.raw == own and cache.n == #own)) then return cache end
  local all, src = own, "window's list"
  if not all then
    all, src = (C_AuctionHouse and C_AuctionHouse.GetBrowseResults and C_AuctionHouse.GetBrowseResults()) or {}, "game's results"
  end
  local byName, byBase = {}, {}
  for _, r in ipairs(all) do
    if type(r) == "table" and r.itemKey and r.itemKey.itemID then
      local ah, base = namesOf(r)
      if ah then byName[ah] = (byName[ah] == nil) and r or false end -- false: two results share the name
      if base then
        local l = byBase[base] or {}
        l[#l + 1] = r
        byBase[base] = l
      end
    end
  end
  cache = { raw = own, n = own and #own, list = all, src = src, byName = byName, byBase = byBase }
  return cache
end
function ns.ResetAuctionCache() cache = nil end

-- A row's browse result { itemKey = { itemID }, minPrice, totalQuantity }, and how it was found.
-- Rows may get the result itself or only their position, and positions follow the window's own sorting, so
-- the row's shown name decides: exact name, then the row's position if its name fits, then the only result
-- with that base name. No sure match: no tag, rather than another item's.
local function browseResult(frame, data)
  if type(data) == "table" and data.itemKey then return data, "row data" end
  if type(frame.rowData) == "table" and frame.rowData.itemKey then return frame.rowData, "row" end
  local index = type(data) == "number" and data or (type(data) == "table" and (data.index or data.rowIndex)) or nil
  local c = results()
  local shown = shownName(frame)
  if not shown then
    local r = index and (c.list[index] or (list and type(list.getEntry) == "function" and list.getEntry(index)))
    return (type(r) == "table" and r.itemKey) and r or nil, "position, name not checked"
  end
  local r = c.byName[shown]
  if r then return r, "name" end
  r = index and c.list[index]
  if type(r) == "table" and r.itemKey and fits(r, shown) then return r, "position (" .. c.src .. ")" end
  -- the base name is what comes before " of …"; one result with that base name is the row's
  local from = 1
  while true do
    local s = shown:find(" of ", from, true)
    if not s then break end
    local l = c.byBase[shown:sub(1, s - 1)]
    if l and #l == 1 then return l[1], "base name" end
    from = s + 1
  end
  local l = c.byBase[shown]
  if l and #l == 1 then return l[1], "base name" end
  return nil, "no match for " .. shown
end

-- results change: rebuild the index on the next row
local events = CreateFrame("Frame")
for _, e in ipairs({ "AUCTION_HOUSE_BROWSE_RESULTS_UPDATED", "AUCTION_HOUSE_BROWSE_RESULTS_ADDED",
  "AUCTION_HOUSE_CLOSED", "ITEM_KEY_ITEM_INFO_RECEIVED" }) do
  pcall(events.RegisterEvent, events, e) -- events this client doesn't have are skipped
end
events:SetScript("OnEvent", function() cache = nil end)

-- Right-aligned at the end of the Name column, whichever columns this search shows (armor adds Level);
-- without a Name column found, 120 in from the row's right edge (the Available column)
local function placeTag(t, frame)
  local cell = nameCell(frame)
  t.text:ClearAllPoints()
  if cell then
    t.text:SetPoint("RIGHT", cell, "RIGHT", -4, 0)
  else
    t.text:SetPoint("RIGHT", frame, "RIGHT", -120, 0)
  end
  ns.lastTagAnchor = cell and "name column" or "row edge" -- for /fa debug
end

local function tagRow(frame, data)
  local t = tagFor(frame)
  paint(t, nil)
  if not (ns.db.show.flips and ns.House()) then return end
  local result, source = browseResult(frame, data)
  ns.lastRow = type(data) .. " -> " .. source -- for /fa debug
  if not (result and result.itemKey and result.minPrice) then return end
  local kind, amount, complete = ns.RowTag(result.itemKey.itemID, result.minPrice)
  if kind then
    placeTag(t, frame)
    paint(t, kind, amount, complete)
  end
end

-- Rows are reused while scrolling, and the game tells us about a reused row before it has written the new
-- item's name into it, so tagging right away read the previous item's name and showed its value. So: clear the
-- tag at once, tag a moment later (next frame), and only if the row hasn't been reused again meanwhile.
local function browseRow(frame, data)
  paint(tagFor(frame), nil)
  local turn = (frame.foreverAnvilTurn or 0) + 1
  frame.foreverAnvilTurn = turn
  if not (C_Timer and C_Timer.After) then return tagRow(frame, data) end
  C_Timer.After(0, function()
    if frame.foreverAnvilTurn == turn then ns.Safe("auction", tagRow, frame, data) end
  end)
end

-- Hooks whichever auction window exists, once. Runs when an auction UI addon loads and again when the window
-- opens (AUCTION_HOUSE_SHOW, in Core.lua), so it works however and whenever the client loads that UI.
function ns.InitAuction()
  if ns.auctionUI then return end
  list = AuctionHouseFrame and AuctionHouseFrame.BrowseResultsFrame and AuctionHouseFrame.BrowseResultsFrame.ItemList
  if list then
    if ns.HookScrollRows(list.ScrollBox, browseRow, "auction") then
      ns.auctionUI = "modern"
      return
    end
    ns.auctionUI = "modern, unsupported"
  elseif type(AuctionFrameBrowse_Update) == "function" and GetAuctionItemInfo then
    ns.auctionUI = "classic"
    hooksecurefunc("AuctionFrameBrowse_Update", function() ns.Safe("auction", update) end)
    return
  elseif AuctionFrame then
    ns.auctionUI = "classic, unsupported"
  else
    return -- not loaded yet: try again when the window opens
  end
  ns.Print("this auction house window isn't supported yet, so flips aren't tagged. Tooltips still work.")
end
ns.onAddon["Blizzard_AuctionUI"] = ns.InitAuction
ns.onAddon["Blizzard_AuctionHouseUI"] = ns.InitAuction
