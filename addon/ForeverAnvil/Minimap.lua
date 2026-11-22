-- Minimap button and the addon's menu.
--   Minimap button: click opens the menu, right-click opens the settings, drag moves it around the minimap.
--   Menu: which auction house and how old the prices are, your lists (shopping list, watchlist, import),
--   quick on/off switches for the main features, and the settings. Also in the game's addon compartment
--   (the addons button by the minimap) on clients that have one.
local addonName, ns = ...
local M = ns.Math
local L = ns.L

ns.ICON = "Interface\\AddOns\\" .. addonName .. "\\Media\\Icon"
local GOLD = "|cffe6a23c"
local atan2 = math.atan2 or math.atan -- the game has Lua 5.1's math.atan2

---------------------------------------------------------------------------------------------------
-- Status in one line: "PvP horde · prices 2h ago", or what's missing
function ns.StatusLine()
  if not ns.data then return "|cffff5555" .. L["No price data loaded"] .. "|r" end
  local id, r, side = ns.House()
  if not id then return "|cffffd100" .. L["Set this realm's ruleset"] .. "|r  |cff999999(/fa ruleset)|r" end
  return ("%s %s%s  |cff999999·  %s|r"):format(r.name, L[side], r.likely and "?" or "", L["prices %s"]:format(M.Age(ns.DataAge())))
end

---------------------------------------------------------------------------------------------------
-- Menu
local menu, menuAnchor
local WIDTH = 252

local function divider(parent, y)
  local t = parent:CreateTexture(nil, "ARTWORK")
  t:SetColorTexture(0.76, 0.6, 0.29, 0.35)
  t:SetPoint("TOPLEFT", 12, y)
  t:SetPoint("TOPRIGHT", -12, y)
  t:SetHeight(1)
end

local function sectionLabel(parent, text, y)
  local fs = parent:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fs:SetPoint("TOPLEFT", 14, y)
  fs:SetText(GOLD .. L[text]:upper() .. "|r")
end

-- a clickable line: icon, label and a value on the right
local function actionRow(parent, y, icon, label, onClick)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(WIDTH - 20, 22)
  b:SetPoint("TOPLEFT", 10, y)
  b:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  b.icon = b:CreateTexture(nil, "ARTWORK")
  b.icon:SetSize(16, 16)
  b.icon:SetPoint("LEFT", 4, 0)
  b.icon:SetTexture(icon)
  b.icon:SetTexCoord(0.08, 0.92, 0.08, 0.92)
  b.label = b:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  b.label:SetPoint("LEFT", b.icon, "RIGHT", 8, 0)
  b.label:SetText(L[label])
  b.value = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  b.value:SetPoint("RIGHT", -6, 0)
  b.value:SetJustifyH("RIGHT")
  b:SetScript("OnClick", function() ns.Safe("menu", onClick) end)
  return b
end

-- an on/off line: a check box and a label; keys: the settings it switches together
local function toggleRow(parent, y, label, keys)
  local b = CreateFrame("Button", nil, parent)
  b:SetSize(WIDTH - 20, 20)
  b:SetPoint("TOPLEFT", 10, y)
  b:SetHighlightTexture("Interface\\QuestFrame\\UI-QuestTitleHighlight", "ADD")
  b.box = b:CreateTexture(nil, "ARTWORK")
  b.box:SetSize(20, 20)
  b.box:SetPoint("LEFT", 2, 0)
  b.box:SetTexture("Interface\\Buttons\\UI-CheckBox-Up")
  b.check = b:CreateTexture(nil, "OVERLAY")
  b.check:SetSize(20, 20)
  b.check:SetPoint("CENTER", b.box)
  b.check:SetTexture("Interface\\Buttons\\UI-CheckBox-Check")
  b.label = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  b.label:SetPoint("LEFT", b.box, "RIGHT", 6, 0)
  b.label:SetText(L[label])
  b.keys = keys
  function b.refresh()
    local on = false
    for _, k in ipairs(keys) do on = on or ns.db.show[k] == true end
    b.check:SetShown(on)
    b.label:SetTextColor(on and 1 or 0.6, on and 1 or 0.6, on and 1 or 0.6)
    return on
  end
  b:SetScript("OnClick", function()
    local on = not b.refresh()
    for _, k in ipairs(keys) do ns.db.show[k] = on end
    b.refresh()
    if ns.OnSetting then ns.OnSetting(keys[1]) end
  end)
  return b
end

local TOGGLES = {
  { "Prices on tooltips", { "market", "min", "sold", "region" } },
  { "Flips in the auction house", { "flips" } },
  { "Upgrades for your gear", { "upgrades" } },
  { "Craft profits", { "craft" } },
  { "Cheapest skill-up", { "skillup" } },
  { "Waylaid crate values", { "crates" } },
}

local function buildMenu()
  local fr = CreateFrame("Frame", "ForeverAnvilMenu", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  fr:SetFrameStrata("DIALOG")
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
    tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
  fr:SetBackdropColor(0.07, 0.05, 0.03, 0.96)
  fr:SetBackdropBorderColor(0.76, 0.6, 0.29, 1)
  tinsert(UISpecialFrames, "ForeverAnvilMenu") -- Esc closes it

  -- header: crest, name, status
  local logo = fr:CreateTexture(nil, "ARTWORK")
  logo:SetSize(34, 34)
  logo:SetPoint("TOPLEFT", 12, -12)
  logo:SetTexture(ns.ICON)
  local title = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -1)
  title:SetText(GOLD .. "Forever Anvil|r")
  fr.status = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.status:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  fr.status:SetWidth(WIDTH - 70)
  fr.status:SetJustifyH("LEFT")
  local close = CreateFrame("Button", nil, fr, "UIPanelCloseButton")
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", -4, -4)

  local y = -54
  divider(fr, y)
  y = y - 10
  sectionLabel(fr, "Prices and lists", y)
  y = y - 16
  fr.prices = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Coin_02", "Auction prices", function()
    fr:Hide()
    ns.ShowPrices()
  end)
  fr.prices.value:SetText("|cff999999" .. L["search every item"] .. "|r")
  y = y - 22
  fr.bags = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Bag_07", "Bag value", function()
    fr:Hide()
    ns.ShowBags(true)
  end)
  y = y - 22
  fr.shopping = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Bag_10", "Shopping list", function()
    ns.ShowShopping(not ns.ShoppingShown())
    fr.refresh()
  end)
  y = y - 22
  fr.watch = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Spyglass_03", "Watchlist", function()
    ns.WatchCommand("watch", "")
    fr.refresh()
  end)
  y = y - 22
  fr.import = actionRow(fr, y, "Interface\\Icons\\INV_Letter_15", "Import from the site", function()
    fr:Hide()
    ns.ShowImport()
  end)
  fr.import.value:SetText("|cff999999" .. L["watchlist, plan"] .. "|r")
  y = y - 28
  divider(fr, y)
  y = y - 10
  sectionLabel(fr, "Show", y)
  y = y - 16
  fr.toggles = {}
  for _, t in ipairs(TOGGLES) do
    fr.toggles[#fr.toggles + 1] = toggleRow(fr, y, t[1], t[2])
    y = y - 20
  end
  y = y - 8
  divider(fr, y)
  y = y - 6
  actionRow(fr, y, "Interface\\Icons\\INV_Misc_Gear_01", "All settings", function()
    fr:Hide()
    if ns.OpenOptions then ns.OpenOptions() end
  end).value:SetText("|cff999999/fa options|r")
  y = y - 22
  local hide = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Map_01", "Hide the minimap button", function()
    fr:Hide()
    ns.db.show.minimap = false
    ns.UpdateMinimapButton()
    ns.Print(L["minimap button hidden. |cffffffff/fa minimap|r brings it back; |cffffffff/fa menu|r opens this menu."])
  end)
  hide.label:SetFontObject("GameFontHighlightSmall")
  fr.hide = hide
  y = y - 26
  local foot = fr:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  foot:SetPoint("TOPLEFT", 14, y)
  foot:SetText(L["More tools at %s"]:format(ns.SITE))
  y = y - 18

  fr:SetSize(WIDTH, -y + 6)

  function fr.refresh()
    fr.status:SetText(ns.StatusLine())
    local n, open, total, complete = ns.ShoppingSummary()
    if n == 0 then
      fr.shopping.value:SetText("|cff999999" .. L["empty"] .. "|r")
    elseif open == 0 then
      fr.shopping.value:SetText("|cff33dd55" .. L["all in bags"] .. "|r")
    else
      fr.shopping.value:SetText(L["%d to buy"]:format(open) .. "  |cff999999" .. (complete and "" or "~") .. M.ShortMoney(total, true) .. "|r")
    end
    local w, hits = ns.WatchSummary()
    if w == 0 then
      fr.watch.value:SetText("|cff999999" .. L["empty"] .. "|r")
    else
      fr.watch.value:SetText((w == 1 and L["1 item"] or L["%d items"]:format(w)) .. (hits > 0 and ("  |cff33dd55" .. L["%d at target"]:format(hits) .. "|r") or ""))
    end
    local worth = ns.BagWorth and ns.BagWorth()
    if worth and worth > 0 then
      fr.bags.value:SetText(M.ShortMoney(worth, true))
    else
      fr.bags.value:SetText("|cff999999" .. L["nothing priced"] .. "|r")
    end
    for _, t in ipairs(fr.toggles) do t.refresh() end
    fr.hide:SetShown(ns.minimapButton ~= nil and ns.db.show.minimap)
  end
  fr:SetScript("OnShow", fr.refresh)

  -- a click anywhere else closes it
  pcall(fr.RegisterEvent, fr, "GLOBAL_MOUSE_DOWN")
  fr:SetScript("OnEvent", function(self)
    if self:IsShown() and not self:IsMouseOver() and not (menuAnchor and menuAnchor:IsMouseOver()) then self:Hide() end
  end)
  return fr
end

-- opens the menu beside anchor (the minimap button), on whichever side has room
local function place(anchor)
  menu:ClearAllPoints()
  if not (anchor and anchor.GetCenter and anchor:GetCenter()) then
    menu:SetPoint("TOPRIGHT", UIParent, "TOPRIGHT", -200, -180)
    return
  end
  local x, y = anchor:GetCenter()
  local scale = anchor:GetEffectiveScale() / UIParent:GetEffectiveScale()
  x, y = x * scale, y * scale
  local right = x > UIParent:GetWidth() / 2
  local top = y > UIParent:GetHeight() / 2
  local v, h = top and "TOP" or "BOTTOM", right and "RIGHT" or "LEFT"
  menu:SetPoint(v .. h, anchor, (top and "BOTTOM" or "TOP") .. (right and "LEFT" or "RIGHT"), 0, 0)
end

function ns.ToggleMenu(anchor)
  menu = menu or buildMenu()
  if menu:IsShown() then menu:Hide(); return end
  menuAnchor = anchor
  place(anchor)
  menu:Show()
end

function ns.RefreshMenu()
  if menu and menu:IsShown() then menu.refresh() end
end

---------------------------------------------------------------------------------------------------
-- Minimap button (drawn like the game's own round minimap buttons)
local button

local function position()
  local angle = math.rad(ns.db.minimap.angle or 210)
  local x, y = math.cos(angle), math.sin(angle)
  local w, h = Minimap:GetWidth() / 2 + 5, Minimap:GetHeight() / 2 + 5
  local square = GetMinimapShape and GetMinimapShape() == "SQUARE"
  if square then
    -- on a square minimap, slide along the edge instead of a circle
    local d = math.sqrt(2) * math.max(w, h)
    x, y = math.max(-w, math.min(x * d, w)), math.max(-h, math.min(y * d, h))
  else
    x, y = x * w, y * h
  end
  button:ClearAllPoints()
  button:SetPoint("CENTER", Minimap, "CENTER", x, y)
end

local function onDragUpdate()
  local mx, my = Minimap:GetCenter()
  local px, py = GetCursorPosition()
  local s = Minimap:GetEffectiveScale()
  ns.db.minimap.angle = math.deg(atan2(py / s - my, px / s - mx)) % 360
  position()
end

local function buildButton()
  local b = CreateFrame("Button", "ForeverAnvilMinimapButton", Minimap)
  b:SetSize(31, 31)
  b:SetFrameStrata("MEDIUM")
  b:SetFrameLevel(8)
  b:RegisterForClicks("LeftButtonUp", "RightButtonUp")
  b:RegisterForDrag("LeftButton")
  b:SetHighlightTexture("Interface\\Minimap\\UI-Minimap-ZoomButton-Highlight")
  local bg = b:CreateTexture(nil, "BACKGROUND")
  bg:SetTexture("Interface\\Minimap\\UI-Minimap-Background")
  bg:SetSize(20, 20)
  bg:SetPoint("TOPLEFT", 7, -5)
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetTexture(ns.ICON)
  icon:SetSize(19, 19)
  icon:SetPoint("TOPLEFT", 6, -6)
  b.icon = icon
  local border = b:CreateTexture(nil, "OVERLAY")
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetSize(53, 53)
  border:SetPoint("TOPLEFT")

  b:SetScript("OnMouseDown", function() icon:SetPoint("TOPLEFT", 7, -7) end)
  b:SetScript("OnMouseUp", function() icon:SetPoint("TOPLEFT", 6, -6) end)
  b:SetScript("OnClick", function(self, which)
    GameTooltip:Hide()
    if which == "RightButton" then
      if ns.OpenOptions then ns.OpenOptions() end
    else
      ns.ToggleMenu(self)
    end
  end)
  b:SetScript("OnDragStart", function(self)
    self:LockHighlight()
    self:SetScript("OnUpdate", onDragUpdate)
  end)
  b:SetScript("OnDragStop", function(self)
    self:SetScript("OnUpdate", nil)
    self:UnlockHighlight()
    icon:SetPoint("TOPLEFT", 6, -6)
  end)
  b:SetScript("OnEnter", function(self)
    if menu and menu:IsShown() then return end
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine(GOLD .. "Forever Anvil|r")
    GameTooltip:AddLine(ns.StatusLine(), 1, 1, 1)
    local w, hits = ns.WatchSummary()
    if hits > 0 then GameTooltip:AddLine(L["%d of your %d watched items at target"]:format(hits, w), 0.2, 0.87, 0.33) end
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("|cffffffff" .. L["Click"] .. "|r  " .. L["menu"], 0.6, 0.6, 0.6)
    GameTooltip:AddLine("|cffffffff" .. L["Right-click"] .. "|r  " .. L["settings"], 0.6, 0.6, 0.6)
    GameTooltip:AddLine("|cffffffff" .. L["Drag"] .. "|r  " .. L["move this button"], 0.6, 0.6, 0.6)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return b
end

function ns.UpdateMinimapButton()
  if not (ns.db and Minimap) then return end
  if ns.db.show.minimap then
    button = button or buildButton()
    ns.minimapButton = button
    position()
    button:Show()
  elseif button then
    button:Hide()
  end
end

-- a setting changed (menu or settings panel)
function ns.OnSetting(key)
  if key == "minimap" then ns.UpdateMinimapButton() end
  ns.RefreshMenu()
end

function ns.InitMinimap()
  ns.UpdateMinimapButton()
  -- the addon compartment (modern clients' addons button by the minimap)
  if AddonCompartmentFrame and AddonCompartmentFrame.RegisterAddon and not ns.inCompartment then
    ns.inCompartment = true
    AddonCompartmentFrame:RegisterAddon({ text = "Forever Anvil", icon = ns.ICON, notCheckable = true,
      func = function() ns.ToggleMenu(AddonCompartmentFrame) end })
  end
end
