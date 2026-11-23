-- Landfall: arriving somewhere shows a title card: the name, whose territory it is, its level range against
-- yours, and whether it's a first visit or a discovery. Replaces the game's plain zone text.
-- Core: settings, events, what each card says, the game's zone text, sounds and /landfall.
local addonName, ns = ...
local Logic = ns.Logic

ns.DEFAULTS = {
  enabled = true,
  style = "classic",     -- "classic", "bronze", "cinematic", "minimal"
  duration = "normal",   -- "short", "normal", "long"
  scale = 1,
  pos = nil,             -- { x, y } of the card's middle from the top centre of the screen
  subzones = true,       -- cards for areas inside a zone
  citySubzones = false,  -- ... in capital cities too
  flying = false,        -- subzone cards while on a flight path
  territory = true,
  levels = true,
  pvpWarning = true,
  discovery = true,      -- "First visit" and "Discovered" badges
  colorTitle = true,     -- the name in its territory's colour, like the game's zone text
  login = true,          -- a card for where you are when you log in
  sound = true,
  sounds = {},           -- [moment] = sound file name (Logic.SOUNDS), filled with the defaults below
  hideGameText = true,   -- hide the game's own zone text while Landfall shows cards
  -- 1.1
  suggest = true,        -- "Better for your level: …" when a zone is far from your level
  dungeons = true,       -- "Dungeons here: …" on a zone's card
  rested = true,         -- at an inn: your hearthstone's inn and how long until fully rested
  danger = true,         -- a red pulse and drums arriving somewhere 5+ levels above you
  crest = true,          -- the faction's crest beside its territory
  minimapButton = true,
  minimapAngle = 220,
  v = 1,
}
for _, m in ipairs(Logic.SOUND_MOMENTS) do ns.DEFAULTS.sounds[m[1]] = Logic.SOUNDS[m[1]][1][1] end

function ns.Print(msg)
  DEFAULT_CHAT_FRAME:AddMessage("|cffe8c36aLandfall|r: " .. msg)
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
-- The game's zone text: its frame listens to the zone events; Landfall takes them away while it's on

local ZONE_EVENTS = { "ZONE_CHANGED", "ZONE_CHANGED_INDOORS", "ZONE_CHANGED_NEW_AREA" }

function ns.UpdateGameText()
  local zf = _G.ZoneTextFrame
  if not zf then return end
  local hide = ns.db.enabled and ns.db.hideGameText
  if hide then
    zf:UnregisterAllEvents()
    zf:Hide()
    if _G.SubZoneTextFrame then _G.SubZoneTextFrame:Hide() end
  else
    for _, e in ipairs(ZONE_EVENTS) do pcall(zf.RegisterEvent, zf, e) end
  end
end

---------------------------------------------------------------------------------------------------
-- Sounds: Landfall's own, made by tools/landfall-sounds.js

local SOUNDS = "Interface\\AddOns\\" .. addonName .. "\\Media\\Sounds\\"
local lastSound = 0

-- plays a sound file by name (the settings' play buttons too); "none" plays nothing
function ns.PlayFile(file)
  if not file or file == "none" then return end
  pcall(PlaySoundFile, SOUNDS .. file .. ".mp3", "SFX")
end

-- the sound picked for a moment ("arrive", "discover", "danger"), at most one a second
local function play(moment)
  if not (ns.db.sound and ns.db.enabled) then return end
  local now = GetTime()
  if now - lastSound < 1 then return end
  lastSound = now
  ns.PlayFile(ns.db.sounds[moment])
end

---------------------------------------------------------------------------------------------------
-- What a card says

local function territoryStrings()
  return { sanctuary = _G.SANCTUARY_TERRITORY, contested = _G.CONTESTED_TERRITORY,
    faction = _G.FACTION_CONTROLLED_TERRITORY, combat = _G.COMBAT_ZONE }
end

-- what the game says about the zone's territory: type, whether it's the subzone's own, faction name
local function gamePvpInfo()
  local fn = (C_PvP and C_PvP.GetZonePVPInfo) or GetZonePVPInfo
  if not fn then return nil end
  local ok, pvpType, isSubZone, faction = pcall(fn)
  if ok then return pvpType, isSubZone, faction end
end

local FACTION_NAMES = { Alliance = _G.FACTION_ALLIANCE or "Alliance", Horde = _G.FACTION_HORDE or "Horde" }

-- The territory: the game's, or (when it gives none, as on Forever) from Landfall's own zone table.
-- map: the zone map, for the fallback. Returns type, isSubZone, faction name (in your language).
local function pvpInfo(map)
  local pvpType, isSubZone, faction = gamePvpInfo()
  if pvpType == "" then pvpType = nil end
  local mine = UnitFactionGroup("player")
  if not pvpType and map then
    local holder
    pvpType, holder = Logic.TerritoryFromSide(Logic.SideOf(map), mine)
    faction = holder and FACTION_NAMES[holder]
  end
  if (pvpType == "friendly" or pvpType == "hostile") and (not faction or faction == "") then
    local holder = pvpType == "friendly" and mine or (mine == "Horde" and "Alliance" or "Horde")
    faction = FACTION_NAMES[holder]
  end
  return pvpType, isSubZone, faction
end

local function flagged()
  return UnitIsPVP and UnitIsPVP("player") and true or false
end

-- the Horde or Alliance crest, as a texture in text, for land one faction holds
local function crest(pvpType)
  if not ns.db.crest or (pvpType ~= "friendly" and pvpType ~= "hostile") then return "" end
  local mine = UnitFactionGroup("player")
  if mine ~= "Horde" and mine ~= "Alliance" then return "" end
  local holder = pvpType == "friendly" and mine or (mine == "Horde" and "Alliance" or "Horde")
  return "|TInterface\\TargetingFrame\\UI-PVP-" .. holder .. ":18:18:0:-1:64:64:2:40:2:40|t "
end

-- lines for territory and the PvP warning
local function territoryLines(lines, pvpType, faction)
  if not ns.db.territory then return end
  local text = Logic.TerritoryText(pvpType, faction, territoryStrings())
  if text then
    local c = Logic.TERRITORY[pvpType] or { 1, 1, 1 }
    local warn = ns.db.pvpWarning and Logic.PvPWarning(pvpType, flagged())
    lines[#lines + 1] = { crest(pvpType) .. text .. (warn and "  ·  |cffff4033PvP: you can be attacked|r" or ""), c[1], c[2], c[3] }
  end
end

local function hexColor(r, g, b)
  local function h(v) return math.floor(math.max(0, math.min(1, v)) * 255 + 0.5) end
  return ("|cff%02x%02x%02x"):format(h(r), h(g), h(b))
end

-- the level line; returns how the range fits you
local function levelLine(lines, range)
  if not (ns.db.levels and range) then return nil end
  local level = UnitLevel("player")
  local fit = Logic.Fit(level, range)
  local f = Logic.FIT[fit]
  lines[#lines + 1] = { Logic.RangeText(range) .. (f and ("  ·  " .. f[1]) or ""), f and f[2] or 1, f and f[3] or 1, f and f[4] or 1 }
  return fit
end

local function mapName(id)
  local info = C_Map and C_Map.GetMapInfo and C_Map.GetMapInfo(id)
  return info and info.name
end

-- "Better for your level: Arathi Highlands, Stranglethorn Vale"
local function suggestLine(lines, map, fit)
  if not (ns.db.suggest and ns.db.levels) or (fit ~= "danger" and fit ~= "low") then return end
  local z = Logic.ZONES[map]
  local side = ({ Alliance = "A", Horde = "H" })[UnitFactionGroup("player") or ""]
  local names = {}
  for _, id in ipairs(Logic.Suggest(UnitLevel("player"), map, side, z and z[3], 2)) do
    local name = mapName(id)
    if name then names[#names + 1] = name end
  end
  if #names > 0 then lines[#lines + 1] = { "Better for your level: " .. table.concat(names, ", "), 0.91, 0.76, 0.42 } end
end

local function instanceName(id)
  local name = GetRealZoneText and GetRealZoneText(id)
  if name and name ~= "" then return name end
  return Logic.INSTANCE_NAMES[id]
end

-- "Dungeons here: The Deadmines 17-26", each coloured for your level
local function dungeonLine(lines, map)
  if not ns.db.dungeons or not map then return end
  local list, extra = Logic.ZoneInstances(map, 3)
  if #list == 0 then return end
  local level = UnitLevel("player")
  local parts = {}
  for _, id in ipairs(list) do
    local r = Logic.INSTANCES[id]
    local f = Logic.FIT[Logic.Fit(level, r)]
    local range = r[1] == r[2] and ("raid " .. r[1]) or (r[1] .. "-" .. r[2])
    parts[#parts + 1] = (f and hexColor(f[2], f[3], f[4]) or "|cffffffff") .. (instanceName(id) or "?") .. " " .. range .. "|r"
  end
  local label = (#list + extra == 1) and "Dungeon here: " or "Dungeons here: "
  lines[#lines + 1] = { label .. table.concat(parts, "  ·  ") .. (extra > 0 and ("  +" .. extra) or ""), 0.8, 0.8, 0.8 }
end

-- at an inn: "Resting · your hearthstone's inn · fully rested in 3h 20m"
local function innLine(lines, sub, zone)
  if not (IsResting and IsResting()) then return end
  local parts = { "Resting" }
  if ns.db.rested then
    local home = GetBindLocation and GetBindLocation()
    if home and home ~= "" and (home == sub or home == zone) then parts[#parts + 1] = "your hearthstone's inn" end
    if UnitLevel("player") < 60 then -- Forever's and Classic's cap (the modern client's own call names the retail one)
      local text = Logic.RestedText(GetXPExhaustion and GetXPExhaustion(), UnitXPMax and UnitXPMax("player"))
      if text then parts[#parts + 1] = text end
    end
  end
  lines[#lines + 1] = { table.concat(parts, "  ·  "), 0.6, 0.8, 1 }
end

local function titleColor(pvpType)
  return Logic.TERRITORY[pvpType] and Logic.TERRITORY[pvpType] or nil
end

local INSTANCE_KIND = { party = "Dungeon", raid = "Raid", pvp = "Battleground", arena = "Arena", scenario = "Scenario" }

-- the card for where you are: a zone, or a dungeon / raid / battleground
function ns.ZoneCard()
  local inInstance, instanceType = IsInInstance()
  if inInstance then
    local name, iType, _, difficultyName, maxPlayers, _, _, instanceID = GetInstanceInfo()
    local lines = {}
    local kind = INSTANCE_KIND[iType or instanceType] or "Instance"
    local extra = {}
    if difficultyName and difficultyName ~= "" then extra[#extra + 1] = difficultyName end
    if maxPlayers and maxPlayers > 0 then extra[#extra + 1] = maxPlayers .. " players" end
    lines[#lines + 1] = { kind .. (#extra > 0 and ("  ·  " .. table.concat(extra, "  ·  ")) or ""), 1, 0.82, 0 }
    local range = Logic.INSTANCES[instanceID or 0]
    levelLine(lines, range)
    local badge
    if ns.db.discovery and instanceID then
      if not ns.char.instances[instanceID] then badge = "First visit" end
      ns.char.instances[instanceID] = true
    end
    return { kind = "instance", title = name or GetZoneText(), color = { 1, 0.82, 0 }, lines = lines, badge = badge,
      danger = Logic.Danger(UnitLevel("player"), range) }
  end
  local zone = GetZoneText()
  local sub = GetSubZoneText()
  local map = ns.ZoneMap()
  local pvpType, _, faction = pvpInfo(map)
  local range = map and Logic.ZONES[map]
  local lines = {}
  territoryLines(lines, pvpType, faction)
  local fit = levelLine(lines, range)
  suggestLine(lines, map, fit)
  dungeonLine(lines, map)
  if sub ~= "" then innLine(lines, sub, zone) end
  local badge
  if ns.db.discovery and map and ns.EnterMap(map) then badge = "First visit" end
  return { kind = "zone", title = zone, sub = sub ~= zone and sub or nil, color = titleColor(pvpType), lines = lines, badge = badge,
    map = map, danger = Logic.Danger(UnitLevel("player"), range) }
end

-- the card for an area inside the zone
function ns.SubCard(sub)
  local pvpType, isSubZonePvP, faction = pvpInfo()
  local lines = {}
  if isSubZonePvP then territoryLines(lines, pvpType, faction) end
  innLine(lines, sub, GetZoneText())
  return { kind = "sub", title = sub, color = isSubZonePvP and titleColor(pvpType) or nil, lines = lines }
end

---------------------------------------------------------------------------------------------------
-- Arriving

local memory = Logic.NewMemory()
local lastZone

local function show(d)
  ns.ShowCard(d)
  if d.danger and ns.db.danger then
    ns.DangerPulse()
    play("danger")
  elseif d.kind ~= "sub" then
    play(d.badge and "discover" or "arrive")
  end
end

-- a moment after arriving: was an area discovered? Stamp it on the card, or show a card for it.
local function checkDiscovery()
  if not (ns.db.enabled and ns.db.discovery) or IsInInstance() then return end
  local names = ns.CheckHere()
  if #names == 0 then return end
  local name = names[#names]
  local d = ns.CardShowing()
  if d and d.badge == "First visit" then return end -- the zone card already says it
  if not ns.BadgeCard("Discovered", name) then
    local card = ns.SubCard(name)
    card.badge = "Discovered"
    ns.ShowCard(card)
  end
  play("discover")
end

local function later(seconds, fn)
  C_Timer.After(seconds, function()
    local ok, err = pcall(fn)
    if not ok then ns.Print("error (please report it): " .. tostring(err)) end
  end)
end

local function zoneChanged()
  if not ns.db.enabled then return end
  local zone = IsInInstance() and (GetInstanceInfo()) or GetZoneText()
  if zone == lastZone then return end -- the event fires on some phase and map changes inside one zone too
  if not Logic.ShouldShow(memory, "zone", zone, GetTime()) then return end
  lastZone = zone
  local d = ns.ZoneCard()
  if d.sub then Logic.ShouldShow(memory, "sub", d.sub, GetTime()) end -- don't show its subzone again right after
  show(d)
  later(0.8, checkDiscovery)
end

local function subChanged()
  if not ns.db.enabled then return end
  if IsInInstance() then return end
  local sub = GetSubZoneText()
  if not sub or sub == "" then return end
  local zone = GetZoneText()
  if zone ~= lastZone then return end -- the zone event follows: its card will carry the subzone
  local d, t = ns.CardShowing()
  if d and d.kind == "zone" and d.title == zone and t < 1.5 then -- just arrived: put it on the zone card
    if Logic.ShouldShow(memory, "sub", sub, GetTime()) or d.sub ~= sub then ns.SetCardSub(sub) end
    later(0.8, checkDiscovery)
    return
  end
  local map = ns.ZoneMap()
  local allowed = ns.db.subzones and (ns.db.citySubzones or not (map and Logic.CITIES[map]))
    and (ns.db.flying or not (UnitOnTaxi and UnitOnTaxi("player")))
  if allowed and Logic.ShouldShow(memory, "sub", sub, GetTime()) then show(ns.SubCard(sub)) end
  later(0.8, checkDiscovery) -- discoveries show even when the subzone card doesn't
end

-- You started resting (walked into an inn or a city). Entering an inn rarely changes the area's name, and
-- the game marks you as resting a moment after you step in, sometimes without its event: so after every
-- resting event and zone change, Landfall compares "resting now" with "resting before", twice (0.3 s and
-- 1.5 s later). The inn line goes onto the card on screen, or gets a small card of its own (once in 45 s per
-- place, so stepping out and back in stays quiet).
local innShown = {}
local wasResting -- nil until known (set when you enter the world)

local function arrivedAtInn()
  if not (ns.db.enabled and ns.db.rested) or IsInInstance() then return end
  local zone, sub = GetZoneText(), GetSubZoneText()
  local lines = {}
  innLine(lines, sub, zone)
  if #lines == 0 then return end
  if ns.AddCardLine(lines[1]) then return end
  local map = ns.ZoneMap()
  if map and Logic.CITIES[map] then return end -- a capital: the whole city is resting, its card said so
  local place = (sub ~= "" and sub) or zone
  local now = GetTime()
  if innShown[place] and now - innShown[place] < 45 then return end
  innShown[place] = now
  ns.ShowCard(ns.SubCard(place))
end

local function resting() return (IsResting and IsResting()) and true or false end

local function checkResting()
  local now, before = resting(), wasResting
  wasResting = now
  if now and before == false then arrivedAtInn() end
end

local function checkRestingSoon()
  later(0.3, checkResting)
  later(1.5, checkResting)
end

---------------------------------------------------------------------------------------------------
-- Events

local f = CreateFrame("Frame")
for _, e in ipairs({ "ADDON_LOADED", "PLAYER_ENTERING_WORLD", "ZONE_CHANGED", "ZONE_CHANGED_INDOORS",
  "ZONE_CHANGED_NEW_AREA", "PLAYER_UPDATE_RESTING" }) do
  pcall(f.RegisterEvent, f, e)
end

local ready = false

f:SetScript("OnEvent", function(_, event, arg1, arg2)
  if event == "ADDON_LOADED" then
    if arg1 ~= addonName then return end
    LandfallDB = LandfallDB or {}
    copyDefaults(LandfallDB, ns.DEFAULTS)
    ns.db = LandfallDB
    LandfallCharDB = LandfallCharDB or {}
    ns.char = LandfallCharDB
    ns.char.explored = ns.char.explored or {}
    ns.char.instances = ns.char.instances or {}
    for _, m in ipairs(Logic.SOUND_MOMENTS) do -- a sound from an older version that's gone: back to the default
      local list, known = Logic.SOUNDS[m[1]], false
      for _, e in ipairs(list) do if e[1] == ns.db.sounds[m[1]] then known = true end end
      if not known then ns.db.sounds[m[1]] = list[1][1] end
    end
    if ns.InitOptions then pcall(ns.InitOptions) end
  elseif event == "PLAYER_ENTERING_WORLD" then
    local isLogin, isReload = arg1, arg2
    pcall(ns.UpdateGameText)
    if isLogin or isReload then
      local ok, err = pcall(ns.InitMinimap)
      if not ok then ns.Print("error (please report it): " .. tostring(err)) end
    end
    ready = false
    later(isLogin and 2.5 or 0.6, function()
      ready = true
      wasResting = resting() -- logging in inside an inn: the zone card already says so
      local zone = IsInInstance() and (GetInstanceInfo()) or GetZoneText()
      if isReload then -- a /reload: no card, just remember where we are
        lastZone = zone
        Logic.ShouldShow(memory, "zone", zone, GetTime())
        if ns.db.discovery and not IsInInstance() then ns.EnterMap(ns.ZoneMap()) end
        return
      end
      if isLogin and not ns.db.login then
        lastZone = zone
        Logic.ShouldShow(memory, "zone", zone, GetTime())
        return
      end
      zoneChanged() -- logging in, or out of a loading screen (an instance, a boat, a portal)
    end)
  elseif not ready then
    return
  elseif event == "ZONE_CHANGED_NEW_AREA" then
    later(0.2, zoneChanged)
    checkRestingSoon()
  elseif event == "PLAYER_UPDATE_RESTING" then
    checkRestingSoon()
  else
    later(0.1, subChanged)
    checkRestingSoon()
  end
end)

---------------------------------------------------------------------------------------------------
-- /landfall

function ns.OnSetting(key)
  if key == "enabled" or key == "hideGameText" then ns.UpdateGameText() end
  if key == "enabled" and not ns.db.enabled then ns.HideCard() end
  if key == "style" or key == "scale" then ns.PlaceCard() end
  if key == "minimapButton" and ns.UpdateMinimapButton then ns.UpdateMinimapButton() end
  if ns.RefreshMenu then ns.RefreshMenu() end
  if ns.RefreshOptions then ns.RefreshOptions() end
end

-- the card for where you are, now (also the settings' and menu's test buttons). Sounds play even with the
-- one-a-second limit, so trying things out always sounds right.
function ns.Test(kind)
  lastSound = 0
  if kind == "sub" then
    local sub = GetSubZoneText()
    local d = ns.SubCard(sub ~= "" and sub or "Somewhere Quiet")
    d.badge = "Discovered"
    ns.ShowCard(d)
    play("discover")
    return
  end
  local d = ns.ZoneCard()
  if kind == "first" then d.badge = "First visit" end
  if kind == "danger" then d.danger = true end
  show(d)
end

SLASH_LANDFALL1 = "/landfall"
SlashCmdList.LANDFALL = function(msg)
  local cmd = (msg or ""):lower():match("^%s*(%S*)")
  if cmd == "test" then
    local what = (msg or ""):lower():match("test%s+(%S+)")
    ns.Test(what)
  elseif cmd == "on" or cmd == "off" then
    ns.db.enabled = cmd == "on"
    ns.OnSetting("enabled")
    ns.Print(ns.db.enabled and "on." or "off: the game's own zone text is back. /landfall on turns it on again.")
  elseif cmd == "move" or cmd == "unlock" then
    ns.SetMoving(true)
    ns.Print("drag the card where you want it, then /landfall lock.")
  elseif cmd == "lock" then
    ns.SetMoving(false)
  elseif cmd == "reset" then
    ns.db.pos = nil
    ns.PlaceCard()
    ns.Print("the card is back in its place.")
  elseif cmd == "menu" then
    ns.ToggleMenu(ns.minimapButton and ns.minimapButton:IsVisible() and ns.minimapButton or nil)
  elseif cmd == "minimap" then
    ns.db.minimapButton = true
    ns.OnSetting("minimapButton")
    ns.Print("minimap button shown. Drag it to move it.")
  elseif cmd == "debug" then
    local map = ns.ZoneMap()
    local rawType, rawSub, rawFaction = gamePvpInfo()
    local pvpType, isSub, faction = pvpInfo(map)
    local inInstance = IsInInstance()
    ns.Print(("version %s, %s, style %s."):format(
      (C_AddOns and C_AddOns.GetAddOnMetadata or GetAddOnMetadata)(addonName, "Version") or "?",
      ns.db.enabled and "on" or "off", ns.db.style))
    ns.Print(("zone %q, subzone %q, map %s, %s."):format(GetZoneText() or "", GetSubZoneText() or "", tostring(map),
      Logic.RangeText(map and Logic.ZONES[map]) or "no level range known"))
    ns.Print(("territory %s%s, faction %s, you're %s (the game said: %s, %s, %s)."):format(tostring(pvpType),
      isSub and " (this area)" or "", tostring(faction), flagged() and "flagged for PvP" or "not flagged",
      tostring(rawType), tostring(rawSub), tostring(rawFaction)))
    if inInstance then
      local name, iType, _, difficultyName, maxPlayers, _, _, instanceID = GetInstanceInfo()
      ns.Print(("instance %s (%s, %s, %s players), id %s, %s."):format(tostring(name), tostring(iType), tostring(difficultyName),
        tostring(maxPlayers), tostring(instanceID), Logic.RangeText(Logic.INSTANCES[instanceID or 0]) or "no level range known"))
    end
    local n = ns.KnownCount(map)
    ns.Print(n and ("areas explored on this map that Landfall knows of: %d."):format(n) or "this map hasn't been looked at yet.")
    ns.Print("the game's zone text is " .. ((ns.db.enabled and ns.db.hideGameText) and "hidden." or "shown."))
  elseif cmd == "" or cmd == "options" then
    ns.OpenOptions()
  else
    ns.Print("/landfall: settings, /landfall test [sub | first | danger]: a card for where you are, /landfall menu, /landfall move | lock | reset: place the card, /landfall on | off, /landfall debug")
  end
end
