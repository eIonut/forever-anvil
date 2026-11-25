-- Gold earned today: every time this character's money goes up (loot, quests, vendor and auction sales picked
-- up from the mailbox, trades) it counts as earned, and every time it goes down as spent. Starts again at
-- midnight (your computer's clock), per character. Shown in the minimap menu and on the minimap button when
-- the "earnings" setting is on; /fa gold prints it any time.
local addonName, ns = ...
local M = ns.Math
local L = ns.L

local function today() return date("%Y-%m-%d") end

local function charKey()
  return (UnitName("player") or "?") .. "-" .. (GetRealmName() or "?")
end

-- today's record for this character (zeros once the day has changed, before the next money change)
function ns.EarnedToday()
  local rec = ns.db and ns.db.earnings and ns.db.earnings[charKey()]
  if not rec or rec.day ~= today() then return 0, 0 end
  return rec.earned or 0, rec.spent or 0
end

-- "+12g 5s" in green, or a grey "+0c", with the coin icons
function ns.EarnedText(copper)
  if copper > 0 then return "|cff33dd55+" .. M.CoinMoney(copper) .. "|r" end
  return "|cff999999+" .. M.CoinMoney(0) .. "|r"
end

-- the hover text: earned, spent, net
function ns.AddEarningsTooltip(tip)
  local earned, spent = ns.EarnedToday()
  local net = earned - spent
  tip:AddLine(L["Gold earned today"])
  tip:AddDoubleLine(L["Earned"], M.CoinMoney(earned), 1, 1, 1, 0.2, 0.87, 0.33)
  tip:AddDoubleLine(L["Spent"], M.CoinMoney(spent), 1, 1, 1, 1, 0.4, 0.4)
  tip:AddDoubleLine(L["Net"], (net > 0 and "+" or "") .. M.CoinMoney(net), 1, 1, 1, 1, 1, 1)
  tip:AddLine(L["This character, since midnight. Gold mailed between your characters counts too."], 0.6, 0.6, 0.6, true)
end

function ns.PrintEarnings()
  local earned, spent = ns.EarnedToday()
  local net = earned - spent
  ns.Print(L["today on this character: earned %s, spent %s, net %s."]:format(M.ShortMoney(earned), M.ShortMoney(spent),
    (net > 0 and "+" or "") .. M.ShortMoney(net)))
end

local function track(fresh)
  if not (ns.db and GetMoney) then return end
  ns.db.earnings = ns.db.earnings or {}
  local key = charKey()
  ns.db.earnings[key] = M.MoneyDay(ns.db.earnings[key], today(), GetMoney(), fresh)
  if ns.RefreshMenu then ns.RefreshMenu() end
end

local f = CreateFrame("Frame")
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("PLAYER_MONEY")
f:SetScript("OnEvent", function(_, event)
  ns.Safe("earnings", track, event == "PLAYER_LOGIN")
end)
