-- Loot Comets: items you loot fly into the bag slot they land in.
-- Core: settings, watching your bags for new items, and the /comets command.
local addonName, ns = ...
local Logic = ns.Logic

ns.DEFAULTS = {
  enabled = true,
  grey = true,   -- comets for grey (poor) items too
  stacks = true, -- small comets for more of an item you already carry (off: just the slot flash and "+3")
  counts = true, -- "+3" over the slot when a stack grows
  sound = true,  -- a sound when an epic or better item lands
  speed = 1,     -- slider, 0.5 to 2
  size = 1,      -- slider, 0.6 to 1.6
  shape = "round",     -- "round" icon, "square" icon with a coloured border, "orb" (no icon)
  trail = "dots",      -- "dots", "streak", "dust", "none"
  color = "quality",   -- "quality", "custom" (customColor), "rainbow"
  customColor = { r = 0.61, g = 0.48, b = 1 },
  arc = 1,             -- 0.3 flat, 1 normal, 1.8 high
  landing = "normal",  -- "subtle", "normal", "big"
  sparkles = true,     -- sparkles when green and better items land
  epicGlow = true,     -- the screen's edges glow when an epic or better item lands
  minimapButton = true,
  minimapAngle = 200,  -- where the minimap button sits (degrees around the minimap)
  v = 1,
}

function ns.Print(msg)
  DEFAULT_CHAT_FRAME:AddMessage("|cff9b7bffLoot Comets|r: " .. msg)
end

local function copyDefaults(dst, src)
  for k, v in pairs(src) do
    if type(v) == "table" then
      if type(dst[k]) ~= "table" then dst[k] = {} end
      copyDefaults(dst[k], v)
    elseif dst[k] == nil then
      dst[k] = v
    end
  end
end

---------------------------------------------------------------------------------------------------
-- reading the bags

local function slotInfo(bag, slot)
  local C = C_Container
  if C and C.GetContainerItemInfo then
    local info = C.GetContainerItemInfo(bag, slot)
    if info then return info.itemID, info.stackCount, info.iconFileID, info.quality, info.hyperlink end
    return
  end
  if GetContainerItemInfo then
    local icon, count, _, quality, _, _, link, _, _, id = GetContainerItemInfo(bag, slot)
    return id, count, icon, quality, link
  end
end

local function readBags()
  local numSlots = (C_Container and C_Container.GetContainerNumSlots) or GetContainerNumSlots
  local items = {}
  for bag = 0, (NUM_TOTAL_EQUIPPED_BAG_SLOTS or NUM_BAG_SLOTS or 4) do
    for slot = 1, (numSlots(bag) or 0) do
      local id, count, icon, quality, link = slotInfo(bag, slot)
      if id then
        if quality == nil and C_Item and C_Item.GetItemQualityByID then quality = C_Item.GetItemQualityByID(id) end
        items[#items + 1] = { bag = bag, slot = slot, id = id, count = count or 1, icon = icon, quality = quality, link = link }
      end
    end
  end
  return Logic.Snapshot(items)
end

---------------------------------------------------------------------------------------------------
-- new items → comets

local last           -- the bags as they were
local ready = false  -- false at login and after loading screens, while the game fills the bags in
local quietUntil = 0 -- gains before this time are moves, not loot (gear swaps, closing the bank)
local pending = false
ns.lastFlight = nil  -- where the last comet flew from and to, for /comets debug

local atBank = false -- the bank or guild bank is open (bag addons like Bagnon hide the game's bank window)

local function quiet()
  if GetTime() < quietUntil or atBank then return true end
  -- taking items out of the bank is moving your own things, not loot
  return (BankFrame and BankFrame:IsShown()) or (GuildBankFrame and GuildBankFrame:IsShown()) or false
end

local FAN = { 0, 1, -1, 2, -2 }

local function launch(gains, now)
  local n = 0
  for _, g in ipairs(gains) do
    local s = now.slots[g.bag .. ":" .. g.slot]
    if s and n < 20 and Logic.Flies(s.quality, ns.db) then
      n = n + 1
      local x0, y0, from = ns.Launch(g.id)
      local x1, y1, w, to = ns.Landing(g.bag, g.slot)
      local spread = FAN[(n - 1) % 5 + 1] -- a handful from one corpse fan out a little
      local o = {
        icon = s.icon, quality = s.quality, count = g.gained, small = not g.new,
        x0 = x0 + spread * 12, y0 = y0 + spread * 4, x1 = x1, y1 = y1, w = w,
        delay = (n - 1) * 0.09, side = spread / 2,
      }
      if g.new or ns.db.stacks then
        ns.Fire(o)
      else
        ns.Land(o) -- more of something you carry, small comets off: just the slot's flash and "+3"
      end
      ns.lastFlight = { link = s.link, from = from, to = to }
    end
  end
end

local function check()
  pending = false
  local now = readBags()
  if ready and last and ns.db.enabled and not quiet() then
    local gains = Logic.Gains(last, now)
    if #gains > 0 then launch(gains, now) end
  end
  last = now
end

-- BAG_UPDATE_DELAYED, checked a frame later so a gear swap's PLAYER_EQUIPMENT_CHANGED is seen first
local function bagsChanged()
  if pending then return end
  pending = true
  C_Timer.After(0, function()
    local ok, err = pcall(check)
    if not ok then
      pending = false
      ns.Print("error (please report it): " .. tostring(err))
    end
  end)
end

---------------------------------------------------------------------------------------------------
-- /comets test: one comet per quality from the middle of the screen, into real items' slots where it can

function ns.Test()
  local now = readBags()
  local byQuality = {}
  for _, s in pairs(now.slots) do
    local q = s.quality or 1
    local best = byQuality[q]
    if not best or s.bag < best.bag or (s.bag == best.bag and s.slot < best.slot) then byQuality[q] = s end
  end
  local x0, y0 = UIParent:GetWidth() / 2, UIParent:GetHeight() * 0.42
  local n = 0
  for q = 0, 5 do
    local s = byQuality[q]
    if s or q <= 4 then
      local x1, y1, w = ns.Landing(s and s.bag or 0, s and s.slot or 1)
      local spread = n - 2
      ns.Fire({
        icon = s and s.icon, quality = q, count = 1,
        x0 = x0 + spread * 30, y0 = y0, x1 = x1, y1 = y1, w = w, delay = n * 0.18, side = spread / 2,
      })
      n = n + 1
    end
  end
end

---------------------------------------------------------------------------------------------------
-- events

local f = CreateFrame("Frame")
local function listen(event)
  pcall(f.RegisterEvent, f, event) -- events this client doesn't have are skipped
end
for _, e in ipairs({ "ADDON_LOADED", "PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "BAG_UPDATE_DELAYED", "LOOT_OPENED", "LOOT_CLOSED",
  "PLAYER_EQUIPMENT_CHANGED", "BANKFRAME_OPENED", "BANKFRAME_CLOSED", "GUILDBANKFRAME_OPENED", "GUILDBANKFRAME_CLOSED",
  "BAG_CONTAINER_UPDATE" }) do
  listen(e)
end

f:SetScript("OnEvent", function(_, event, arg1)
  if event == "ADDON_LOADED" then
    if arg1 ~= addonName then return end
    LootCometsDB = LootCometsDB or {}
    copyDefaults(LootCometsDB, ns.DEFAULTS)
    ns.db = LootCometsDB
    if ns.InitOptions then pcall(ns.InitOptions) end
  elseif event == "PLAYER_LOGIN" then
    local ok, err = pcall(ns.InitMinimap)
    if not ok then ns.Print("error (please report it): " .. tostring(err)) end
  elseif event == "PLAYER_ENTERING_WORLD" then
    ready = false
    C_Timer.After(3, function()
      last = readBags()
      ready = true
    end)
  elseif event == "BAG_UPDATE_DELAYED" then
    bagsChanged()
  elseif event == "LOOT_OPENED" then
    pcall(ns.OnLootOpened)
  elseif event == "LOOT_CLOSED" then
    pcall(ns.OnLootClosed)
  elseif event == "BANKFRAME_OPENED" or event == "GUILDBANKFRAME_OPENED" then
    atBank = true
  else -- gear swaps, the bank closing, a bag swapped: the next change is moving things, not loot
    if event == "BANKFRAME_CLOSED" or event == "GUILDBANKFRAME_CLOSED" then atBank = false end
    quietUntil = GetTime() + 0.6
  end
end)

---------------------------------------------------------------------------------------------------
-- /comets

SLASH_LOOTCOMETS1 = "/comets"
SLASH_LOOTCOMETS2 = "/lootcomets"
SlashCmdList.LOOTCOMETS = function(msg)
  local cmd = (msg or ""):lower():match("^%s*(%S*)")
  if cmd == "test" then
    ns.Test()
  elseif cmd == "on" or cmd == "off" then
    ns.db.enabled = cmd == "on"
    ns.Print(ns.db.enabled and "on." or "off. /comets on turns it back on.")
    ns.OnSetting("enabled")
  elseif cmd == "minimap" then
    ns.db.minimapButton = true
    ns.OnSetting("minimapButton")
    ns.Print("minimap button shown. Drag it to move it.")
  elseif cmd == "menu" then
    ns.ToggleMenu(ns.minimapButton and ns.minimapButton:IsVisible() and ns.minimapButton or nil)
  elseif cmd == "debug" then
    local fl = ns.lastFlight
    ns.Print(("version %s, %s, %d in the air."):format(
      (C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata)(addonName, "Version") or "?",
      ns.db.enabled and "on" or "off", ns.Flying()))
    ns.Print(fl and ("last: %s from %s to %s"):format(fl.link or "?", fl.from, fl.to) or "no comets yet.")
    local x, y, _, to = ns.Landing(0, 1)
    ns.Print(("backpack slot 1 lands on: %s (%d, %d)"):format(to, x, y))
  elseif cmd == "" or cmd == "options" then
    if ns.OpenOptions then ns.OpenOptions() end
  else
    ns.Print("/comets: settings, /comets menu, /comets test: a comet of each quality, /comets on | off, /comets minimap, /comets debug")
  end
end
