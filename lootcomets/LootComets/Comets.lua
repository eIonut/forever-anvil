-- Loot Comets: drawing. Every moving thing is an "effect" with update(self, dt) that returns false when it's done;
-- one OnUpdate runs them all and stops when none are left. Textures are pooled and reused.
local _, ns = ...
local Logic = ns.Logic

local MEDIA = "Interface\\AddOns\\LootComets\\Media\\"
local GLOW, RING, STAR, EDGE = MEDIA .. "Glow", MEDIA .. "Ring", MEDIA .. "Star", MEDIA .. "Edge"
local WHITE = "Interface\\Buttons\\WHITE8x8"
local ROUND_MASK = "Interface\\CharacterFrame\\TempPortraitAlphaMask"
local QUESTION = "Interface\\Icons\\INV_Misc_QuestionMark"
local MAX_COMETS = 14     -- more at once than this and the extra items only flash their slot
local MAX_EFFECTS = 700   -- the dust trail stops adding specks past this many things on screen

-- trail styles drawn as glow dots at earlier points of the same curve (looks the same at any frame rate):
-- how many, how far apart along the flight, their size and brightness. "dust" and "none" are handled apart.
local TRAILS = {
  dots = { n = 10, gap = 0.028, size = 1.1, base = 0.5, alpha = 0.6 },
  streak = { n = 22, gap = 0.009, size = 0.75, base = 0.35, alpha = 0.42 },
}

-- everything is drawn on one full-screen layer above the game's windows, which never takes the mouse
local layer = CreateFrame("Frame", "LootCometsLayer", UIParent)
layer:SetAllPoints(UIParent)
layer:SetFrameStrata("FULLSCREEN_DIALOG")
layer:EnableMouse(false)
layer:Hide()

local effects = {}
local flying = 0

---------------------------------------------------------------------------------------------------
-- pools

local texPool, textPool = {}, {}
local iconPools = { [true] = {}, [false] = {} } -- round (masked) and square icons

local function getTex(file, drawLayer, sub, blend)
  local t = table.remove(texPool) or layer:CreateTexture()
  t:SetDrawLayer(drawLayer or "ARTWORK", sub or 0)
  t:SetTexture(file)
  t:SetTexCoord(0, 1, 0, 1)
  t:SetBlendMode(blend or "ADD")
  t:SetVertexColor(1, 1, 1)
  t:SetAlpha(1)
  if t.SetRotation then t:SetRotation(0) end
  t:Show()
  return t
end

local function freeTex(t)
  t:Hide()
  t:ClearAllPoints()
  texPool[#texPool + 1] = t
end

-- an item icon, round (masked to a circle where the game can) or square
local function getIcon(round)
  local pool = iconPools[round]
  local it = table.remove(pool)
  if not it then
    it = { tex = layer:CreateTexture(nil, "OVERLAY", nil, 2), round = round }
    if round and layer.CreateMaskTexture and it.tex.AddMaskTexture then
      it.mask = layer:CreateMaskTexture()
      it.mask:SetTexture(ROUND_MASK, "CLAMPTOBLACKADDITIVE", "CLAMPTOBLACKADDITIVE")
      it.mask:SetAllPoints(it.tex)
      it.tex:AddMaskTexture(it.mask)
    else
      it.tex:SetTexCoord(0.08, 0.92, 0.08, 0.92)
    end
  end
  it.tex:SetAlpha(1)
  it.tex:Show()
  return it
end

local function freeIcon(it)
  it.tex:Hide()
  it.tex:ClearAllPoints()
  local pool = iconPools[it.round]
  pool[#pool + 1] = it
end

local function getText()
  local fs = table.remove(textPool)
  if not fs then
    fs = layer:CreateFontString(nil, "OVERLAY")
    fs:SetFont(STANDARD_TEXT_FONT or "Fonts\\FRIZQT__.TTF", 16, "OUTLINE")
    fs:SetShadowOffset(1, -1)
    fs:SetShadowColor(0, 0, 0, 0.8)
  end
  fs:SetAlpha(1)
  fs:Show()
  return fs
end

local function freeText(fs)
  fs:Hide()
  fs:ClearAllPoints()
  textPool[#textPool + 1] = fs
end

local function place(region, x, y, w, h)
  region:ClearAllPoints()
  region:SetPoint("CENTER", layer, "BOTTOMLEFT", x, y)
  region:SetSize(w, h or w)
end

---------------------------------------------------------------------------------------------------
-- the loop

local function add(e)
  effects[#effects + 1] = e
  layer:Show()
end

local reported = {}
layer:SetScript("OnUpdate", function(_, dt)
  if dt > 0.1 then dt = 0.1 end -- after a loading screen or a hitch, don't jump to the end
  for i = #effects, 1, -1 do
    local e = effects[i]
    local ok, alive = pcall(e.update, e, dt)
    if not ok or not alive then
      table.remove(effects, i)
      if e.release then pcall(e.release, e) end
      if not ok and not reported[tostring(alive)] then
        reported[tostring(alive)] = true
        ns.Print("error (please report it): " .. tostring(alive))
      end
    end
  end
  if #effects == 0 then layer:Hide() end
end)

---------------------------------------------------------------------------------------------------
-- colours and sound

function ns.QualityColor(q)
  q = q or 1
  if C_Item and C_Item.GetItemQualityColor then
    local ok, r, g, b = pcall(C_Item.GetItemQualityColor, q)
    if ok and r then return r, g, b end
  end
  local c = ITEM_QUALITY_COLORS and ITEM_QUALITY_COLORS[q]
  if c then return c.r, c.g, c.b end
  return 1, 1, 1
end

-- A comet's colour under the colour setting: the item's quality, your own colour, or the rainbow at hue.
function ns.ColorFor(quality, hue)
  local mode = ns.db.color
  if mode == "custom" then
    local c = ns.db.customColor
    return c.r, c.g, c.b
  elseif mode == "rainbow" then
    return Logic.HSV(hue or math.random(), 0.75, 1)
  end
  return ns.QualityColor(quality)
end

local function playEpic()
  local kit = SOUNDKIT and (SOUNDKIT.UI_EPICLOOT_TOAST or SOUNDKIT.UI_LEGENDARY_LOOT_TOAST)
  if kit then pcall(PlaySound, kit, "SFX") end
end

---------------------------------------------------------------------------------------------------
-- small effects: a texture that drifts, grows or shrinks and fades

-- o: file, x, y, vx, vy, drag, life, size0, size1, alpha0, alpha1, spin, r, g, b, delay, drawLayer, sub
local function particle(o)
  local t = getTex(o.file, o.drawLayer or "ARTWORK", o.sub)
  t:SetVertexColor(o.r or 1, o.g or 1, o.b or 1)
  t:SetAlpha(0)
  add({
    age = -(o.delay or 0), x = o.x, y = o.y, vx = o.vx or 0, vy = o.vy or 0, rot = o.rot or 0,
    update = function(e, dt)
      e.age = e.age + dt
      if e.age < 0 then return true end
      local p = e.age / o.life
      if p >= 1 then return false end
      local drag = 1 - (o.drag or 0) * dt
      if drag < 0 then drag = 0 end
      e.vx, e.vy = e.vx * drag, e.vy * drag
      e.x, e.y = e.x + e.vx * dt, e.y + e.vy * dt
      local size = o.size0 + (o.size1 - o.size0) * p
      place(t, e.x, e.y, size)
      local a0, a1 = o.alpha0 or 1, o.alpha1 or 0
      t:SetAlpha(a0 + (a1 - a0) * p)
      if o.spin and t.SetRotation then
        e.rot = e.rot + o.spin * dt
        t:SetRotation(e.rot)
      end
      return true
    end,
    release = function() freeTex(t) end,
  })
end

-- "+3" (or "+1g 20s") rising off the slot, kept inside the screen's right edge
local function countText(x, y, text, r, g, b, long)
  local fs = getText()
  fs:SetText(text)
  fs:SetTextColor(r, g, b)
  local cx = math.min(x + 14, layer:GetWidth() - (fs:GetStringWidth() or 0) / 2 - 8)
  local life = long and 1.8 or 1.1
  add({
    age = 0,
    update = function(e, dt)
      e.age = e.age + dt
      local p = e.age / life
      if p >= 1 then return false end
      fs:ClearAllPoints()
      fs:SetPoint("CENTER", layer, "BOTTOMLEFT", cx, y + 10 + 34 * (1 - (1 - p) * (1 - p)))
      fs:SetAlpha(p < 0.6 and 1 or (1 - (p - 0.6) / 0.4))
      return true
    end,
    release = function() freeText(fs) end,
  })
end

-- the screen's edges glow in the item's colour for a moment (epic and better)
local function edgeGlow(r, g, b)
  local t = getTex(EDGE, "BACKGROUND", 0)
  t:ClearAllPoints()
  t:SetAllPoints(layer)
  t:SetVertexColor(r, g, b)
  t:SetAlpha(0)
  add({
    age = 0,
    update = function(e, dt)
      e.age = e.age + dt
      if e.age >= 1.5 then return false end
      local a = e.age < 0.15 and e.age / 0.15 or 1 - (e.age - 0.15) / 1.35
      t:SetAlpha(0.9 * a)
      return true
    end,
    release = function() freeTex(t) end,
  })
end

---------------------------------------------------------------------------------------------------
-- landing: the slot flashes, a ring goes out, and better items sparkle; how much depends on the landing setting

-- o: x1, y1 (where), w (width of what it lands on), quality, count, small, r, g, b (the comet's colour)
function ns.Land(o)
  local db = ns.db
  local r, g, b = o.r, o.g, o.b
  if not r then r, g, b = ns.ColorFor(o.quality) end
  local q = o.quality or 1
  local w = o.w or 36
  local x, y = o.x1, o.y1
  local mode = db.landing or "normal"
  local k = (mode == "big" and 1.35) or (mode == "subtle" and 0.75) or 1
  local strong = (o.small and 0.6 or 1) * (mode == "subtle" and 0.65 or 1)

  particle({ file = GLOW, x = x, y = y, life = 0.5, size0 = w * 2.1 * k, size1 = w * 2.6 * k,
    alpha0 = 0.95 * strong, alpha1 = 0, r = r, g = g, b = b })
  if mode ~= "subtle" then
    particle({ file = RING, x = x, y = y, life = 0.42, size0 = w * 0.7, size1 = w * (o.small and 1.8 or 2.6) * k,
      alpha0 = 0.9 * strong, alpha1 = 0, r = r, g = g, b = b, sub = 1 })
  end
  if mode == "big" and not o.small then
    particle({ file = RING, x = x, y = y, life = 0.55, size0 = w * 0.9, size1 = w * 3.6,
      alpha0 = 0.6, alpha1 = 0, r = r, g = g, b = b, sub = 1, delay = 0.07 })
  end

  if db.sparkles and not o.small and mode ~= "subtle" then
    local n = (q >= 4 and 12) or (q == 3 and 7) or (q == 2 and 4) or 0
    if mode == "big" then n = math.floor(n * 1.6) + 3 end
    for i = 1, n do
      local sr, sg, sb = r, g, b
      if db.color == "rainbow" then sr, sg, sb = Logic.HSV(i / n, 0.7, 1) end
      local angle = (i / n) * math.pi * 2 + math.random() * 0.5
      local speed = (90 + math.random() * 120) * k
      particle({ file = STAR, x = x, y = y, vx = math.cos(angle) * speed, vy = math.sin(angle) * speed,
        drag = 3.2, life = 0.55 + math.random() * 0.3, size0 = 16 + math.random() * 8, size1 = 2,
        alpha0 = 1, alpha1 = 0, spin = 4, r = sr, g = sg, b = sb, drawLayer = "OVERLAY", sub = 3 })
    end
  end

  if q >= 4 and not o.small then
    if mode ~= "subtle" then
      particle({ file = RING, x = x, y = y, life = 0.7, size0 = w, size1 = w * 4.2 * k,
        alpha0 = 0.7, alpha1 = 0, r = r, g = g, b = b, delay = 0.08 })
    end
    if db.sound then playEpic() end
    if db.epicGlow then edgeGlow(r, g, b) end
  end

  if o.label then -- coins: how much money, on the last coin
    countText(x, y, o.label, 1, 0.9, 0.55, true) -- gold text, up a little longer so you can read it
  elseif db.counts and o.count and (o.count > 1 or o.small) then
    countText(x, y, "+" .. o.count, r, g, b)
  end
end

---------------------------------------------------------------------------------------------------
-- the comet, flying on an arc from x0, y0 to x1, y1. Shape: a round icon in a glow, a square icon with a
-- coloured border, or a glowing orb with no icon. A twinkle spins on top; the trail follows the trail setting.

-- o: icon, quality, x0, y0, x1, y1, w, count, small (more of an item you already had), delay, side (-1 to 1)
function ns.Fire(o)
  local db = ns.db
  if flying >= MAX_COMETS then
    add({ age = -(o.delay or 0), update = function(e, dt)
      e.age = e.age + dt
      if e.age < 0 then return true end
      ns.Land(o)
      return false
    end })
    return
  end

  local rainbow = db.color == "rainbow" and not o.color -- coins keep their own gold, silver or copper
  local hue0 = math.random()
  local r0, g0, b0 = ns.ColorFor(o.quality, hue0)
  if o.color then r0, g0, b0 = o.color[1], o.color[2], o.color[3] end
  local size = 34 * (db.size or 1) * (o.small and 0.62 or 1)
  local cx, cy = Logic.Control(o.x0, o.y0, o.x1, o.y1, o.side, db.arc)
  local dur = Logic.Duration(o.x0, o.y0, o.x1, o.y1, db.speed) * (o.small and 0.85 or 1)
  local x0, y0, x1, y1 = o.x0, o.y0, o.x1, o.y1
  local shape = db.shape or "round"
  local trail = db.trail or "dots"
  local style = TRAILS[trail]

  local icon, border, core
  if shape == "orb" then
    core = getTex(GLOW, "OVERLAY", 2)
    core:SetAlpha(0)
  else
    icon = getIcon(shape ~= "square")
    icon.tex:SetTexture(o.icon or QUESTION)
    icon.tex:SetAlpha(0)
    if shape == "square" then
      border = getTex(WHITE, "OVERLAY", 1, "BLEND")
      border:SetAlpha(0)
    end
  end
  local halo = getTex(GLOW, "OVERLAY", 0)
  halo:SetAlpha(0)
  local star = getTex(STAR, "OVERLAY", 3)
  star:SetAlpha(0)
  local dots = {}
  if style then
    for i = 1, (o.small and math.ceil(style.n / 2) or style.n) do
      dots[i] = getTex(GLOW, "ARTWORK", 2)
      dots[i]:SetAlpha(0)
    end
  end

  flying = flying + 1
  add({
    age = -(o.delay or 0), spin = math.random() * 6, dust = 0,
    update = function(e, dt)
      e.age = e.age + dt
      if e.age < 0 then return true end
      local p = e.age / dur
      local hue = hue0 + e.age * 0.6
      local r, g, b = r0, g0, b0
      if rainbow then r, g, b = Logic.HSV(hue, 0.75, 1) end
      if p >= 1 then
        o.r, o.g, o.b = r, g, b
        ns.Land(o)
        return false
      end
      local x, y = Logic.Arc(Logic.Ease(p), x0, y0, cx, cy, x1, y1)
      local s = size * Logic.Scale(p)

      if icon then
        place(icon.tex, x, y, border and s * 0.86 or s)
        icon.tex:SetAlpha(1)
      end
      if border then
        place(border, x, y, s * 0.86 + 4)
        border:SetVertexColor(r, g, b)
        border:SetAlpha(1)
      end
      if core then
        place(core, x, y, s * 1.15)
        core:SetVertexColor(r * 0.35 + 0.65, g * 0.35 + 0.65, b * 0.35 + 0.65)
        core:SetAlpha(1)
      end
      place(halo, x, y, s * (core and 2.9 or 2.3))
      halo:SetVertexColor(r, g, b)
      halo:SetAlpha(0.9)
      place(star, x, y, s * 1.9)
      star:SetVertexColor(r * 0.5 + 0.5, g * 0.5 + 0.5, b * 0.5 + 0.5)
      star:SetAlpha(0.55 + 0.25 * math.sin(e.age * 18))
      if star.SetRotation then
        e.spin = e.spin + dt * 2.5
        star:SetRotation(e.spin)
      end

      for i, dot in ipairs(dots) do
        local pi = p - i * style.gap
        if pi <= 0 then
          dot:SetAlpha(0)
        else
          local dx, dy = Logic.Arc(Logic.Ease(pi), x0, y0, cx, cy, x1, y1)
          local kk = 1 - i / (#dots + 1)
          place(dot, dx, dy, s * (style.base + style.size * kk))
          if rainbow then
            dot:SetVertexColor(Logic.HSV(hue - i * 0.035, 0.75, 1))
          else
            dot:SetVertexColor(r, g, b)
          end
          dot:SetAlpha(style.alpha * kk)
        end
      end

      if trail == "dust" then -- specks shed along the way that drift down and fade
        e.dust = e.dust + dt * (o.small and 25 or 45)
        while e.dust >= 1 do
          e.dust = e.dust - 1
          if #effects < MAX_EFFECTS then
            particle({ file = math.random() < 0.35 and STAR or GLOW,
              x = x + (math.random() - 0.5) * s * 0.4, y = y + (math.random() - 0.5) * s * 0.4,
              vx = (math.random() - 0.5) * 40, vy = -5 - math.random() * 30, drag = 1.5,
              life = 0.45 + math.random() * 0.45, size0 = s * (0.25 + math.random() * 0.25), size1 = 1,
              alpha0 = 0.9, alpha1 = 0, spin = 3, r = r, g = g, b = b, sub = 2 })
          end
        end
      end
      return true
    end,
    release = function()
      flying = flying - 1
      if icon then freeIcon(icon) end
      if border then freeTex(border) end
      if core then freeTex(core) end
      freeTex(halo)
      freeTex(star)
      for _, dot in ipairs(dots) do freeTex(dot) end
    end,
  })
end

-- how many comets are in the air (for /comets debug)
function ns.Flying() return flying end
