-- Loot Comets: settings (Esc → Options → AddOns → Loot Comets, or /comets). Hover a switch for what it does.
-- Left: switches, then speed and size sliders. Right: rows of choices. Every change but a switch launches
-- test comets, so you see it straight away.
local _, ns = ...
local Logic = ns.Logic

local SWITCHES = {
  { "enabled", "Comets on", "Items you get fly into the bag slot they land in." },
  { "grey", "Grey items too", "Comets for poor-quality (grey) items, the vendor trash." },
  { "stacks", "Small comets for stacks", "A smaller, quicker comet when you get more of something you already carry. Off: just the slot's flash." },
  { "counts", "Show +3 on stacks", "How many you got, rising off the slot, when a stack grows." },
  { "sparkles", "Sparkles on landing", "Green, blue and purple items burst into sparkles when they land." },
  { "epicGlow", "Screen glow for epics", "The edges of the screen glow in the item's colour when an epic or better item lands." },
  { "sound", "Sound for epic items", "A sound when an epic or better item lands." },
  { "coins", "Coin comets", "Gold, silver and copper you loot or earn fly into the money shown in your bags, with how much you got." },
  { "minimapButton", "Minimap button", "Click: a menu to change the look and switch things on and off. Right-click: these settings. Drag: move it. /comets minimap brings it back." },
}
local SLIDERS = {
  { "speed", "Speed", 0.5, 2, 0.05 },
  { "size", "Size", 0.6, 1.6, 0.05 },
}
-- setting, title, { { button text, value }, … }
local CHOICES = {
  { "shape", "Comet", { { "Round", "round" }, { "Square", "square" }, { "Orb", "orb" } } },
  { "trail", "Trail", { { "Dots", "dots" }, { "Streak", "streak" }, { "Dust", "dust" }, { "None", "none" } } },
  { "color", "Colour", { { "Quality", "quality" }, { "My colour", "custom" }, { "Rainbow", "rainbow" } } },
  { "arc", "Arc", { { "Flat", 0.3 }, { "Normal", 1 }, { "High", 1.8 } } },
  { "landing", "Landing", { { "Subtle", "subtle" }, { "Normal", "normal" }, { "Big", "big" } } },
}
ns.CHOICES = CHOICES -- the minimap menu cycles through these too

local COL_X = { 16, 320 }
local panel, category

local function header(text, x, y)
  local fs = panel:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fs:SetPoint("TOPLEFT", x, y)
  fs:SetText(text)
  local rule = panel:CreateTexture(nil, "ARTWORK")
  rule:SetColorTexture(0.61, 0.48, 1, 0.3)
  rule:SetPoint("TOPLEFT", x, y - 16)
  rule:SetSize(280, 1)
end

local function same(a, b)
  if type(a) == "number" and type(b) == "number" then return math.abs(a - b) < 0.01 end
  return a == b
end

-- the game's colour picker on your own colour; cancelling puts the old one back
local function pickColour(changed)
  local c = ns.db.customColor
  local before = { r = c.r, g = c.g, b = c.b }
  local function apply()
    c.r, c.g, c.b = ColorPickerFrame:GetColorRGB()
    changed()
  end
  local function cancel()
    c.r, c.g, c.b = before.r, before.g, before.b
    changed()
  end
  if ColorPickerFrame.SetupColorPickerAndShow then
    ColorPickerFrame:SetupColorPickerAndShow({ r = c.r, g = c.g, b = c.b, hasOpacity = false,
      swatchFunc = apply, cancelFunc = cancel })
  else
    ColorPickerFrame.func, ColorPickerFrame.cancelFunc = apply, cancel
    ColorPickerFrame.hasOpacity, ColorPickerFrame.previousValues = false, before
    ColorPickerFrame:SetColorRGB(c.r, c.g, c.b)
    ColorPickerFrame:Hide()
    ColorPickerFrame:Show()
  end
end

-- a plain slider (no template, so it works whichever ones this client has)
local function slider(def, x, y)
  local key, title, lo, hi, step = def[1], def[2], def[3], def[4], def[5]
  local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  label:SetPoint("TOPLEFT", x, y)
  local s = CreateFrame("Slider", nil, panel)
  s:SetOrientation("HORIZONTAL")
  s:SetSize(260, 18)
  s:SetPoint("TOPLEFT", x + 4, y - 20)
  s:SetMinMaxValues(lo, hi)
  s:SetValueStep(step)
  if s.SetObeyStepOnDrag then s:SetObeyStepOnDrag(true) end
  s:EnableMouse(true)
  s:SetThumbTexture("Interface\\Buttons\\UI-SliderBar-Button-Horizontal")
  local thumb = s:GetThumbTexture()
  if thumb then thumb:SetSize(32, 32) end
  local track = s:CreateTexture(nil, "BACKGROUND")
  track:SetColorTexture(0, 0, 0, 0.55)
  track:SetPoint("LEFT", 0, 0)
  track:SetPoint("RIGHT", 0, 0)
  track:SetHeight(6)
  local fill = s:CreateTexture(nil, "BORDER")
  fill:SetColorTexture(0.61, 0.48, 1, 0.6)
  fill:SetPoint("LEFT", 0, 0)
  fill:SetHeight(6)
  local lowText = s:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  lowText:SetPoint("TOPLEFT", s, "BOTTOMLEFT", 0, -1)
  lowText:SetText(("%.1fx"):format(lo))
  local highText = s:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  highText:SetPoint("TOPRIGHT", s, "BOTTOMRIGHT", 0, -1)
  highText:SetText(("%.1fx"):format(hi))

  local function show(v)
    label:SetText(("%s: %.2fx"):format(title, v))
    fill:SetWidth(math.max(1, 260 * (v - lo) / (hi - lo)))
  end
  s:SetScript("OnValueChanged", function(_, v)
    v = Logic.Snap(v, lo, hi, step)
    ns.db[key] = v
    show(v)
  end)
  s:SetScript("OnMouseUp", function() ns.Test() end)
  return function()
    local v = ns.db[key] or 1
    s:SetValue(v)
    show(v)
  end
end

local function build()
  panel = CreateFrame("Frame")
  panel.name = "Loot Comets"
  local refreshers = {}

  local logo = panel:CreateTexture(nil, "ARTWORK")
  logo:SetSize(36, 36)
  logo:SetPoint("TOPLEFT", 16, -12)
  logo:SetTexture("Interface\\AddOns\\LootComets\\Media\\Icon")
  local title = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -2)
  title:SetText("Loot Comets")
  local sub = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  sub:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  sub:SetWidth(580)
  sub:SetJustifyH("LEFT")
  sub:SetText("Items you loot fly into the bag slot they land in. Changes launch test comets.")

  -- left: switches and sliders
  local x, y = COL_X[1], -62
  header("Comets", x, y)
  y = y - 24
  for _, c in ipairs(SWITCHES) do
    local cb = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    cb:SetSize(24, 24)
    cb:SetPoint("TOPLEFT", x, y)
    local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    label:SetPoint("LEFT", cb, "RIGHT", 2, 0)
    label:SetText(c[2])
    cb:SetHitRectInsets(0, -250, 0, 0) -- the label clicks too
    cb:SetScript("OnClick", function(self)
      ns.db[c[1]] = self:GetChecked() and true or false
      if ns.OnSetting then ns.OnSetting(c[1]) end
    end)
    cb:SetScript("OnEnter", function(self)
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:AddLine(c[2])
      GameTooltip:AddLine(c[3], 1, 1, 1, true)
      GameTooltip:Show()
    end)
    cb:SetScript("OnLeave", function() GameTooltip:Hide() end)
    refreshers[#refreshers + 1] = function() cb:SetChecked(ns.db[c[1]]) end
    y = y - 26
  end
  y = y - 14
  header("Speed and size", x, y)
  y = y - 26
  for _, def in ipairs(SLIDERS) do
    refreshers[#refreshers + 1] = slider(def, x, y)
    y = y - 58
  end

  -- right: choices
  x, y = COL_X[2], -62
  for _, c in ipairs(CHOICES) do
    header(c[2], x, y)
    y = y - 24
    local buttons = {}
    local width = #c[3] == 4 and 68 or 90
    for i, opt in ipairs(c[3]) do
      local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
      b:SetSize(width, 22)
      b:SetPoint("TOPLEFT", x + (i - 1) * (width + 4), y)
      b:SetText(opt[1])
      b:SetScript("OnClick", function()
        ns.db[c[1]] = opt[2]
        panel.refresh()
        if ns.RefreshMenu then ns.RefreshMenu() end
        if c[1] == "color" and opt[2] == "custom" then
          pickColour(function() panel.refresh() end)
        end
        ns.Test()
      end)
      buttons[i] = { b, opt[2] }
    end
    if c[1] == "color" then -- your colour, beside its button; click it to change the colour
      local swatch = CreateFrame("Button", nil, panel)
      swatch:SetSize(18, 18)
      swatch:SetPoint("LEFT", buttons[#buttons][1], "RIGHT", 8, 0)
      local edge = swatch:CreateTexture(nil, "BACKGROUND")
      edge:SetAllPoints()
      edge:SetColorTexture(1, 1, 1, 0.7)
      local fillTex = swatch:CreateTexture(nil, "ARTWORK")
      fillTex:SetPoint("TOPLEFT", 2, -2)
      fillTex:SetPoint("BOTTOMRIGHT", -2, 2)
      swatch:SetScript("OnClick", function()
        ns.db.color = "custom"
        pickColour(function() panel.refresh() end)
        panel.refresh()
      end)
      swatch:SetScript("OnEnter", function(self)
        GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
        GameTooltip:AddLine("My colour")
        GameTooltip:AddLine("Click to pick the colour for all comets.", 1, 1, 1, true)
        GameTooltip:Show()
      end)
      swatch:SetScript("OnLeave", function() GameTooltip:Hide() end)
      refreshers[#refreshers + 1] = function()
        local col = ns.db.customColor
        fillTex:SetColorTexture(col.r, col.g, col.b)
      end
    end
    refreshers[#refreshers + 1] = function()
      for _, e in ipairs(buttons) do e[1]:SetEnabled(not same(ns.db[c[1]], e[2])) end
    end
    y = y - 36
  end

  -- under both columns
  y = math.min(y, -62 - 24 - #SWITCHES * 26 - 14 - 26 - #SLIDERS * 58) - 8
  header("Try it", COL_X[1], y)
  local test = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  test:SetSize(150, 22)
  test:SetPoint("TOPLEFT", COL_X[1], y - 24)
  test:SetText("Launch test comets")
  test:SetScript("OnClick", function() ns.Test() end)
  local reset = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  reset:SetSize(120, 22)
  reset:SetPoint("LEFT", test, "RIGHT", 6, 0)
  reset:SetText("Reset the look")
  reset:SetScript("OnClick", function()
    for _, key in ipairs({ "speed", "size", "shape", "trail", "color", "arc", "landing", "sparkles", "epicGlow" }) do
      ns.db[key] = ns.DEFAULTS[key]
    end
    panel.refresh()
    if ns.RefreshMenu then ns.RefreshMenu() end
    ns.Test()
  end)
  local hint = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  hint:SetPoint("TOPLEFT", test, "BOTTOMLEFT", 0, -8)
  hint:SetWidth(560)
  hint:SetJustifyH("LEFT")
  hint:SetText("One of each quality (also /comets test). Open your bags to see them land in their slots.")

  function panel.refresh()
    for _, fn in ipairs(refreshers) do fn() end
  end
  -- the minimap menu changed something: show it here too if the page is open
  function ns.RefreshOptions()
    if panel:IsVisible() then panel.refresh() end
  end
  panel:SetScript("OnShow", panel.refresh)

  if Settings and Settings.RegisterCanvasLayoutCategory then
    category = Settings.RegisterCanvasLayoutCategory(panel, panel.name)
    Settings.RegisterAddOnCategory(category)
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(panel)
  end
end

function ns.InitOptions()
  if not panel then build() end
end

function ns.OpenOptions()
  ns.InitOptions()
  if Settings and Settings.OpenToCategory and category then
    Settings.OpenToCategory(category:GetID())
  elseif InterfaceOptionsFrame_OpenToCategory then
    InterfaceOptionsFrame_OpenToCategory(panel)
    InterfaceOptionsFrame_OpenToCategory(panel)
  end
end
