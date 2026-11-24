-- Auction house scan (2.5): read every auction on the house you're at and price items from it, so prices stay
-- current between addon updates. One request to the game (C_AuctionHouse.ReplicateItems, which the game allows
-- once every 15 minutes), then the listings are read a slice per frame so the game doesn't freeze, summed up the
-- site's way (M.Aggregate) and saved per house in ForeverAnvilDB.scans. Core.lua prefers a scan over the shipped
-- prices while it's the newer of the two (ns.ScanOf). "Scan" button under the auction house, or /fa scan.
local _, ns = ...
local M = ns.Math
local L = ns.L

local GAP = 900      -- seconds between scans the game allows
local TIMEOUT = 60   -- seconds to wait for the auctions before giving up
local SLICE = 1000   -- auctions read per frame

local state = { running = false } -- { running, house, key, started, done, total, byItem, auctions }
local button, status

local function api()
  local A = C_AuctionHouse
  return A and A.ReplicateItems and A.GetNumReplicateItems and A.GetReplicateItemInfo and A
end

local function ahOpen()
  return (AuctionHouseFrame and AuctionHouseFrame:IsShown()) or (AuctionFrame and AuctionFrame:IsShown()) or false
end

-- seconds until the game takes another scan (0: now)
function ns.ScanWait()
  local last = ns.db.lastScanRequest
  if not last then return 0 end
  return math.max(0, GAP - (time() - last))
end

local function refreshButton()
  if not button then return end
  if state.running then
    local pct = state.total and state.total > 0 and math.floor(state.done / state.total * 100) or 0
    button:SetText(L["Scanning… %d%%"]:format(pct))
    button:Disable()
  else
    button:SetText(L["Scan"])
    if api() then button:Enable() else button:Disable() end
  end
  local scan = ns.ScanOf((ns.House()))
  local wait = ns.ScanWait()
  local bits = {}
  bits[#bits + 1] = scan and L["scanned %s"]:format(M.Age(time() - scan.time)) or L["not scanned yet"]
  if wait > 0 and not state.running then bits[#bits + 1] = L["again in %d min"]:format(math.ceil(wait / 60)) end
  status:SetText("|cff999999" .. table.concat(bits, " · ") .. "|r")
end
ns.RefreshScanButton = refreshButton

local function finish(msg)
  state.running = false
  state.byItem = nil
  if msg then ns.Print(msg) end
  refreshButton()
end

-- the listings are in: read them a slice at a time, then save the house's prices
local function readSlice()
  if not state.running then return end
  if not ahOpen() then return finish(L["the scan stopped: the auction house was closed."]) end
  local A = api()
  local last = math.min(state.total, state.done + SLICE)
  for i = state.done, last - 1 do -- the game counts its replicate list from 0
    local _, _, count, _, _, _, _, _, _, buyout, _, _, _, _, _, _, itemID = A.GetReplicateItemInfo(i)
    count = count or 1
    if itemID and buyout and buyout > 0 and count > 0 then
      local l = state.byItem[itemID]
      if not l then l = {}; state.byItem[itemID] = l end
      l[#l + 1] = { buyout / count, count }
      state.auctions = state.auctions + 1
    end
  end
  state.done = last
  refreshButton()
  if state.done < state.total then
    C_Timer.After(0, function() ns.Safe("scan", readSlice) end)
    return
  end
  local items = M.Aggregate(state.byItem)
  local n = 0
  for _ in pairs(items) do n = n + 1 end
  if n == 0 then return finish(L["the auction house sent no auctions with a buyout. Your prices are unchanged."]) end
  ns.db.scans[state.key] = { time = time(), data = M.EncodeHouse(items), auctions = state.auctions }
  ns.houseCache[state.house] = nil
  if ns.ResetAuctionCache then ns.ResetAuctionCache() end
  local auctions = state.auctions
  finish(L["scanned %d auctions of %d items. Your prices for this auction house are from now."]:format(auctions, n))
  if ns.OnRulesetChanged then ns.Safe("scan", ns.OnRulesetChanged) end -- redraws the open windows
end

local function onListReady()
  if not state.running or state.total then return end -- the game may send it more than once
  state.total = api().GetNumReplicateItems() or 0
  state.done, state.auctions, state.byItem = 0, 0, {}
  if state.total == 0 then return finish(L["the auction house sent no auctions with a buyout. Your prices are unchanged."]) end
  readSlice()
end

-- Starts a scan; says why it can't when it can't.
function ns.StartScan()
  if state.running then ns.Print(L["a scan is already running."]); return end
  local A = api()
  if not A then ns.Print(L["this game client can't scan the auction house."]); return end
  if not ahOpen() then ns.Print(L["open the auction house to scan it."]); return end
  local house = ns.House()
  if not house then
    ns.Print(L["pick this realm's ruleset first, so the scan knows which auction house this is."])
    if ns.ShowRulesetPicker then ns.ShowRulesetPicker() end
    return
  end
  local wait = ns.ScanWait()
  if wait > 0 then ns.Print(L["the game allows one scan every 15 minutes: try again in %d min."]:format(math.ceil(wait / 60))); return end
  state = { running = true, house = house, key = ns.regionCode .. ":" .. house, started = time() }
  ns.db.lastScanRequest = time()
  A.ReplicateItems()
  refreshButton()
  local started = state.started
  C_Timer.After(TIMEOUT, function()
    if state.running and state.started == started and not state.total then
      finish(L["the auction house didn't send its auctions. Try again in 15 minutes."])
    end
  end)
end

-- for /fa debug
function ns.ScanDebug()
  local scan = ns.ScanOf((ns.House()))
  return ("scan: api %s, %s, last %s"):format(api() and "yes" or "no", state.running and ("running " .. (state.done or 0) .. "/" .. (state.total or "?")) or "idle",
    scan and (M.Age(time() - scan.time) .. ", " .. (scan.auctions or 0) .. " auctions") or "none newer than the shipped prices")
end

-- the button, under the auction house's bottom-right corner, with the scan's age beside it
local function build()
  local parent = AuctionHouseFrame or AuctionFrame
  if not parent or button then return end
  button = CreateFrame("Button", "ForeverAnvilScanButton", parent, "UIPanelButtonTemplate")
  button:SetSize(110, 22)
  button:SetPoint("TOPRIGHT", parent, "BOTTOMRIGHT", -4, -2)
  button:SetScript("OnClick", function() ns.Safe("scan", ns.StartScan) end)
  button:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:SetText(L["Scan prices"])
    GameTooltip:AddLine(L["Reads every auction on this auction house and uses those prices until an addon update brings newer ones. The game allows one scan every 15 minutes."], 1, 1, 1, true)
    GameTooltip:Show()
  end)
  button:SetScript("OnLeave", function() GameTooltip:Hide() end)
  status = button:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  button.status = status
  status:SetPoint("RIGHT", button, "LEFT", -6, 0)
  status:SetJustifyH("RIGHT")
end

local events = CreateFrame("Frame")
for _, e in ipairs({ "AUCTION_HOUSE_SHOW", "AUCTION_HOUSE_CLOSED", "REPLICATE_ITEM_LIST_UPDATE" }) do
  pcall(events.RegisterEvent, events, e) -- events this client doesn't have are skipped
end
events:SetScript("OnEvent", function(_, event)
  if event == "REPLICATE_ITEM_LIST_UPDATE" then
    ns.Safe("scan", onListReady)
  elseif event == "AUCTION_HOUSE_SHOW" then
    -- after Core.lua has worked out the house (neutral or not) on the same event
    C_Timer.After(0, function() ns.Safe("scan", function() build(); refreshButton() end) end)
  end
end)
