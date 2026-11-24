-- Watchlist and shopping list (version 2). Both are kept in game: each has a window to add, change and remove
-- items (/fa watch, /fa list, or the minimap menu), Alt-click watches an item, and the profession window adds a
-- recipe's materials to the shopping list. They can also come from the site as an import string (the "Copy for
-- the addon" buttons on /watchlist and /planner), pasted with /fa import.
--   Watchlist: tooltips show your target, the auction house tags items at or below it, and opening the auction
--   house says which watched items the shipped prices already have at target.
--   Shopping list: a small window of the plan's materials, ticked off from your bags and bank; the auction
--   house tags materials you still need.
local _, ns = ...
local M = ns.Math
local L = ns.L

local function itemName(id)
  local name = ns.ItemMeta(id)
  return name or ("item " .. id)
end

local function money(c) return M.ShortMoney(c) end

---------------------------------------------------------------------------------------------------
-- Import window: a box to paste the site's string into (chat lines are too short for long lists)
local importFrame

local function buildImport()
  local fr = CreateFrame("Frame", "ForeverAnvilImport", UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(420, 220)
  fr:SetPoint("CENTER")
  fr:SetFrameStrata("DIALOG")
  fr:SetMovable(true)
  fr:EnableMouse(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", fr.StopMovingOrSizing)
  if fr.TitleText then fr.TitleText:SetText("Forever Anvil: " .. L["import"]) end
  tinsert(UISpecialFrames, "ForeverAnvilImport") -- Esc closes it

  local help = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  help:SetPoint("TOPLEFT", 14, -32)
  help:SetWidth(390)
  help:SetJustifyH("LEFT")
  help:SetText(L["On %s, press \"Copy for the addon\" on your watchlist or crafting planner, then paste here (Ctrl+V). It replaces that list."]:format(ns.SITE))

  local scroll = CreateFrame("ScrollFrame", nil, fr, "UIPanelScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 14, -64)
  scroll:SetPoint("BOTTOMRIGHT", -34, 44)
  local box = CreateFrame("EditBox", nil, scroll)
  box:SetMultiLine(true)
  box:SetMaxLetters(0)
  box:SetAutoFocus(true)
  box:SetFontObject(ChatFontNormal)
  box:SetWidth(360)
  box:SetScript("OnEscapePressed", function() fr:Hide() end)
  scroll:SetScrollChild(box)
  fr.box = box

  local status = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  status:SetPoint("BOTTOMLEFT", 16, 18)
  status:SetWidth(250)
  status:SetJustifyH("LEFT")
  fr.status = status

  local ok = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
  ok:SetSize(100, 22)
  ok:SetPoint("BOTTOMRIGHT", -12, 12)
  ok:SetText(L["Import"])
  ok:SetScript("OnClick", function()
    local done, msg = ns.Import(box:GetText())
    if done then
      ns.Print(msg)
      fr:Hide()
    else
      status:SetText("|cffff5555" .. msg .. "|r")
    end
  end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

function ns.ShowImport()
  importFrame = importFrame or buildImport()
  importFrame.box:SetText("")
  importFrame.status:SetText("")
  importFrame:Show()
  importFrame.box:SetFocus()
end

---------------------------------------------------------------------------------------------------
-- /fa watch [item] [price], /fa unwatch <item | all>

-- an item link or ID at the start of the text, and the rest
local function itemArg(text)
  local id = text:match("|Hitem:(%d+)")
  if id then return tonumber(id), text:match("|h%[.-%]|h|?r?%s*(.*)$") or "" end
  local rest
  id, rest = text:match("^(%d+)%s*(.*)$")
  return tonumber(id), rest or text
end

local function watchLine(id, target)
  local p = ns.Price(id)
  local low = p and p[1]
  local at = target > 0 and low and low <= target
  return L["%s: %s, lowest %s%s"]:format(itemName(id), target > 0 and L["target %s"]:format(money(target)) or L["no target"],
    low and money(low) or L["not listed"], at and (" |cff33dd55(" .. L["at target"] .. ")|r") or "")
end

function ns.WatchCommand(cmd, rest)
  local watch = ns.db.watch
  if cmd == "unwatch" then
    if rest:lower() == "all" then
      ns.db.watch = {}
      ns.Print(L["watchlist cleared."])
      ns.RefreshWatch()
      return
    end
    local id = itemArg(rest)
    if not id or not watch[id] then ns.Print(L["that item isn't on your watchlist."]); return end
    watch[id] = nil
    ns.Print(L["%s is off your watchlist."]:format(itemName(id)))
    ns.RefreshWatch()
    return
  end
  if rest == "" then
    ns.ShowWatch(not ns.WatchShown())
    return
  end
  local id, price = itemArg(rest)
  if not id then ns.Print(L["which item? Shift-click it into the chat line: |cffffffff/fa watch <item> [price]|r"]); return end
  local target = 0
  if price and price ~= "" then
    target = M.ParseMoney(price)
    if not target then ns.Print(L["that price isn't clear: write it like 2g50s, 75s or 30c."]); return end
  end
  watch[id] = target
  ns.Print(L["watching %s"]:format(watchLine(id, target)))
  ns.RefreshWatch()
end

---------------------------------------------------------------------------------------------------
-- List windows (shopping list, watchlist): a movable window of item rows (icon, name, two columns, and
-- edit and remove buttons), scrolled with the mouse wheel, over an editor to add or change an item.
local shop, watchWin
local ROWS, ROW_H = 14, 20
local WIDTH = 340

-- search the auction house for an item, when it's open (one click = one search). True when it searched.
local function searchFor(id)
  local name = ns.ItemMeta(id)
  if not name then return false end
  if AuctionHouseFrame and AuctionHouseFrame:IsShown() and AuctionHouseFrame.SearchBar then
    local bar = AuctionHouseFrame.SearchBar
    if bar.SearchBox then bar.SearchBox:SetText(name) end
    if bar.StartSearch then bar:StartSearch() end
    return true
  elseif AuctionFrame and AuctionFrame:IsShown() and BrowseName and AuctionFrameBrowse_Search then
    BrowseName:SetText(name)
    AuctionFrameBrowse_Search()
    return true
  end
  return false
end
ns.SearchAuction = searchFor

-- An item typed or shift-clicked into a box: a link, an item ID, or the name of an item the game has loaded
-- (or one of the items on sale, whose names ship with the prices).
function ns.ItemFromText(text)
  text = (text or ""):gsub("^%s+", ""):gsub("%s+$", "")
  if text == "" then return nil end
  local id = tonumber(text:match("|Hitem:(%d+)") or text:match("^(%d+)$") or "")
  if id then return id end
  local _, link = ns.ItemInfo(text)
  id = ns.ItemID(link)
  if id then return id end
  local lower = text:lower()
  for k, e in pairs(ns.ItemNames()) do
    if e[1] and e[1]:lower() == lower then return k end
  end
  return nil
end

-- the edit boxes that take shift-clicked items (shift-click inserts links into the focused chat line only)
local itemBoxes = {}
local function insertLink(link)
  if type(link) ~= "string" then return end
  for _, box in ipairs(itemBoxes) do
    if box:HasFocus() then
      box:SetText(link)
      -- next: the amount
      if box.nextBox then box:ClearFocus(); box.nextBox:SetFocus() end
      return true
    end
  end
end
if type(ChatEdit_InsertLink) == "function" then hooksecurefunc("ChatEdit_InsertLink", insertLink) end
if ChatFrameUtil and type(ChatFrameUtil.InsertLink) == "function" then hooksecurefunc(ChatFrameUtil, "InsertLink", insertLink) end

-- A text box. Raised above the window's own layers and focused on click, so nothing drawn over it can
-- swallow the click (in game, the window's "How many" box once wouldn't take typing).
local function inputBox(parent, w)
  local box = CreateFrame("EditBox", nil, parent, "InputBoxTemplate")
  box:SetSize(w, 20)
  box:SetAutoFocus(false)
  box:EnableMouse(true)
  box:EnableKeyboard(true)
  box:SetFrameLevel(parent:GetFrameLevel() + 10)
  box:SetScript("OnMouseDown", function(self) self:SetFocus() end)
  box:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  return box
end
ns.InputBox = inputBox

local function smallLabel(parent, text, x, y)
  local fs = parent:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fs:SetPoint("TOPLEFT", x, y)
  fs:SetText(text)
  return fs
end

-- a small icon button with a tooltip
local function iconButton(parent, texture, tip)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(16, 16)
  b:SetNormalTexture(texture)
  b:SetHighlightTexture("Interface\\Buttons\\UI-Common-MouseHilight", "ADD")
  b:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(L[tip])
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return b
end

-- o: { name (the frame's global name), title, posKey (where its position is saved), x, y (first position),
--   refresh(), amountLabel, amountOf(id) → the amount box's text for an item on the list,
--   save(id, amountText) → saves the editor's item, remove(id), clear() }
-- Rows: .name, .count (middle column), .cost (right column), .edit and .delete buttons, .itemID.
-- Click a row (or its pencil) to edit it, and to search the auction house when it's open; its X, or a
-- right-click, removes it. fr.fill(list) shows a list of { id, dim, count, cost }.
local function buildList(o)
  local fr = CreateFrame("Frame", o.name, UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(WIDTH, 50 + ROWS * ROW_H + 108)
  fr:SetFrameStrata("MEDIUM")
  fr:SetMovable(true)
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, rel, px, py = self:GetPoint()
    ns.db[o.posKey] = { point, rel, px, py }
  end)
  local pos = ns.db[o.posKey]
  if pos then fr:SetPoint(pos[1], UIParent, pos[2], pos[3], pos[4]) else fr:SetPoint("RIGHT", o.x, o.y) end
  if fr.TitleText then fr.TitleText:SetText(L[o.title]) end
  fr.offset = 0
  fr.list = {}

  -- column headings
  local head = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  head:SetPoint("TOPLEFT", 36, -30)
  head:SetText(L["Item"])
  local h2 = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  h2:SetPoint("TOPRIGHT", fr, "TOPLEFT", 14 + 202, -30)
  h2:SetText(L[o.countHead])
  local h3 = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  h3:SetPoint("TOPRIGHT", fr, "TOPLEFT", 14 + 282, -30)
  h3:SetText(L[o.costHead])

  local area = CreateFrame("Frame", nil, fr)
  area:SetPoint("TOPLEFT", 14, -44)
  area:SetSize(WIDTH - 28, ROWS * ROW_H)
  area:EnableMouseWheel(true)
  area:SetScript("OnMouseWheel", function(_, delta)
    fr.offset = fr.offset - delta * 2
    ns.Safe("lists", o.refresh)
  end)

  fr.rows = {}
  for i = 1, ROWS do
    local b = CreateFrame("Button", nil, area)
    b:SetSize(WIDTH - 28, ROW_H)
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
    b.selected:Hide()
    local hl = b:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.1)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.icon:SetSize(18, 18)
    b.icon:SetPoint("LEFT", 1, 0)
    b.icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    b.name = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.name:SetPoint("LEFT", 22, 0)
    b.name:SetWidth(122)
    b.name:SetJustifyH("LEFT")
    b.name:SetWordWrap(false)
    b.count = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.count:SetPoint("LEFT", 146, 0)
    b.count:SetWidth(56)
    b.count:SetJustifyH("RIGHT")
    b.cost = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.cost:SetPoint("LEFT", 206, 0)
    b.cost:SetWidth(62)
    b.cost:SetJustifyH("RIGHT")
    b.edit = iconButton(b, "Interface\\Buttons\\UI-GuildButton-PublicNote-Up", "Edit")
    b.edit:SetPoint("LEFT", 274, 0)
    b.edit:SetScript("OnClick", function() if b.itemID then fr.edit(b.itemID) end end)
    b.delete = iconButton(b, "Interface\\Buttons\\UI-StopButton", "Remove")
    b.delete:SetPoint("LEFT", 294, 0)
    b.delete:SetScript("OnClick", function() if b.itemID then ns.Safe("lists", o.remove, b.itemID) end end)
    b:SetScript("OnClick", function(self, button)
      if not self.itemID then return end
      if button == "RightButton" then
        ns.Safe("lists", o.remove, self.itemID)
      else
        local link = select(2, ns.ItemInfo(self.itemID))
        if link and IsModifiedClick and IsModifiedClick() and HandleModifiedItemClick then
          HandleModifiedItemClick(link) -- Shift: link in chat, Ctrl: try it on
          return
        end
        fr.edit(self.itemID)
        searchFor(self.itemID)
      end
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

  -- editor: item and amount, Add / Cancel / Clear all
  local y = -44 - ROWS * ROW_H - 8
  local sep = fr:CreateTexture(nil, "ARTWORK")
  sep:SetColorTexture(1, 0.82, 0, 0.25)
  sep:SetPoint("TOPLEFT", 14, y + 3)
  sep:SetSize(WIDTH - 28, 1)
  fr.editLabel = smallLabel(fr, L["Add an item"] .. " |cff999999" .. L["(shift-click one, or type its name)"] .. "|r", 16, y)
  fr.item = inputBox(fr, 196)
  fr.item:SetPoint("TOPLEFT", 20, y - 26)
  itemBoxes[#itemBoxes + 1] = fr.item
  smallLabel(fr, L[o.amountLabel], 228, y - 14)
  fr.amount = inputBox(fr, 90)
  fr.amount:SetPoint("TOPLEFT", 232, y - 26)
  fr.item.nextBox = fr.amount

  local function reset()
    fr.editing = nil
    fr.item:SetText("")
    fr.amount:SetText("")
    fr.item:ClearFocus()
    fr.amount:ClearFocus()
    fr.editLabel:SetText(L["Add an item"] .. " |cff999999" .. L["(shift-click one, or type its name)"] .. "|r")
    fr.saveButton:SetText(L["Add"])
    o.refresh()
  end
  fr.reset = reset
  local function save()
    local id = ns.ItemFromText(fr.item:GetText())
    if not id then ns.Print(L["which item? Shift-click it into the Item box, or type its name or number."]); return end
    if o.save(id, fr.amount:GetText()) then reset() end
  end
  fr.item:SetScript("OnEnterPressed", function() fr.amount:SetFocus() end)
  fr.amount:SetScript("OnEnterPressed", save)
  fr.item:SetScript("OnTabPressed", function() fr.amount:SetFocus() end)
  fr.amount:SetScript("OnTabPressed", function() fr.item:SetFocus() end)

  local function button(text, w, point, px)
    local b = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
    b:SetSize(w, 22)
    b:SetPoint(point, px, y - 52)
    b:SetText(L[text])
    return b
  end
  fr.saveButton = button("Add", 80, "TOPLEFT", 14)
  fr.saveButton:SetScript("OnClick", save)
  fr.cancelButton = button("Cancel", 72, "TOPLEFT", 98)
  fr.cancelButton:SetScript("OnClick", reset)
  -- Clear all asks once more before it empties the list
  fr.clearButton = button("Clear all", 80, "TOPRIGHT", -14)
  fr.clearButton:SetScript("OnClick", function(self)
    if self.armed then
      self.armed = nil
      self:SetText(L["Clear all"])
      o.clear()
      reset()
    else
      self.armed = true
      self:SetText("|cffff5555" .. L["Sure?"] .. "|r")
      if C_Timer and C_Timer.After then
        C_Timer.After(3, function() if self.armed then self.armed = nil; self:SetText(L["Clear all"]) end end)
      end
    end
  end)

  -- puts a line's item in the editor
  function fr.edit(id)
    local _, link = ns.ItemInfo(id)
    fr.editing = id
    fr.item:SetText(link or tostring(id))
    fr.amount:SetText(o.amountOf(id) or "")
    fr.editLabel:SetText(L["Editing"] .. " |cffffffff" .. (ns.ItemMeta(id) or ("item " .. id)) .. "|r")
    fr.saveButton:SetText(L["Save"])
    fr.amount:SetFocus()
    o.refresh()
  end

  -- shows list (entries { id, dim, count, cost }), from the scroll position; returns how far it can scroll
  function fr.fill(list)
    fr.list = list
    local max = math.max(0, #list - ROWS)
    if fr.offset > max then fr.offset = max end
    if fr.offset < 0 then fr.offset = 0 end
    for i, b in ipairs(fr.rows) do
      local e = list[fr.offset + i]
      b.itemID = e and e.id
      if e then
        local name, quality, icon = ns.ItemMeta(e.id)
        name = name or ("item " .. e.id)
        b.icon:SetTexture(icon)
        b.icon:SetDesaturated(e.dim and true or false)
        b.name:SetText(e.dim and ("|cff777777" .. name .. "|r") or ("|cff" .. ns.QualityHex(quality) .. name .. "|r"))
        b.count:SetText(e.count)
        b.cost:SetText(e.cost)
        b.selected:SetShown(e.id == fr.editing)
        b:Show()
      else
        b:Hide()
      end
    end
    return max
  end

  -- "12–25 of 40" when the list scrolls
  function fr.range()
    if #fr.list <= ROWS then return "" end
    return ("  |cff999999" .. L["%d–%d of %d, scroll for more"] .. "|r"):format(fr.offset + 1, math.min(#fr.list, fr.offset + ROWS), #fr.list)
  end

  fr.total = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fr.total:SetPoint("BOTTOMLEFT", 16, 12)
  fr.total:SetWidth(WIDTH - 32)
  fr.total:SetJustifyH("LEFT")
  fr:SetScript("OnShow", function() o.refresh() end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

local function shoppingUnits(id)
  for _, e in ipairs(ns.db.shopping) do if e[1] == id then return e[2] end end
end

-- shopping list edits (window, profession window)
function ns.SetShoppingUnits(id, units)
  for i, e in ipairs(ns.db.shopping) do
    if e[1] == id then
      if units and units > 0 then e[2] = units else table.remove(ns.db.shopping, i) end
      ns.RefreshShopping()
      return
    end
  end
  if units and units > 0 then ns.db.shopping[#ns.db.shopping + 1] = { id, units } end
  ns.RefreshShopping()
end

local function buildShop()
  return buildList({
    name = "ForeverAnvilShopping", title = "Shopping list", posKey = "shoppingPos", x = -60, y = 60,
    refresh = function() ns.RefreshShopping() end,
    amountLabel = "How many", countHead = "Have", costHead = "To buy",
    amountOf = function(id) local n = shoppingUnits(id); return n and tostring(n) end,
    save = function(id, text)
      local n = M.ParseCount(text)
      if not n then ns.Print(L["how many? Type a number from 1 to 9999."]); return false end
      ns.SetShoppingUnits(id, n)
      ns.Print(L["shopping list: %d %s."]:format(n, itemName(id)))
      return true
    end,
    remove = function(id)
      if not shoppingUnits(id) then ns.Print(L["%s isn't on your shopping list."]:format(itemName(id))); return end
      ns.SetShoppingUnits(id, nil)
      ns.Print(L["%s is off your shopping list."]:format(itemName(id)))
      if shop.editing == id then shop.reset() end
    end,
    clear = function()
      ns.db.shopping = {}
      ns.RefreshShopping()
      ns.Print(L["shopping list cleared."])
    end,
  })
end

-- Adds a recipe's materials × times. mats: { {id, units}, … } for one craft. Opens the window.
function ns.AddToShopping(mats, times, what)
  M.AddMaterials(ns.db.shopping, mats, times)
  ns.Print(L["added the materials for %d× %s to your shopping list."]:format(times, what or L["that recipe"]))
  ns.ShowShopping(true)
  ns.RefreshShopping()
end

-- Adds units of one item (the prices window's "Add to list"). Opens the window.
function ns.AddItemToShopping(id, units)
  M.AddMaterials(ns.db.shopping, { { id, units } }, 1)
  ns.Print(L["shopping list: %d× %s (%d in all)."]:format(units, itemName(id), shoppingUnits(id) or units))
  ns.ShowShopping(true)
  ns.RefreshShopping()
end

-- missing materials first (dearest first), then the ones you have
function ns.RefreshShopping()
  if ns.RefreshMenu then ns.RefreshMenu() end
  if not (shop and shop:IsShown()) then return end
  local list = {}
  for _, e in ipairs(ns.db.shopping) do
    local have = ns.Count(e[1])
    local missing = math.max(0, e[2] - have)
    local unit = ns.ReagentCost(e[1])
    list[#list + 1] = { id = e[1], need = e[2], have = have, missing = missing, cost = unit and unit * missing }
  end
  table.sort(list, function(a, b)
    if (a.missing > 0) ~= (b.missing > 0) then return a.missing > 0 end
    if (a.cost or 0) ~= (b.cost or 0) then return (a.cost or 0) > (b.cost or 0) end
    return a.id < b.id
  end)
  local total, unpriced, open = 0, false, 0
  for _, e in ipairs(list) do
    if e.missing > 0 then
      open = open + 1
      if e.cost then total = total + e.cost else unpriced = true end
    end
  end
  for _, e in ipairs(list) do
    local done = e.missing == 0
    e.dim = done
    e.count = (done and "|cff33dd55" or "") .. math.min(e.have, e.need) .. "/" .. e.need .. (done and "|r" or "")
    e.cost = done and ("|cff33dd55" .. L["done"] .. "|r") or (e.cost and M.CoinMoney(e.cost) or "|cff777777?|r")
  end
  shop.fill(list)
  local more = shop.range()
  if #list == 0 then
    shop.total:SetText("|cff999999" .. L["Empty. Add items below, or use the bag button beside Create All in a profession window."] .. "|r")
  elseif open == 0 then
    shop.total:SetText("|cff33dd55" .. L["You have everything."] .. "|r" .. more)
  else
    shop.total:SetText(L["To buy: %s"]:format((unpriced and "~" or "") .. M.CoinMoney(total)) .. more)
  end
end

function ns.ShowShopping(on)
  if on == false then
    if shop then shop:Hide() end
    return
  end
  shop = shop or buildShop()
  shop:Show()
  ns.RefreshShopping()
end

function ns.ListCommand(rest)
  if rest:lower() == "clear" then
    ns.db.shopping = {}
    ns.RefreshShopping()
    ns.Print(L["shopping list cleared."])
    return
  end
  ns.ShowShopping(not (shop and shop:IsShown()))
end

function ns.ShoppingShown() return shop ~= nil and shop:IsShown() end

-- Shopping list in numbers, for the menu: materials, how many still missing, their cost (and whether complete)
function ns.ShoppingSummary()
  local n, open, total, complete = 0, 0, 0, true
  for _, e in ipairs(ns.db.shopping) do
    n = n + 1
    local missing = math.max(0, e[2] - ns.Count(e[1]))
    if missing > 0 then
      open = open + 1
      local unit = ns.ReagentCost(e[1])
      if unit then total = total + unit * missing else complete = false end
    end
  end
  return n, open, total, complete
end

---------------------------------------------------------------------------------------------------
-- Watchlist window: items at target first, then by name

-- watched items, and how many the shipped prices have at or below their target
function ns.WatchSummary()
  local n, hits = 0, 0
  for id, target in pairs(ns.db.watch) do
    n = n + 1
    local p = ns.Price(id)
    if target > 0 and p and p[1] and p[1] <= target then hits = hits + 1 end
  end
  return n, hits
end

function ns.RefreshWatch()
  if ns.RefreshMenu then ns.RefreshMenu() end
  if ns.RefreshPrices then ns.RefreshPrices() end
  if not (watchWin and watchWin:IsShown()) then return end
  local list = {}
  for id, target in pairs(ns.db.watch) do
    local p = ns.Price(id)
    local low = p and p[1]
    list[#list + 1] = { id = id, name = itemName(id), target = target, low = low, at = target > 0 and low ~= nil and low <= target }
  end
  table.sort(list, function(a, b)
    if a.at ~= b.at then return a.at end
    return a.name < b.name
  end)
  for _, e in ipairs(list) do
    e.count = e.target > 0 and ("|cff999999" .. M.CoinMoney(e.target) .. "|r") or "|cff777777-|r"
    e.cost = e.low and ((e.at and "|cff33dd55" or "") .. M.CoinMoney(e.low) .. (e.at and "|r" or "")) or "|cff777777none|r"
  end
  watchWin.fill(list)
  local n, hits = ns.WatchSummary()
  local more = watchWin.range()
  if n == 0 then
    watchWin.total:SetText("|cff999999" .. L["Empty. Add items below, Alt-click an item in your bags, or use the prices window."] .. "|r")
  else
    watchWin.total:SetText(("%s  |cff999999%s|r%s"):format(
      hits > 0 and ("|cff33dd55" .. L["%d at target"]:format(hits) .. "|r") or L["none at target"], L["prices %s"]:format(M.Age(ns.DataAge())), more))
  end
end

function ns.ShowWatch(on)
  if on == false then
    if watchWin then watchWin:Hide() end
    return
  end
  watchWin = watchWin or buildList({
    name = "ForeverAnvilWatchlist", title = "Watchlist", posKey = "watchPos", x = -380, y = 60,
    refresh = function() ns.RefreshWatch() end,
    amountLabel = "Target price", countHead = "Target", costHead = "Lowest",
    amountOf = function(id)
      local t = ns.db.watch[id]
      return t and t > 0 and M.ShortMoney(t, true):gsub(" ", "") or nil
    end,
    save = function(id, text)
      local target = 0
      if text:match("%S") then
        target = M.ParseMoney(text)
        if not target then ns.Print(L["that price isn't clear: write it like 2g50s, 75s or 30c (or leave it empty)."]); return false end
      end
      ns.db.watch[id] = target
      ns.Print(L["watching %s"]:format(watchLine(id, target)))
      ns.RefreshWatch()
      return true
    end,
    remove = function(id)
      if not ns.db.watch[id] then ns.Print(L["%s isn't on your watchlist."]:format(itemName(id))); return end
      ns.db.watch[id] = nil
      ns.Print(L["%s is off your watchlist."]:format(itemName(id)))
      if watchWin.editing == id then watchWin.reset() end
      ns.RefreshWatch()
    end,
    clear = function()
      ns.db.watch = {}
      ns.Print(L["watchlist cleared."])
      ns.RefreshWatch()
    end,
  })
  watchWin:Show()
  ns.RefreshWatch()
end

function ns.WatchShown() return watchWin ~= nil and watchWin:IsShown() end

-- after an import: a new shopping list opens its window; an open watchlist window updates
function ns.OnListsChanged(kind)
  if kind == "shopping" then ns.ShowShopping(#ns.db.shopping > 0) end
  ns.RefreshWatch()
end

---------------------------------------------------------------------------------------------------
-- At the auction house: the shopping list opens beside it while something's missing, and the watched items
-- the shipped prices have at target are named once per session (src/lib/watchmath.js hitMessages).
local told = {}
function ns.OnAuctionOpen()
  if ns.db.show.shopping then
    for _, e in ipairs(ns.db.shopping) do
      if ns.Count(e[1]) < e[2] then ns.ShowShopping(true); break end
    end
  end
  if not (ns.db.show.watch and ns.House()) then return end
  local hits = {}
  for id, target in pairs(ns.db.watch) do
    local p = ns.Price(id)
    if target > 0 and p and p[1] and p[1] <= target and not told[id] then
      told[id] = true
      hits[#hits + 1] = { name = itemName(id), min = p[1] }
    end
  end
  table.sort(hits, function(a, b) return a.name < b.name end)
  if #hits == 0 then return end
  local age = " (" .. L["prices from %s"]:format(M.Age(ns.DataAge())) .. ")"
  if #hits <= 2 then
    for _, h in ipairs(hits) do ns.Print(L["%s is at your target (%s)"]:format(h.name, money(h.min)) .. age) end
  else
    local names = {}
    for i = 1, #hits - 1 do names[i] = hits[i].name end
    ns.Print(L["%d items reached your target: %s and %s"]:format(#hits, table.concat(names, ", "), hits[#hits].name) .. age)
  end
end

-- bags and bank change: recount
local events = CreateFrame("Frame")
for _, e in ipairs({ "BAG_UPDATE_DELAYED", "BANKFRAME_OPENED", "PLAYERBANKSLOTS_CHANGED", "GET_ITEM_INFO_RECEIVED" }) do
  pcall(events.RegisterEvent, events, e)
end
local pending = false
events:SetScript("OnEvent", function()
  if pending or not (shop and shop:IsShown()) then return end
  pending = true
  local function run() pending = false; ns.Safe("shopping", ns.RefreshShopping) end
  if C_Timer and C_Timer.After then C_Timer.After(0.2, run) else run() end
end)

-- Alt-click an item (in your bags, a chat link, the auction house…) to put it on your watchlist
local function altClick(link)
  if not (ns.db and ns.db.show.watch and IsAltKeyDown and IsAltKeyDown()) then return end
  if (IsShiftKeyDown and IsShiftKeyDown()) or (IsControlKeyDown and IsControlKeyDown()) then return end
  local id = ns.ItemID(link)
  if not id then return end
  if ns.db.watch[id] then
    ns.Print(L["%s is already on your watchlist (|cffffffff/fa watch|r to set its target)."]:format(itemName(id)))
    return
  end
  ns.db.watch[id] = 0
  ns.Print(L["%s added to your watchlist. Set a target price in |cffffffff/fa watch|r."]:format(itemName(id)))
  ns.RefreshWatch()
end
if type(HandleModifiedItemClick) == "function" then hooksecurefunc("HandleModifiedItemClick", function(link) ns.Safe("alt-click", altClick, link) end) end
