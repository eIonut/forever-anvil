-- Loot Comets: minimap button and menu (the same pattern as Forever Anvil's).
--   Minimap button: click opens the menu, right-click opens the settings, drag moves it around the minimap.
--   Menu: test comets, the look in one click per row (each click picks the next option and launches a comet),
--   quick switches, and the settings. Also in the game's addon compartment on clients that have one.
local addonName, ns = ...

ns.ICON = "Interface\\AddOns\\" .. addonName .. "\\Media\\Icon"
local VIOLET = "|cff9b7bff"
local GREY = "|cff999999"
local ROUND_MASK = "Interface\\CharacterFrame\\TempPortraitAlphaMask"
local atan2 = math.atan2 or math.atan -- the game has Lua 5.1's math.atan2

-- the name of the chosen option for a setting, from the settings page's choices ("Round", "Dots", …)
local function choiceName(key)
  for _, c in ipairs(ns.CHOICES or {}) do
    if c[1] == key then
      for _, opt in ipairs(c[3]) do
        if opt[2] == ns.db[key] or (type(opt[2]) == "number" and type(ns.db[key]) == "number"
          and math.abs(opt[2] - ns.db[key]) < 0.01) then
          return opt[1]
        end
      end
    end
  end
  return "?"
end

-- the next option for a setting, wrapping around
local function cycle(key)
  for _, c in ipairs(ns.CHOICES or {}) do
    if c[1] == key then
      local now = 0
      for i, opt in ipairs(c[3]) do
        if opt[2] == ns.db[key] then now = i end
      end
      ns.db[key] = c[3][now % #c[3] + 1][2]
      return
    end
  end
end

-- "On · Round comets, dots trail" or "Off"
function ns.StatusLine()
  if not ns.db.enabled then return "|cffff5555Off|r  " .. GREY .. "/comets on|r" end
  return ("|cff33dd55On|r  " .. GREY .. "·  %s, %s trail|r"):format(choiceName("shape"), choiceName("trail"):lower())
end

---------------------------------------------------------------------------------------------------
-- Menu
local menu, menuAnchor
local WIDTH = 240

local function divider(parent, y)
  local t = parent:CreateTexture(nil, "ARTWORK")
  t:SetColorTexture(0.61, 0.48, 1, 0.35)
  t:SetPoint("TOPLEFT", 12, y)
  t:SetPoint("TOPRIGHT", -12, y)
  t:SetHeight(1)
end

local function sectionLabel(parent, text, y)
  local fs = parent:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fs:SetPoint("TOPLEFT", 14, y)
  fs:SetText(VIOLET .. text:upper() .. "|r")
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
  b.label:SetText(label)
  b.value = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  b.value:SetPoint("RIGHT", -6, 0)
  b.value:SetJustifyH("RIGHT")
  b:SetScript("OnClick", function()
    local ok, err = pcall(onClick)
    if not ok then ns.Print("error (please report it): " .. tostring(err)) end
  end)
  return b
end

-- an on/off line: a check box and a label for one setting
local function toggleRow(parent, y, label, key)
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
  b.label:SetText(label)
  function b.refresh()
    local on = ns.db[key] and true or false
    b.check:SetShown(on)
    b.label:SetTextColor(on and 1 or 0.6, on and 1 or 0.6, on and 1 or 0.6)
  end
  b:SetScript("OnClick", function()
    ns.db[key] = not ns.db[key]
    if ns.OnSetting then ns.OnSetting(key) end
  end)
  return b
end

-- rows that pick the next option on each click: setting, label, icon
local LOOKS = {
  { "shape", "Comet", "Interface\\Icons\\Spell_Arcane_Starfire" },
  { "trail", "Trail", "Interface\\Icons\\Spell_Nature_StarFall" },
  { "color", "Colour", "Interface\\Icons\\INV_Misc_Gem_Amethyst_02" },
  { "landing", "Landing", "Interface\\Icons\\Spell_Holy_MagicalSentry" },
}
local TOGGLES = {
  { "Comets on", "enabled" },
  { "Grey items too", "grey" },
  { "Sparkles on landing", "sparkles" },
  { "Screen glow for epics", "epicGlow" },
  { "Sound for epic items", "sound" },
}

local function buildMenu()
  local fr = CreateFrame("Frame", "LootCometsMenu", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  fr:SetFrameStrata("DIALOG")
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  if fr.SetBackdrop then
    fr:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
      tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
    fr:SetBackdropColor(0.05, 0.04, 0.09, 0.96)
    fr:SetBackdropBorderColor(0.61, 0.48, 1, 1)
  end
  tinsert(UISpecialFrames, "LootCometsMenu") -- Esc closes it

  -- header: logo, name, status
  local logo = fr:CreateTexture(nil, "ARTWORK")
  logo:SetSize(34, 34)
  logo:SetPoint("TOPLEFT", 12, -12)
  logo:SetTexture(ns.ICON)
  local title = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -1)
  title:SetText(VIOLET .. "Loot Comets|r")
  fr.status = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.status:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  fr.status:SetWidth(WIDTH - 70)
  fr.status:SetJustifyH("LEFT")
  local close = CreateFrame("Button", nil, fr, "UIPanelCloseButton")
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", -4, -4)

  local y = -54
  divider(fr, y)
  y = y - 6
  actionRow(fr, y, "Interface\\Icons\\INV_Misc_Bag_08", "Launch test comets", function() ns.Test() end)
    .value:SetText(GREY .. "/comets test|r")
  y = y - 28
  divider(fr, y)
  y = y - 10
  sectionLabel(fr, "Look  " .. GREY .. "(click for the next)|r", y)
  y = y - 16
  fr.looks = {}
  for _, l in ipairs(LOOKS) do
    local row = actionRow(fr, y, l[3], l[2], function()
      cycle(l[1])
      if l[1] == "color" and ns.db.color == "custom" then
        ns.Print("comets in your own colour. Pick it on the settings page (right-click the minimap button).")
      end
      if ns.OnSetting then ns.OnSetting(l[1]) end
      ns.Test()
    end)
    row.key = l[1]
    fr.looks[#fr.looks + 1] = row
    y = y - 22
  end
  y = y - 8
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
  end).value:SetText(GREY .. "/comets|r")
  y = y - 22
  local hide = actionRow(fr, y, "Interface\\Icons\\INV_Misc_Map_01", "Hide the minimap button", function()
    fr:Hide()
    ns.db.minimapButton = false
    ns.UpdateMinimapButton()
    ns.Print("minimap button hidden. |cffffffff/comets minimap|r brings it back; |cffffffff/comets menu|r opens this menu.")
  end)
  hide.label:SetFontObject("GameFontHighlightSmall")
  fr.hide = hide
  y = y - 28

  fr:SetSize(WIDTH, -y + 4)

  function fr.refresh()
    fr.status:SetText(ns.StatusLine())
    for _, row in ipairs(fr.looks) do row.value:SetText(choiceName(row.key)) end
    for _, t in ipairs(fr.toggles) do t.refresh() end
    fr.hide:SetShown(ns.minimapButton ~= nil and ns.db.minimapButton)
  end
  fr:SetScript("OnShow", fr.refresh)

  -- a click anywhere else closes it
  pcall(fr.RegisterEvent, fr, "GLOBAL_MOUSE_DOWN")
  fr:SetScript("OnEvent", function(self)
    if self:IsShown() and not self:IsMouseOver() and not (menuAnchor and menuAnchor:IsMouseOver()) then self:Hide() end
  end)
  return fr
end

-- puts frame beside anchor (the minimap button), on whichever side has room
local function placeBeside(frame, anchor)
  frame:ClearAllPoints()
  if not (anchor and anchor.GetCenter and anchor:GetCenter()) then
    frame:SetPoint("TOPRIGHT", UIParent, "TOPRIGHT", -200, -180)
    return
  end
  local x, y = anchor:GetCenter()
  local scale = anchor:GetEffectiveScale() / UIParent:GetEffectiveScale()
  x, y = x * scale, y * scale
  local right = x > UIParent:GetWidth() / 2
  local top = y > UIParent:GetHeight() / 2
  frame:SetPoint((top and "TOP" or "BOTTOM") .. (right and "RIGHT" or "LEFT"), anchor,
    (top and "BOTTOM" or "TOP") .. (right and "LEFT" or "RIGHT"), 0, 0)
end

function ns.ToggleMenu(anchor)
  menu = menu or buildMenu()
  if menu:IsShown() then menu:Hide(); return end
  menuAnchor = anchor
  placeBeside(menu, anchor)
  menu:Show()
end

function ns.RefreshMenu()
  if menu and menu:IsShown() then menu.refresh() end
end

---------------------------------------------------------------------------------------------------
-- Minimap button (drawn like the game's own round minimap buttons)
local button

local function position()
  local angle = math.rad(ns.db.minimapAngle or 200)
  local x, y = math.cos(angle), math.sin(angle)
  local w, h = Minimap:GetWidth() / 2 + 5, Minimap:GetHeight() / 2 + 5
  if GetMinimapShape and GetMinimapShape() == "SQUARE" then
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
  ns.db.minimapAngle = math.deg(atan2(py / s - my, px / s - mx)) % 360
  position()
end

local function buildButton()
  local b = CreateFrame("Button", "LootCometsMinimapButton", Minimap)
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
  -- the logo, zoomed past its frame onto the comet and pouch, and cut round to fit the button
  local icon = b:CreateTexture(nil, "ARTWORK")
  icon:SetTexture(ns.ICON)
  icon:SetTexCoord(0.1, 0.9, 0.1, 0.9)
  icon:SetSize(20, 20)
  icon:SetPoint("TOPLEFT", 6, -5)
  if b.CreateMaskTexture and icon.AddMaskTexture then
    local mask = b:CreateMaskTexture()
    mask:SetTexture(ROUND_MASK, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
    mask:SetAllPoints(icon)
    icon:AddMaskTexture(mask)
  end
  b.icon = icon
  local border = b:CreateTexture(nil, "OVERLAY")
  border:SetTexture("Interface\\Minimap\\MiniMap-TrackingBorder")
  border:SetSize(53, 53)
  border:SetPoint("TOPLEFT")

  b:SetScript("OnMouseDown", function() icon:SetPoint("TOPLEFT", 7, -6) end)
  b:SetScript("OnMouseUp", function() icon:SetPoint("TOPLEFT", 6, -5) end)
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
    icon:SetPoint("TOPLEFT", 6, -5)
  end)
  b:SetScript("OnEnter", function(self)
    if menu and menu:IsShown() then return end
    GameTooltip:SetOwner(self, "ANCHOR_LEFT")
    GameTooltip:AddLine(VIOLET .. "Loot Comets|r")
    GameTooltip:AddLine(ns.StatusLine(), 1, 1, 1)
    GameTooltip:AddLine(" ")
    GameTooltip:AddLine("|cffffffffClick|r  menu", 0.6, 0.6, 0.6)
    GameTooltip:AddLine("|cffffffffRight-click|r  settings", 0.6, 0.6, 0.6)
    GameTooltip:AddLine("|cffffffffDrag|r  move this button", 0.6, 0.6, 0.6)
    GameTooltip:Show()
  end)
  b:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return b
end

function ns.UpdateMinimapButton()
  if not (ns.db and Minimap) then return end
  if ns.db.minimapButton then
    button = button or buildButton()
    ns.minimapButton = button
    position()
    button:Show()
  elseif button then
    button:Hide()
  end
end

-- a setting changed (menu or settings page)
function ns.OnSetting(key)
  if key == "minimapButton" then ns.UpdateMinimapButton() end
  ns.RefreshMenu()
  if ns.RefreshOptions then ns.RefreshOptions() end
end

function ns.InitMinimap()
  ns.UpdateMinimapButton()
  -- the addon compartment (modern clients' addons button by the minimap)
  if AddonCompartmentFrame and AddonCompartmentFrame.RegisterAddon and not ns.inCompartment then
    ns.inCompartment = true
    AddonCompartmentFrame:RegisterAddon({ text = "Loot Comets", icon = ns.ICON, notCheckable = true,
      func = function() ns.ToggleMenu(AddonCompartmentFrame) end })
  end
end
