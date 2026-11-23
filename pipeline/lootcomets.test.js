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
