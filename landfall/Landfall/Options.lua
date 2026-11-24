-- Landfall: settings (Esc → Options → AddOns → Landfall, or /landfall). Hover a switch for what it does.
-- Left: switches. Right: style, how long and how big, test cards, placing the card, and the sounds.
local addonName, ns = ...
local Logic = ns.Logic

local SWITCHES = {
  { "enabled", "Landfall on", "Title cards when you arrive somewhere, in place of the game's zone text." },
  { "subzones", "Areas inside a zone", "A smaller card for villages, camps and other areas as you enter them." },
  { "citySubzones", "... in capital cities too", "Cities name every street and building: off keeps them quiet." },
  { "flying", "... on flight paths too", "Off: only new zones get a card while you fly." },
  { "territory", "Territory", "Whose land it is: Horde, Alliance, contested or a sanctuary, in its colour." },
  { "crest", "Faction crest", "The Horde or Alliance crest beside land one of them holds." },
  { "pvpWarning", "PvP warning", "\"You can be attacked\" when you're flagged for PvP in contested or enemy land." },
  { "levels", "Level range", "The zone's or dungeon's levels, and how they suit yours: dangerous, a little high, good or below you." },
  { "suggest", "Better zones for your level", "When a zone is far above or below you: two zones that suit you, on your continent first, never the other faction's." },
  { "dungeons", "Dungeons here", "The dungeons and raids whose entrance is in the zone, each in the colour of how it suits you." },
  { "danger", "Danger warning", "Arriving somewhere 5 or more levels above you: the screen's edges flash red, with its own sound." },
  { "rested", "Inns", "At an inn: whether it's your hearthstone's, and how long until you're fully rested." },
  { "discovery", "First visits and discoveries", "A \"First visit\" stamp on a zone you've never explored, and \"Discovered\" for each new area." },
  { "colorTitle", "Name in the territory's colour", "Like the game's zone text. Off: parchment (or bronze for the bronze style)." },
  { "login", "A card when you log in", "Where you are, as you enter the world." },
  { "sound", "Sounds", "Pick them on the right." },
  { "hideGameText", "Hide the game's zone text", "Off: the game's yellow zone text shows too." },
  { "minimapButton", "Minimap button", "Click: a quick menu. Right-click: these settings. Drag: move it. /landfall minimap brings it back." },
}

local CHOICES = {
  { "style", "Style", { { "Classic", "classic" }, { "Bronze", "bronze" }, { "Cinematic", "cinematic" }, { "Minimal", "minimal" } } },
  { "duration", "How long", { { "Short", "short" }, { "Normal", "normal" }, { "Long", "long" } } },
  { "scale", "Size", { { "Small", 0.85 }, { "Normal", 1 }, { "Large", 1.2 } } },
}
ns.CHOICES = CHOICES -- the minimap menu cycles through these too

local panel, category
local ROW = 23

local function header(text, x, y)
  local fs = panel:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fs:SetPoint("TOPLEFT", x, y)
  fs:SetText(text)
  local rule = panel:CreateTexture(nil, "ARTWORK")
  rule:SetColorTexture(0.91, 0.76, 0.42, 0.35)
  rule:SetPoint("TOPLEFT", x, y - 16)
  rule:SetSize(290, 1)
end

local function same(a, b)
  if type(a) == "number" and type(b) == "number" then return math.abs(a - b) < 0.001 end
  return a == b
end

local function button(text, w, x, y, fn)
  local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  b:SetSize(w, 22)
  b:SetPoint("TOPLEFT", x, y)
  b:SetText(text)
  b:SetScript("OnClick", fn)
  return b
end

-- The Discord invite, top right. The game can't open web links, so it's a box the text can be copied from:
-- a click selects it all, Ctrl+C copies it, and typing can't change it.
local DISCORD = "discord.gg/GJvNf8Zvzt"

local function discordBox(x, y)
  local label = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  label:SetPoint("TOPLEFT", x, y)
  label:SetText("Join us on Discord")
  local box = CreateFrame("EditBox", nil, panel, "InputBoxTemplate")
  box:SetSize(170, 20)
  box:SetPoint("TOPLEFT", x + 6, y - 14) -- the template's border sits left of the box
  box:SetAutoFocus(false)
  box:SetFontObject("GameFontHighlightSmall")
  box:SetText(DISCORD)
  box:SetCursorPosition(0)
  box:SetScript("OnEditFocusGained", function(self) self:HighlightText() end)
  box:SetScript("OnEditFocusLost", function(self) self:HighlightText(0, 0); self:SetCursorPosition(0) end)
  box:SetScript("OnMouseUp", function(self) self:SetFocus(); self:HighlightText() end)
  box:SetScript("OnTextChanged", function(self, typed)
    if typed and self:GetText() ~= DISCORD then self:SetText(DISCORD); self:HighlightText() end
  end)
  box:SetScript("OnEscapePressed", function(self) self:ClearFocus() end)
  box:SetScript("OnEnterPressed", function(self) self:ClearFocus() end)
  box:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_BOTTOMLEFT")
    GameTooltip:AddLine("Join us on Discord")
    GameTooltip:AddLine("Questions, a bug or a zone card idea? Click the link, copy it with Ctrl+C (Cmd+C on a Mac) and paste it into your browser.", 1, 1, 1, true)
    GameTooltip:Show()
  end)
  box:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return box
end

local function build()
  panel = CreateFrame("Frame")
  panel.name = "Landfall"
  local refreshers = {}

  local logo = panel:CreateTexture(nil, "ARTWORK")
  logo:SetSize(36, 36)
  logo:SetPoint("TOPLEFT", 16, -12)
  logo:SetTexture("Interface\\AddOns\\" .. addonName .. "\\Media\\Icon")
  local title = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -2)
  title:SetText("Landfall")
  local sub = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  sub:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  sub:SetWidth(350) -- leaves the top right to the Discord box
  sub:SetJustifyH("LEFT")
  sub:SetText("A title card when you arrive somewhere. Changes show a card for where you are.")
  discordBox(420, -14)

  local x, y = 16, -62
  header("Cards", x, y)
  y = y - 22
  for _, c in ipairs(SWITCHES) do
    local cb = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    cb:SetSize(22, 22)
    cb:SetPoint("TOPLEFT", x, y)
    local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    label:SetPoint("LEFT", cb, "RIGHT", 2, 0)
    label:SetText(c[2])
    cb:SetHitRectInsets(0, -250, 0, 0)
    cb:SetScript("OnClick", function(self)
      ns.db[c[1]] = self:GetChecked() and true or false
      ns.OnSetting(c[1])
    end)
    cb:SetScript("OnEnter", function(self)
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:AddLine(c[2])
      GameTooltip:AddLine(c[3], 1, 1, 1, true)
      GameTooltip:Show()
    end)
    cb:SetScript("OnLeave", function() GameTooltip:Hide() end)
    refreshers[#refreshers + 1] = function() cb:SetChecked(ns.db[c[1]]) end
    y = y - ROW
  end

  x, y = 320, -62
  for _, c in ipairs(CHOICES) do
    header(c[2], x, y)
    y = y - 24
    local buttons = {}
    local w = #c[3] == 4 and 70 or 94
    for i, opt in ipairs(c[3]) do
      local b = button(opt[1], w, x + (i - 1) * (w + 3), y, function()
        ns.db[c[1]] = opt[2]
        ns.OnSetting(c[1])
        panel.refresh()
        ns.Test()
      end)
      buttons[i] = { b, opt[2] }
    end
    refreshers[#refreshers + 1] = function()
      for _, e in ipairs(buttons) do e[1]:SetEnabled(not same(ns.db[c[1]], e[2])) end
    end
    y = y - 34
  end

  header("Try it", x, y)
  y = y - 24
  button("This zone", 70, x, y, function() ns.Test() end)
  button("This area", 70, x + 73, y, function() ns.Test("sub") end)
  button("First visit", 70, x + 146, y, function() ns.Test("first") end)
  button("Danger", 70, x + 219, y, function() ns.Test("danger") end)
  y = y - 34

  header("Place", x, y)
  y = y - 24
  local move = button("Move the card", 130, x, y, function() ns.SetMoving(not ns.moving); panel.refresh() end)
  button("Reset", 70, x + 134, y, function()
    ns.db.pos = nil
    ns.PlaceCard()
    ns.Test()
  end)
  refreshers[#refreshers + 1] = function() move:SetText(ns.moving and "Lock it there" or "Move the card") end
  local hint = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  hint:SetPoint("TOPLEFT", x, y - 26)
  hint:SetWidth(290)
  hint:SetJustifyH("LEFT")
  hint:SetText("Drag the card, then lock it. Reset puts it back in its style's own place.")
  y = y - 66

  -- a sound for each moment: < name > and a play button
  header("Sounds", x, y)
  y = y - 26
  for _, m in ipairs(Logic.SOUND_MOMENTS) do
    local key, list = m[1], Logic.SOUNDS[m[1]]
    local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    label:SetPoint("TOPLEFT", x, y - 4)
    label:SetText(m[2])
    local prev = button("<", 24, x + 80, y, nil)
    local name = panel:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    name:SetPoint("LEFT", prev, "RIGHT", 4, 0)
    name:SetWidth(100)
    name:SetJustifyH("CENTER")
    local nextB = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    nextB:SetSize(24, 22)
    nextB:SetPoint("LEFT", name, "RIGHT", 4, 0)
    nextB:SetText(">")
    local play = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    play:SetSize(44, 22)
    play:SetPoint("LEFT", nextB, "RIGHT", 4, 0)
    play:SetText("Play")
    local function step(dir)
      ns.db.sounds[key] = Logic.Cycle(list, ns.db.sounds[key], dir)
      panel.refresh()
      if ns.RefreshMenu then ns.RefreshMenu() end
      ns.PlayFile(ns.db.sounds[key])
    end
    prev:SetScript("OnClick", function() step(-1) end)
    nextB:SetScript("OnClick", function() step(1) end)
    play:SetScript("OnClick", function() ns.PlayFile(ns.db.sounds[key]) end)
    refreshers[#refreshers + 1] = function() name:SetText(Logic.ChoiceName(list, ns.db.sounds[key])) end
    y = y - 27
  end

  function panel.refresh()
    for _, fn in ipairs(refreshers) do fn() end
  end
  function ns.RefreshOptions()
    if panel:IsVisible() then panel.refresh() end
  end
  panel:SetScript("OnShow", panel.refresh)
  panel:SetScript("OnHide", function() if ns.moving then ns.SetMoving(false) end end)
  panel:Hide() -- a new frame starts out shown: hidden, so opening the settings runs OnShow and fills the page in

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
