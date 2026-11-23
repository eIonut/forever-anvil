// Landfall (landfall/Landfall) in a Lua VM (fengari, Lua 5.3; the game has 5.1, so the code sticks to what
// both share): every file must parse, and Logic.lua must place ranges, territory, repeats and discoveries right.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const ADDON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../landfall/Landfall");
const LOGIC = fs.readFileSync(path.join(ADDON, "Logic.lua"), "utf8");

/** Runs Lua code with Logic.lua loaded as L; the code returns a string. */
function runLua(body) {
  const S = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(S);
  lua.lua_pushstring(S, to_luastring(LOGIC));
  lua.lua_setglobal(S, to_luastring("LOGIC_SRC"));
  const code = `local ns = {}; assert(load(LOGIC_SRC, "=Logic.lua"))("Landfall", ns); local L = ns.Logic
${body}`;
  if (lauxlib.luaL_loadstring(S, to_luastring(code)) !== lua.LUA_OK || lua.lua_pcall(S, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(lua.lua_tojsstring(S, -1));
  }
  return lua.lua_tojsstring(S, -1);
}

const luaFiles = () => fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua"));

test("every Landfall Lua file parses", () => {
  for (const file of luaFiles()) {
    const S = lauxlib.luaL_newstate();
    const src = fs.readFileSync(path.join(ADDON, file), "utf8");
    const status = lauxlib.luaL_loadbuffer(S, to_luastring(src), null, to_luastring("=" + file));
    assert.equal(status, lua.LUA_OK, `${file}: ${status === lua.LUA_OK ? "" : lua.lua_tojsstring(S, -1)}`);
    assert.doesNotMatch(src, /\s\/\/\s|\bgoto\b|<<|>>|%z/, `${file} uses syntax one of Lua 5.1 / 5.3 lacks`);
  }
});

test("the toc lists every Lua file, and the media it uses is there", () => {
  const toc = fs.readFileSync(path.join(ADDON, "Landfall.toc"), "utf8");
  for (const file of luaFiles()) {
    assert.match(toc, new RegExp(`^${file.replace(".", "\\.")}\\r?$`, "m"), `${file} is missing from the toc`);
  }
  assert.match(toc, /^## Interface: .*16001/m);
  for (const f of ["Glow.tga", "Divider.tga", "Icon.tga", "Edge.tga", "Plaque.tga"]) {
    assert.ok(fs.existsSync(path.join(ADDON, "Media", f)), `Media/${f} is missing`);
  }
});

test("level ranges: every zone and dungeon has a sane range, and the text reads well", () => {
  const out = runLua(`
    for id, r in pairs(L.ZONES) do assert(r[1] >= 1 and r[2] <= 60 and r[1] <= r[2], "zone " .. id) end
    for id, r in pairs(L.INSTANCES) do assert(r[1] >= 10 and r[2] <= 60 and r[1] <= r[2], "instance " .. id) end
    return table.concat({ L.RangeText(L.ZONES[1413]), L.RangeText(L.INSTANCES[409]), tostring(L.RangeText(nil)) }, "|")`);
  assert.equal(out, "Levels 10-25|Level 60|nil");
});

test("how a range fits your level", () => {
  const out = runLua(`local r = { 30, 40 }
    return table.concat({ L.Fit(25, r), L.Fit(28, r), L.Fit(29, r), L.Fit(30, r), L.Fit(40, r), L.Fit(41, r), L.Fit(60, { 60, 60 }), tostring(L.Fit(nil, r)) }, " ")`);
  assert.equal(out, "danger high high good good low good nil");
});

test("territory words: the game's own strings without their brackets, else English", () => {
  const out = runLua(`
    local game = { sanctuary = "(Sanctuary)", contested = "(Contested Territory)", faction = "(%s Territory)", combat = "(Combat Zone)" }
    local de = { faction = "(Gebiet der %s)" }
    return table.concat({
      L.TerritoryText("sanctuary", nil, game), L.TerritoryText("contested", nil, game), L.TerritoryText("friendly", "Horde", game),
      L.TerritoryText("hostile", "Alliance"), L.TerritoryText("friendly", "Horde", de), L.TerritoryText("combat"),
      tostring(L.TerritoryText("friendly", "")), tostring(L.TerritoryText(nil)), tostring(L.TerritoryText("arena", nil, game)),
    }, "|")`);
  assert.equal(out, "Sanctuary|Contested Territory|Horde Territory|Alliance Territory|Gebiet der Horde|Combat Zone|nil|nil|Combat Zone");
});

test("the PvP warning shows only when you're flagged in land where you can be attacked", () => {
  const out = runLua(`return table.concat({ tostring(L.PvPWarning("contested", true)), tostring(L.PvPWarning("hostile", true)),
    tostring(L.PvPWarning("contested", false)), tostring(L.PvPWarning("friendly", true)), tostring(L.PvPWarning("sanctuary", true)) }, " ")`);
  assert.equal(out, "true true false false false");
});

test("cinematic text: spaced capitals, accented letters kept whole", () => {
  const out = runLua(`return L.Spaced("Booty Bay") .. "|" .. L.Spaced("Zul'Farrak") .. "|" .. L.Spaced("Tal'é") .. "|" .. L.Spaced(nil)`);
  assert.equal(out, "B O O T Y    B A Y|Z U L ' F A R R A K|T A L ' é|");
});

test("subzones don't repeat within 45 s; a new zone clears that; the zone's own name isn't a subzone", () => {
  const out = runLua(`
    local m = L.NewMemory()
    local r = {}
    local function s(kind, name, t) r[#r + 1] = tostring(L.ShouldShow(m, kind, name, t)) end
    s("zone", "Elwynn Forest", 0)
    s("sub", "Goldshire", 1)
    s("sub", "Elwynn Forest", 2)  -- open country: the zone itself
    s("sub", "Goldshire", 20)     -- back and forth on the border
    s("sub", "Goldshire", 80)     -- long after
    s("sub", "", 81)
    s("zone", "Westfall", 90)
    s("sub", "Goldshire", 91)     -- a new zone cleared the memory
    return table.concat(r, " ")`);
  assert.equal(out, "true true false false true false true true");
});

test("discoveries: new areas where you stand, and a first visit when nothing else on the map was explored", () => {
  const out = runLua(`
    local known = { [10] = true, [11] = true }
    local new = L.NewAreas(known, { 11, 12, 13 })
    local again = L.NewAreas(known, { 12 })
    return table.concat({ table.concat(new, ","), #again, tostring(known[13]),
      tostring(L.FirstVisit({ 5 }, { 5 })), tostring(L.FirstVisit({ 5, 6 }, { 5 })), tostring(L.FirstVisit({}, { 5 })),
      tostring(L.FirstVisit({}, {})) }, " ")`);
  assert.equal(out, "12,13 0 true true false true true");
});

test("the card's timeline fades in, opens the divider, holds and fades out", () => {
  const out = runLua(`
    local function at(t) local a, s, d, sub, done = L.Timeline(t, 3) return string.format("%.2f/%.2f/%.2f/%.2f/%s", a, s, d, sub, tostring(done)) end
    return table.concat({ at(0), at(1), at(3), at(3.4), at(3.8) }, " ") .. " " .. L.Hold("short", "zone") .. " " .. string.format("%.2f", L.Hold("normal", "sub")) .. " " .. L.Hold("nope", "zone")`);
  assert.equal(out, "0.00/1.06/0.00/0.00/false 1.00/1.00/1.00/1.00/false 1.00/1.00/1.00/1.00/false 0.50/1.00/1.00/1.00/false 0.00/1.00/1.00/1.00/true 2.2 2.52 3.6");
});

test("every sound in the lists ships as an MP3, and each list starts with its default", () => {
  const out = runLua(`
    local files = {}
    for _, m in ipairs(L.SOUND_MOMENTS) do
      local list = assert(L.SOUNDS[m[1]], m[1])
      assert(list[1][1] ~= "none", "a moment's default is silent: " .. m[1])
      for _, e in ipairs(list) do if e[1] ~= "none" then files[e[1]] = true end end
    end
    local out = {}
    for f in pairs(files) do out[#out + 1] = f end
    table.sort(out)
    return table.concat(out, ",")`);
  for (const f of out.split(",")) {
    const file = path.join(ADDON, "Media", "Sounds", `${f}.mp3`);
    assert.ok(fs.existsSync(file), `Media/Sounds/${f}.mp3 is missing (node tools/landfall-sounds.js, then tools/landfall-sounds.ps1)`);
    assert.ok(fs.statSync(file).size < 150_000, `${f}.mp3 is too big`);
  }
  assert.equal(out, "bells,chime,drum,harp,horn,sparkle,swell");
});

test("cycling choices wraps both ways, and an unknown one starts at the default", () => {
  const out = runLua(`local list = L.SOUNDS.danger
    return table.concat({ L.Cycle(list, "drum", 1), L.Cycle(list, "none", 1), L.Cycle(list, "drum", -1), L.Cycle(list, "gone", 1),
      L.ChoiceName(list, "horn"), L.ChoiceName(list, "gone") }, " ")`);
  assert.equal(out, "horn drum none drum Horn call War drums");
});

test("every zone says its continent and whose land it is", () => {
  const out = runLua(`
    for id, z in pairs(L.ZONES) do
      assert(z[3] == nil or z[3] == "K" or z[3] == "E", "continent of " .. id)
      assert(z[4] == "A" or z[4] == "H" or z[4] == "C" or z[4] == "X", "side of " .. id)
    end
    return L.ZONES[1413][4] .. L.ZONES[1436][4] .. L.ZONES[1434][4] .. L.ZONES[2521][4]`);
  assert.equal(out, "HACX");
});

test("better zones: your continent first, nearest the middle, never the other faction's", () => {
  const out = runLua(`
    local function names(t) return table.concat(t, ",") end
    return table.concat({
      names(L.Suggest(25, 1429, "A", "E", 2)),  -- Alliance 25 in Elwynn: Hillsbrad and Wetlands (both 20-30, mid 25)
      names(L.Suggest(15, 1411, "H", "K", 2)),  -- Horde 15 in Durotar: The Barrens (mid 17.5) and Stonetalon (21), not Darkshore
      names(L.Suggest(15, 1411, "A", "K", 3)),  -- Alliance 15: Darkshore, Stonetalon, then Loch Modan (other continent); never The Barrens
      names(L.Suggest(60, 1429, "A", "E", 2)),  -- max level: nothing
      names(L.Suggest(5, 1429, "H", "E", 2)),   -- Horde 5 in Elwynn: Tirisfal, then Durotar; never Zephras Isle (X)
    }, " | ")`);
  assert.equal(out, "1424,1437 | 1413,1442 | 1439,1442,1432 |  | 1420,1411");
});

test("dungeons in a zone: dungeons first by level, raids after, capped with a count of the rest", () => {
  const out = runLua(`
    local function show(map, max) local l, extra = L.ZoneInstances(map, max) return table.concat(l, ",") .. "+" .. extra end
    for map, list in pairs(L.ZONE_INSTANCES) do
      for _, id in ipairs(list) do assert(L.INSTANCES[id] and L.INSTANCE_NAMES[id], "instance " .. id .. " in zone " .. map) end
    end
    return table.concat({ show(1413, 3), show(1428, 3), show(1423, 3), show(1429, 3) }, " ")`);
  assert.equal(out, "43,47,129+0 230,229,409+1 329,533+0 +0");
});

test("danger: 5 or more levels under where a place starts", () => {
  const out = runLua(`local r = { 30, 40 }
    return table.concat({ tostring(L.Danger(25, r)), tostring(L.Danger(26, r)), tostring(L.Danger(nil, r)), tostring(L.Danger(10, nil)) }, " ")`);
  assert.equal(out, "true false false false");
});

test("rested time at an inn", () => {
  const out = runLua(`return table.concat({ L.RestedText(nil, 8000), L.RestedText(12000, 8000), L.RestedText(11950, 8000),
    L.RestedText(11000, 8000), tostring(L.RestedText(100, 0)) }, " | ")`);
  // 8000 XP a level: full at 12000, 50 XP an hour
  assert.equal(out, "fully rested in 10 days 0h | fully rested | fully rested in 1h 00m | fully rested in 20h 00m | nil");
});

test("territory from Landfall's own table when the game gives none", () => {
  const out = runLua(`
    local function t(map, mine) local p, h = L.TerritoryFromSide(L.SideOf(map), mine) return tostring(p) .. ":" .. tostring(h) end
    return table.concat({
      t(1412, "Horde"),     -- Mulgore, Horde playing: friendly
      t(1412, "Alliance"),  -- Mulgore, Alliance playing: hostile, held by the Horde
      t(1434, "Horde"),     -- Stranglethorn: contested
      t(1453, "Horde"),     -- Stormwind (a city): hostile, Alliance
      t(2548, "Alliance"),  -- Riverglades: contested
      t(2521, "Horde"),     -- Zephras Isle: not known
      t(nil, "Horde"), t(1412, nil),
    }, " ")`);
  assert.equal(out, "friendly:Horde hostile:Horde contested:nil hostile:Alliance contested:nil nil:nil nil:nil nil:nil");
});
