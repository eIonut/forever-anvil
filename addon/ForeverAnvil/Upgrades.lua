-- Upgrades window (version 2.2): gear on your auction house and the neutral one that's better for your spec
-- than what you wear, slot by slot, within a budget. The spec comes from your talents (the tree with the most
-- points) or your pick; items are scored by their stats (read from the game, which loads them as needed)
-- with that spec's weights (M.SPECS). Gear made for other specs is left out unless you ask for it.
-- Without the game's item stats it falls back to item level, like the site's finder (M.FindUpgrades).
-- /fa upgrades, or "Upgrades for you" in the minimap menu.
local _, ns = ...
local M = ns.Math
local L = ns.L

local ROWS, ROW_H, WIDTH = 18, 20, 520
local BUDGETS = { 10000, 50000, 200000, 1000000, 0 } -- 1g, 5g, 20g, 100g, any price
local SLOT_TITLE = { HEAD = "Head", NECK = "Neck", SHOULDER = "Shoulders", BACK = "Back", CHEST = "Chest", WRIST = "Wrists",
  HANDS = "Hands", WAIST = "Waist", LEGS = "Legs", FEET = "Feet", FINGER = "Ring", TRINKET = "Trinket", MAIN_HAND = "Main hand",
  OFF_HAND = "Off hand", RANGED = "Ranged" }
local STAT_SHORT = { str = "Str", agi = "Agi", sta = "Sta", int = "Int", spi = "Spi", ap = "AP", rap = "RAP", sp = "SP", heal = "Heal",
  crit = "Crit", hit = "Hit", def = "Def", dodge = "Dodge", parry = "Parry", block = "Block", mp5 = "MP5" }
local PERCENT = { crit = true, hit = true, dodge = true, parry = true }
local win

-- the houses you can buy from: yours and the neutral one (Blackwater)
local function houses()
  local _, r, side = ns.House()
  if not r then return {} end
  local out = {}
  for _, s in ipairs({ side ~= "neutral" and side or nil, "neutral" }) do
    if s and r[s] then out[#out + 1] = { items = ns.HouseItems(r[s]), side = s } end
  end
  return out
end

---------------------------------------------------------------------------------------------------
-- Item stats from the game. An item it hasn't loaded yet is asked for, and asked again every few seconds while
-- the window waits (GET_ITEM_INFO_RECEIVED and the window's own retry redraw); after a few tries without an
-- answer it's left out (false), so the window can't stay on "loading" for good.
local RETRY_AFTER, MAX_TRIES = 3, 4
local statCache, asked = {}, {} -- asked[id] = { when it was last asked for, how many times }
local function getStats() return (C_Item and C_Item.GetItemStats) or GetItemStats end
local function now() return (GetTime and GetTime()) or time() end

local function statsOf(id)
  local s = statCache[id]
  if s ~= nil then return s end
  local _, link = ns.ItemInfo(id)
  if not link then
    local a, t = asked[id], now()
    if not a or t - a[1] >= RETRY_AFTER then
      if a and a[2] >= MAX_TRIES then statCache[id] = false; return false end
      asked[id] = { t, (a and a[2] or 0) + 1 }
      if C_Item and C_Item.RequestLoadItemDataByID then pcall(C_Item.RequestLoadItemDataByID, id) end
    end
    return nil
  end
  local ok, raw = pcall(getStats(), link)
  s = M.ParseItemStats(ok and raw or nil)
  statCache[id] = s
  return s
end

-- talent points per tree: { tree1, tree2, tree3 }
local function talentPoints()
  local pts = {}
  local n = (GetNumTalentTabs and GetNumTalentTabs()) or 0
  for i = 1, math.min(n, 3) do
    local r = { pcall(GetTalentTabInfo, i) }
    -- classic: name, icon, pointsSpent; later clients: id, name, description, icon, pointsSpent
    if r[1] then pts[i] = tonumber(type(r[2]) == "number" and r[6] or r[4]) or 0 end
  end
  return pts
end

-- your class, the spec to gear for (1-3), whether it comes from your talents, its name and weights
function ns.Spec()
  local _, cls = UnitClass("player")
  cls = (cls or ""):lower()
  local specs = M.SPECS[cls]
  if not specs then return cls end
  ns.db.upgradeSpec = ns.db.upgradeSpec or {}
  local chosen = ns.db.upgradeSpec[cls]
  local auto = M.SpecIndex(cls, talentPoints())
  local index = chosen or auto
  return cls, index, chosen == nil, specs[index + 1][1], specs[index + 1][2], auto
end

-- your upgrades right now: slots, items still loading, items left out as gear for other specs, and whether
-- they're ranked by stats (false: by item level, when the game can't give item stats)
function ns.FindUpgrades(budget, perSlot, showAll)
  local cls, index, _, _, weights = ns.Spec()
  local level = UnitLevel("player") or 1
  local opts = { maxPrice = (budget and budget > 0) and budget or nil, perSlot = perSlot or 3, showAll = showAll }
  if not (index and getStats()) then
    return M.FindUpgrades(ns.Gear(), cls, level, houses(), ns.GearOnSale, opts), 0, 0, false
  end
  local slots, pending, off = M.SpecUpgrades(ns.Gear(), cls, level, houses(), ns.GearOnSale, statsOf, weights, opts)
  return slots, pending, off, true
end

-- "+12 Agi +8 Sta" for an item's stats that count for the spec
local function statLine(stats, weights)
  local parts = {}
  for _, s in ipairs(M.KeyStats(stats, weights, 3)) do
    parts[#parts + 1] = "+" .. s[2] .. (PERCENT[s[1]] and "% " or " ") .. L[STAT_SHORT[s[1]]]
  end
  return table.concat(parts, " ")
end

---------------------------------------------------------------------------------------------------
local function draw()
  local cls, index, auto, specName, weights, autoIndex = ns.Spec()
  local slots, pending, off, byStats = ns.FindUpgrades(ns.db.upgradeBudget, 3, ns.db.upgradeShowAll)
  local list, nOptions = {}, 0
  for _, s in ipairs(slots) do
    list[#list + 1] = { head = true, slot = s.slot, wearing = s.wearing }
    for _, o in ipairs(s.options) do list[#list + 1] = o; nOptions = nOptions + 1 end
  end
  local max = math.max(0, #list - ROWS)
  if win.offset > max then win.offset = max end
  if win.offset < 0 then win.offset = 0 end
  for i, b in ipairs(win.rows) do
    local e = list[win.offset + i]
    b.itemID = e and (e.head and (e.wearing and e.wearing.id) or e.id) or nil
    if not e then
      b:Hide()
    elseif e.head then
      b.head:Show()
      b.icon:ClearAllPoints()
      b.icon:SetPoint("LEFT", 82, 0)
      b.name:ClearAllPoints()
      b.name:SetPoint("LEFT", 104, 0)
      b.name:SetWidth(132)
      b.slot:SetText(L[SLOT_TITLE[e.slot]])
      if e.wearing then
        local name, quality, icon = ns.ItemMeta(e.wearing.id)
        b.icon:SetTexture(icon)
        b.icon:Show()
        b.name:SetText("|cff" .. ns.QualityHex(quality) .. (name or "") .. "|r")
        b.stats:SetText("|cff999999" .. ((byStats and weights) and statLine(statsOf(e.wearing.id), weights) or L["ilvl %d"]:format(e.wearing.ilvl or 0)) .. "|r")
      else
        b.icon:Hide()
        b.name:SetText("|cff999999" .. L["nothing worn"] .. "|r")
        b.stats:SetText("")
      end
      b.req:SetText("")
      b.price:SetText("")
      b:Show()
    else
      b.head:Hide()
      b.slot:SetText("")
      b.icon:ClearAllPoints()
      b.icon:SetPoint("LEFT", 14, 0)
      b.name:ClearAllPoints()
      b.name:SetPoint("LEFT", 36, 0)
      b.name:SetWidth(200)
      local name, quality, icon = ns.ItemMeta(e.id)
      b.icon:SetTexture(icon)
      b.icon:Show()
      b.name:SetText("|cff" .. ns.QualityHex(quality) .. (name or ("item " .. e.id)) .. "|r"
        .. (e.side == "neutral" and ("  |cff999999" .. L["Blackwater"] .. "|r") or ""))
      if e.random then
        b.stats:SetText("|cff999999" .. L["random stats"] .. " · " .. L["ilvl %d"]:format(e.ilvl) .. "|r")
      elseif e.stats then
        b.stats:SetText("|cff33dd55" .. statLine(e.stats, weights) .. "|r")
      else
        b.stats:SetText("|cff33dd55+" .. e.gain .. "|r |cff999999" .. L["ilvl %d"]:format(e.ilvl) .. "|r")
      end
      b.req:SetText(e.req > 1 and ("|cff999999" .. L["level %d"]:format(e.req) .. "|r") or "")
      b.price:SetText(M.ShortMoney(e.price, true))
      b:Show()
    end
  end

  for _, b in ipairs(win.budgets) do
    if b.value == (ns.db.upgradeBudget or 0) then b:LockHighlight() else b:UnlockHighlight() end
  end
  local specs = M.SPECS[cls]
  for i, b in ipairs(win.specs) do
    if specs then
      b:SetText(L[specs[i + 1][1]] .. (i == autoIndex and " *" or ""))
      b:Show()
      if i == index then b:LockHighlight() else b:UnlockHighlight() end
    else
      b:Hide()
    end
  end
  win.showAll:SetChecked(ns.db.upgradeShowAll and true or false)

  local _, r, side = ns.House()
  win.who:SetText(L["Level %d %s"]:format(UnitLevel("player") or 1, (UnitClass("player")) or "")
    .. (specName and ("  |cffffffff" .. L[specName] .. "|r |cff999999(" .. (auto and L["from your talents"] or L["your pick"]) .. ")|r") or ""))
  local bits = {}
  if not byStats then bits[#bits + 1] = L["ranked by item level"] end
  if off > 0 then bits[#bits + 1] = L["%d for other specs hidden"]:format(off) end
  if pending > 0 then bits[#bits + 1] = L["loading %d items"]:format(pending) end
  bits[#bits + 1] = L["prices %s"]:format(M.Age(ns.DataAge()))
  local extra = "  |cff999999" .. table.concat(bits, " · ") .. "|r"
  if not r then
    win.total:SetText("|cffff5555" .. L["Set your realm's ruleset first: |cffffffff/fa ruleset PvP|r (or Normal, Roleplay, RP-PvP)."] .. "|r")
  elseif #slots == 0 then
    win.total:SetText("|cff999999" .. (pending > 0 and L["Loading item stats…"] or L["No upgrades on sale within this budget. Try a bigger one."]) .. "|r" .. extra)
  else
    win.total:SetText(L["%d upgrades for %d slots"]:format(nOptions, #slots) .. extra)
  end
  -- an empty list says why, in the middle of the window: still loading, no ruleset, or nothing in budget
  if #list > 0 then
    win.empty:SetText("")
  elseif not r then
    win.empty:SetText(L["Pick this realm's ruleset to see upgrades."])
  elseif pending > 0 then
    win.empty:SetText(L["Getting the gear on sale from the game…"] .. "\n|cff999999" .. L["%d items to go. Upgrades show up here as they arrive."]:format(pending) .. "|r")
  else
    win.empty:SetText(L["No upgrades on sale within this budget. Try a bigger one."])
  end
  -- while items are loading, look again in a second (asks again for any the game hasn't sent)
  if pending > 0 and not win.retrying and C_Timer and C_Timer.After then
    win.retrying = true
    C_Timer.After(1, function()
      win.retrying = false
      if win:IsShown() then ns.Safe("upgrades", draw) end
    end)
  end
  win.where:SetText("|cff999999" .. (r and L["%s %s auction house and Blackwater"]:format(r.name, L[side]) or "") .. "|r")
end

local function build()
  local fr = CreateFrame("Frame", "ForeverAnvilUpgrades", UIParent, "BasicFrameTemplateWithInset")
  fr:SetSize(WIDTH, 120 + ROWS * ROW_H + 50)
  fr:SetFrameStrata("MEDIUM")
  fr:SetToplevel(true)
  fr:SetMovable(true)
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", function(self)
    self:StopMovingOrSizing()
    local point, _, rel, px, py = self:GetPoint()
    ns.db.upgradesPos = { point, rel, px, py }
  end)
  local pos = ns.db.upgradesPos
  if pos then fr:SetPoint(pos[1], UIParent, pos[2], pos[3], pos[4]) else fr:SetPoint("CENTER", 120, 0) end
  if fr.TitleText then fr.TitleText:SetText(L["Upgrades for you"]) end
  tinsert(UISpecialFrames, "ForeverAnvilUpgrades")
  win = fr
  fr.offset = 0

  fr.who = fr:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fr.who:SetPoint("TOPLEFT", 16, -32)
  fr.who:SetJustifyH("LEFT")
  fr.where = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.where:SetPoint("TOPRIGHT", -16, -34)
  fr.where:SetJustifyH("RIGHT")

  local function label(text, y)
    local fs = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
    fs:SetPoint("TOPLEFT", 16, y)
    fs:SetWidth(56)
    fs:SetJustifyH("LEFT")
    fs:SetText(text)
    return fs
  end

  -- spec: from your talents (marked *), or your pick
  local specLabel = label(L["Spec"], -58)
  fr.specs = {}
  local prev = specLabel
  for i = 1, 3 do
    local b = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
    b:SetSize(128, 20)
    b:SetPoint("LEFT", prev, "RIGHT", 4, 0)
    b.index = i
    b:SetScript("OnClick", function(self)
      local cls, _, _, _, _, autoIndex = ns.Spec()
      ns.db.upgradeSpec[cls] = (self.index ~= autoIndex) and self.index or nil
      fr.offset = 0
      ns.Safe("upgrades", draw)
    end)
    b:SetScript("OnEnter", function(self)
      GameTooltip:SetOwner(self, "ANCHOR_TOP")
      GameTooltip:AddLine(L["Gear for this spec"])
      GameTooltip:AddLine(L["* is the spec your talents point to. Pick another to gear for it; pick * again to follow your talents."], 1, 1, 1, true)
      GameTooltip:Show()
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    fr.specs[i] = b
    prev = b
  end

  -- budget
  local budgetLabel = label(L["Budget"], -82)
  fr.budgets = {}
  prev = budgetLabel
  for _, v in ipairs(BUDGETS) do
    local b = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
    b:SetSize(v == 0 and 84 or 52, 20)
    b:SetPoint("LEFT", prev, "RIGHT", 4, 0)
    b:SetText(v == 0 and L["Any price"] or M.ShortMoney(v, true))
    b.value = v
    b:SetScript("OnClick", function(self)
      ns.db.upgradeBudget = self.value
      fr.offset = 0
      ns.Safe("upgrades", draw)
    end)
    fr.budgets[#fr.budgets + 1] = b
    prev = b
  end
  -- gear for other specs: hidden unless you ask
  local all = CreateFrame("CheckButton", nil, fr, "UICheckButtonTemplate")
  all:SetSize(22, 22)
  all:SetPoint("LEFT", prev, "RIGHT", 10, 0)
  all:SetScript("OnClick", function(self)
    ns.db.upgradeShowAll = self:GetChecked() and true or false
    fr.offset = 0
    ns.Safe("upgrades", draw)
  end)
  local allLabel = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  allLabel:SetPoint("LEFT", all, "RIGHT", 0, 0)
  allLabel:SetText(L["other specs too"])
  fr.showAll = all

  local area = CreateFrame("Frame", nil, fr)
  area:SetPoint("TOPLEFT", 14, -108)
  area:SetSize(WIDTH - 28, ROWS * ROW_H)
  area:EnableMouseWheel(true)
  area:SetScript("OnMouseWheel", function(_, delta)
    fr.offset = fr.offset - delta * 3
    ns.Safe("upgrades", draw)
  end)
  fr.rows = {}
  for i = 1, ROWS do
    local b = CreateFrame("Button", nil, area)
    b:SetSize(WIDTH - 28, ROW_H)
    b:SetPoint("TOPLEFT", 0, -(i - 1) * ROW_H)
    b.head = b:CreateTexture(nil, "BACKGROUND")
    b.head:SetAllPoints()
    b.head:SetColorTexture(1, 0.82, 0, 0.1)
    local hl = b:CreateTexture(nil, "HIGHLIGHT")
    hl:SetAllPoints()
    hl:SetColorTexture(1, 1, 1, 0.1)
    b.slot = b:CreateFontString(nil, "ARTWORK", "GameFontNormal")
    b.slot:SetPoint("LEFT", 4, 0) -- headings: the slot, then what you wear there
    b.slot:SetWidth(76)
    b.slot:SetJustifyH("LEFT")
    b.slot:SetWordWrap(false)
    b.icon = b:CreateTexture(nil, "ARTWORK")
    b.icon:SetSize(18, 18)
    b.icon:SetTexCoord(0.07, 0.93, 0.07, 0.93)
    b.name = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.name:SetJustifyH("LEFT")
    b.name:SetWordWrap(false)
    b.stats = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.stats:SetPoint("LEFT", 240, 0)
    b.stats:SetWidth(150)
    b.stats:SetJustifyH("LEFT")
    b.stats:SetWordWrap(false)
    b.req = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.req:SetPoint("LEFT", 392, 0)
    b.req:SetWidth(50)
    b.req:SetJustifyH("LEFT")
    b.price = b:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
    b.price:SetPoint("RIGHT", -2, 0)
    b.price:SetWidth(52)
    b.price:SetJustifyH("RIGHT")
    -- click: search the auction house; Shift: link in chat; Ctrl: try it on
    b:SetScript("OnClick", function(self)
      if not self.itemID then return end
      local link = select(2, ns.ItemInfo(self.itemID))
      if link and IsModifiedClick and IsModifiedClick() and HandleModifiedItemClick then HandleModifiedItemClick(link); return end
      if ns.SearchAuction then ns.SearchAuction(self.itemID) end
    end)
    b:SetScript("OnEnter", function(self)
      if not self.itemID then return end
      GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
      GameTooltip:SetItemByID(self.itemID)
      GameTooltip:Show()
    end)
    b:SetScript("OnLeave", function() GameTooltip:Hide() end)
    fr.rows[i] = b
  end

  fr.empty = area:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fr.empty:SetPoint("CENTER", 0, 20)
  fr.empty:SetWidth(WIDTH - 80)
  fr.empty:SetJustifyH("CENTER")

  fr.total = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalSmall")
  fr.total:SetPoint("BOTTOMLEFT", 16, 30)
  fr.total:SetPoint("BOTTOMRIGHT", -16, 30)
  fr.total:SetJustifyH("LEFT")
  local hint = fr:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  hint:SetPoint("BOTTOMLEFT", 16, 12)
  hint:SetPoint("BOTTOMRIGHT", -16, 12)
  hint:SetJustifyH("LEFT")
  hint:SetText(L["Ranked by your spec's stats, roughly: read the tooltip. Click to search, Ctrl-click to try on."])
  fr:SetScript("OnShow", function() ns.Safe("upgrades", draw) end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

function ns.ShowUpgrades(on)
  win = win or build()
  if on == nil then on = not win:IsShown() end
  if on then win:Show() else win:Hide() end
  if on and ns.data and not ns.Ruleset() and ns.ShowRulesetPicker then ns.ShowRulesetPicker() end -- prices need it
end

function ns.UpgradesShown() return win ~= nil and win:IsShown() end

-- for the menu: how many slots have an upgrade within your budget
function ns.UpgradeCount()
  local slots, pending = ns.FindUpgrades(ns.db.upgradeBudget, 1, ns.db.upgradeShowAll)
  return #slots, pending -- and how many items are still loading
end

-- gear, level or talents changed, or item stats arrived: redraw an open window (once per burst)
local events, pending = CreateFrame("Frame"), false
for _, e in ipairs({ "PLAYER_EQUIPMENT_CHANGED", "PLAYER_LEVEL_UP", "CHARACTER_POINTS_CHANGED", "PLAYER_TALENT_UPDATE", "GET_ITEM_INFO_RECEIVED" }) do
  pcall(events.RegisterEvent, events, e)
end
pcall(events.RegisterEvent, events, "PLAYER_LOGIN")
events:SetScript("OnEvent", function(_, event)
  if event == "PLAYER_LOGIN" then
    -- ask the game for the gear on sale in the background, so the window has it when you open it
    if C_Timer and C_Timer.After then
      C_Timer.After(20, function() if ns.data then ns.Safe("upgrades", ns.UpgradeCount) end end)
    end
    return
  end
  if pending or not (win and win:IsShown()) then return end
  pending = true
  local function run() pending = false; ns.Safe("upgrades", draw) end
  if C_Timer and C_Timer.After then C_Timer.After(0.4, run) else run() end
end)
