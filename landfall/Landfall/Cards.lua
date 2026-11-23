-- Landfall: the title card. One card frame, laid out for the chosen style each time it shows:
--   classic   the name in Morpheus, an ornamental divider opening from the middle, lines under it
--   bronze    the classic card on a bronze plaque, like Forever's own windows
--   cinematic thin black bars slide in behind the interface, the name in spaced ivory capitals in the
--             lower third (above the action bars) on a soft dark band
--   minimal   a smaller name and one line, nothing else
-- d (what to show): { kind = "zone" | "sub" | "instance", title, color = {r,g,b}, sub, lines = { {text, r, g, b}, … },
-- badge = "First visit" | "Discovered" | nil }
local addonName, ns = ...
local Logic = ns.Logic

local MEDIA = "Interface\\AddOns\\" .. addonName .. "\\Media\\"
local GOLD = { 1, 0.82, 0 }
local PARCHMENT = { 1, 0.92, 0.72 }
local BRONZE = { 0.98, 0.84, 0.55 }
local BRONZE_RULE = { 0.85, 0.64, 0.33 }
local IVORY = { 0.96, 0.94, 0.88 }

local card, bars, pulse
local state -- the card showing: { d, t, hold, badgeT }

local function setFont(fs, path, size, flags)
  local ok = pcall(fs.SetFont, fs, path, size, flags or "")
  if not ok or not fs:GetFont() then fs:SetFontObject(GameFontNormalLarge) end
end

local MORPHEUS = "Fonts\\MORPHEUS.TTF"
local FRIZ = "Fonts\\FRIZQT__.TTF"

local function build()
  card = CreateFrame("Frame", "LandfallCard", UIParent)
  card:SetSize(640, 170)
  card:SetFrameStrata("FULLSCREEN_DIALOG") -- above the settings window, so its test cards show
  card:SetClampedToScreen(true)
  card:EnableMouse(false)
  card:SetMovable(true)
  card:RegisterForDrag("LeftButton")

  -- a soft dark plate behind the text, so it reads over snow and sand
  card.plate = card:CreateTexture(nil, "BACKGROUND")
  card.plate:SetTexture(MEDIA .. "Glow")
  card.plate:SetVertexColor(0, 0, 0)

  -- the bronze plaque: three slices of one texture, so its ends keep their shape at any width
  card.plaque = {}
  for i, tc in ipairs({ { 0, 0.25 }, { 0.25, 0.75 }, { 0.75, 1 } }) do
    local tx = card:CreateTexture(nil, "BACKGROUND", nil, 1)
    tx:SetTexture(MEDIA .. "Plaque")
    tx:SetTexCoord(tc[1], tc[2], 0, 1)
    card.plaque[i] = tx
  end

  card.badge = card:CreateFontString(nil, "OVERLAY", "GameFontHighlight") -- a font from the start: SetText errors on a FontString without one
  card.badgeGlow = card:CreateTexture(nil, "ARTWORK")
  card.badgeGlow:SetTexture(MEDIA .. "Glow")
  card.badgeGlow:SetBlendMode("ADD")
  card.badgeGlow:SetVertexColor(GOLD[1], GOLD[2], GOLD[3])

  card.title = card:CreateFontString(nil, "OVERLAY", "GameFontHighlight") -- a font from the start: SetText errors on a FontString without one
  card.title:SetShadowOffset(2, -2)
  card.title:SetShadowColor(0, 0, 0, 0.9)

  -- the divider: two halves of one texture, opened from the middle by their texture coordinates
  card.divL = card:CreateTexture(nil, "ARTWORK")
  card.divL:SetTexture(MEDIA .. "Divider")
  card.divR = card:CreateTexture(nil, "ARTWORK")
  card.divR:SetTexture(MEDIA .. "Divider")

  card.lines = {}
  for i = 1, 7 do
    local fs = card:CreateFontString(nil, "OVERLAY", "GameFontHighlight") -- a font from the start: SetText errors on a FontString without one
    fs:SetShadowOffset(1, -1)
    fs:SetShadowColor(0, 0, 0, 1)
    card.lines[i] = fs
  end

  -- for moving it: a dashed box and a hint, shown only while unlocked
  card.box = card:CreateTexture(nil, "BACKGROUND", nil, -1)
  card.box:SetAllPoints()
  card.box:SetColorTexture(1, 0.82, 0, 0.12)
  card.box:Hide()

  card:SetScript("OnDragStart", function(self) if ns.moving then self:StartMoving() end end)
  card:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local x, y = self:GetCenter()
    local s = self:GetEffectiveScale() / UIParent:GetEffectiveScale()
    ns.db.pos = { x * s - UIParent:GetWidth() / 2, y * s - UIParent:GetHeight() }
    ns.PlaceCard()
  end)
  card:Hide()

  -- cinematic bars: on their own full-screen frame under the card
  bars = CreateFrame("Frame", nil, UIParent)
  bars:SetAllPoints(UIParent)
  bars:SetFrameStrata("BACKGROUND") -- behind the whole interface: the bars frame the world, not your UI
  bars:EnableMouse(false)
  bars.top = bars:CreateTexture(nil, "BACKGROUND")
  bars.top:SetColorTexture(0, 0, 0, 0.85)
  bars.top:SetPoint("TOPLEFT")
  bars.top:SetPoint("TOPRIGHT")
  bars.bottom = bars:CreateTexture(nil, "BACKGROUND")
  bars.bottom:SetColorTexture(0, 0, 0, 0.85)
  bars.bottom:SetPoint("BOTTOMLEFT")
  bars.bottom:SetPoint("BOTTOMRIGHT")
  bars:Hide()

  -- the danger pulse: the screen's edges glow red, twice
  pulse = CreateFrame("Frame", nil, UIParent)
  pulse:SetAllPoints(UIParent)
  pulse:SetFrameStrata("BACKGROUND")
  pulse:EnableMouse(false)
  pulse.glow = pulse:CreateTexture(nil, "ARTWORK")
  pulse.glow:SetTexture(MEDIA .. "Edge")
  pulse.glow:SetAllPoints()
  pulse.glow:SetBlendMode("ADD")
  pulse.glow:SetVertexColor(1, 0.1, 0.05)
  pulse:Hide()
end

-- where the card sits: your spot (its middle, from the top centre of the screen), or the style's own
function ns.PlaceCard()
  if not card then return end
  card:ClearAllPoints()
  local scale = ns.db.scale or 1
  card:SetScale(scale)
  if ns.db.pos then
    card:SetPoint("CENTER", UIParent, "TOP", ns.db.pos[1] / scale, ns.db.pos[2] / scale)
  elseif ns.db.style == "cinematic" then -- the lower third, above the action bars
    card:SetPoint("CENTER", UIParent, "BOTTOM", 0, UIParent:GetHeight() * 0.34 / scale)
  else
    card:SetPoint("CENTER", UIParent, "TOP", 0, -230 / scale)
  end
end

---------------------------------------------------------------------------------------------------
-- Laying a card out for the style

local function layout(d)
  local style = ns.db.style
  local big = d.kind ~= "sub"
  local bronze = style == "bronze"
  local cinematic = style == "cinematic"
  local c = (cinematic and IVORY) or (ns.db.colorTitle and d.color) or (bronze and BRONZE) or PARCHMENT
  local t, lines = card.title, card.lines
  t:ClearAllPoints()
  card.badge:ClearAllPoints()
  for _, fs in ipairs(lines) do fs:ClearAllPoints(); fs:SetText(""); fs:Hide() end

  local width
  if cinematic then
    setFont(t, FRIZ, big and 30 or 20, "")
    t:SetText(Logic.Spaced(d.title))
    width = big and 280 or 180
  elseif style == "minimal" then
    setFont(t, FRIZ, big and 20 or 16, "OUTLINE")
    t:SetText(d.title)
    width = 0
  else
    setFont(t, MORPHEUS, big and 38 or 26, "")
    t:SetText(d.title)
    width = big and 380 or 240
  end
  t:SetTextColor(c[1], c[2], c[3])
  t:SetPoint("TOP", card, "TOP", 0, -26)

  -- badge over the name
  setFont(card.badge, FRIZ, 12, "OUTLINE")
  card.badge:SetText(d.badge and Logic.Spaced(d.badge) or "")
  card.badge:SetTextColor(GOLD[1], GOLD[2], GOLD[3])
  card.badge:SetPoint("BOTTOM", t, "TOP", 0, 6)
  card.badgeGlow:ClearAllPoints()
  card.badgeGlow:SetPoint("TOPLEFT", card.badge, "TOPLEFT", -30, 14)
  card.badgeGlow:SetPoint("BOTTOMRIGHT", card.badge, "BOTTOMRIGHT", 30, -14)

  -- divider under the name
  card.divWidth = width
  card.divL:ClearAllPoints()
  card.divR:ClearAllPoints()
  card.divL:SetPoint("TOPRIGHT", t, "BOTTOM", 0, -4)
  card.divR:SetPoint("TOPLEFT", t, "BOTTOM", 0, -4)
  card.divL:SetHeight(16)
  card.divR:SetHeight(16)
  local dc = (cinematic and IVORY) or (bronze and BRONZE_RULE) or GOLD
  card.divL:SetVertexColor(dc[1], dc[2], dc[3])
  card.divR:SetVertexColor(dc[1], dc[2], dc[3])
  card.divL:SetShown(width > 0)
  card.divR:SetShown(width > 0)
  card.divAlpha = cinematic and 0.55 or 1

  -- the lines: the subzone, then territory, level and so on; minimal joins them into one
  local list = {}
  if d.sub and d.sub ~= "" then list[#list + 1] = { d.sub, 1, 1, 1 } end
  for _, l in ipairs(d.lines or {}) do list[#list + 1] = l end
  if style == "minimal" and #list > 0 then
    local parts = {}
    for _, l in ipairs(list) do
      local function hex(v) return math.floor(math.max(0, math.min(1, v)) * 255 + 0.5) end
      parts[#parts + 1] = ("|cff%02x%02x%02x%s|r"):format(hex(l[2]), hex(l[3]), hex(l[4]), l[1])
    end
    list = { { table.concat(parts, "  ·  "), 1, 1, 1 } }
  end
  local anchor, gap = t, width > 0 and -22 or -6
  for i, l in ipairs(list) do
    local fs = lines[i]
    if not fs then break end
    local first = i == 1 and d.sub and d.sub ~= "" and style ~= "minimal"
    setFont(fs, FRIZ, first and (cinematic and 17 or 15) or (cinematic and 14 or 13), "")
    fs:SetText(l[1])
    fs:SetTextColor(l[2], l[3], l[4])
    fs:SetPoint("TOP", anchor, "BOTTOM", 0, i == 1 and gap or -4)
    fs:Show()
    anchor = fs
  end

  -- the plate (or plaque) fits what's shown: as wide as the widest line, from the badge to the last line
  local widest = math.max(t:GetStringWidth() or 0, width)
  for _, fs in ipairs(lines) do
    if fs:IsShown() then widest = math.max(widest, fs:GetStringWidth() or 0) end
  end
  -- cinematic: a wide, soft band instead, lighter, so it reads like film over the world
  local wide = cinematic and 300 or 120
  card.plate:ClearAllPoints()
  card.plate:SetPoint("TOPLEFT", t, "TOP", -(widest / 2 + wide), 50)
  card.plate:SetPoint("BOTTOMRIGHT", anchor, "BOTTOM", widest / 2 + wide, -40)
  card.plate:SetVertexColor(0, 0, 0, cinematic and 0.7 or 1)
  card.plate:SetShown(not bronze)
  local half = widest / 2 + 58
  -- Morpheus capitals reach above their text box, so the plaque starts well above it
  local top, bottom = (d.badge and 52 or 34) * (d.kind == "sub" and 0.8 or 1), -30
  local L, M, R = card.plaque[1], card.plaque[2], card.plaque[3]
  for _, tx in ipairs(card.plaque) do tx:ClearAllPoints(); tx:SetShown(bronze) end
  L:SetPoint("TOPLEFT", t, "TOP", -half, top)
  L:SetPoint("BOTTOMLEFT", anchor, "BOTTOM", -half, bottom)
  L:SetWidth(48)
  R:SetPoint("TOPRIGHT", t, "TOP", half, top)
  R:SetPoint("BOTTOMRIGHT", anchor, "BOTTOM", half, bottom)
  R:SetWidth(48)
  M:SetPoint("TOPLEFT", L, "TOPRIGHT")
  M:SetPoint("BOTTOMRIGHT", R, "BOTTOMLEFT")
end

---------------------------------------------------------------------------------------------------
-- Showing, animating, and the badge arriving later

local function apply(t)
  local s = state
  local alpha, scale, divider, sub, done = Logic.Timeline(t, s.hold)
  card:SetAlpha(alpha)
  pcall(card.title.SetScale, card.title, scale) -- regions scale on modern clients; older ones just skip it
  for _, fs in ipairs(card.lines) do fs:SetAlpha(sub) end
  local w = (card.divWidth or 0) / 2 * divider
  if w < 1 then
    card.divL:SetAlpha(0)
    card.divR:SetAlpha(0)
  else
    card.divL:SetAlpha(card.divAlpha or 1)
    card.divR:SetAlpha(card.divAlpha or 1)
    card.divL:SetWidth(w)
    card.divR:SetWidth(w)
    card.divL:SetTexCoord(0.5 - divider / 2, 0.5, 0, 1)
    card.divR:SetTexCoord(0.5, 0.5 + divider / 2, 0, 1)
  end
  -- the badge stamps in: big, then settling, with a glow that fades
  if s.badgeT then
    local b = t - s.badgeT
    local p = b < 0 and 0 or math.min(1, b / 0.25)
    card.badge:SetAlpha(p)
    pcall(card.badge.SetScale, card.badge, 1.8 - 0.8 * p)
    card.badgeGlow:SetAlpha(b < 0 and 0 or math.max(0, 0.9 - b / 1.2))
  else
    card.badge:SetAlpha(0)
    card.badgeGlow:SetAlpha(0)
  end
  -- cinematic bars slide in and out with the card
  if bars:IsShown() then
    local h = UIParent:GetHeight() * 0.075
    local p = math.min(1, t / 0.6)
    if t > s.hold then p = math.max(0, 1 - (t - s.hold) / Logic.FADE_OUT) end
    p = 1 - (1 - p) ^ 3
    bars.top:SetHeight(math.max(1, h * p))
    bars.bottom:SetHeight(math.max(1, h * p))
  end
  return done
end

local function onUpdate(_, elapsed)
  if not state then return end
  state.t = state.t + elapsed
  if ns.moving then state.t = math.min(state.t, 1) end -- held on screen while you move it
  if apply(state.t) then
    state = nil
    card:Hide()
    bars:Hide()
  end
end

function ns.ShowCard(d)
  if not card then build() end
  ns.PlaceCard()
  layout(d)
  state = { d = d, t = 0, hold = Logic.Hold(ns.db.duration, d.kind), badgeT = d.badge and 0.7 or nil }
  bars:SetShown(ns.db.style == "cinematic" and d.kind ~= "sub" and not ns.moving)
  card:SetScript("OnUpdate", onUpdate)
  card:Show()
  apply(0)
end

-- a discovery found a moment after the card showed: stamp the badge on it (and keep it up a little longer)
-- if it's still showing this place; returns false when there's no card to put it on
function ns.BadgeCard(text, title)
  if not (state and card:IsShown()) then return false end
  -- the card must be for this place; an area card that just appeared counts (the area's name in the
  -- exploration data can differ a little from the subzone text)
  local fresh = state.d.kind == "sub" and state.t < 2
  if title and state.d.title ~= title and state.d.sub ~= title and not fresh then return false end
  if state.t > state.hold then return false end
  state.d.badge = text
  layout(state.d)
  state.badgeT = state.t + 0.05
  state.hold = math.max(state.hold, state.t + 2)
  apply(state.t)
  return true
end

-- the card on screen: its kind, title and how long it has shown (for merging a subzone into a zone card)
function ns.CardShowing()
  if state and card:IsShown() then return state.d, state.t end
end

-- a subzone arriving just after its zone card: add it as the card's subzone line
function ns.SetCardSub(sub)
  if not state then return end
  state.d.sub = sub
  layout(state.d)
  apply(state.t)
end

-- a line arriving a moment after the card (you started resting): added to the card on screen, which stays a
-- little longer so it can be read; returns false when there's no card to add it to
function ns.AddCardLine(line)
  if not (state and card:IsShown()) or state.t > state.hold - 1 then return false end
  state.d.lines = state.d.lines or {}
  for _, l in ipairs(state.d.lines) do
    if l[1] == line[1] then return true end -- already there
  end
  state.d.lines[#state.d.lines + 1] = line
  layout(state.d)
  state.hold = math.max(state.hold, state.t + 2.5)
  apply(state.t)
  return true
end

function ns.HideCard()
  state = nil
  if card then card:Hide() end
  if bars then bars:Hide() end
end

-- unlock: the card stays up with a box around it so you can drag it
function ns.SetMoving(on)
  ns.moving = on and true or false
  if not card then build() end
  card:EnableMouse(ns.moving)
  card.box:SetShown(ns.moving)
  if ns.moving then
    ns.ShowCard({ kind = "zone", title = "Drag me", color = GOLD, lines = { { "Then /landfall lock, or Lock in the settings", 1, 1, 1 } } })
  else
    ns.HideCard()
    ns.PlaceCard()
  end
end

-- a place far above your level: the screen's edges flash red twice
function ns.DangerPulse()
  if not pulse then build() end
  local t = 0
  pulse:SetScript("OnUpdate", function(self, elapsed)
    t = t + elapsed
    if t >= 1.7 then
      self:Hide()
      self:SetScript("OnUpdate", nil)
      return
    end
    self.glow:SetAlpha(0.85 * math.abs(math.sin(math.pi * t / 0.85)) * (1 - t / 2.2))
  end)
  pulse.glow:SetAlpha(0)
  pulse:Show()
end
