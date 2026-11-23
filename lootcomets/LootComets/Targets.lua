-- Loot Comets: where a comet starts and where it lands, as points on the screen (UIParent's coordinates).
-- Only reads positions of the game's frames; never changes them.
local _, ns = ...

-- The middle of a frame in UIParent's coordinates, and its width; nil when it isn't on screen.
local function centre(frame)
  if not (frame and frame.IsVisible and frame:IsVisible() and frame.GetCenter) then return end
  local x, y = frame:GetCenter()
  if not x then return end
  -- text (a money display) may not know its own scale: its frame does
  local scaled = frame.GetEffectiveScale and frame or (frame.GetParent and frame:GetParent())
  local s = (scaled and scaled:GetEffectiveScale() or 1) / UIParent:GetEffectiveScale()
  return x * s, y * s, (frame:GetWidth() or 36) * s
end
ns.Centre = centre

-- Shown AND placed somewhere. Bag addons like ElvUI "disable" the game's bag windows by taking away their
-- position but leaving them shown, so IsVisible alone would pick a slot that isn't anywhere on screen.
local function onScreen(frame)
  return frame and frame.IsVisible and frame:IsVisible() and frame.GetCenter and frame:GetCenter() ~= nil or false
end
ns.OnScreen = onScreen

---------------------------------------------------------------------------------------------------
-- Landing: the item's own slot when your bags are open, else that bag's button on the bag bar

local function bagOf(button)
  if button.GetBagID then
    local ok, bag = pcall(button.GetBagID, button)
    if ok and bag then return bag end
  end
  local parent = button:GetParent()
  return parent and parent.GetID and parent:GetID()
end

-- calls fn(button) for each item button of an open bag window; stops when fn returns true
local function eachButton(frame, fn)
  if not onScreen(frame) then return end
  if frame.EnumerateValidItems then
    local ok, done = pcall(function()
      for _, button in frame:EnumerateValidItems() do
        if fn(button) then return true end
      end
    end)
    if ok then return done end
  end
  if type(frame.Items) == "table" then
    for _, button in ipairs(frame.Items) do
      if fn(button) then return true end
    end
    return
  end
  local name = frame.GetName and frame:GetName()
  if name then -- older bag windows: ContainerFrame1Item1, …
    for i = 1, 40 do
      local button = _G[name .. "Item" .. i]
      if not button then break end
      if fn(button) then return true end
    end
  end
end

local function bagWindows()
  local list = {}
  if ContainerFrameCombinedBags then list[#list + 1] = ContainerFrameCombinedBags end
  for i = 1, (NUM_CONTAINER_FRAMES or 13) do
    local f = _G["ContainerFrame" .. i]
    if f then list[#list + 1] = f end
  end
  return list
end

-- ElvUI keeps its bag window's slot buttons in a table: ElvUI_ContainerFrame.Bags[bag][slot]
local function elvuiSlot(bag, slot)
  local f = _G.ElvUI_ContainerFrame
  if not (onScreen(f) and type(f.Bags) == "table") then return end
  local b = f.Bags[bag]
  local button = type(b) == "table" and b[slot]
  if type(button) == "table" and onScreen(button) then return button end
end

-- Baganator names its backpack window after the skin in use
local BAGANATOR_SKINS = { "", "blizzard", "blizzard_black", "dark", "elvui", "ndui", "gw2_ui", "ellesmereui" }

-- what /comets debug reports about ElvUI's bag window, step by step
function ns.ElvUIReport(bag, slot)
  local f = _G.ElvUI_ContainerFrame
  if not f then return "no ElvUI_ContainerFrame" end
  local parts = { "window " .. (onScreen(f) and "on screen" or "not on screen") }
  local blizz = _G.ContainerFrameCombinedBags
  if blizz and blizz:IsVisible() and not onScreen(blizz) then parts[#parts + 1] = "game's bag window shown with no position (skipped)" end
  if type(f.Bags) ~= "table" then
    parts[#parts + 1] = "no Bags table"
  else
    local b = f.Bags[bag]
    if type(b) ~= "table" then
      parts[#parts + 1] = "no bag " .. bag
    else
      local button = b[slot]
      if type(button) ~= "table" then
        parts[#parts + 1] = "bag " .. bag .. " has no slot " .. slot
      else
        parts[#parts + 1] = ("slot %s, ID %s, BagID %s"):format(onScreen(button) and "on screen" or (button.IsVisible and button:IsVisible() and "shown but not placed" or "hidden"),
          tostring(button.GetID and button:GetID()), tostring(button.BagID))
      end
    end
  end
  return table.concat(parts, ", ")
end

-- Bag addons' windows to search: Bagnon's inventory, Baganator's backpack (bag view or category view), and
-- ElvUI's bag window again (in case its slot table isn't laid out as expected)
local function addonWindows()
  local list = {}
  local elv = _G.ElvUI_ContainerFrame
  if onScreen(elv) then list[#list + 1] = elv end
  local frames = Bagnon and Bagnon.Frames
  if frames and frames.Get then
    local ok, f = pcall(frames.Get, frames, "inventory")
    if ok and type(f) == "table" and f[0] and onScreen(f) then list[#list + 1] = f end
  end
  for _, skin in ipairs(BAGANATOR_SKINS) do
    for _, view in ipairs({ "Baganator_SingleViewBackpackViewFrame", "Baganator_CategoryViewBackpackViewFrame" }) do
      local f = _G[view .. skin]
      if onScreen(f) then list[#list + 1] = f end
    end
  end
  return list
end

-- is this the item button for bag, slot? Bagnon keeps the bag in .bag; Baganator uses the game's GetBagID().
-- The slot is the button's ID in both. (Bagnon's bag-bar buttons also have GetBagID, as GetID: skipped.)
local function isSlot(button, bag, slot)
  if not (button.GetID and button:GetID() == slot) or button.GetBagID == button.GetID then return false end
  if button.bag ~= nil then return button.bag == bag end
  if button.BagID ~= nil then return button.BagID == bag end -- ElvUI
  if button.GetBagID then
    local ok, b = pcall(button.GetBagID, button)
    return ok and b == bag
  end
  return false
end

local function findIn(frame, bag, slot, depth)
  if depth > 8 or not frame.GetChildren then return end
  for _, child in ipairs({ frame:GetChildren() }) do
    if child:IsVisible() then
      if isSlot(child, bag, slot) and onScreen(child) then return child end
      local found = findIn(child, bag, slot, depth + 1)
      if found then return found end
    end
  end
end

-- the item button showing this bag slot, when a bag window is open
function ns.SlotButton(bag, slot)
  local found
  for _, frame in ipairs(bagWindows()) do
    eachButton(frame, function(button)
      if onScreen(button) and button:GetID() == slot and bagOf(button) == bag then
        found = button
        return true
      end
    end)
    if found then return found end
  end
  found = elvuiSlot(bag, slot)
  if found then return found end
  for _, frame in ipairs(addonWindows()) do
    found = findIn(frame, bag, slot, 1)
    if found then return found end
  end
end

-- the button for a whole bag on the bag bar: the backpack, the four bag slots, the reagent bag
function ns.BagButton(bag)
  if bag == 0 then return MainMenuBarBackpackButton end
  if bag >= 1 and bag <= 4 then return _G["CharacterBag" .. (bag - 1) .. "Slot"] end
  return _G["CharacterReagentBag" .. (bag - 5) .. "Slot"]
end

-- Where a comet for this bag slot lands: x, y, the width of what it lands on, and a name for /comets debug.
function ns.Landing(bag, slot)
  local x, y, w = centre(ns.SlotButton(bag, slot))
  if x then return x, y, w, "slot" end
  x, y, w = centre(ns.BagButton(bag))
  if x then return x, y, w, "bag button" end
  x, y, w = centre(MainMenuBarBackpackButton)
  if x then return x, y, w, "backpack" end
  -- no bag bar on screen (hidden by another addon): the bottom right corner, where it usually is
  return UIParent:GetWidth() - 60, 60, 36, "corner"
end

-- Where coin comets land: the money shown in your open bag window (ElvUI, Bagnon, Baganator or the game's),
-- else the backpack button, else the corner. Returns x, y, a width for the flash, and a name for /comets debug.
function ns.MoneyLanding()
  local candidates = {}
  local elv = _G.ElvUI_ContainerFrame
  if onScreen(elv) then candidates[#candidates + 1] = { elv.goldText, "ElvUI money" } end
  local frames = Bagnon and Bagnon.Frames
  if frames and frames.Get then
    local ok, f = pcall(frames.Get, frames, "inventory")
    if ok and type(f) == "table" and f[0] and onScreen(f) then candidates[#candidates + 1] = { rawget(f, "MoneyFrame"), "Bagnon money" } end
  end
  for _, skin in ipairs(BAGANATOR_SKINS) do
    for _, view in ipairs({ "Baganator_SingleViewBackpackViewFrame", "Baganator_CategoryViewBackpackViewFrame" }) do
      local f = _G[view .. skin]
      if onScreen(f) and f.CurrencyWidget then candidates[#candidates + 1] = { f.CurrencyWidget.Money, "Baganator money" } end
    end
  end
  local combined = _G.ContainerFrameCombinedBags
  candidates[#candidates + 1] = { combined and combined.MoneyFrame, "bag money" }
  local backpack = _G.ContainerFrame1
  candidates[#candidates + 1] = { (backpack and backpack.MoneyFrame) or _G.ContainerFrame1MoneyFrame, "backpack money" }
  for _, c in ipairs(candidates) do
    if onScreen(c[1]) then
      local x, y = centre(c[1])
      if x then return x, y, 28, c[2] end
    end
  end
  local x, y, _, to = ns.Landing(0, nil)
  return x, y, 28, to
end

---------------------------------------------------------------------------------------------------
-- Launch: the loot window's row, else where you clicked the corpse, else the window you got it from

local loot = { at = -100, x = nil, y = nil, rows = {} }

-- the loot window's row for a loot slot (modern list, or the older numbered buttons)
local function lootRow(slot)
  local found
  local box = LootFrame and LootFrame.ScrollBox
  if box and box.ForEachFrame then
    pcall(box.ForEachFrame, box, function(frame, data)
      local s = (type(data) == "table" and (data.slotIndex or data.slot)) or (frame.GetSlotIndex and frame:GetSlotIndex())
      if s == slot then found = frame end
    end)
    if found then return found end
  end
  for i = 1, (LOOTFRAME_NUMBUTTONS or 4) do
    local b = _G["LootButton" .. i]
    if b and b.slot == slot and b:IsVisible() then return b end
  end
end

local function itemID(link)
  return link and tonumber(link:match("item:(%d+)"))
end

-- At LOOT_OPENED: the cursor (it's on the corpse you clicked) and, once the loot window has drawn its rows,
-- where each item sits in it.
function ns.OnLootOpened()
  loot.at = GetTime()
  loot.rows = {}
  local cx, cy = GetCursorPosition()
  local s = UIParent:GetEffectiveScale()
  loot.x, loot.y = cx / s, cy / s
  local function rows()
    if not GetNumLootItems then return end
    local MONEY = (Enum and Enum.LootSlotType and Enum.LootSlotType.Money) or LOOT_SLOT_MONEY or 2
    for slot = 1, GetNumLootItems() do
      local id = itemID(GetLootSlotLink and GetLootSlotLink(slot))
      if not id and GetLootSlotType and GetLootSlotType(slot) == MONEY then id = "money" end -- the coins' row
      local x, y = centre(lootRow(slot))
      if id and x and not loot.rows[id] then loot.rows[id] = { x = x, y = y } end
    end
  end
  pcall(rows)
  C_Timer.After(0, function() pcall(rows) end)
end

function ns.OnLootClosed()
  loot.at = GetTime() -- items can reach the bags a moment after the window closes
end

-- windows you get items from, checked in this order
local SOURCES = { "MerchantFrame", "QuestFrame", "OpenMailFrame", "MailFrame", "TradeFrame", "ProfessionsFrame",
  "TradeSkillFrame" }

-- Where a comet for this item starts: x, y and a name for /comets debug.
function ns.Launch(id)
  if GetTime() - loot.at < 2.5 then
    local row = loot.rows[id]
    if row then return row.x, row.y, "loot window" end
    if loot.x then return loot.x, loot.y, "corpse" end
  end
  for _, name in ipairs(SOURCES) do
    local x, y = centre(_G[name])
    if x then return x, y, name end
  end
  -- your character: a little below the middle of the screen
  return UIParent:GetWidth() / 2, UIParent:GetHeight() * 0.42, "character"
end
