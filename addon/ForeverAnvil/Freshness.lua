-- Old prices: the addon can't download anything, so new prices come with addon updates. This tells players
-- when theirs are old and how to get new ones:
--   at login    a note in chat when the prices are over a day old
--   guild/group each copy sends the time of its prices over the hidden addon channel (one short message at
--               login and when the group changes). A copy with newer prices answers one with older ones, and
--               that player gets a note. Players whose prices are current see nothing.
-- At most one note per session; the "Old price notes" switch turns them off (the messages still go out, so
-- others hear about newer prices).
local _, ns = ...
local M = ns.Math
local L = ns.L

local CHANNELS = { GUILD = true, PARTY = true, RAID = true, INSTANCE_CHAT = true }
local ANNOUNCE_GAP, ANSWER_GAP = 120, 20 -- seconds between our messages on a channel

local told = false   -- a note was shown this session
local lastSent = {}  -- [channel] = time() of our last message there
local waiting = {}   -- [channel] = true while our answer waits (someone else may answer first)

local function ours() return ns.data and ns.data.updated end
local function notesOn() return ns.db and ns.db.show.updates ~= false end

local function tell(msg)
  if told or not notesOn() then return end
  told = true
  ns.Print(msg)
end

local function later(seconds, fn)
  if C_Timer and C_Timer.After then C_Timer.After(seconds, function() ns.Safe("freshness", fn) end) end
end

local function send(channel, gap)
  local updated = ours()
  if not (updated and C_ChatInfo and C_ChatInfo.SendAddonMessage) then return end
  local now = time()
  if lastSent[channel] and now - lastSent[channel] < gap then return end
  lastSent[channel] = now
  C_ChatInfo.SendAddonMessage(M.SYNC_PREFIX, M.SyncMessage(updated), channel)
end

local function groupChannel()
  if IsInGroup and LE_PARTY_CATEGORY_INSTANCE and IsInGroup(LE_PARTY_CATEGORY_INSTANCE) then return "INSTANCE_CHAT" end
  if IsInRaid and IsInRaid() then return "RAID" end
  if IsInGroup and IsInGroup() then return "PARTY" end
  return nil
end

local function announce()
  if IsInGuild and IsInGuild() then send("GUILD", ANNOUNCE_GAP) end
  local ch = groupChannel()
  if ch then send(ch, ANNOUNCE_GAP) end
end

local function shortName(sender) return sender and sender:match("^[^-]+") or "?" end
local function isMe(sender) return UnitName and shortName(sender) == UnitName("player") end

-- the note at login
function ns.CheckOldPrices()
  local age = ns.DataAge()
  if age and age > M.OLD_AFTER then
    tell(L["your prices were last updated %s. Update the addon in your CurseForge or Wago app, or turn on auto-update there, for fresh ones."]:format(M.Age(age)))
  end
end

-- another copy's message
function ns.HeardPrices(text, channel, sender)
  local theirs = M.ParseSync(text)
  if not theirs or not CHANNELS[channel] or isMe(sender) then return end
  local verdict = M.SyncVerdict(ours(), theirs)
  if verdict == "newer" then
    waiting[channel] = nil
    tell(L["%s has newer prices than you (updated %s). Update the addon in your CurseForge or Wago app to get them."]:format(shortName(sender), M.Age(time() - theirs)))
  elseif verdict == "older" then
    -- answer after a few seconds, unless someone with prices as new as ours answers first
    if not waiting[channel] then
      waiting[channel] = true
      later(math.random(2, 9), function()
        if waiting[channel] then waiting[channel] = nil; send(channel, ANSWER_GAP) end
      end)
    end
  else
    waiting[channel] = nil -- same prices as ours: they've answered (or will hear the same)
  end
end

local f = CreateFrame("Frame")
ns.freshnessFrame = f
f:RegisterEvent("PLAYER_LOGIN")
f:RegisterEvent("GROUP_ROSTER_UPDATE")
f:RegisterEvent("CHAT_MSG_ADDON")
f:SetScript("OnEvent", function(_, event, prefix, text, channel, sender)
  if event == "CHAT_MSG_ADDON" then
    if prefix == M.SYNC_PREFIX then ns.Safe("freshness", ns.HeardPrices, text, channel, sender) end
  elseif event == "PLAYER_LOGIN" then
    if C_ChatInfo and C_ChatInfo.RegisterAddonMessagePrefix then C_ChatInfo.RegisterAddonMessagePrefix(M.SYNC_PREFIX) end
    -- after the login messages have gone by
    later(10, function() ns.CheckOldPrices(); announce() end)
  elseif event == "GROUP_ROSTER_UPDATE" then
    later(3, function()
      local ch = groupChannel()
      if ch then send(ch, ANNOUNCE_GAP) end
    end)
  end
end)
