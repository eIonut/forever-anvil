-- Landfall: what's explored. The game tells which areas are explored at a point of a map
-- (C_MapExplorationInfo.GetExploredAreaIDsAtPosition); sampling a grid over the map gives everything
-- explored on it. Each character remembers that per map (LandfallCharDB.explored), so an area explored
-- since is a discovery, and a map with nothing explored but where you stand is a first visit.
local _, ns = ...
local Logic = ns.Logic

local GRID = 24 -- points per side sampled on a map's first look (576 lookups, once per map per character)
local vec

local ZONE_TYPE = (Enum and Enum.UIMapType and Enum.UIMapType.Zone) or 3

-- the zone map you're on (caves and buildings with their own small map count as their zone), or nil
function ns.ZoneMap()
  if not (C_Map and C_Map.GetBestMapForUnit) then return nil end
  local map = C_Map.GetBestMapForUnit("player")
  local guard = 0
  while map and guard < 5 do
    local info = C_Map.GetMapInfo(map)
    if not info then return map end
    if info.mapType == ZONE_TYPE or not info.parentMapID or info.parentMapID == 0 then return map end
    if info.mapType and info.mapType < ZONE_TYPE then return map end -- a continent or the world: stop
    map = info.parentMapID
    guard = guard + 1
  end
  return map
end

local function canExplore()
  return C_MapExplorationInfo and C_MapExplorationInfo.GetExploredAreaIDsAtPosition and CreateVector2D and C_Map
    and C_Map.GetPlayerMapPosition
end

local function areasAt(map, pos)
  if not pos then return {} end
  local ok, ids = pcall(C_MapExplorationInfo.GetExploredAreaIDsAtPosition, map, pos)
  return ok and type(ids) == "table" and ids or {}
end

local function here(map)
  local ok, pos = pcall(C_Map.GetPlayerMapPosition, map, "player")
  if not ok or not pos then return {} end
  return areasAt(map, pos)
end

local function exploredOn(map)
  vec = vec or CreateVector2D(0, 0)
  local seen, list = {}, {}
  for i = 1, GRID do
    for j = 1, GRID do
      vec:SetXY((i - 0.5) / GRID, (j - 0.5) / GRID)
      for _, id in ipairs(areasAt(map, vec)) do
        if not seen[id] then
          seen[id] = true
          list[#list + 1] = id
        end
      end
    end
  end
  return list
end

-- Arriving on a map: whether it's a first visit. The first time a character's on a map (since installing),
-- everything explored there is remembered; on a first visit the areas where you stand are left out, so
-- CheckHere reports them as discovered.
function ns.EnterMap(map)
  if not (map and canExplore() and ns.char) then return false end
  if ns.char.explored[map] then return false end
  local all = exploredOn(map)
  local at = here(map)
  -- nothing explored where you stand means the game told us nothing (or it's open country with no
  -- named area): never call that a first visit
  local first = #at > 0 and Logic.FirstVisit(all, at)
  local known = {}
  for _, id in ipairs(all) do known[id] = true end
  if first then
    for _, id in ipairs(at) do known[id] = nil end
  end
  ns.char.explored[map] = known
  return first
end

-- Areas discovered where you stand since we last looked: a list of names (and remembers them).
function ns.CheckHere()
  local map = ns.ZoneMap()
  if not (map and canExplore() and ns.char) then return {} end
  if not ns.char.explored[map] then ns.EnterMap(map) end
  local new = Logic.NewAreas(ns.char.explored[map], here(map))
  local names = {}
  for _, id in ipairs(new) do
    local name = C_Map.GetAreaInfo and C_Map.GetAreaInfo(id)
    if name and name ~= "" then names[#names + 1] = name end
  end
  return names
end

-- for /landfall debug: how many areas this character has explored on the map
function ns.KnownCount(map)
  local known = map and ns.char and ns.char.explored[map]
  if not known then return nil end
  local n = 0
  for _ in pairs(known) do n = n + 1 end
  return n
end
