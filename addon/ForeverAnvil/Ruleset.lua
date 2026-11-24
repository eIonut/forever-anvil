-- Ruleset picker: a small window that asks which ruleset this realm is. Each Forever ruleset has its own auction
-- houses, and the game doesn't tell addons which one you're on (nor does the realm name, nor Blizzard's API).
-- It opens:
--   by itself   once a session while this realm has none: a few seconds after login, or at the auction house
--   on a click  the minimap button or addon compartment (while none is set), the menu's status line,
--               /fa ruleset, /fa, and the prices and upgrades windows when they open without one
-- One click saves it for the realm (ForeverAnvilDB.realms, like /fa ruleset <name> and the settings page).
-- "Later" (or Esc, or the close button) leaves it until the next login.
local _, ns = ...
local M = ns.Math
local L = ns.L

local GOLD = "|cffe6a23c"
local WIDTH = 300
local PAD = 14
local BTN_W, BTN_H, GAP = (WIDTH - 2 * PAD - 8) / 2, 26, 8

local picker
local offered = false -- shown by itself this session

local function layout(fr)
  local y = -56 - fr.help:GetStringHeight() - 12
  for i, b in ipairs(fr.buttons) do
    local col, row = (i - 1) % 2, math.floor((i - 1) / 2)
    b:ClearAllPoints()
    b:SetPoint("TOPLEFT", PAD + col * (BTN_W + GAP), y - row * (BTN_H + 6))
  end
  y = y - math.ceil(#fr.buttons / 2) * (BTN_H + 6) - 4
  fr.status:ClearAllPoints()
  fr.status:SetPoint("TOPLEFT", PAD, y)
  if fr.status:GetText() and fr.status:GetText() ~= "" then y = y - fr.status:GetStringHeight() - 6 end
  fr.note:ClearAllPoints()
  fr.note:SetPoint("TOPLEFT", PAD, y)
  if fr.note:IsShown() then y = y - fr.note:GetStringHeight() - 6 end
  if fr.later:IsShown() then y = y - 28 end
  fr:SetHeight(-y + 10)
end

local function build()
  local fr = CreateFrame("Frame", "ForeverAnvilRuleset", UIParent, BackdropTemplateMixin and "BackdropTemplate" or nil)
  fr:SetSize(WIDTH, 200)
  fr:SetFrameStrata("DIALOG")
  fr:SetToplevel(true)
  fr:SetClampedToScreen(true)
  fr:EnableMouse(true)
  fr:SetMovable(true)
  fr:RegisterForDrag("LeftButton")
  fr:SetScript("OnDragStart", fr.StartMoving)
  fr:SetScript("OnDragStop", fr.StopMovingOrSizing)
  if fr.SetBackdrop then
    fr:SetBackdrop({ bgFile = "Interface\\Tooltips\\UI-Tooltip-Background", edgeFile = "Interface\\Tooltips\\UI-Tooltip-Border",
      tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
    fr:SetBackdropColor(0.07, 0.05, 0.03, 0.96)
    fr:SetBackdropBorderColor(0.76, 0.6, 0.29, 1)
  end
  tinsert(UISpecialFrames, "ForeverAnvilRuleset") -- Esc closes it

  local logo = fr:CreateTexture(nil, "ARTWORK")
  logo:SetSize(34, 34)
  logo:SetPoint("TOPLEFT", 12, -12)
  logo:SetTexture(ns.ICON)
  local title = fr:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -1)
  title:SetText(GOLD .. "Forever Anvil|r")
  local question = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
  question:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -3)
  question:SetText(L["Which ruleset are you playing?"])
  local close = CreateFrame("Button", nil, fr, "UIPanelCloseButton")
  close:SetSize(24, 24)
  close:SetPoint("TOPRIGHT", -4, -4)

  fr.help = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.help:SetPoint("TOPLEFT", PAD, -56)
  fr.help:SetWidth(WIDTH - 2 * PAD)
  fr.help:SetJustifyH("LEFT")
  fr.help:SetText("|cffbbbbbb" .. L["Pick the one you chose on the login screen. Each ruleset has its own auction houses, so the prices depend on it."] .. "|r")

  fr.buttons = {}
  for _, r in ipairs(ns.data.rulesets) do
    local b = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
    b:SetSize(BTN_W, BTN_H)
    b:SetText(r.name .. (r.likely and "?" or ""))
    b.ruleset = r
    b:SetScript("OnClick", function()
      ns.Safe("ruleset", function()
        if not ns.SetRuleset(r.name) then return end
        local id, rr, side = ns.House()
        if id then ns.Print(L["%s %s auction house (%s), prices from %s."]:format(rr.name, L[side], ns.regionCode, M.Age(ns.DataAge()))) end
        fr:Hide()
      end)
    end)
    fr.buttons[#fr.buttons + 1] = b
  end

  fr.status = fr:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  fr.status:SetWidth(WIDTH - 2 * PAD)
  fr.status:SetJustifyH("LEFT")
  fr.note = fr:CreateFontString(nil, "ARTWORK", "GameFontDisableSmall")
  fr.note:SetWidth(WIDTH - 2 * PAD)
  fr.note:SetJustifyH("LEFT")
  fr.note:SetText(L["? not confirmed in game yet for this region"])

  fr.later = CreateFrame("Button", nil, fr, "UIPanelButtonTemplate")
  fr.later:SetSize(90, 22)
  fr.later:SetPoint("BOTTOMRIGHT", -PAD, 10)
  fr.later:SetText(L["Later"])
  fr.later:SetScript("OnClick", function() fr:Hide() end)

  function fr.refresh()
    local current = ns.Ruleset()
    local likely = false
    for _, b in ipairs(fr.buttons) do
      if b.ruleset == current then b:LockHighlight() else b:UnlockHighlight() end
      likely = likely or b.ruleset.likely == true
    end
    local id, r, side = ns.House()
    fr.status:SetText(id and L["%s, %s auction house. Prices from %s."]:format(r.name, L[side], M.Age(ns.DataAge())) or "")
    fr.note:SetShown(likely)
    fr.later:SetShown(current == nil)
    layout(fr)
  end
  fr:SetScript("OnShow", function() ns.Safe("ruleset", fr.refresh) end)
  fr:Hide() -- a new frame starts out shown: hide it, so opening it runs OnShow (draws it)
  return fr
end

-- Opens the picker beside anchor (the minimap button, …), or near the top of the screen. False without data.
function ns.ShowRulesetPicker(anchor)
  if not (ns.data and ns.data.rulesets and #ns.data.rulesets > 0) then return false end
  picker = picker or build()
  if anchor and ns.PlaceBeside then
    ns.PlaceBeside(picker, anchor)
  else
    picker:ClearAllPoints()
    picker:SetPoint("TOP", UIParent, "TOP", 0, -160)
  end
  if picker:IsShown() then picker.refresh() else picker:Show() end
  return true
end

function ns.RulesetPickerShown() return picker ~= nil and picker:IsShown() end

-- Opens it by itself, once a session, while this realm has no ruleset; after `delay` seconds, and not mid-fight.
function ns.OfferRulesetPicker(delay)
  if offered or not ns.data or ns.Ruleset() then return end
  offered = true
  local function show()
    if not ns.Ruleset() then ns.ShowRulesetPicker() end
  end
  local function soon()
    if InCombatLockdown and InCombatLockdown() then
      local wait = CreateFrame("Frame")
      wait:RegisterEvent("PLAYER_REGEN_ENABLED")
      wait:SetScript("OnEvent", function(self) self:UnregisterAllEvents(); ns.Safe("ruleset", show) end)
    else
      show()
    end
  end
  if delay and delay > 0 and C_Timer and C_Timer.After then
    C_Timer.After(delay, function() ns.Safe("ruleset", soon) end)
  else
    soon()
  end
end

-- The ruleset changed (picker, settings, /fa ruleset): everything that shows prices draws again.
function ns.OnRulesetChanged()
  if picker and picker:IsShown() then picker.refresh() end
  if ns.RefreshMenu then ns.RefreshMenu() end
  if ns.RefreshBagMarks then ns.RefreshBagMarks() end
  local panel = ns.OptionsPanel and ns.OptionsPanel()
  if panel and panel:IsShown() and panel.refresh then ns.Safe("options", panel.refresh) end
  for _, name in ipairs({ "ForeverAnvilPrices", "ForeverAnvilUpgrades", "ForeverAnvilBags" }) do
    local w = _G[name]
    local fn = w and w:IsShown() and w:GetScript("OnShow")
    if fn then ns.Safe(name, fn, w) end
  end
end
