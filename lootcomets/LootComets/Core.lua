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
  coins = true,        -- money you get flies into your money display as coins, with how much
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
  -- (on screen, not just shown: ElvUI leaves the game's bank window shown with no position)
  return ns.OnScreen(BankFrame) or ns.OnScreen(GuildBankFrame) or false
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

-- the item on your cursor, and until when it counts as "just dropped" (a second after you let go)
local held, heldUntil = nil, 0

-- money on the cursor (picked up for a trade or the mail) and put back is a move too
local moneyHeld, moneyHeldUntil = false, 0

local function cursorChanged()
  local kind, id = GetCursorInfo()
  if kind == "item" and id then
    held, heldUntil = id, math.huge
  elseif held then
    heldUntil = GetTime() + 1
  end
  if kind == "money" then
    moneyHeld, moneyHeldUntil = true, math.huge
  elseif moneyHeld then
    moneyHeld, moneyHeldUntil = false, GetTime() + 1
  end
end

---------------------------------------------------------------------------------------------------
-- coins: money you get flies into your money display

local COINS = {
  gold = { "Interface\\MoneyFrame\\UI-GoldIcon", { 1, 0.82, 0.25 } },
  silver = { "Interface\\MoneyFrame\\UI-SilverIcon", { 0.85, 0.88, 0.95 } },
  copper = { "Interface\\MoneyFrame\\UI-CopperIcon", { 0.93, 0.55, 0.28 } },
}

local function moneyLabel(copper)
  if GetCoinTextureString then
    local ok, s = pcall(GetCoinTextureString, copper)
    if ok and s then return "+" .. s end
  end
  return "+" .. Logic.MoneyText(copper)
end

-- a shower of coins for copper gained, from (x0, y0); the last coin shows how much
function ns.CoinShower(copper, x0, y0, delay)
  local plan = Logic.CoinPlan(copper)
  local x1, y1, w, to = ns.MoneyLanding()
  for i, kind in ipairs(plan) do
    local spread = (i - 1) % 5 - 2
    ns.Fire({
      icon = COINS[kind][1], color = COINS[kind][2], quality = 1, small = true,
      x0 = x0 + spread * 10, y0 = y0 + ((i - 1) % 3) * 6, x1 = x1, y1 = y1, w = w,
      delay = (delay or 0) + (i - 1) * 0.07, side = spread / 2,
      label = i == #plan and moneyLabel(copper) or nil,
    })
  end
  ns.lastCoins = { amount = copper, to = to }
end

local lastMoney

local function moneyChanged()
  local now = GetMoney()
  local gained = now - (lastMoney or now)
  lastMoney = now
  if gained <= 0 or not (ready and ns.db.enabled and ns.db.coins) or quiet() then return end
  if moneyHeld or GetTime() < moneyHeldUntil then return end
  local x0, y0 = ns.Launch("money")
  ns.CoinShower(gained, x0, y0)
end

local function check()
  pending = false
  local now = readBags()
  if ready and last and ns.db.enabled and not quiet() then
    local gains = Logic.Gains(last, now)
    if held and GetTime() < heldUntil then gains = Logic.WithoutHeld(gains, held) end
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

local EMPTY_BAGS_ICON = "Interface\\Icons\\INV_Misc_Gem_Amethyst_02" -- only when there's nothing in the bags

function ns.Test()
  local items = {}
  for _, s in pairs(readBags().slots) do items[#items + 1] = s end
  local x0, y0 = UIParent:GetWidth() / 2, UIParent:GetHeight() * 0.42
  for n, pick in ipairs(Logic.TestPicks(items)) do
    local s = pick.item
    local x1, y1, w = ns.Landing(s and s.bag or 0, s and s.slot or 1)
    local spread = n - 3
    ns.Fire({
      icon = s and s.icon or EMPTY_BAGS_ICON, quality = pick.quality, count = 1,
      x0 = x0 + spread * 30, y0 = y0, x1 = x1, y1 = y1, w = w, delay = (n - 1) * 0.18, side = spread / 2,
    })
  end
  if ns.db.coins then ns.CoinShower(123456, x0, y0 - 20, 1.0) end -- and a shower of 12g 34s 56c
end

---------------------------------------------------------------------------------------------------
-- events

local f = CreateFrame("Frame")
local function listen(event)
  pcall(f.RegisterEvent, f, event) -- events this client doesn't have are skipped
end
for _, e in ipairs({ "ADDON_LOADED", "PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "BAG_UPDATE_DELAYED", "LOOT_OPENED", "LOOT_CLOSED",
  "PLAYER_EQUIPMENT_CHANGED", "BANKFRAME_OPENED", "BANKFRAME_CLOSED", "GUILDBANKFRAME_OPENED", "GUILDBANKFRAME_CLOSED",
  "BAG_CONTAINER_UPDATE", "CURSOR_CHANGED", "CURSOR_UPDATE", "PLAYER_MONEY" }) do
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
      lastMoney = GetMoney()
      ready = true
    end)
  elseif event == "BAG_UPDATE_DELAYED" then
    bagsChanged()
  elseif event == "PLAYER_MONEY" then
    local ok, err = pcall(moneyChanged)
    if not ok then ns.Print("error (please report it): " .. tostring(err)) end
  elseif event == "CURSOR_CHANGED" or event == "CURSOR_UPDATE" then
    pcall(cursorChanged)
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
    if _G.ElvUI_ContainerFrame then ns.Print("ElvUI bags: " .. ns.ElvUIReport(0, 1)) end
    local _, _, _, money = ns.MoneyLanding()
    ns.Print("coins land on: " .. money .. (ns.db.coins and "" or " (coin comets are off)"))
  elseif cmd == "" or cmd == "options" then
    if ns.OpenOptions then ns.OpenOptions() end
  else
    ns.Print("/comets: settings, /comets menu, /comets test: a comet of each quality, /comets on | off, /comets minimap, /comets debug")
  end
end
