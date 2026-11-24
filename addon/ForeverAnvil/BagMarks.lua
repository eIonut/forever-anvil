-- Sell marks (2.6): the game's auction house symbol (the auctioneer's minimap icon) on the bag slots holding items that sell best on the auction house,
-- the ones the bag value window lists as "Auction house" and has ticked. Works on the game's bag windows and
-- on bag addons (Bagnon, ElvUI, Baganator) by finding their item buttons; it only adds a texture to them.
-- Switch: "Sell marks in your bags" in the settings, or "Mark in bags" in the bag value window.
local _, ns = ...

-- the mark: the auctioneer's minimap icon (an atlas on modern clients, a file on older ones)
local ATLAS, FILE = "auctioneer", "Interface\\Minimap\\Tracking\\Auctioneer"
local marked = setmetatable({}, { __mode = "k" }) -- buttons we gave a mark texture

-- Shown AND placed somewhere: ElvUI "disables" the game's bag windows by taking away their position but
-- leaving them shown.
local function onScreen(frame)
  return frame and frame.IsVisible and frame:IsVisible() and frame.GetCenter and frame:GetCenter() ~= nil or false
end

-- the bag and slot an item button shows: the game's windows and Baganator (GetBagID), Bagnon (.bag), ElvUI
-- (.BagID); the slot is the button's ID. parentID: older game windows keep the bag in the window's ID.
local function where(button, parentID)
  if not (button.GetID and button.CreateTexture) then return end
  if button.GetBagID ~= nil and button.GetBagID == button.GetID then return end -- Bagnon's bag bar buttons
  local slot = button:GetID()
  if type(slot) ~= "number" or slot < 1 then return end
  local bag = button.bag
  if bag == nil then bag = rawget(button, "BagID") end
  if bag == nil and button.GetBagID then
    local ok, b = pcall(button.GetBagID, button)
    if ok then bag = b end
  end
  if bag == nil and parentID then
    local parent = button.GetParent and button:GetParent()
    bag = parent and parent.GetID and parent:GetID()
  end
  if type(bag) == "number" then return bag, slot end
end

-- Should this item get a mark? Unbound, ticked in the bag value window, and worth most on the auction house.
-- cache: [itemID] = true/false for one pass over the buttons.
local function sells(id, bound, cache)
  if not id or bound or ns.BagIgnored(id) then return false end
  local v = cache and cache[id]
  if v == nil then
    v = ns.BestUseOf(id, false) == "ah"
    if cache then cache[id] = v end
  end
  return v
end
ns.SellsOnAuction = sells

local function setMark(button, on)
  local t = rawget(button, "ForeverAnvilMark")
  if on then
    if not t then
      t = button:CreateTexture(nil, "OVERLAY", nil, 6)
      local atlas = t.SetAtlas and C_Texture and C_Texture.GetAtlasInfo and C_Texture.GetAtlasInfo(ATLAS)
      if atlas then t:SetAtlas(ATLAS) else t:SetTexture(FILE) end
      t:SetSize(15, 15)
      t:SetPoint("TOPRIGHT", -2, -2)
      button.ForeverAnvilMark = t
      marked[button] = true
    end
    t:Show()
  elseif t then
    t:Hide()
  end
end

-- One item button: mark it or take its mark off.
local function update(button, parentID, cache)
  local bag, slot = where(button, parentID)
  if not bag then return end
  local on = false
  if ns.db and ns.db.show.bagMarks then
    local id, bound
    local info = button.info -- Bagnon: the item it shows (another character's bags too)
    if type(info) == "table" then
      id, bound = info.itemID, info.isBound
      if id and bound == nil then
        local live, _, liveBound = ns.SlotItem(bag, slot)
        if live == id then bound = liveBound end
      end
    else
      local _
      id, _, bound = ns.SlotItem(bag, slot)
    end
    on = sells(id, bound, cache)
  end
  setMark(button, on)
end

-- the game's bag windows: the combined backpack, and one per bag
local function gameWindows()
  local list = {}
  if ContainerFrameCombinedBags then list[#list + 1] = ContainerFrameCombinedBags end
  for i = 1, (NUM_CONTAINER_FRAMES or 13) do
    local f = _G["ContainerFrame" .. i]
    if f then list[#list + 1] = f end
  end
  return list
end

-- calls fn(button) for each item button of one of the game's bag windows
local function eachGameButton(frame, fn)
  if frame.EnumerateValidItems then
    local ok = pcall(function()
      for _, button in frame:EnumerateValidItems() do fn(button) end
    end)
    if ok then return end
  end
  if type(rawget(frame, "Items")) == "table" then
    for _, button in ipairs(frame.Items) do fn(button) end
    return
  end
  local name = frame.GetName and frame:GetName()
  if name then -- older bag windows: ContainerFrame1Item1, …
    for i = 1, 40 do
      local button = _G[name .. "Item" .. i]
      if not button then break end
      fn(button)
    end
  end
end

-- Baganator names its backpack and bank windows after the skin in use
local BAGANATOR_SKINS = { "", "blizzard", "blizzard_black", "dark", "elvui", "ndui", "gw2_ui", "ellesmereui" }

-- bag addons' windows that are open: ElvUI's bags, Bagnon's inventory and bank, Baganator's backpack and bank
local function addonWindows()
  local list = {}
  for _, name in ipairs({ "ElvUI_ContainerFrame", "ElvUI_BankContainerFrame" }) do
    if onScreen(_G[name]) then list[#list + 1] = _G[name] end
  end
  local frames = Bagnon and Bagnon.Frames
  if type(frames) == "table" and frames.Get then
    for _, id in ipairs({ "inventory", "bank" }) do
      local ok, f = pcall(frames.Get, frames, id)
      if ok and type(f) == "table" and f[0] and onScreen(f) then list[#list + 1] = f end
    end
  end
  for _, skin in ipairs(BAGANATOR_SKINS) do
    for _, view in ipairs({ "Baganator_SingleViewBackpackViewFrame", "Baganator_CategoryViewBackpackViewFrame",
      "Baganator_SingleViewBankViewFrame", "Baganator_CategoryViewBankViewFrame" }) do
      local f = _G[view .. skin]
      if onScreen(f) then list[#list + 1] = f end
    end
  end
  return list
end

-- every item button inside a bag addon's window (they nest them in groups per bag)
local function walk(frame, depth, cache)
  if depth > 8 or not frame.GetChildren then return end
  for _, child in ipairs({ frame:GetChildren() }) do
    if child.IsVisible and child:IsVisible() then
      if child.GetID and (child.bag ~= nil or rawget(child, "BagID") ~= nil or child.GetBagID) then
        update(child, false, cache)
      end
      walk(child, depth + 1, cache)
    end
  end
end

local function refreshGameWindow(frame, cache)
  if not (frame and frame.IsShown and frame:IsShown()) then return end
  eachGameButton(frame, function(button) update(button, true, cache) end)
end

-- Marks every open bag window again (after a bag change, a setting, an untick, a scan). With the switch off,
-- takes every mark off.
local function refresh()
  if not (ns.db and ns.db.show.bagMarks) then
    for button in pairs(marked) do setMark(button, false) end
    return
  end
  local cache = {}
  for _, f in ipairs(gameWindows()) do refreshGameWindow(f, cache) end
  for _, f in ipairs(addonWindows()) do walk(f, 1, cache) end
end

-- once per burst of changes
local pending = false
function ns.RefreshBagMarks()
  if pending then return end
  pending = true
  local function run() pending = false; ns.Safe("marks", refresh) end
  if C_Timer and C_Timer.After then C_Timer.After(0.1, run) else run() end
end

function ns.SetBagMarks(on)
  ns.db.show.bagMarks = on and true or false
  if ns.OnSetting then ns.OnSetting("bagMarks") else ns.RefreshBagMarks() end
end

-- Hooks the windows that tell us when they draw their slots: the game's bag windows and Bagnon's item buttons.
-- Other bag addons (ElvUI, Baganator) are looked at again every second while one of their windows is open.
local function hook()
  for _, f in ipairs(gameWindows()) do
    if f.UpdateItems then hooksecurefunc(f, "UpdateItems", function(self) ns.Safe("marks", refreshGameWindow, self) end) end
    if f.HookScript then f:HookScript("OnShow", ns.RefreshBagMarks) end
  end
  if ContainerFrame_Update then
    hooksecurefunc("ContainerFrame_Update", function(frame) ns.Safe("marks", refreshGameWindow, frame) end)
  end
  local item = Bagnon and (Bagnon.Item or Bagnon.ItemSlot)
  if type(item) == "table" and item.Update then
    hooksecurefunc(item, "Update", function(self) ns.Safe("marks", update, self) end)
  end
  if C_Timer and C_Timer.NewTicker then
    C_Timer.NewTicker(1, function()
      if ns.db and ns.db.show.bagMarks and #addonWindows() > 0 then ns.Safe("marks", refresh) end
    end)
  end
end

local events = CreateFrame("Frame")
for _, e in ipairs({ "PLAYER_LOGIN", "BAG_UPDATE_DELAYED", "GET_ITEM_INFO_RECEIVED", "BANKFRAME_OPENED",
  "PLAYERBANKSLOTS_CHANGED" }) do
  pcall(events.RegisterEvent, events, e)
end
events:SetScript("OnEvent", function(_, event)
  if event == "PLAYER_LOGIN" then ns.Safe("marks", hook) end
  if ns.db and ns.db.show.bagMarks then ns.RefreshBagMarks() end
end)
