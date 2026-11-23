-- Loot Comets: where a comet starts and where it lands, as points on the screen (UIParent's coordinates).
-- Only reads positions of the game's frames; never changes them.
local _, ns = ...

-- The middle of a frame in UIParent's coordinates, and its width; nil when it isn't on screen.
local function centre(frame)
  if not (frame and frame.IsVisible and frame:IsVisible() and frame.GetCenter) then return end
  local x, y = frame:GetCenter()
  if not x then return end
  local s = frame:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return x * s, y * s, (frame:GetWidth() or 36) * s
end
ns.Centre = centre

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
  if not (frame and frame:IsVisible()) then return end
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

-- Bag addons' windows: their item buttons keep the bag in a .bag field and the slot as their ID (Bagnon)
local function addonWindows()
  local list = {}
  local frames = Bagnon and Bagnon.Frames
  if frames and frames.Get then
    local ok, f = pcall(frames.Get, frames, "inventory")
    if ok and type(f) == "table" and f[0] and f.IsVisible and f:IsVisible() then list[#list + 1] = f end
  end
  return list
end

local function findIn(frame, bag, slot, depth)
  if depth > 7 or not frame.GetChildren then return end
  for _, child in ipairs({ frame:GetChildren() }) do
    if child:IsVisible() then
      if child.bag == bag and child.GetID and child:GetID() == slot and child.GetBagID ~= child.GetID then return child end
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
      if button:IsVisible() and button:GetID() == slot and bagOf(button) == bag then
        found = button
        return true
      end
    end)
    if found then return found end
  end
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
    for slot = 1, GetNumLootItems() do
      local id = itemID(GetLootSlotLink and GetLootSlotLink(slot))
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
