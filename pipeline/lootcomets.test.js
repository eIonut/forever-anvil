// Loot Comets (lootcomets/LootComets) in a Lua VM (fengari, Lua 5.3; the game has 5.1, so the code sticks to
// what both share): every file must parse, and Logic.lua must tell loot from items moved around the bags.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const ADDON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../lootcomets/LootComets");
const LOGIC = fs.readFileSync(path.join(ADDON, "Logic.lua"), "utf8");

/** Runs Lua code with Logic.lua loaded as C; the code returns a string. */
function runLua(body) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(LOGIC));
  lua.lua_setglobal(L, to_luastring("LOGIC_SRC"));
  const code = `local ns = {}; assert(load(LOGIC_SRC, "=Logic.lua"))("LootComets", ns); local C = ns.Logic
local function it(bag, slot, id, count) return { bag = bag, slot = slot, id = id, count = count } end
local function gains(old, now)
  local out = {}
  for _, g in ipairs(C.Gains(C.Snapshot(old), C.Snapshot(now))) do
    out[#out + 1] = g.id .. "+" .. g.gained .. "@" .. g.bag .. ":" .. g.slot .. (g.new and " new" or "")
  end
  return table.concat(out, ", ")
end
${body}`;
  if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(lua.lua_tojsstring(L, -1));
  }
  return lua.lua_tojsstring(L, -1);
}

test("every Loot Comets Lua file parses", () => {
  for (const file of fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua"))) {
    const L = lauxlib.luaL_newstate();
    const src = fs.readFileSync(path.join(ADDON, file), "utf8");
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring("=" + file));
    assert.equal(status, lua.LUA_OK, `${file}: ${status === lua.LUA_OK ? "" : lua.lua_tojsstring(L, -1)}`);
    assert.doesNotMatch(src, /\s\/\/\s|\bgoto\b|<<|>>/, `${file} uses Lua 5.3-only syntax`);
  }
});

test("the toc lists every Lua file", () => {
  const toc = fs.readFileSync(path.join(ADDON, "LootComets.toc"), "utf8");
  for (const file of fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua"))) {
    assert.match(toc, new RegExp(`^${file.replace(".", "\\.")}\\r?$`, "m"), `${file} is missing from the toc`);
  }
});

test("a new item is a gain in the slot it landed in", () => {
  assert.equal(runLua(`return gains({ it(0, 1, 100, 1) }, { it(0, 1, 100, 1), it(0, 2, 200, 1) })`), "200+1@0:2 new");
});

test("more of a stack you carry is a gain, not new", () => {
  assert.equal(runLua(`return gains({ it(0, 1, 100, 5) }, { it(0, 1, 100, 8) })`), "100+3@0:1");
});

test("a full stack spilling into a new slot lands where most of it went", () => {
  assert.equal(runLua(`return gains({ it(0, 1, 100, 19) }, { it(0, 1, 100, 20), it(1, 4, 100, 3) })`), "100+4@1:4");
});

test("moving, swapping and splitting inside the bags is never a gain", () => {
  assert.equal(runLua(`return gains({ it(0, 1, 100, 1), it(0, 2, 200, 4) }, { it(2, 7, 100, 1), it(0, 2, 200, 4) })`), "");
  assert.equal(runLua(`return gains({ it(0, 1, 100, 1), it(0, 2, 200, 4) }, { it(0, 2, 100, 1), it(0, 1, 200, 4) })`), "");
  assert.equal(runLua(`return gains({ it(0, 1, 200, 10) }, { it(0, 1, 200, 6), it(0, 3, 200, 4) })`), "");
});

test("selling, using or destroying is never a gain", () => {
  assert.equal(runLua(`return gains({ it(0, 1, 100, 5), it(0, 2, 200, 1) }, { it(0, 1, 100, 4) })`), "");
});

test("several items at once come back in bag order", () => {
  assert.equal(
    runLua(`return gains({}, { it(1, 2, 300, 1), it(0, 5, 200, 2), it(0, 3, 100, 1) })`),
    "100+1@0:3 new, 200+2@0:5 new, 300+1@1:2 new",
  );
});

test("an item that grew by moving stacks still lands somewhere", () => {
  // one stack of 100 gained 2 while another stack of it moved: the slot that grew wins
  assert.equal(runLua(`return gains({ it(0, 1, 100, 3), it(0, 2, 100, 5) }, { it(0, 4, 100, 3), it(0, 2, 100, 7) })`), "100+2@0:2");
});

test("the arc starts and ends at the right points and bends upwards", () => {
  const out = runLua(`
    local x0, y0, x1, y1 = 500, 300, 1500, 100
    local cx, cy = C.Control(x0, y0, x1, y1, 0)
    local ax, ay = C.Arc(0, x0, y0, cx, cy, x1, y1)
    local bx, by = C.Arc(1, x0, y0, cx, cy, x1, y1)
    local mx, my = C.Arc(0.5, x0, y0, cx, cy, x1, y1)
    return string.format("%d,%d %d,%d %s", ax, ay, bx, by, tostring(my > (y0 + y1) / 2))`);
  assert.equal(out, "500,300 1500,100 true");
});

test("easing and size start and end where they should", () => {
  const out = runLua(`return string.format("%.2f %.2f %.2f %.2f %.2f", C.Ease(0), C.Ease(1), C.Scale(0), C.Scale(0.5), C.Scale(1))`);
  assert.equal(out, "0.00 1.00 0.30 1.00 0.55");
});

test("flight time grows with distance, shrinks with speed, and is capped", () => {
  const out = runLua(`
    local near = C.Duration(0, 0, 100, 0, 1)
    local far = C.Duration(0, 0, 2000, 0, 1)
    local fast = C.Duration(0, 0, 2000, 0, 1.35)
    local huge = C.Duration(0, 0, 99999, 0, 1)
    return tostring(near < far) .. " " .. tostring(fast < far) .. " " .. string.format("%.2f", huge)`);
  assert.equal(out, "true true 1.05");
});

test("grey items fly only when grey is on", () => {
  assert.equal(
    runLua(`return tostring(C.Flies(0, { grey = true })) .. tostring(C.Flies(0, { grey = false })) .. tostring(C.Flies(4, { grey = false })) .. tostring(C.Flies(nil, {}))`),
    "truefalsetruetrue",
  );
});

test("rainbow colours: red, green and blue at their hues, and the hue wraps around", () => {
  const out = runLua(`
    local function c(h) local r, g, b = C.HSV(h, 1, 1) return string.format("%.2f,%.2f,%.2f", r, g, b) end
    return table.concat({ c(0), c(1 / 3), c(2 / 3), c(1), c(1.5), c(-0.5) }, " ")`);
  assert.equal(out, "1.00,0.00,0.00 0.00,1.00,0.00 0.00,0.00,1.00 1.00,0.00,0.00 0.00,1.00,1.00 0.00,1.00,1.00");
});

test("sliders snap to their step and stay between their ends", () => {
  const out = runLua(`return string.format("%.2f %.2f %.2f %.2f", C.Snap(1.234, 0.5, 2, 0.05), C.Snap(0.1, 0.5, 2, 0.05), C.Snap(9, 0.5, 2, 0.05), C.Snap(1.0249, 0.5, 2, 0.05))`);
  assert.equal(out, "1.25 0.50 2.00 1.00");
});

test("the arc setting scales how high comets loop", () => {
  const out = runLua(`
    local function top(h)
      local cx, cy = C.Control(0, 0, 1000, 0, 0, h)
      local _, y = C.Arc(0.5, 0, 0, cx, cy, 1000, 0)
      return y
    end
    return tostring(top(0.3) < top(1)) .. " " .. tostring(top(1) < top(1.8)) .. " " .. tostring(top(nil) == top(1))`);
  assert.equal(out, "true true true");
});

test("the toc lists Forever and the other game versions", () => {
  const toc = fs.readFileSync(path.join(ADDON, "LootComets.toc"), "utf8");
  const versions = toc.match(/^## Interface: (.+)$/m)[1].split(",").map((v) => v.trim());
  for (const v of ["16001", "120105", "11509"]) assert.ok(versions.includes(v), `missing interface ${v}`);
  for (const v of versions) assert.match(v, /^\d{5,6}$/);
});

test("test comets: one per quality, each with a real bag item, borrowing the closest when one is missing", () => {
  const out = runLua(`
    local function it(bag, slot, q) return { bag = bag, slot = slot, quality = q, icon = "i" .. bag .. slot } end
    local function show(items)
      local parts = {}
      for _, p in ipairs(C.TestPicks(items)) do
        parts[#parts + 1] = p.quality .. "=" .. (p.item and (p.item.bag .. ":" .. p.item.slot) or "none")
      end
      return table.concat(parts, " ")
    end
    return table.concat({
      -- grey, white, green only: blue borrows the unused white, then epic reuses the closest, the green
      show({ it(0, 1, 1), it(0, 2, 2), it(0, 3, 0), it(1, 1, 1) }),
      -- an item of every quality: each its own, legendary added
      show({ it(0, 1, 4), it(0, 2, 3), it(0, 3, 2), it(0, 4, 1), it(0, 5, 0), it(0, 6, 5) }),
      -- one item: every comet uses it
      show({ it(2, 7, 1) }),
      show({}),
    }, " | ")`);
  assert.equal(out,
    "0=0:3 1=0:1 2=0:2 3=1:1 4=0:2 | 0=0:5 1=0:4 2=0:3 3=0:2 4=0:1 5=0:6 | 0=2:7 1=2:7 2=2:7 3=2:7 4=2:7 | 0=none 1=none 2=none 3=none 4=none");
});

/** Runs Lua code with Targets.lua loaded as ns (frames mocked by the code itself); returns a string. */
function runTargets(body) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  lua.lua_pushstring(L, to_luastring(fs.readFileSync(path.join(ADDON, "Targets.lua"), "utf8")));
  lua.lua_setglobal(L, to_luastring("TARGETS_SRC"));
  const code = `
-- a frame: shown or not, placed at (x, y) or nowhere (x nil), with an ID and children
local function frame(o)
  o = o or {}
  local kids = o.kids or {}
  o.kids = nil
  o.IsVisible = function() return o.shown ~= false end
  o.GetCenter = function() if o.x then return o.x, o.y end end
  o.GetEffectiveScale = function() return 1 end
  o.GetWidth = function() return 36 end
  o.GetID = function() return o.id or 0 end
  o.GetChildren = function() return unpack(kids) end
  o.GetParent = function() return o.parent end
  for _, k in ipairs(kids) do k.parent = o end
  return o
end
unpack = unpack or table.unpack
UIParent = frame({ x = 1000, y = 500 }); UIParent.GetWidth = function() return 2000 end
GetTime = function() return 0 end
local ns = {}
assert(load(TARGETS_SRC, "=Targets.lua"))("LootComets", ns)
local function landing(bag, slot)
  local x, y, _, to = ns.Landing(bag, slot)
  return to .. "@" .. math.floor(x) .. "," .. math.floor(y)
end
${body}`;
  if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(lua.lua_tojsstring(L, -1));
  }
  return lua.lua_tojsstring(L, -1);
}

test("ElvUI: its slot wins over the game's bag window that ElvUI leaves shown with no position", () => {
  const out = runTargets(`
    -- the game's combined bag window: shown, its slot matches, but nowhere on screen (ElvUI's DisableFrame)
    local ghost = frame({ id = 1 }); ghost.GetBagID = function() return 0 end
    ContainerFrameCombinedBags = frame({})
    ContainerFrameCombinedBags.EnumerateValidItems = function() return ipairs({ ghost }) end
    -- ElvUI's window: Bags[bag][slot]
    local slot = frame({ id = 1, x = 1700, y = 300 }); slot.BagID = 0
    ElvUI_ContainerFrame = frame({ x = 1750, y = 350 })
    ElvUI_ContainerFrame.Bags = { [0] = { slot } }
    return landing(0, 1) .. " | " .. ns.ElvUIReport(0, 1)`);
  assert.equal(out, "slot@1700,300 | window on screen, game's bag window shown with no position (skipped), slot on screen, ID 1, BagID 0");
});

test("ElvUI with bags closed and no bag bar: the corner", () => {
  const out = runTargets(`
    ElvUI_ContainerFrame = frame({ shown = false })
    ElvUI_ContainerFrame.Bags = {}
    return landing(0, 1)`);
  assert.equal(out, "corner@1940,60");
});

test("Baganator: a slot button found by the game's GetBagID under its backpack window", () => {
  const out = runTargets(`
    local button = frame({ id = 4, x = 1500, y = 420 })
    button.GetBagID = function(self) return self.parent:GetID() end
    local indexFrame = frame({ id = 2, x = 1, y = 1, kids = { button } })
    Baganator_SingleViewBackpackViewFrameblizzard = frame({ x = 1500, y = 400, kids = { indexFrame } })
    return landing(2, 4) .. " " .. ns.Landing(2, 5)`);
  assert.match(out, /^slot@1500,420 /);
});

test("splitting a stack is a move, not loot: the item dropped from the cursor is left out", () => {
  const out = runLua(`
    local full = C.Snapshot({ it(0, 1, 2592, 3) })                     -- 3 wool cloth
    local onCursor = C.Snapshot({ it(0, 1, 2592, 2) })                 -- 1 split off onto the cursor
    local dropped = C.Snapshot({ it(0, 1, 2592, 2), it(0, 2, 2592, 1) }) -- dropped in an empty slot
    local looted = C.Snapshot({ it(0, 1, 2592, 2), it(0, 2, 2592, 1), it(0, 3, 4306, 1) }) -- then silk loot
    local function ids(g) local t = {} for _, x in ipairs(g) do t[#t + 1] = x.id .. "+" .. x.gained end return table.concat(t, ",") end
    return table.concat({
      ids(C.Gains(full, onCursor)),                                     -- picking up: nothing
      ids(C.Gains(onCursor, dropped)),                                  -- without the cursor rule: looks like loot
      ids(C.WithoutHeld(C.Gains(onCursor, dropped), 2592)),             -- with it: nothing
      ids(C.WithoutHeld(C.Gains(dropped, looted), 2592)),               -- real loot of another item still flies
      ids(C.WithoutHeld(C.Gains(onCursor, dropped), nil)),              -- nothing held: unchanged
    }, " | ")`);
  assert.equal(out, " | 2592+1 |  | 4306+1 | 2592+1");
});

test("coin comets: more coins for more money, every kind in the amount gets one, biggest first", () => {
  const out = runLua(`
    local function show(copper) return table.concat(C.CoinPlan(copper), ",") end
    return table.concat({ show(7), show(250), show(10005), show(123456), show(1500000), show(0), show(-3) }, " | ")`);
  assert.equal(out, [
    "copper,copper",
    "silver,silver,copper",
    "gold,gold,gold,gold,copper",
    "gold,gold,gold,gold,silver,copper",
    "gold,gold,gold,gold,gold,gold,gold,gold",
    "",
    "",
  ].join(" | "));
});

test("money text leaves out zero parts", () => {
  const out = runLua(`return table.concat({ C.MoneyText(123456), C.MoneyText(10005), C.MoneyText(250), C.MoneyText(0), C.MoneyText(1500000) }, " | ")`);
  assert.equal(out, "12g 34s 56c | 1g 5c | 2s 50c | 0c | 150g");
});

test("coins land on the money in ElvUI's bag window (text with no scale of its own), else the corner", () => {
  const out = runTargets(`
    local closed = select(4, ns.MoneyLanding())
    ElvUI_ContainerFrame = frame({ x = 1750, y = 350 })
    ElvUI_ContainerFrame.Bags = {}
    local text = { IsVisible = function() return true end, GetCenter = function() return 1880, 120 end,
      GetWidth = function() return 90 end, GetParent = function() return ElvUI_ContainerFrame end }
    ElvUI_ContainerFrame.goldText = text
    local x, y, _, to = ns.MoneyLanding()
    return closed .. " | " .. to .. "@" .. math.floor(x) .. "," .. math.floor(y)`);
  assert.equal(out, "corner | ElvUI money@1880,120");
});
