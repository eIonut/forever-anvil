// The addon's Lua (addon/ForeverAnvil) run in a Lua VM (fengari, Lua 5.3; the game has 5.1, so the code
// sticks to what both share): every file must parse, and Math.lua must give the same answers as the site's JS.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fengari from "fengari";
import { disenchantTable, disenchantValue } from "../src/lib/demath.js";
import { craftProfit } from "../src/lib/pricemath.js";
import { encodeHouse, regionMedians, encodeSkill, encodeCrates, encodeItems } from "./addon-data.js";
import { findUpgrades } from "../src/lib/upgrades.js";
import { skillUpChance, planLeveling } from "../src/lib/levelmath.js";
import { rankCrates } from "../src/lib/cratemath.js";
import { watchString, shoppingString } from "../src/lib/addonstring.js";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const ADDON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../addon/ForeverAnvil");
const MATH = fs.readFileSync(path.join(ADDON, "Math.lua"), "utf8");

/** Runs Lua code with Math.lua loaded as M; the code returns a string. Globals: name → string. */
function runLua(body, globals = {}) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries({ MATH_SRC: MATH, ...globals })) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  const code = `local ns = {}; assert(load(MATH_SRC, "=Math.lua"))("ForeverAnvil", ns); local M = ns.Math\n${body}`;
  if (lauxlib.luaL_loadstring(L, to_luastring(code)) !== lua.LUA_OK || lua.lua_pcall(L, 0, 1, 0) !== lua.LUA_OK) {
    throw new Error(lua.lua_tojsstring(L, -1));
  }
  return lua.lua_tojsstring(L, -1);
}

test("every addon Lua file parses", () => {
  for (const file of fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua"))) {
    const L = lauxlib.luaL_newstate();
    const src = fs.readFileSync(path.join(ADDON, file), "utf8");
    const status = lauxlib.luaL_loadbuffer(L, to_luastring(src), null, to_luastring("=" + file));
    assert.equal(status, lua.LUA_OK, `${file}: ${status === lua.LUA_OK ? "" : lua.lua_tojsstring(L, -1)}`);
    // the game runs Lua 5.1: no integer division, bit operators or goto
    assert.doesNotMatch(src, /\s\/\/\s|\bgoto\b|<<|>>/, `${file} uses Lua 5.3-only syntax`);
  }
});

const QUALITY = { 2: "uncommon", 3: "rare", 4: "epic" };
const CLASS = { 2: "Weapon", 4: "Armor" };
const fmt = (t) => (t ? `${t.skill ?? "-"}|` + t.drops.map((d) => `${d.id}:${d.chance.toFixed(3)}:${d.min}:${d.max}`).join(",") : "none");

test("disenchant tables match demath.js for every quality, class and item level", () => {
  const lua_ = runLua(`
    local out = {}
    for _, q in ipairs({ 1, 2, 3, 4 }) do for _, c in ipairs({ 2, 4, 15 }) do for l = 1, 100 do
      local t = M.DisenchantTable(q, c, l)
      local s = "none"
      if t then
        local parts = {}
        for _, d in ipairs(t.drops) do parts[#parts + 1] = d.id .. ":" .. string.format("%.3f", d.chance) .. ":" .. d.min .. ":" .. d.max end
        s = (t.skill or "-") .. "|" .. table.concat(parts, ",")
      end
      out[#out + 1] = q .. "/" .. c .. "/" .. l .. "=" .. s
    end end end
    return table.concat(out, "\\n")`);
  const js = [];
  for (const q of [1, 2, 3, 4]) for (const c of [2, 4, 15]) for (let l = 1; l <= 100; l++) {
    js.push(`${q}/${c}/${l}=${fmt(disenchantTable(QUALITY[q] || "common", CLASS[c] || "Trade Goods", l))}`);
  }
  assert.equal(lua_, js.join("\n"));
});

test("disenchant value matches demath.js, including unpriced materials", () => {
  const prices = { 10940: 120, 10938: 900, 10978: 2500, 11083: 300, 11082: 4100, 11176: 2600, 11178: 61000, 20725: 150000 };
  const cases = [[2, 4, 18], [2, 2, 28], [2, 4, 48], [3, 4, 50], [4, 2, 58], [2, 4, 33]];
  const lua_ = runLua(`
    local P = { [10940]=120, [10938]=900, [10978]=2500, [11083]=300, [11082]=4100, [11176]=2600, [11178]=61000, [20725]=150000 }
    local out = {}
    for _, c in ipairs({ {2,4,18}, {2,2,28}, {2,4,48}, {3,4,50}, {4,2,58}, {2,4,33} }) do
      local v, complete = M.DisenchantValue(M.DisenchantTable(c[1], c[2], c[3]), function(id) return P[id] end)
      out[#out + 1] = v .. ":" .. tostring(complete)
    end
    return table.concat(out, ",")`);
  const js = cases.map(([q, c, l]) => {
    const v = disenchantValue(disenchantTable(QUALITY[q], CLASS[c], l), (id) => prices[id] ?? null);
    return `${v.value}:${v.complete}`;
  });
  assert.equal(lua_, js.join(","));
});

test("craft profit matches pricemath.js", () => {
  const market = { 1: 50000, 2: 1200, 3: 800 };
  const vendor = { 4: 100 };
  const price = (id) => ({ ah: market[id] ?? null, vendor: vendor[id] ?? null, sell: null });
  const cases = [
    { item: 1, q: 1, r: [[2, 3], [3, 5], [4, 2]] },
    { item: 1, q: 2, r: [[2, 10]] },
    { item: 1, q: 1, r: [[2, 1], [9, 1]] },      // unpriced reagent
    { item: 9, q: 1, r: [[2, 1]] },              // unpriced product
  ];
  const js = cases.map((c) => { const p = craftProfit(c, price); return `${p.cost}:${p.costComplete}:${p.profit ?? "nil"}`; });
  const lua_ = runLua(`
    local mk = { [1]=50000, [2]=1200, [3]=800 }
    local cost = function(id) return mk[id] or ({ [4]=100 })[id] end
    local out = {}
    for _, c in ipairs({ {1,1,{{2,3},{3,5},{4,2}}}, {1,2,{{2,10}}}, {1,1,{{2,1},{9,1}}}, {9,1,{{2,1}}} }) do
      local cs, complete, profit = M.CraftProfit(c[3], cost, mk[c[1]], c[2])
      out[#out + 1] = cs .. ":" .. tostring(complete) .. ":" .. tostring(profit)
    end
    return table.concat(out, ",")`);
  assert.equal(lua_, js.join(","));
});

test("flip rule: at least 10c and 5% profit per unit", () => {
  const lua_ = runLua(`
    local out = {}
    for _, c in ipairs({ {90,100}, {91,100}, {950,1000}, {951,1000}, {5,0}, {1,15} }) do out[#out + 1] = tostring(M.Pays(c[1], c[2])) end
    return table.concat(out, ",")`);
  const pays = (unit, worth) => unit <= worth - Math.max(10, worth * 0.05);
  assert.equal(lua_, [[90, 100], [91, 100], [950, 1000], [951, 1000], [5, 0], [1, 15]].map(([u, w]) => String(pays(u, w))).join(","));
});

test("house strings round-trip through the addon's decoder", () => {
  const items = { 2589: [12, 15, 400, 30, 85], 25: [1500, 1500, 9, 9], 14047: [900, 1100, 2000, 120, 310.4] };
  const lua_ = runLua(`
    local t = M.DecodeHouse(HOUSE)
    local ids = {}
    for id in pairs(t) do ids[#ids + 1] = id end
    table.sort(ids)
    local out = {}
    for _, id in ipairs(ids) do local a = t[id]; out[#out + 1] = id .. "=" .. a[1] .. "," .. a[2] .. "," .. a[3] .. "," .. a[4] .. "," .. tostring(a[5]) end
    return table.concat(out, ";")`, { HOUSE: encodeHouse(items) });
  assert.equal(lua_, "25=1500,1500,9,9,nil;2589=12,15,400,30,85;14047=900,1100,2000,120,310");
});

test("region median uses houses with at least 3 listings", () => {
  const m = regionMedians([{ 1: [0, 100, 5, 3], 2: [0, 50, 1, 1] }, { 1: [0, 300, 5, 4] }, { 1: [0, 200, 5, 9], 2: [0, 70, 9, 9] }]);
  assert.deepEqual(m, { 1: [200, 3], 2: [70, 1] });
});

// Core + Tooltip with the game's functions stubbed: a Horde character on a PvP realm hovers an item.
// MODE "script": the classic OnTooltipSetItem script exists; "set": it doesn't, only the tooltip's Set…Item calls are hooked.
for (const mode of ["script", "set"]) test(`smoke (${mode} hook): tooltip shows this house's prices and disenchant value`, () => {
  const house113 = encodeHouse({ 2589: [12, 15, 400, 30, 85], 10940: [100, 110, 500, 40], 10938: [800, 900, 50, 12], 10978: [2400, 2500, 20, 6], 9001: [5000, 5200, 3, 2] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local lines = {}
    local function frame()
      local fr = {}
      function fr:RegisterEvent() end
      function fr:SetScript(k, fn) self[k] = fn end
      function fr:HookScript(k, fn) self[k] = fn end
      function fr:AddDoubleLine(l, r) lines[#lines + 1] = l .. " = " .. r end
      function fr:Show() end
      function fr:NumLines() return #lines end
      function fr:HasScript(k) return MODE == "script" and k == "OnTooltipSetItem" end
      function fr:SetBagItem() end
      return fr
    end
    CreateFrame = frame
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) lines[#lines + 1] = "chat: " .. m end }
    SlashCmdList = {}
    hooksecurefunc = function(t, name, fn) local orig = t[name]; t[name] = function(...) orig(...); fn(...) end end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    IsAddOnLoaded = function() return false end
    LoadAddOn = function() end
    time = os.time
    GetCoinTextureString = function(c) return c .. "c" end
    -- itemID → name, link, quality, itemLevel, …, sellPrice (11), classID (12)
    local items = { [9001] = { 2, 18, 4, 350 }, [2589] = { 1, 5, 7, 25 }, [9003] = { 2, 18, 4, 350 } }
    local function info(id)
      local i = items[id]; if not i then return nil end
      return "Item", "item:" .. id, i[1], i[2], 0, "", "", 1, "", 0, i[4], i[3]
    end
    -- the "set" run is the Forever client (build 71037): no global GetItemInfo, only C_Item.GetItemInfo
    if MODE == "script" then GetItemInfo = info else C_Item = { GetItemInfo = info } end
    GameTooltip, ItemRefTooltip = frame(), frame()
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 7200,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "9001,6000,4;", vendorBuy = "", noDisenchant = "11288;9003;" } }
    for _, f in ipairs({ "Core.lua", "Tooltip.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    -- fire the load events through the Core frame
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    GameTooltip.GetItem = function() return "Item", "|Hitem:9001::|h[Item]|h" end
    if MODE == "script" then
      GameTooltip.OnTooltipSetItem(GameTooltip)
      GameTooltip.OnTooltipSetItem(GameTooltip) -- several hooks fire for one tooltip: lines must not repeat
    else
      assert(GameTooltip.OnTooltipSetItem == nil)
    end
    GameTooltip:SetBagItem(0, 1)
    -- the same kind of item, but the game won't disenchant it: no Disenchant line
    local before = #lines
    GameTooltip.GetItem = function() return "Item", "|Hitem:9003::|h[Item]|h" end
    GameTooltip:SetBagItem(0, 2)
    for i = before + 1, #lines do assert(not lines[i]:find("Disenchant"), "9003 can't be disenchanted") end
    for i = #lines, before + 1, -1 do table.remove(lines, i) end
    return table.concat(lines, "\\n")`, { MODE: mode, HOUSE: house113, "Core.lua": src("Core.lua"), "Tooltip.lua": src("Tooltip.lua") });
  const lines = out.split("\n");
  assert.equal(lines[0], "Forever Anvil = PvP horde  2h ago");
  assert.deepEqual(lines.slice(1), [
    "  Market = 5200c",
    "  Lowest listed = 5000c  |cff999999x3|r",
    "  Sold per day = |cff999999none seen|r",
    "  Region median = 6000c  |cff999999" + "4 houses|r",
    // green armor, item level 18: 75% Strange Dust 2–3 (110), 20% Greater Magic (unpriced), 5% Small Glimmering (2500, 6 listings)
    "  Disenchant = ~" + Math.round(Math.round(0.75 * 2.5 * 110 + 0.05 * 2500) * 0.95) + "c  |cff999999skill 1|r",
  ]);
});

// The Forever client's modern windows (Blizzard_Professions, Blizzard_AuctionHouseUI), stubbed: rows come
// through ScrollUtil.AddInitializedFrameCallback, recipes through C_TradeSkillUI.GetRecipeSchematic.
test("smoke: modern profession and auction windows show profits and flips", () => {
  const house = encodeHouse({ 100: [9000, 10000, 20, 10], 4234: [270, 275, 6000, 200], 9001: [200, 210, 3, 2], 9002: [400, 420, 5, 5],
    10940: [100, 110, 500, 40], 10939: [800, 900, 50, 12], 10978: [2400, 2500, 20, 6] }); // Strange Dust, Greater Magic Essence, Small Glimmering Shard
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local texts = {}
    local function region()
      local r = {}
      function r:SetPoint(_, rel) self.anchor = rel end
      function r:ClearAllPoints() self.anchor = nil end
      function r:SetJustifyH() end
      function r:SetAllPoints() end
      function r:SetColorTexture() end
      function r:SetText(s) self.text = s end
      return r
    end
    local function frame(name, parent)
      local fr = setmetatable({ parent = parent }, { __index = function(_, k) if k:match("^%u") then return function() end end end })
      function fr:SetAllPoints() end
      function fr:SetFrameLevel() end
      function fr:GetFrameLevel() return 1 end
      function fr:RegisterEvent() end
      function fr:SetScript(k, fn) self[k] = fn end
      function fr:HookScript(k, fn) self[k] = fn end
      function fr:GetName() return name end
      -- a font string on a child frame (the auction tag's holder) counts as the row's
      function fr:CreateFontString() local fs = region(); self.fs = fs; if self.parent then self.parent.fs = fs end; return fs end
      function fr:CreateTexture() return region() end
      return fr
    end
    CreateFrame = function(_, name, parent) return frame(name, parent) end
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) texts[#texts + 1] = "chat: " .. m end }
    SlashCmdList = {}
    hooksecurefunc = function(t, name, fn) local orig = t[name]; t[name] = function(...) orig(...); fn(...) end end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    C_Item = { GetItemInfo = function(id)
      local sell = ({ [9001] = 350, [9002] = 420 })[id]
      if sell then return ({ [9001] = "Cheap Cape", [9002] = "Dear Cape" })[id], "item:" .. id, 1, 10, 0, "", "", 1, "", 0, sell, 15 end
      if id == 9004 then return "Boots", "item:9004", 2, 18, 0, "", "", 1, "", 0, 50, 4 end -- green armor, item level 18
    end }
    Enum = { CraftingReagentType = { Modifying = 0, Basic = 1, Finishing = 2 } }
    local callbacks = {}
    -- asking for existing rows errors in the game while the list isn't set up yet (ScrollBox.lua:595)
    ScrollUtil = { AddInitializedFrameCallback = function(box, cb, owner, iterateExisting) assert(not iterateExisting, "iterateExisting"); callbacks[box] = function(f, d) cb(owner, f, d) end end }
    local recipes = {
      [1] = { outputItemID = 100, quantityMin = 1, quantityMax = 1, reagentSlotSchematics = {
        { required = true, reagents = { { itemID = 4234 } }, quantityRequired = 8 },
        { reagentType = 1, reagents = { { itemID = 2321 } }, quantityRequired = 2 },
        { reagentType = 0, reagents = { { itemID = 999 } }, quantityRequired = 1 } } },
      [2] = { quantityMin = 1, reagentSlotSchematics = {} }, -- an enchant: makes no item
      [3] = { outputItemID = 100, quantityMin = 1, reagentSlotSchematics = { { required = true, reagents = { { itemID = 777 } }, quantityRequired = 1 } } },
    }
    C_TradeSkillUI = { GetRecipeSchematic = function(id) return recipes[id] end }
    local recipeBox, browseBox = {}, {}
    ProfessionsFrame = { CraftingPage = { RecipeList = { ScrollBox = recipeBox }, SchematicForm = frame() } }
    ProfessionsFrame.CraftingPage.SchematicForm.Init = function() end
    -- rows may get only an index: the list's getEntry, or C_AuctionHouse.GetBrowseResults, turns it into the result
    local browse = { { itemKey = { itemID = 9001 }, minPrice = 200 }, { itemKey = { itemID = 9001 }, minPrice = 250 } }
    AuctionHouseFrame = { BrowseResultsFrame = { ItemList = { ScrollBox = browseBox, getEntry = function(i) if i == 1 then return browse[1] end end } } }
    local fetches = 0
    C_AuctionHouse = { GetBrowseResults = function() fetches = fetches + 1; return browse end }
    GameTooltip, ItemRefTooltip = frame(), frame()
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 60,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "2321,100;" } }
    for _, f in ipairs({ "Core.lua", "Tooltip.lua", "Auction.lua", "Profession.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    -- as in the game: no ADDON_LOADED for the window UIs reaches us, only the windows opening
    GetMinimapZoneText, GetZoneText = function() return "Orgrimmar" end, function() return "Orgrimmar" end
    ns.frame.OnEvent(ns.frame, "TRADE_SKILL_SHOW")
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_SHOW")
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_SHOW") -- opening it again must not hook twice
    local function node(data) return { GetData = function() return data end } end
    local function row(box, data, cells) local f = frame(); f.cells = cells; callbacks[box](f, data); return f.fs.text, f.fs.anchor end
    texts[#texts + 1] = "recipe: " .. row(recipeBox, node({ recipeInfo = { recipeID = 1 } }))
    texts[#texts + 1] = "enchant: [" .. row(recipeBox, node({ recipeInfo = { recipeID = 2 } })) .. "]"
    texts[#texts + 1] = "unpriced: " .. row(recipeBox, node({ recipeInfo = { recipeID = 3 } }))
    texts[#texts + 1] = "header: [" .. row(recipeBox, node({ categoryInfo = {} })) .. "]"
    texts[#texts + 1] = "flip: " .. row(browseBox, { itemKey = { itemID = 9001 }, minPrice = 200, totalQuantity = 3 })
    -- armor searches add a Level column: the tag goes at the end of the Name cell (the one with the item icon)
    local price, nameCol, level = {}, { Icon = {}, Text = {} }, {}
    local _, anchor = row(browseBox, { itemKey = { itemID = 9001 }, minPrice = 200 }, { price, nameCol, level })
    texts[#texts + 1] = "anchored to name column: " .. tostring(anchor == nameCol)
    texts[#texts + 1] = "no flip: [" .. row(browseBox, { itemKey = { itemID = 9002 }, minPrice = 400, totalQuantity = 5 }) .. "]"
    -- a green item that isn't a flip: nothing by default; its disenchant value in grey with "every row" on
    -- (75% 2.5 × 110 + 20% 1.5 × 900 + 5% 2500 = 601, × 0.95 = 571)
    texts[#texts + 1] = "not a flip: [" .. row(browseBox, { itemKey = { itemID = 9004 }, minPrice = 2000 }) .. "]"
    ns.db.show.deAll = true
    texts[#texts + 1] = "not a flip, every row on: " .. row(browseBox, { itemKey = { itemID = 9004 }, minPrice = 2000 })
    ns.db.show.deAll = false
    texts[#texts + 1] = "index, getEntry: " .. row(browseBox, 1)
    texts[#texts + 1] = "index, browse results: " .. row(browseBox, 2)
    -- sorted by level, as in the game: the window's own list says row 1 is Dear Cape, the game's raw results
    -- say Cheap Cape. The row's name decides; a row whose name matches nothing (a white item) gets no tag.
    AuctionHouseFrame.BrowseResultsFrame.browseResults = { { itemKey = { itemID = 9002 }, minPrice = 300 } }
    local function cells(name) return { {}, { Icon = {}, Text = { GetText = function() return name end } }, {} } end
    texts[#texts + 1] = "sorted, name matches: " .. row(browseBox, 1, cells("|cff1eff00Dear Cape|r"))
    texts[#texts + 1] = "sorted, no match: [" .. row(browseBox, 2, cells("Polished Scale Bracers (22)")) .. "]"
    texts[#texts + 1] = "debug: " .. ns.lastRow
    texts[#texts + 1] = "game's results fetched: " .. fetches
    -- the auction house names random-suffix items by their base name ("Dear Cape"), the row shows the suffix
    C_AuctionHouse.GetItemKeyInfo = function(key) return { itemName = "Dear Cape" } end
    AuctionHouseFrame.BrowseResultsFrame.browseResults = {
      { itemKey = { itemID = 9002, itemSuffix = 1 }, minPrice = 300 }, { itemKey = { itemID = 9002, itemSuffix = 2 }, minPrice = 410 } }
    texts[#texts + 1] = "suffix, base name from AH: " .. row(browseBox, 1, cells("Dear Cape of the Boar")) .. " via " .. ns.lastRow
    texts[#texts + 1] = "suffix, second: [" .. row(browseBox, 2, cells("Dear Cape of the Owl")) .. "] via " .. ns.lastRow
    -- when the AH names them in full, the exact name wins over the position, and another suffix never fits
    C_AuctionHouse.GetItemKeyInfo = function(key) return { itemName = key.itemSuffix == 1 and "Dear Cape of the Boar" or "Dear Cape of the Owl" } end
    ns.ResetAuctionCache()
    texts[#texts + 1] = "full names, wrong position: [" .. row(browseBox, 1, cells("Dear Cape of the Owl")) .. "] via " .. ns.lastRow
    -- a reused row while scrolling: the game calls us before writing the new item's name into it, so the tag
    -- waits a frame (C_Timer.After 0); a row reused again before then only gets its latest item's tag
    local queue = {}
    C_Timer = { After = function(_, fn) queue[#queue + 1] = fn end }
    local shownText = "Polished Scale Bracers" -- the previous item's name, still on the row
    local f = frame()
    f.cells = { {}, { Icon = {}, Text = { GetText = function() return shownText end } }, {} }
    callbacks[browseBox](f, 2)
    callbacks[browseBox](f, 1)
    texts[#texts + 1] = "reused, before the next frame: [" .. tostring(f.fs.text) .. "]"
    shownText = "Dear Cape of the Boar"
    for _, fn in ipairs(queue) do fn() end
    texts[#texts + 1] = "reused, after: " .. f.fs.text .. " via " .. ns.lastRow
    C_Timer = nil
    local form = ProfessionsFrame.CraftingPage.SchematicForm
    form:Init({ recipeID = 1 })
    texts[#texts + 1] = "form: " .. form.fs.text
    texts[#texts + 1] = "ui: " .. ns.professionUI .. ", " .. ns.auctionUI
    return table.concat(texts, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Tooltip.lua": src("Tooltip.lua"), "Auction.lua": src("Auction.lua"), "Profession.lua": src("Profession.lua") });
  // 10000 × 0.95 − (8 × 275 Heavy Leather + 2 × 100 vendor thread); the optional reagent doesn't count
  assert.deepEqual(out.split("\n"), [
    "recipe: |cff33dd55+71s|r",
    "enchant: []",
    "unpriced: |cff777777?|r",
    "header: []",
    "flip: |cff33dd55Vendor +|r|cffc7c7cf1s|r |cffeda55f50c|r",
    "anchored to name column: true",
    "no flip: []",
    "not a flip: []",
    "not a flip, every row on: |cff999999DE 5s 71c|r",
    "index, getEntry: |cff33dd55Vendor +|r|cffc7c7cf1s|r |cffeda55f50c|r",
    "index, browse results: |cff33dd55Vendor +|r|cffc7c7cf1s|r",
    "sorted, name matches: |cff33dd55Vendor +|r|cffc7c7cf1s|r |cffeda55f20c|r",
    "sorted, no match: []",
    "debug: number -> no match for Polished Scale Bracers",
    "game's results fetched: 1",
    "suffix, base name from AH: |cff33dd55Vendor +|r|cffc7c7cf1s|r |cffeda55f20c|r via number -> position (window's list)",
    "suffix, second: [] via number -> position (window's list)",
    "full names, wrong position: [] via number -> name",
    "reused, before the next frame: []",
    "reused, after: |cff33dd55Vendor +|r|cffc7c7cf1s|r |cffeda55f20c|r via number -> name",
    "form: |cffe6a23cForever Anvil|r  profit |cff33dd55+71s|r  |cff999999reagents 24s|r",
    "ui: modern, modern",
  ]);
});

// ------------------------------------------------------------------------------------------------
// Version 2: upgrades, leveling helper, crates, import strings

/** A JS value as Lua source (arrays → sequences, objects → string/number keyed tables) */
function toLua(v) {
  if (v == null) return "nil";
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return "{" + v.map(toLua).join(",") + "}";
  return "{" + Object.entries(v).map(([k, x]) => (/^\d+$/.test(k) ? `[${k}]` : `[${JSON.stringify(k)}]`) + "=" + toLua(x)).join(",") + "}";
}

// a small seeded random, so the generated cases are the same every run
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

test("upgrades match upgrades.js for random characters, gear and items", () => {
  const rand = rng(7);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const ARMOR = [["Cloth", ["HEAD", "CHEST", "ROBE", "LEGS", "CLOAK", "HAND"]], ["Leather", ["HEAD", "SHOULDER", "WAIST", "FEET", "WRIST"]],
    ["Mail", ["HEAD", "CHEST", "LEGS", "HAND"]], ["Plate", ["HEAD", "CHEST", "FEET"]], ["Miscellaneous", ["FINGER", "NECK", "TRINKET", "HOLDABLE"]],
    ["Shield", ["SHIELD"]], ["Libram", ["RELIC"]], ["Idol", ["RELIC"]], ["Totem", ["RELIC"]]];
  const WEAPON = [["Sword", ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND", "WEAPONOFFHAND"]], ["Axe", ["WEAPON", "TWOHWEAPON"]], ["Mace", ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"]],
    ["Dagger", ["WEAPON", "WEAPONOFFHAND"]], ["Fist Weapon", ["WEAPON"]], ["Polearm", ["TWOHWEAPON"]], ["Staff", ["TWOHWEAPON"]],
    ["Bow", ["RANGED"]], ["Gun", ["RANGEDRIGHT"]], ["Crossbow", ["RANGED"]], ["Thrown", ["THROWN"]], ["Wand", ["RANGEDRIGHT"]]];
  const QUALITIES = ["poor", "common", "uncommon", "rare", "epic"];
  const items = {};
  for (let id = 1; id <= 400; id++) {
    const weapon = rand() < 0.4;
    const [sub, invs] = pick(weapon ? WEAPON : ARMOR);
    const ilvl = 5 + Math.floor(rand() * 60), req = rand() < 0.1 ? 1 : Math.max(1, ilvl - 5 - Math.floor(rand() * 5));
    items[id] = [`Item ${id}`, 0, 0, 0, pick(QUALITIES), weapon ? "Weapon" : "Armor", 0, null, sub, pick(invs), req, ilvl];
  }
  const SHEET = { HEAD: ["HEAD"], NECK: ["NECK"], SHOULDER: ["SHOULDER"], BACK: ["CLOAK"], CHEST: ["CHEST", "ROBE"], WRIST: ["WRIST"], HANDS: ["HAND"],
    WAIST: ["WAIST"], LEGS: ["LEGS"], FEET: ["FEET"], FINGER_1: ["FINGER"], FINGER_2: ["FINGER"], TRINKET_1: ["TRINKET"], TRINKET_2: ["TRINKET"],
    MAIN_HAND: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"], OFF_HAND: ["SHIELD", "HOLDABLE", "WEAPON", "WEAPONOFFHAND"], RANGED: ["RANGED", "RANGEDRIGHT", "THROWN", "RELIC"] };
  const byInv = {};
  for (const [id, e] of Object.entries(items)) (byInv[e[9]] ||= []).push(Number(id));
  const QN = { poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4 };
  const luaItem = (id) => { const e = items[id]; return { id: Number(id), ilvl: e[11], req: e[10], quality: QN[e[4]], cls: e[5], sub: e[8], inv: e[9] }; };

  const cases = [];
  for (let c = 0; c < 60; c++) {
    const character = { class: pick(["Warrior", "Paladin", "Hunter", "Rogue", "Priest", "Shaman", "Mage", "Warlock", "Druid"]), level: 1 + Math.floor(rand() * 60) };
    const gear = [];
    for (const [slot, invs] of Object.entries(SHEET)) {
      if (rand() < 0.25) continue;
      const pool = invs.flatMap((inv) => byInv[inv] || []);
      if (pool.length) { const id = pick(pool); gear.push({ slotType: slot, id, level: items[id][11] }); }
    }
    if (gear.some((g) => g.slotType === "MAIN_HAND" && items[g.id][9] === "TWOHWEAPON")) {
      const i = gear.findIndex((g) => g.slotType === "OFF_HAND");
      if (i >= 0) gear.splice(i, 1);
    }
    // every item on sale on one house: the best gain per item across the slots it'd upgrade
    const house = { id: "1", faction: "horde", items: Object.fromEntries(Object.keys(items).map((id) => [id, [100, 100, 1, 1]])) };
    const best = {};
    for (const s of findUpgrades(character, gear, items, [house], { perSlot: 1000 })) {
      for (const o of s.options) if (!best[o.id] || o.gain > best[o.id]) best[o.id] = o.gain;
    }
    const luaGear = Object.fromEntries(gear.map((g) => [g.slotType, { id: g.id, ilvl: g.level, inv: items[g.id][9] }]));
    cases.push({ cls: character.class.toLowerCase(), level: character.level, gear: luaGear, best });
  }
  const lua_ = runLua(`
    local ITEMS, CASES = ${toLua(Object.keys(items).map(luaItem))}, ${toLua(cases.map(({ cls, level, gear }) => ({ cls, level, gear })))}
    local out = {}
    for c, k in ipairs(CASES) do
      local parts = {}
      for _, item in ipairs(ITEMS) do
        local slot, gain = M.UpgradeFor(item, k.gear, k.cls, k.level)
        if slot then parts[#parts + 1] = item.id .. "=" .. gain end
      end
      out[c] = table.concat(parts, ",")
    end
    return table.concat(out, "\\n")`);
  const js = cases.map((k) => Object.keys(k.best).map(Number).sort((a, b) => a - b).map((id) => `${id}=${k.best[id]}`).join(","));
  assert.equal(lua_, js.join("\n"));
  assert.ok(cases.reduce((n, k) => n + Object.keys(k.best).length, 0) > 200, "the random cases should find plenty of upgrades");
});

test("skill-up chance and the cheapest recipe per point match levelmath.js", () => {
  const recipes = [
    [1, "Orange cheap", "", 100, "", 1, [[10, 2, ""]], [null, 40, 70, "trainer", 0, 1001]],
    [2, "Pattern", "", 101, "", 1, [[11, 1, ""]], [25, 50, 80, "item", 900, 1002]],
    [3, "Dear but sure", "", 102, "", 1, [[12, 1, ""]], [1, 60, 90, "auto", 0, 1003]],
    [4, "Unpriced", "", 103, "", 1, [[99, 1, ""]], [1, 30, 60, "trainer", 0, 1004]],
    [5, "Same per point", "", 104, "", 1, [[13, 1, ""]], [null, 45, 65, "trainer", 0, 1005]],
  ];
  const unit = { 10: 50, 11: 30, 12: 200, 13: 100 };
  const price = (id) => (unit[id] != null ? { unit: unit[id], source: "ah" } : null);
  const skills = [1, 20, 30, 39, 40, 45, 50, 55, 64, 69, 70, 75, 85, 89, 90];
  const js = skills.map((s) => {
    const chances = recipes.map((r) => skillUpChance(r[7], s).toFixed(6)).join("/");
    const step = planLeveling(recipes, price, { from: s, to: s + 1, sources: ["trainer", "auto", "item"] }).steps[0];
    return `${s}:${chances}:${step ? step.recipe[0] : "-"}`;
  });
  const lua_ = runLua(`
    local R = ${toLua(recipes.map((r) => ({ id: r[0], cost: r[6].every(([id]) => unit[id] != null) ? r[6].reduce((t, [id, q]) => t + unit[id] * q, 0) : null, info: r[7] })))}
    local out = {}
    for _, s in ipairs(${toLua(skills)}) do
      local chances, entries = {}, {}
      for _, r in ipairs(R) do
        local ch = M.SkillUpChance(r.info[1], r.info[2], r.info[3], s)
        chances[#chances + 1] = string.format("%.6f", ch)
        if r.cost then entries[#entries + 1] = { r.id, r.cost, ch } end
      end
      local best = M.CheapestSkillUp(entries)
      out[#out + 1] = s .. ":" .. table.concat(chances, "/") .. ":" .. (best and best[1] or "-")
    end
    return table.concat(out, "\\n")`);
  assert.equal(lua_, js.join("\n"));
});

test("recipe skill levels are shipped by spell and decoded by the addon", () => {
  const s = encodeSkill({ professions: [{ recipes: [
    [6612, "Admiral's Hat", "", 10030, "", 1, [], [200, 215, 245, "item", 10318, 12081]],
    [1, "Linen Bandage", "", 1251, "", 1, [], [null, 30, 50, "trainer", 0, 3275]],
    [2, "No info", "", 1, "", 1, [], null],
  ] }] });
  assert.equal(s, "3275,,30,50;12081,200,215,245;");
  assert.equal(runLua(`local t = M.DecodeSkill(S); return tostring(t[3275][1]) .. "," .. t[3275][2] .. "," .. t[12081][1] .. "," .. t[12081][3]`, { S: s }), "nil,30,200,245");
});

test("crate fill matches cratemath.js", () => {
  const file = { crates: [
    [500, "Waylaid Crate: Apprentice Ore", 10, [[2770, 20, "Copper Ore"], [2771, 20, "Tin Ore"]]],
    [501, "Waylaid Crate: Journeyman Fabrics", 20, [[2996, 10, "Bolt of Linen"], [null, 5, "Unknown"], [2997, 5, "Bolt of Wool"]]],
    [502, "Waylaid Crate: Artisan Parts", 50, [[4389, 4, "Gyrochronatom"]]],
    [503, "Not a crate", 1, []],
  ] };
  const houses = [
    { id: 113, faction: "horde", items: { 2770: [9, 10, 25, 5], 2771: [12, 14, 100, 9], 2996: [200, 210, 4, 2], 2997: [300, 320, 50, 8] } },
    { id: 116, faction: "neutral", items: { 2770: [8, 8, 19, 3], 2996: [150, 160, 30, 6] } },
  ];
  const s = encodeCrates(file);
  assert.equal(s, "500,5,1|2770:20,2771:20;501,20,1|2996:10,2997:5;502,40,0|4389:4;");
  const js = rankCrates(file.crates, houses).sort((a, b) => a.id - b.id)
    .map((r) => `${r.id}:${r.favor}:${r.confirmed}:${r.best ? r.best.itemId + "x" + r.best.qty + "=" + r.best.cost : "-"}`);
  const lua_ = runLua(`
    local crates = M.DecodeCrates(S)
    local H = { ${houses.map((h) => toLua(h.items)).join(",")} }
    local out = {}
    for _, id in ipairs({ 500, 501, 502 }) do
      local c = crates[id]
      local f = M.CrateFill(c, H)
      out[#out + 1] = id .. ":" .. c.favor .. ":" .. tostring(c.confirmed) .. ":" .. (f and (f.item .. "x" .. f.qty .. "=" .. f.cost) or "-")
    end
    return table.concat(out, "\\n")`, { S: s });
  assert.equal(lua_, js.join("\n"));
});

test("import strings from the site decode in the addon", () => {
  const w = watchString([{ id: 2589, below: 500 }, { id: 2592 }, { id: 2589, below: 1 }, { id: -3 }, { id: 14047, below: 12.4 }]);
  assert.equal(w, "FA1W:2589:500,2592,14047:12");
  const sh = shoppingString([{ id: 2996, need: 10 }, { id: 2321, need: 2.5 }, { id: 2996, need: 4 }, { id: 7, need: 0 }]);
  assert.equal(sh, "FA1S:2996:14,2321:3");
  const lua_ = runLua(`
    local function show(kind, list)
      if not kind then return "nil:" .. list end
      local parts = {}
      for _, e in ipairs(list) do parts[#parts + 1] = e[1] .. "=" .. tostring(e[2]) end
      return kind .. ":" .. table.concat(parts, ",")
    end
    local out = {}
    for _, s in ipairs({ W, SH, "  FA1W:1,\\n2:30 ", "FA1S:5", "FA1W:", "FA1W:1,x", "hello" }) do out[#out + 1] = show(M.DecodeImport(s)) end
    for _, s in ipairs({ "1g 20s 5c", "1g20s", "50s", "75c", "120", "2g", "abc", "5x", "" }) do out[#out + 1] = tostring(M.ParseMoney(s)) end
    return table.concat(out, "\\n")`, { W: w, SH: sh });
  assert.deepEqual(lua_.split("\n"), [
    "watch:2589=500,2592=nil,14047=12",
    "shopping:2996=14,2321=3",
    "watch:1=nil,2=30",
    "nil:the string is damaged (copy it again from the site)",
    "nil:the list is empty",
    "nil:the string is damaged (copy it again from the site)",
    "nil:that isn't a Forever Anvil string",
    "12005", "12000", "5000", "75", "120", "20000", "nil", "nil", "nil",
  ]);
});

// Version 2 in the (stubbed) game: a level 30 Horde warrior with gear on, a watchlist and a shopping list.
test("smoke: upgrades, crates, watchlist and shopping list in tooltips, auction rows and slash commands", () => {
  const house = encodeHouse({ 2770: [9, 10, 25, 5], 2771: [12, 14, 100, 9], 2589: [12, 15, 400, 30], 9100: [5000, 5200, 2, 2], 9101: [800, 900, 3, 3] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local lines = {}
    local noop = function() end
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s end
      return r
    end
    local function frame(name, parent)
      local fr = setmetatable({ parent = parent }, { __index = function(_, k)
        if k:match("^%u") and k ~= "TitleText" and not k:match("^On") then return noop end
      end })
      for _, k in ipairs({ "SetAllPoints", "SetFrameLevel", "RegisterEvent", "SetSize", "SetPoint", "SetFrameStrata", "SetMovable",
        "SetClampedToScreen", "EnableMouse", "RegisterForDrag", "SetMultiLine", "SetMaxLetters", "SetAutoFocus", "SetFontObject",
        "SetWidth", "SetScrollChild", "SetFocus", "SetOwner", "RegisterForClicks", "EnableKeyboard" }) do fr[k] = function() end end
      function fr:GetFrameLevel() return 1 end
      function fr:SetScript(k, fn) self[k] = fn end
      function fr:HookScript(k, fn) self[k] = fn end
      function fr:GetName() return name end
      function fr:CreateFontString() local fs = region(); self.fs = fs; if self.parent then self.parent.fs = fs end; return fs end
      function fr:CreateTexture() return region() end
      function fr:Show() self.shown = true; if self.OnShow then self.OnShow(self) end end
      function fr:Hide() self.shown = false end
      function fr:IsShown() return self.shown end
      function fr:SetText(s) self.value = s end
      function fr:GetText() return self.value end
      function fr:AddDoubleLine(l, r) lines[#lines + 1] = l .. " = " .. r end
      function fr:NumLines() return #lines end
      function fr:SetBagItem() end
      return fr
    end
    CreateFrame = function(_, name, parent) return frame(name, parent) end
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) lines[#lines + 1] = "chat: " .. m end }
    SlashCmdList = {}
    hooksecurefunc = function(t, name, fn) local orig = t[name]; t[name] = function(...) orig(...); fn(...) end end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    UnitClass = function() return "Warrior", "WARRIOR" end
    UnitLevel = function() return 30 end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    GetCoinTextureString = function(c) return c .. "c" end
    -- name, link, quality, ilvl, req, type, subtype, stack, equipLoc, texture, sell, classID, subclassID
    local I = {
      [9100] = { "Fine Mail Helm", 2, 32, 27, "INVTYPE_HEAD", 0, 4, 3 },
      [9101] = { "Old Mail Helm", 2, 22, 17, "INVTYPE_HEAD", 0, 4, 3 },
      [9102] = { "Plate Helm", 2, 40, 28, "INVTYPE_HEAD", 0, 4, 4 },    -- plate before 40: no
      [9103] = { "Great Axe", 3, 35, 30, "INVTYPE_2HWEAPON", 0, 2, 1 },
      [9104] = { "Short Sword", 2, 34, 29, "INVTYPE_WEAPON", 0, 2, 7 }, -- one-hander for a two-hander: no
      [248683] = { "Waylaid Crate: Apprentice Ore", 1, 10, 0, "", 0, 15, 0 },
      [2770] = { "Copper Ore", 1, 5, 0, "", 0, 7, 0 }, [2771] = { "Tin Ore", 1, 5, 0, "", 0, 7, 0 }, [2589] = { "Linen Cloth", 1, 5, 0, "", 0, 7, 0 },
    }
    C_Item = { GetItemInfo = function(item)
      local id = type(item) == "number" and item or tonumber(tostring(item):match("item:(%d+)"))
      local i = I[id]; if not i then return nil end
      return i[1], "|Hitem:" .. id .. "|h[" .. i[1] .. "]|h", i[2], i[3], i[4], "", "", 1, i[5], 0, i[6], i[7], i[8]
    end, GetItemCount = function(id) return ({ [2589] = 12, [2770] = 40 })[id] or 0 end }
    local worn = { [1] = 9101, [16] = 9103 }
    GetInventoryItemLink = function(_, slot) return worn[slot] and ("|Hitem:" .. worn[slot] .. "|h[x]|h") end
    GameTooltip, ItemRefTooltip = frame(), frame()
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 60,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "248683,5,1|2770:20,2771:20;" } }
    for _, f in ipairs({ "Core.lua", "Tooltip.lua", "Auction.lua", "Lists.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    ns.db.show.market, ns.db.show.min, ns.db.show.sold = false, false, false

    local function hover(id)
      for i = #lines, 1, -1 do table.remove(lines, i) end
      GameTooltip.foreverAnvilItem = nil
      GameTooltip.GetItem = function() return "x", "|Hitem:" .. id .. "::|h[x]|h" end
      GameTooltip:SetBagItem(0, 1)
      local t = {}
      for i = 2, #lines do t[#t + 1] = lines[i] end
      return id .. ": " .. table.concat(t, " | ")
    end
    local out = {}
    for _, id in ipairs({ 9100, 9101, 9102, 9103, 9104, 248683 }) do out[#out + 1] = hover(id) end

    -- the watchlist and shopping list arrive as strings from the site
    SlashCmdList.FOREVERANVIL("import FA1W:9101:850,2589")
    SlashCmdList.FOREVERANVIL("import FA1S:2589:20,2770:20,2771:10")
    out[#out + 1] = lines[#lines - 1]:gsub("^chat: |cffe6a23cForever Anvil|r: ", "")
    out[#out + 1] = hover(9101)
    out[#out + 1] = hover(2589)
    out[#out + 1] = hover(2770)
    -- /fa watch with a shift-clicked link and a price
    SlashCmdList.FOREVERANVIL("watch |cff1eff00|Hitem:9100::::::::30:::::|h[Fine Mail Helm]|h|r 55s")
    out[#out + 1] = lines[#lines]:gsub("^chat: |cffe6a23cForever Anvil|r: ", "")
    SlashCmdList.FOREVERANVIL("watch 9100 lots")
    out[#out + 1] = lines[#lines]:gsub("^chat: |cffe6a23cForever Anvil|r: ", "")

    -- auction rows: one tag each, the first that applies
    local rows = {}
    for _, c in ipairs({ { 9101, 840 }, { 9101, 900 }, { 2589, 15 }, { 2770, 10 }, { 9100, 6000 }, { 9104, 100 } }) do
      local kind, amount = ns.RowTag(c[1], c[2])
      rows[#rows + 1] = c[1] .. "@" .. c[2] .. "=" .. tostring(kind) .. ":" .. tostring(amount)
    end
    out[#out + 1] = table.concat(rows, " ")

    -- opening the auction house names watched items the shipped prices have at target, once per session
    GetMinimapZoneText, GetZoneText = function() return "Orgrimmar" end, function() return "Orgrimmar" end
    local before = #lines
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_SHOW")
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_SHOW")
    for i = before + 1, #lines do out[#out + 1] = lines[i]:gsub("^chat: |cffe6a23cForever Anvil|r: ", "") end
    return table.concat(out, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Tooltip.lua": src("Tooltip.lua"), "Auction.lua": src("Auction.lua"), "Lists.lua": src("Lists.lua") });
  assert.deepEqual(out.split("\n"), [
    "9100:   Upgrade = |cff33dd55+10 item level|r  |cff999999over your head|r",
    "9101: ",
    "9102: ",
    "9103: ",
    "9104: ",
    "248683:   Merchant's Favor = 5 |   Cheapest fill = 20 Copper Ore, 200c |   Per Favor = 40c",
    "watchlist imported: 2 items. Items at your target are tagged in the auction house.",
    "9101:   Watchlist = target 850c  |cff33dd55at target|r",
    "2589:   Watchlist = watched |   Shopping list = need 8 of 20",
    "2770:   Shopping list = |cff33dd55you have all 20|r",
    "watching Fine Mail Helm: target |cffc7c7cf55s|r, lowest |cffc7c7cf50s|r |cff33dd55(at target)|r",
    "that price isn't clear: write it like 2g50s, 75s or 30c.",
    "9101@840=target:840 9101@900=nil:nil 2589@15=need:8 2770@10=nil:nil 9100@6000=upgrade:10 9104@100=nil:nil",
    "Fine Mail Helm is at your target (|cffc7c7cf50s|r) (prices from 1m ago)",
    "Old Mail Helm is at your target (|cffc7c7cf8s|r) (prices from 1m ago)",
  ]);
});

// The leveling helper in the modern profession window: the known recipe with the cheapest reagents per
// expected skill point gets "skill-up"; the selected recipe shows its chance and cost per point.
test("smoke: profession window marks the cheapest skill-up", () => {
  const house = encodeHouse({ 2589: [12, 15, 400, 30], 2996: [100, 120, 50, 10], 100: [900, 1000, 10, 5] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local texts = {}
    local function region() local r = {}; function r:SetPoint() end; function r:SetJustifyH() end; function r:SetText(s) self.text = s end; return r end
    local function frame()
      local fr = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return function() end end end })
      function fr:RegisterEvent() end
      function fr:SetScript(k, fn) self[k] = fn end
      function fr:CreateFontString() local fs = region(); self.fs = fs; return fs end
      return fr
    end
    CreateFrame = function() return frame() end
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) texts[#texts + 1] = "chat: " .. m end }
    SlashCmdList = {}
    hooksecurefunc = function(t, name, fn) local orig = t[name]; t[name] = function(...) orig(...); fn(...) end end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    C_Item = { GetItemInfo = function() end }
    local callbacks = {}
    ScrollUtil = { AddInitializedFrameCallback = function(box, cb, owner) callbacks[box] = function(f, d) cb(owner, f, d) end end }
    -- 3275 Linen Bandage: 1 Linen (15c), yellow 30 grey 50; 3276 Heavy Linen Bandage: 2 Linen (30c), orange until 40;
    -- 7934 Anti-Venom and 9999: as cheap, but not learned
    local recipes = {
      [3275] = { outputItemID = 100, quantityMin = 1, reagentSlotSchematics = { { required = true, reagents = { { itemID = 2589 } }, quantityRequired = 1 } } },
      [3276] = { outputItemID = 100, quantityMin = 1, reagentSlotSchematics = { { required = true, reagents = { { itemID = 2589 } }, quantityRequired = 2 } } },
      [7934] = { outputItemID = 100, quantityMin = 1, reagentSlotSchematics = { { required = true, reagents = { { itemID = 2589 } }, quantityRequired = 1 } } },
      [9999] = { outputItemID = 100, quantityMin = 1, reagentSlotSchematics = { { required = true, reagents = { { itemID = 2589 } }, quantityRequired = 1 } } },
    }
    local known = { [3275] = 1, [3276] = 0 }
    C_TradeSkillUI = {
      GetRecipeSchematic = function(id) return recipes[id] end,
      GetAllRecipeIDs = function() return { 3275, 3276, 7934, 9999 } end,
      GetRecipeInfo = function(id) return { recipeID = id, learned = known[id] ~= nil, relativeDifficulty = known[id] } end,
      GetChildProfessionInfo = function() return { skillLevel = SKILL, maxSkillLevel = 150, professionName = "First Aid" } end,
    }
    local recipeBox = {}
    ProfessionsFrame = { CraftingPage = { RecipeList = { ScrollBox = recipeBox }, SchematicForm = frame() } }
    ProfessionsFrame.CraftingPage.SchematicForm.Init = function() end
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 60,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "", skill = "3275,,30,50;3276,,40,70;7934,80,80,115;", crates = "" } }
    for _, f in ipairs({ "Core.lua", "Profession.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    ns.frame.OnEvent(ns.frame, "TRADE_SKILL_SHOW")
    ns.db.show.craft = false
    local function row(id) local f = frame(); callbacks[recipeBox](f, { GetData = function() return { recipeInfo = { recipeID = id } } end }); return f.fs.text end
    local form = ProfessionsFrame.CraftingPage.SchematicForm
    for _, s in ipairs({ 1, 35, 45, 150 }) do
      SKILL = s
      ns.ResetSkillUp()
      local marks = {}
      for _, id in ipairs({ 3275, 3276, 7934 }) do marks[#marks + 1] = id .. "=[" .. row(id) .. "]" end
      form:Init({ recipeID = 3276, learned = true, relativeDifficulty = 0 })
      texts[#texts + 1] = s .. ": " .. table.concat(marks, " ") .. " form=[" .. tostring(form.fs.text) .. "]"
    end
    return table.concat(texts, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Profession.lua": src("Profession.lua") });
  const tag = "|cff40c0ffskill-up|r ";
  assert.deepEqual(out.split("\n"), [
    // skill 1: Linen Bandage (15c, sure) beats Heavy (30c, sure)
    `1: 3275=[${tag}] 3276=[] 7934=[] form=[|cffe6a23cForever Anvil|r  |cff40c0ffskill-up 100%, 30c per point|r]`,
    // skill 35: Linen Bandage is 75% (15c → 20c per point), Heavy still orange (30c)
    `35: 3275=[${tag}] 3276=[] 7934=[] form=[|cffe6a23cForever Anvil|r  |cff40c0ffskill-up 100%, 30c per point|r]`,
    // skill 45: Linen Bandage 25% (60c per point), Heavy 83% (36c)
    `45: 3275=[] 3276=[${tag}] 7934=[] form=[|cffe6a23cForever Anvil|r  |cff40c0ffskill-up 83%, 36c per point|r]`,
    // at the skill cap nothing levels
    "150: 3275=[] 3276=[] 7934=[] form=[]",
  ]);
});

// The minimap button and menu, with the game's frames stubbed (unknown frame methods do nothing).
test("smoke: minimap button opens the menu; its rows and switches work", () => {
  const house = encodeHouse({ 2589: [12, 15, 400, 30], 9101: [800, 900, 3, 3] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local chat = {}
    local noop = function() end
    local PROPS = { TitleText = true, Icon = true, Text = true }
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if PROPS[k] then return nil end return noop end })
      function r:SetText(s) self.text = s end
      function r:SetShown(on) self.shown = on end
      return r
    end
    local frames = {}
    local function frame(_, name, parent, template)
      local fr = setmetatable({ parent = parent, template = template, regions = {} }, { __index = function(_, k)
        if PROPS[k] or k:match("^On") then return nil end
        return noop
      end })
      function fr:SetScript(k, fn) rawset(self, k, fn) end
      function fr:GetFrameLevel() return 1 end
      function fr:CreateFontString() local fs = region(); self.regions[#self.regions + 1] = fs; return fs end
      function fr:CreateTexture() local t = region(); self.regions[#self.regions + 1] = t; return t end
      function fr:Show() self.shown = true; if self.OnShow then self.OnShow(self) end end
      function fr:Hide() self.shown = false end
      function fr:SetShown(on) if on then self:Show() else self:Hide() end end
      function fr:IsShown() return rawget(self, "shown") == true end
      function fr:IsMouseOver() return false end
      function fr:SetPoint(...) self.point = { ... } end
      function fr:SetSize(w, h) self.w, self.h = w, h end
      function fr:RegisterEvent(e) local ev = rawget(self, "events") or {}; ev[e] = true; rawset(self, "events", ev) end
      function fr:Click(button) self.OnClick(self, button or "LeftButton") end
      if name then _G[name] = fr end
      frames[#frames + 1] = fr
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    function UIParent:GetWidth() return 1920 end
    function UIParent:GetHeight() return 1080 end
    Minimap = frame()
    function Minimap:GetWidth() return 140 end
    function Minimap:GetHeight() return 140 end
    BackdropTemplateMixin = {}
    tinsert = table.insert
    local tipLines = {}
    GameTooltip = frame()
    function GameTooltip:AddLine(s) tipLines[#tipLines + 1] = s end
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = m end }
    SlashCmdList = {}
    hooksecurefunc = function(t, name, fn) local orig = t[name]; t[name] = function(...) orig(...); fn(...) end end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    C_Item = { GetItemInfo = function(id) if id == 2589 then return "Linen Cloth" end if id == 9101 then return "Old Mail Helm" end end,
      GetItemCount = function(id) return id == 2589 and 12 or 0 end }
    local compartment
    AddonCompartmentFrame = { RegisterAddon = function(_, info) compartment = info end }
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 7200,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "" } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Minimap.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.OpenOptions = function() chat[#chat + 1] = "options opened" end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    ns.Import("FA1W:9101:850,2589")
    ns.Import("FA1S:2589:20,4306:5")
    if ForeverAnvilShopping then ForeverAnvilShopping:Hide() end

    local out = {}
    local b = ForeverAnvilMinimapButton
    out[#out + 1] = "button: " .. tostring(b ~= nil and b.shown) .. ", at " .. string.format("%.0f,%.0f", b.point[4], b.point[5])
    out[#out + 1] = "compartment: " .. tostring(compartment and compartment.text) .. ", " .. tostring(compartment and compartment.icon)
    b.OnEnter(b)
    out[#out + 1] = "tooltip: " .. table.concat(tipLines, " / ")
    b:Click("RightButton")
    out[#out + 1] = chat[#chat]
    b:Click("LeftButton")
    local menu = ForeverAnvilMenu
    out[#out + 1] = "menu shown: " .. tostring(menu.shown) .. ", status: " .. menu.status.text
    out[#out + 1] = "shopping: " .. menu.shopping.value.text
    out[#out + 1] = "watch: " .. menu.watch.value.text
    local function toggles()
      local t = {}
      for _, r in ipairs(menu.toggles) do t[#t + 1] = (r.check.shown and "x " or "- ") .. r.label.text end
      return table.concat(t, " | ")
    end
    out[#out + 1] = "toggles: " .. toggles()
    menu.toggles[1]:Click()
    menu.toggles[3]:Click()
    out[#out + 1] = "after clicks: " .. toggles() .. "; market=" .. tostring(ns.db.show.market) .. " region=" .. tostring(ns.db.show.region)
    menu.watch:Click()
    out[#out + 1] = "watch window: " .. tostring(ForeverAnvilWatchlist.shown) .. ", first row " .. ForeverAnvilWatchlist.rows[1].name.text
      .. " " .. ForeverAnvilWatchlist.rows[1].cost.text .. "; " .. ForeverAnvilWatchlist.total.text
    -- right-click a watchlist line: it's off the list
    ForeverAnvilWatchlist.rows[1]:Click("RightButton")
    out[#out + 1] = chat[#chat] .. " -> " .. menu.watch.value.text
    menu.shopping:Click()
    out[#out + 1] = "shopping window: " .. tostring(ForeverAnvilShopping.shown) .. ", " .. ForeverAnvilShopping.total.text
    -- clicking the button again closes the menu; hiding the button from the menu
    b:Click("LeftButton")
    out[#out + 1] = "menu after second click: " .. tostring(menu.shown)
    b:Click("LeftButton")
    menu.hide:Click()
    out[#out + 1] = "hidden: button " .. tostring(b.shown) .. ", menu " .. tostring(menu.shown) .. ", saved " .. tostring(ns.db.show.minimap)
    SlashCmdList.FOREVERANVIL("minimap")
    out[#out + 1] = "after /fa minimap: " .. tostring(b.shown)
    -- dragging moves it round the minimap: cursor straight above the centre → 90 degrees
    function Minimap:GetCenter() return 500, 500 end
    function Minimap:GetEffectiveScale() return 1 end
    GetCursorPosition = function() return 500, 700 end
    b.OnDragStart(b)
    b.OnUpdate(b)
    b.OnDragStop(b)
    out[#out + 1] = "dragged: angle " .. string.format("%.0f", ns.db.minimap.angle) .. ", at " .. string.format("%.0f,%.0f", b.point[4], b.point[5])
    return table.concat(out, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Minimap.lua": src("Minimap.lua") });
  // default angle 210°: cos −0.866, sin −0.5 at radius 75
  assert.deepEqual(out.split("\n"), [
    "button: true, at -65,-38",
    "compartment: Forever Anvil, Interface\\AddOns\\ForeverAnvil\\Media\\Icon",
    "tooltip: |cffe6a23cForever Anvil|r / PvP horde  |cff999999·  prices 2h ago|r / 1 of your 2 watched items at target /   / |cffffffffClick|r  menu / |cffffffffRight-click|r  settings / |cffffffffDrag|r  move this button",
    "options opened",
    "menu shown: true, status: PvP horde  |cff999999·  prices 2h ago|r",
    "shopping: 2 to buy  |cff999999~1s 20c|r",
    "watch: 2 items  |cff33dd551 at target|r",
    "toggles: x Prices on tooltips | x Flips in the auction house | x Upgrades for your gear | x Craft profits | x Cheapest skill-up | x Waylaid crate values",
    "after clicks: - Prices on tooltips | x Flips in the auction house | - Upgrades for your gear | x Craft profits | x Cheapest skill-up | x Waylaid crate values; market=false region=false",
    "watch window: true, first row |cffffffffOld Mail Helm|r |cff33dd558s|r; |cff33dd551 at target|r  |cff999999prices 2h ago|r",
    "|cffe6a23cForever Anvil|r: Old Mail Helm is off your watchlist. -> 1 item",
    "shopping window: true, To buy: ~1s 20c",
    "menu after second click: false",
    "hidden: button false, menu false, saved false",
    "after /fa minimap: true",
    "dragged: angle 90, at 0,75",
  ]);
});

test("shopping list amounts add up and counts are whole numbers", () => {
  const out = runLua(`
    local list = { { 2589, 10 } }
    M.AddMaterials(list, { { 2589, 2 }, { 2996, 1 } }, 3)
    M.AddMaterials(list, { { 4306, 0 } }, 5)
    local parts = {}
    for _, e in ipairs(list) do parts[#parts + 1] = e[1] .. "=" .. e[2] end
    local counts = {}
    for _, s in ipairs({ "5", " 12 ", "0", "10000", "2.5", "x", "" }) do counts[#counts + 1] = tostring(M.ParseCount(s)) end
    return table.concat(parts, ",") .. " | " .. table.concat(counts, ",")`);
  assert.equal(out, "2589=16,2996=3 | 5,12,nil,nil,nil,nil,nil");
});

// Both lists kept without the site: the windows' editors, shift-click into the item box, Alt-click to watch,
// and "Add to shopping list" in the profession window.
test("smoke: watchlist and shopping list managed in game", () => {
  const house = encodeHouse({ 2589: [12, 15, 400, 30], 2996: [100, 120, 50, 10] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local chat = {}
    local noop = function() end
    local frames = {}
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s end
      function r:SetShown(on) self.shown = on end
      return r
    end
    local function frame(kind, name, parent, template)
      local fr = setmetatable({ kind = kind, parent = parent, template = template }, { __index = function(_, k)
        if k:match("^%u") and k ~= "TitleText" and not k:match("^On") then return noop end
      end })
      function fr:SetScript(k, fn) rawset(self, k, fn) end
      function fr:GetFrameLevel() return 1 end
      function fr:CreateFontString() return region() end
      function fr:CreateTexture() return region() end
      function fr:Show() self.shown = true; if self.OnShow then self.OnShow(self) end end
      function fr:Hide() self.shown = false end
      function fr:IsShown() return rawget(self, "shown") == true end
      function fr:SetShown(on) if on then self:Show() else self:Hide() end end
      function fr:SetText(s) self.value = s end
      function fr:GetText() return self.value or "" end
      function fr:SetFocus() self.focus = true end
      function fr:ClearFocus() self.focus = false end
      function fr:HasFocus() return self.focus == true end
      function fr:Click(button) self.OnClick(self, button or "LeftButton") end
      if name then _G[name] = fr end
      frames[#frames + 1] = fr
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    GameTooltip = frame()
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = (m:gsub("^|cffe6a23cForever Anvil|r: ", "")) end }
    SlashCmdList = {}
    hooksecurefunc = function(a, b, c)
      if type(a) == "string" then local orig = _G[a]; _G[a] = function(...) local r = orig(...); b(...); return r end
      else local orig = a[b]; a[b] = function(...) local r = orig(...); c(...); return r end end
    end
    ChatEdit_InsertLink = function() return false end
    HandleModifiedItemClick = function() end
    local alt = false
    IsAltKeyDown, IsShiftKeyDown, IsControlKeyDown = function() return alt end, function() return false end, function() return false end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    local names = { [2589] = "Linen Cloth", [2996] = "Bolt of Linen Cloth", [2321] = "Fine Thread" }
    C_Item = { GetItemInfo = function(item)
      local id = type(item) == "number" and item or tonumber(tostring(item):match("item:(%d+)") or "")
      if not id then for k, v in pairs(names) do if v == item then id = k end end end
      if names[id] then return names[id], "|cffffffff|Hitem:" .. id .. "::|h[" .. names[id] .. "]|h|r" end
    end, GetItemCount = function(id) return id == 2589 and 4 or 0 end }
    -- the profession window, with one recipe: Bolt of Linen Cloth from 2 Linen Cloth
    C_TradeSkillUI = {
      GetRecipeSchematic = function(id) if id == 2963 then return { outputItemID = 2996, quantityMin = 1,
        reagentSlotSchematics = { { required = true, reagents = { { itemID = 2589 } }, quantityRequired = 2 } } } end end,
      GetRecipeInfo = function(id) return { recipeID = id, name = "Bolt of Linen Cloth", learned = true } end,
    }
    ScrollUtil = { AddInitializedFrameCallback = function() end }
    local craftAll = frame()
    ProfessionsFrame = { CraftingPage = { RecipeList = { ScrollBox = {} }, SchematicForm = frame(), CreateAllButton = craftAll } }
    ProfessionsFrame.CraftingPage.SchematicForm.Init = function() end
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 60,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "2321,10;", noDisenchant = "", skill = "", crates = "" } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Profession.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    local out = {}
    local function last() return chat[#chat] end
    local function watchState()
      local ids = {}
      for id, t in pairs(ns.db.watch) do ids[#ids + 1] = id .. "=" .. t end
      table.sort(ids)
      return "{" .. table.concat(ids, ",") .. "}"
    end
    local function shopState()
      local p = {}
      for _, e in ipairs(ns.db.shopping) do p[#p + 1] = e[1] .. "=" .. e[2] end
      return "{" .. table.concat(p, ",") .. "}"
    end

    -- the watchlist window opens even while empty
    SlashCmdList.FOREVERANVIL("watch")
    local W = ForeverAnvilWatchlist
    out[#out + 1] = "watch window: " .. tostring(W.shown) .. ", " .. W.total.text
    -- shift-click an item into the focused Item box, type a price, Save
    W.item:SetFocus()
    ChatEdit_InsertLink("|cffffffff|Hitem:2589::|h[Linen Cloth]|h|r")
    out[#out + 1] = "item box: " .. W.item:GetText() .. ", focus moved to the amount: " .. tostring(W.amount:HasFocus() and not W.item:HasFocus())
    W.amount:SetText("bad")
    W.saveButton:Click()
    out[#out + 1] = "bad price: " .. last() .. " " .. watchState()
    W.amount:SetText("1g20s")
    W.saveButton:Click()
    out[#out + 1] = "saved: " .. watchState() .. ", boxes [" .. W.item:GetText() .. "][" .. W.amount:GetText() .. "]"
    -- an item typed by name, no price: watched without a target
    W.item:SetText("Bolt of Linen Cloth")
    W.saveButton:Click()
    out[#out + 1] = "by name: " .. watchState()
    -- clicking a line puts it in the editor, ready to change
    W.rows[1]:Click() -- Linen Cloth: at target, so first
    out[#out + 1] = "edit line: [" .. W.item:GetText() .. "][" .. W.amount:GetText() .. "] " .. W.editLabel.text .. ", "
      .. W.saveButton.value .. ", row marked " .. tostring(W.rows[1].selected.shown)
    W.amount:SetText("90s")
    W.saveButton:Click()
    out[#out + 1] = "changed: " .. watchState() .. ", button back to " .. W.saveButton.value
    -- the pencil edits too; Cancel empties the editor without saving
    W.rows[2].edit:Click()
    W.amount:SetText("5g")
    W.cancelButton:Click()
    out[#out + 1] = "cancelled: " .. watchState() .. " [" .. W.item:GetText() .. "]"
    -- a row's X removes it
    W.rows[2].delete:Click()
    out[#out + 1] = "removed: " .. last() .. " " .. watchState()
    -- a long list scrolls with the mouse wheel
    for id = 5001, 5020 do ns.db.watch[id] = 0 end
    ns.RefreshWatch()
    W.rows[1].parent.OnMouseWheel(W.rows[1].parent, -1)
    out[#out + 1] = "scrolled: " .. W.total.text:match("|cff999999(%d+–%d+ of %d+)") .. ", first row " .. W.rows[1].itemID
    for id = 5001, 5020 do ns.db.watch[id] = nil end
    ns.RefreshWatch()
    -- Alt-click an item in your bags
    alt = true
    HandleModifiedItemClick("|cffffffff|Hitem:2321::|h[Fine Thread]|h|r")
    HandleModifiedItemClick("|cffffffff|Hitem:2321::|h[Fine Thread]|h|r")
    alt = false
    HandleModifiedItemClick("|cffffffff|Hitem:2996::|h[Bolt of Linen Cloth]|h|r")
    out[#out + 1] = "alt-click: " .. chat[#chat - 1] .. " / " .. last() .. " " .. watchState()
    -- Clear needs a second click
    W.clearButton:Click()
    out[#out + 1] = "clear once: " .. W.clearButton.value .. " " .. watchState()
    W.clearButton:Click()
    out[#out + 1] = "clear twice: " .. watchState()

    -- profession window: pick a recipe, 3 crafts, Add to shopping list
    ns.frame.OnEvent(ns.frame, "TRADE_SKILL_SHOW")
    local add, count
    for i, f in ipairs(frames) do if f.value == "Add to shopping list" then add, count = f, frames[i + 1] end end
    out[#out + 1] = "button beside craft all: " .. tostring(add ~= nil and add.parent == ProfessionsFrame.CraftingPage)
    add:Click()
    out[#out + 1] = "no recipe: " .. last()
    ProfessionsFrame.CraftingPage.SchematicForm:Init({ recipeID = 2963 })
    count:SetText("3")
    add:Click()
    out[#out + 1] = "added: " .. last() .. " " .. shopState() .. ", box back to " .. count:GetText()
    add:Click()
    local S = ForeverAnvilShopping
    out[#out + 1] = "again: " .. shopState() .. ", window " .. tostring(S.shown) .. ": " .. S.rows[1].name.text .. " " .. S.rows[1].count.text
    -- the shopping list's own editor
    S.item:SetText("2321")
    S.amount:SetText("0")
    S.saveButton:Click()
    out[#out + 1] = "zero: " .. last()
    S.amount:SetText("5")
    S.saveButton:Click()
    out[#out + 1] = "thread: " .. shopState()
    S.rows[2]:Click("RightButton") -- Linen Cloth costs more, so it comes first
    out[#out + 1] = "right-click: " .. last() .. " " .. shopState()
    SlashCmdList.FOREVERANVIL("list")
    out[#out + 1] = "/fa list toggles: " .. tostring(S.shown)
    return table.concat(out, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Profession.lua": src("Profession.lua") });
  assert.deepEqual(out.split("\n"), [
    "watch window: true, |cff999999Empty. Add items below, Alt-click an item in your bags, or use the prices window.|r",
    "item box: |cffffffff|Hitem:2589::|h[Linen Cloth]|h|r, focus moved to the amount: true",
    "bad price: that price isn't clear: write it like 2g50s, 75s or 30c (or leave it empty). {}",
    "saved: {2589=12000}, boxes [][]",
    "by name: {2589=12000,2996=0}",
    "edit line: [|cffffffff|Hitem:2589::|h[Linen Cloth]|h|r][1g20s] Editing |cffffffffLinen Cloth|r, Save, row marked true",
    "changed: {2589=9000,2996=0}, button back to Add",
    "cancelled: {2589=9000,2996=0} []",
    "removed: Bolt of Linen Cloth is off your watchlist. {2589=9000}",
    "scrolled: 3–16 of 21, first row 5002",
    "alt-click: Fine Thread added to your watchlist. Set a target price in |cffffffff/fa watch|r. / Fine Thread is already on your watchlist (|cffffffff/fa watch|r to set its target). {2321=0,2589=9000}",
    "clear once: |cffff5555Sure?|r {2321=0,2589=9000}",
    "clear twice: {}",
    "button beside craft all: true",
    "no recipe: pick a recipe with reagents first.",
    "added: added the materials for 3× Bolt of Linen Cloth to your shopping list. {2589=6}, box back to 1",
    "again: {2589=8}, window true: |cffffffffLinen Cloth|r 4/8",
    "zero: how many? Type a number from 1 to 9999.",
    "thread: {2589=8,2321=5}",
    "right-click: Fine Thread is off your shopping list. {2589=8}",
    "/fa list toggles: false",
  ]);
});

// The prices window (Prices.lua): item names ship with the data, and M.PriceRows searches, filters and sorts
// one house's items like the site's /prices page (src/tools/Prices.svelte).
test("item names ship with the data and decode in the addon, commas and quotes included", () => {
  const cache = {
    25: ["Worn Shortsword", 7, 0, 35, "common", "Weapon", 135274, null, "Sword", "WEAPONMAINHAND", 1, 2],
    2589: ["Linen Cloth", 13, 0, 0, "common", "Trade Goods", 132889, null, "Cloth", "", 0, 5],
    7: ['BKP 2700 "Enforcer"', 1, 0, 0, "rare", "Weapon", 135610, null, "Gun", "RANGEDRIGHT", 37, 42],
    8: ["Legends of the Gurubashi, Volume 3", 0, 0, 0, null, "Quest", null, null, null, null, null, null],
    9: [null, null, 20777, null, null, null, 134941, null],
  };
  const s = encodeItems(cache, new Set([25, 2589, 7, 8, 9, 404]));
  assert.equal(s, '7,3,w,37,135610,BKP 2700 "Enforcer"\n8,,o,,,Legends of the Gurubashi, Volume 3\n25,1,w,1,135274,Worn Shortsword\n2589,1,t,0,132889,Linen Cloth\n');
  // through the Lua source as the data file writes it (JSON quoting)
  const out = runLua(`
    local t = M.DecodeItems(assert(load("return " .. S))())
    local p = {}
    for _, id in ipairs({ 7, 8, 25, 2589, 9 }) do
      local e = t[id]
      p[#p + 1] = e and table.concat({ id, e[1], tostring(e[2]), e[3], tostring(e[4]), tostring(e[5]) }, "|") or (id .. "|none")
    end
    return table.concat(p, "\\n")`, { S: JSON.stringify(s) });
  assert.deepEqual(out.split("\n"), [
    '7|BKP 2700 "Enforcer"|3|w|37|135610',
    "8|Legends of the Gurubashi, Volume 3|nil|o|nil|nil",
    "25|Worn Shortsword|1|w|1|135274",
    "2589|Linen Cloth|1|t|0|132889",
    "9|none",
  ]);
});

test("prices window search, categories and sorting follow the prices page's rules", () => {
  // the site's rules (Prices.svelte): search by name or exact id, category, then the sort; "Biggest market"
  // (gold listed) puts thin markets (under 3 listings) last; missing values last; ties by name, then id
  const THIN = 3;
  function siteRows(items, names, { term, cat, sort, dir }) {
    const val = (r) => {
      const a = r.a;
      switch (sort) {
        case "name": return r.name;
        case "market": return a[1];
        case "min": return a[0];
        case "qty": return a[2];
        case "sold": return a[4] || 0;
        default: return a[1] == null ? null : a[1] * (a[2] || 0);
      }
    };
    const byName = (a, b) => (a.name === b.name ? a.id - b.id : a.name == null ? 1 : b.name == null ? -1 : a.name < b.name ? -1 : 1);
    return Object.entries(items).map(([id, a]) => ({ id: +id, a, name: names[id]?.[0] ?? null, cat: names[id]?.[1] || "o" }))
      .filter((r) => (!cat || r.cat === cat) && (!term || (r.name && r.name.includes(term)) || String(r.id) === term))
      .sort((a, b) => {
        if (sort === "value") { const ta = (a.a[3] || 0) < THIN, tb = (b.a[3] || 0) < THIN; if (ta !== tb) return ta ? 1 : -1; }
        const x = val(a), y = val(b);
        if (x == null || y == null) return x == null && y == null ? byName(a, b) : x == null ? 1 : -1;
        if (x !== y) return (x < y ? -1 : 1) * dir;
        return byName(a, b);
      }).map((r) => r.id);
  }
  const words = ["linen", "wool", "silk", "copper", "tin", "iron", "bolt", "thread", "dye", "flux", "ore", "bar"];
  let seed = 7;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const items = {}, names = {};
  for (let i = 0; i < 80; i++) {
    const id = 1000 + rnd(9000);
    const market = rnd(10) === 0 ? null : 1 + rnd(40) * 25;
    items[id] = [1 + rnd(900), market, 1 + rnd(30), rnd(6), rnd(4) === 0 ? null : rnd(50)];
    if (rnd(8)) names[id] = [`${words[rnd(words.length)]} ${words[rnd(words.length)]} ${id}`, "wtao"[rnd(4)]];
  }
  const house = encodeHouse(items);
  const itemStr = Object.entries(names).map(([id, [n, c]]) => `${id},1,${c},,,${n}\n`).join("");
  const cases = [];
  for (const sort of ["value", "name", "market", "min", "qty", "sold"]) for (const dir of [1, -1]) for (const cat of ["", "w", "o"])
    for (const term of ["", "lin", String(Object.keys(items)[3])]) cases.push({ sort, dir, cat, term });
  const out = runLua(`
    local items, names = M.DecodeHouse(HOUSE), M.DecodeItems(NAMES)
    local res = {}
    for c in CASES:gmatch("[^;]+") do
      local sort, dir, cat, term = c:match("^(%a+),(-?%d),(%a*),(%w*)$")
      local ids = {}
      for _, r in ipairs(M.PriceRows(items, names, { sort = sort, dir = tonumber(dir), cat = cat, term = term })) do ids[#ids + 1] = r.id end
      res[#res + 1] = table.concat(ids, ",")
    end
    return table.concat(res, ";")`, { HOUSE: house, NAMES: itemStr, CASES: cases.map((c) => `${c.sort},${c.dir},${c.cat},${c.term}`).join(";") });
  const got = out.split(";");
  assert.equal(got.length, cases.length);
  cases.forEach((c, i) => assert.equal(got[i], siteRows(items, names, c).join(","), JSON.stringify(c)));
});

test("smoke: prices window searches, filters, sorts, switches house and acts on an item", () => {
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const horde = encodeHouse({ 2589: [12, 15, 400, 30, 120], 2592: [40, 45, 200, 20, 60], 2770: [9, 10, 25, 5, 8], 25: [5000, 6000, 1, 1], 4306: [100, 110, 50, 12, 30] });
  const alliance = encodeHouse({ 2589: [20, 22, 100, 8, 40] });
  const itemStr = encodeItems({
    2589: ["Linen Cloth", 13, 0, 0, "common", "Trade Goods", 132889], 2592: ["Wool Cloth", 33, 0, 0, "common", "Trade Goods", 132911],
    2770: ["Copper Ore", 5, 0, 0, "common", "Trade Goods", 134566], 25: ["Worn Shortsword", 7, 0, 35, "common", "Weapon", 135274, null, "Sword", "WEAPONMAINHAND", 1],
    4306: ["Silk Cloth", 150, 0, 0, "common", "Trade Goods", 132905],
  }, new Set([2589, 2592, 2770, 25, 4306]));
  const out = runLua(`
    local chat = {}
    local noop = function() end
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s end
      function r:SetShown(on) self.shown = on end
      function r:SetTexture(t) self.texture = t end
      return r
    end
    local function frame(kind, name, parent)
      local fr = setmetatable({ kind = kind, parent = parent }, { __index = function(_, k)
        if k:match("^%u") and k ~= "TitleText" and not k:match("^On") then return noop end
      end })
      function fr:SetScript(k, fn) rawset(self, k, fn) end
      function fr:GetFrameLevel() return 1 end
      function fr:CreateFontString() return region() end
      function fr:CreateTexture() return region() end
      function fr:Show() self.shown = true; if self.OnShow then self.OnShow(self) end end
      function fr:Hide() self.shown = false end
      function fr:IsShown() return rawget(self, "shown") == true end
      function fr:SetShown(on) if on then self:Show() else self:Hide() end end
      function fr:SetText(s) self.value = s; if self.OnTextChanged then self.OnTextChanged(self) end end
      function fr:GetText() return self.value or "" end
      function fr:LockHighlight() self.lit = true end
      function fr:UnlockHighlight() self.lit = false end
      function fr:Click(button) self.OnClick(self, button or "LeftButton") end
      if name then _G[name] = fr end
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    GameTooltip = frame()
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = (m:gsub("^|cffe6a23cForever Anvil|r: ", "")) end }
    SlashCmdList = {}
    hooksecurefunc = function() end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    -- the game has loaded none of these items: names and icons come from the data
    C_Item = { GetItemInfo = function() return nil end, GetItemCount = function() return 0 end }
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 600,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HORDE }, [110] = { group = "A", faction = "alliance", data = ALLIANCE } },
      regionMedian = "2589,17,3;", vendorBuy = "", noDisenchant = "", skill = "", crates = "", items = ITEMS } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Prices.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    local P
    local out = {}
    local function names()
      local t = {}
      for _, b in ipairs(P.rows) do if b.shown ~= false and b.itemID then t[#t + 1] = (b.name.text:gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end end
      return table.concat(t, ", ")
    end
    SlashCmdList.FOREVERANVIL("prices")
    P = ForeverAnvilPrices
    out[#out + 1] = "open: " .. tostring(P.shown) .. "; " .. names() .. "; " .. P.status.text:gsub(" · prices.*", "")
    out[#out + 1] = "first row: icon " .. tostring(P.rows[1].icon.texture) .. ", " .. P.rows[1].market.text .. " " .. P.rows[1].min.text .. " " .. P.rows[1].qty.text .. " " .. P.rows[1].sold.text
    -- categories count what's on sale
    local cats = {}
    for _, c in ipairs(P.cats) do if c.count.text ~= "" then cats[#cats + 1] = c.label.text .. " " .. c.count.text end end
    out[#out + 1] = "categories: " .. table.concat(cats, ", ")
    P.cats[2]:Click() -- Weapons
    out[#out + 1] = "weapons: " .. names()
    P.cats[1]:Click()
    -- search by name
    P.search:SetText("  CLOTH ")
    out[#out + 1] = "search cloth: " .. names()
    -- sort by a column, again to flip
    P.heads[3]:Click() -- Lowest
    out[#out + 1] = "lowest, dearest first: " .. names()
    P.heads[3]:Click()
    out[#out + 1] = "flipped: " .. names()
    P.heads[1]:Click() -- name
    out[#out + 1] = "by name: " .. names()
    P.search:SetText("")
    -- the other faction's house
    P.sides[3]:Click() -- Alliance
    out[#out + 1] = "alliance: " .. names() .. "; " .. P.status.text:match("PvP %a+") .. ", lit " .. tostring(P.sides[3].lit) .. "/" .. tostring(P.sides[2].lit)
    P.sides[2]:Click()
    -- a line's details, and what you can do with it
    P.rows[5]:Click()
    local d = P.detail
    out[#out + 1] = "detail: " .. d.name.text .. " | " .. d.line1.text .. " | " .. d.line2.text .. " | row marked " .. tostring(P.rows[5].selected.shown)
    P.rows[2]:Click() -- still sorted by name: Copper Ore, Linen Cloth, …
    out[#out + 1] = "detail: " .. d.name.text .. " | " .. d.line1.text .. " | " .. d.line2.text
    d.watch:Click()
    out[#out + 1] = "watch: " .. chat[#chat] .. " " .. tostring(ns.db.watch[2589]) .. ", button " .. d.watch.value
    d.watch:Click()
    out[#out + 1] = "unwatch: " .. tostring(ns.db.watch[2589]) .. ", button " .. d.watch.value
    d.count:SetText("3")
    d.add:Click()
    d.count:SetText("2")
    d.add:Click()
    out[#out + 1] = "add: " .. chat[#chat] .. " " .. ns.db.shopping[1][1] .. "=" .. ns.db.shopping[1][2] .. ", shopping window " .. tostring(ForeverAnvilShopping.shown)
    d.search:Click()
    out[#out + 1] = "search AH while closed: " .. chat[#chat]
    P.rows[2]:Click()
    out[#out + 1] = "click again closes details: " .. tostring(d.shown)
    -- /fa prices with words searches; Esc closes (UISpecialFrames)
    P:Hide()
    SlashCmdList.FOREVERANVIL("prices wool")
    out[#out + 1] = "/fa prices wool: " .. tostring(P.shown) .. ", " .. names() .. ", Esc closes: " .. tostring(UISpecialFrames[#UISpecialFrames] == "ForeverAnvilPrices")
    return table.concat(out, "\\n")`, { HORDE: horde, ALLIANCE: alliance, ITEMS: itemStr, "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Prices.lua": src("Prices.lua") });
  assert.deepEqual(out.split("\n"), [
    "open: true; Wool Cloth, Linen Cloth, Silk Cloth, Copper Ore, Worn Shortsword; Showing 1–5 of 5 items  |cff999999PvP horde",
    "first row: icon 132911, 45c 40c 200 60",
    "categories: All items 5, Weapons 1, Trade goods 4",
    "weapons: Worn Shortsword",
    "search cloth: Wool Cloth, Linen Cloth, Silk Cloth",
    "lowest, dearest first: Silk Cloth, Wool Cloth, Linen Cloth",
    "flipped: Linen Cloth, Wool Cloth, Silk Cloth",
    "by name: Linen Cloth, Silk Cloth, Wool Cloth",
    "alliance: Linen Cloth; PvP alliance, lit true/false",
    "detail: |cffffffffWorn Shortsword|r | Market 60s · Lowest 50s · 1 listed in 1 listings | |cffbbbbbb|r | row marked true",
    "detail: |cffffffffLinen Cloth|r | Market 15c · Lowest 12c · 400 listed in 30 listings · Sold 120/day | |cffbbbbbbRegion 17c (3 houses)|r",
    "watch: Linen Cloth added to your watchlist. Set a target price in |cffffffff/fa watch|r. 0, button Unwatch",
    "unwatch: nil, button Watch",
    "add: shopping list: 2× Linen Cloth (5 in all). 2589=5, shopping window true",
    "search AH while closed: open the auction house first, then press Search AH.",
    "click again closes details: false",
    "/fa prices wool: true, Wool Cloth, Esc closes: true",
  ]);
});
