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
import { encodeHouse, regionMedians, encodeSkill, encodeCrates, encodeItems, encodeGear } from "./addon-data.js";
import { findUpgrades } from "../src/lib/upgrades.js";
import { skillUpChance, planLeveling } from "../src/lib/levelmath.js";
import { rankCrates } from "../src/lib/cratemath.js";
import { watchString, shoppingString } from "../src/lib/addonstring.js";

const { lua, lauxlib, lualib, to_luastring } = fengari;
const ADDON = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../addon/ForeverAnvil");
const MATH = fs.readFileSync(path.join(ADDON, "Math.lua"), "utf8");
const LOCALE = fs.readFileSync(path.join(ADDON, "Locale.lua"), "utf8");

/** Runs Lua code with Math.lua loaded as M; the code returns a string. Globals: name → string. */
function runLua(body, globals = {}) {
  const L = lauxlib.luaL_newstate();
  lualib.luaL_openlibs(L);
  for (const [k, v] of Object.entries({ MATH_SRC: MATH, LOCALE_SRC: LOCALE, ...globals })) {
    lua.lua_pushstring(L, to_luastring(v));
    lua.lua_setglobal(L, to_luastring(k));
  }
  const code = `local ns = {}; assert(load(MATH_SRC, "=Math.lua"))("ForeverAnvil", ns); assert(load(LOCALE_SRC, "=Locale.lua"))("ForeverAnvil", ns); local M = ns.Math\n${body}`;
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
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return function() end end end })
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
    texts[#texts + 1] = "form: " .. form.fs.text .. " (no name text: top right)"
    -- under the recipe's name, or under "Requires: Cooking Fire" when the recipe shows one
    local line = form.fs
    form.OutputText = { name = "name" }
    form.RequiredTools = { name = "tools", IsShown = function() return true end, GetText = function() return "" end }
    form:Init({ recipeID = 1 })
    local first = line.anchor.name
    form.RequiredTools.GetText = function() return "Requires: Cooking Fire" end
    form:Init({ recipeID = 1 })
    texts[#texts + 1] = "placed under: " .. first .. ", then " .. line.anchor.name
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
    "form: |cffe6a23cForever Anvil|r  profit |cff33dd55+71s|r  |cff999999reagents 24s|r (no name text: top right)",
    "placed under: name, then tools",
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
    local function region() local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return function() end end end }); function r:SetPoint() end; function r:SetJustifyH() end; function r:SetText(s) self.text = s end; return r end
    local function frame()
      local fr = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return function() end end end })
      function fr:RegisterEvent() end
      function fr:SetScript(k, fn) self[k] = fn end
      function fr:CreateFontString() local fs = region(); self.fs = fs; return fs end
      function fr:CreateTexture() return region() end
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

// Ruleset picker (Ruleset.lua): opens by itself after login while the realm has none, once a session; the minimap
// button opens it instead of the menu until one is picked; the menu's status line and /fa ruleset reopen it.
test("smoke: ruleset picker asks once after login and from the minimap button, menu and /fa ruleset", () => {
  const house = encodeHouse({ 2589: [12, 15, 400, 30] });
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local chat = {}
    local noop = function() end
    local PROPS = { TitleText = true, Icon = true, Text = true }
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if PROPS[k] then return nil end return noop end })
      function r:SetText(s) self.text = s end
      function r:GetText() return self.text end
      function r:SetShown(on) self.shown = on end
      function r:IsShown() return self.shown ~= false end
      function r:GetStringHeight() return 12 end
      return r
    end
    local function frame(_, name, parent, template)
      local fr = setmetatable({ parent = parent, template = template, regions = {} }, { __index = function(_, k)
        if PROPS[k] or k:match("^On") then return nil end
        return noop
      end })
      function fr:SetScript(k, fn) rawset(self, k, fn) end
      function fr:GetScript(k) return rawget(self, k) end
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
      function fr:SetHeight(h) self.h = h end
      function fr:LockHighlight() self.lit = true end
      function fr:UnlockHighlight() self.lit = false end
      function fr:RegisterEvent(e) local ev = rawget(self, "events") or {}; ev[e] = true; rawset(self, "events", ev) end
      function fr:Click(button) self.OnClick(self, button or "LeftButton") end
      if name then _G[name] = fr end
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
    GetRealmName = function() return "Forever" end -- the name doesn't say which ruleset
    GetMinimapZoneText = function() return "Orgrimmar" end
    GetZoneText = GetMinimapZoneText
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    C_Item = { GetItemInfo = function(id) if id == 2589 then return "Linen Cloth" end end, GetItemCount = function() return 0 end }
    local timers = {}
    C_Timer = { After = function(s, fn) timers[#timers + 1] = { s, fn } end }
    local function runTimers() local t = timers; timers = {}; for _, e in ipairs(t) do e[2]() end; return #t end
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 7200,
      rulesets = {
        { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 },
        { name = "Normal", group = "B", likely = false, alliance = 111, horde = 114, neutral = 117 },
        { name = "Roleplay", group = "C", likely = false, alliance = 119, horde = 120, neutral = 121 },
        { name = "RP-PvP", group = "D", likely = false, alliance = 123, horde = 124, neutral = 125 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE }, [114] = { group = "B", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "" } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Ruleset.lua", "Minimap.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")

    local out = {}
    local function picker()
      local p = ForeverAnvilRuleset
      if not (p and p.shown) then return "hidden" end
      local names = {}
      for _, b in ipairs(p.buttons) do names[#names + 1] = b.ruleset.name .. (b.lit and "*" or "") end
      return table.concat(names, " ") .. "; later " .. tostring(p.later.shown) .. "; status " .. (p.status.text ~= "" and p.status.text or "-")
    end
    out[#out + 1] = "at login: " .. picker() .. ", " .. tostring(timers[1] and timers[1][1]) .. "s timer"
    runTimers()
    out[#out + 1] = "after the timer: " .. picker()
    ForeverAnvilRuleset.later:Click()
    out[#out + 1] = "later: " .. picker()
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_SHOW")
    out[#out + 1] = "auction house, same session: " .. runTimers() .. " timers, " .. picker()
    ns.frame.OnEvent(ns.frame, "AUCTION_HOUSE_CLOSED")
    local b = ForeverAnvilMinimapButton
    b.OnEnter(b)
    out[#out + 1] = "tooltip: " .. tipLines[2] .. " / " .. tipLines[4]
    b:Click("LeftButton")
    out[#out + 1] = "minimap click: " .. picker() .. ", menu " .. tostring(ForeverAnvilMenu ~= nil)
    ForeverAnvilRuleset.buttons[2]:Click()
    out[#out + 1] = "picked Normal: " .. picker() .. ", saved " .. tostring(ns.db.realms.Forever) .. ", chat: " .. chat[#chat]
    b:Click("LeftButton")
    local menu = ForeverAnvilMenu
    out[#out + 1] = "minimap click: menu " .. tostring(menu.shown) .. ", status " .. menu.status.text
    menu.statusButton:Click()
    out[#out + 1] = "status line: menu " .. tostring(menu.shown) .. ", " .. picker()
    SlashCmdList.FOREVERANVIL("ruleset PvP")
    out[#out + 1] = "/fa ruleset PvP: " .. picker()
    ForeverAnvilRuleset:Hide()
    SlashCmdList.FOREVERANVIL("ruleset")
    out[#out + 1] = "/fa ruleset: " .. picker()
    return table.concat(out, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Ruleset.lua": src("Ruleset.lua"), "Minimap.lua": src("Minimap.lua") });
  assert.deepEqual(out.split("\n"), [
    "at login: hidden, 4s timer",
    "after the timer: PvP Normal Roleplay RP-PvP; later true; status -",
    "later: hidden",
    "auction house, same session: 0 timers, hidden",
    "tooltip: |cffffd100Set this realm's ruleset|r / |cffffffffClick|r  pick this realm's ruleset",
    "minimap click: PvP Normal Roleplay RP-PvP; later true; status -, menu false",
    "picked Normal: hidden, saved Normal, chat: |cffe6a23cForever Anvil|r: Normal horde auction house (EU), prices from 2h ago.",
    "minimap click: menu true, status Normal horde  |cff999999·  prices 2h ago|r",
    "status line: menu false, PvP Normal* Roleplay RP-PvP; later false; status Normal, horde auction house. Prices from 2h ago.",
    "/fa ruleset PvP: PvP* Normal Roleplay RP-PvP; later false; status PvP, horde auction house. Prices from 2h ago.",
    "/fa ruleset: PvP* Normal Roleplay RP-PvP; later false; status PvP, horde auction house. Prices from 2h ago.",
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
      function fr:SetPoint(...) self.point = { ... } end
      function fr:SetNormalTexture(t) self.normal = t end
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
    local qty = 0 -- the window's own quantity box, beside Create
    ProfessionsFrame = { CraftingPage = { RecipeList = { ScrollBox = {} }, SchematicForm = frame(), CreateAllButton = craftAll,
      CreateMultipleInputBox = { GetValue = function() return qty end } } }
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

    -- profession window: pick a recipe, 3 in the quantity box, the bag button adds the reagents
    ns.frame.OnEvent(ns.frame, "TRADE_SKILL_SHOW")
    local add
    for _, f in ipairs(frames) do if f.normal == "Interface\\\\Icons\\\\INV_Misc_Bag_10" then add = f end end
    out[#out + 1] = "button right of craft all: " .. tostring(add ~= nil and add.parent == ProfessionsFrame.CraftingPage and add.point[1] == "LEFT" and add.point[2] == craftAll and add.point[3] == "RIGHT")
    add:Click()
    out[#out + 1] = "no recipe: " .. last()
    ProfessionsFrame.CraftingPage.SchematicForm:Init({ recipeID = 2963 })
    qty = 3
    add:Click()
    out[#out + 1] = "added: " .. last() .. " " .. shopState()
    qty = 0 -- an empty box still adds one craft
    add:Click()
    out[#out + 1] = "box at 0: " .. last()
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
    "button right of craft all: true",
    "no recipe: pick a recipe with reagents first.",
    "added: added the materials for 3× Bolt of Linen Cloth to your shopping list. {2589=6}",
    "box at 0: added the materials for 1× Bolt of Linen Cloth to your shopping list.",
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

// The settings page (Options.lua): switches grouped in sections, one for every setting, each with an
// explanation on hover, and buttons that open the windows.
test("smoke: settings page groups every switch and opens the windows", () => {
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local chat, tip = {}, {}
    local noop = function() end
    local texts = {}
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s; texts[#texts + 1] = s end
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
      function fr:SetText(s) self.value = s end
      function fr:GetText() return self.value or "" end
      function fr:SetChecked(on) self.checked = on and true or false end
      function fr:GetChecked() return self.checked end
      function fr:Click() if kind == "CheckButton" then self.checked = not self.checked end; self.OnClick(self, "LeftButton") end
      if name then _G[name] = fr end
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    GameTooltip = frame()
    function GameTooltip:AddLine(s) tip[#tip + 1] = s end
    function GameTooltip:Show() end
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = m end }
    SlashCmdList = {}
    hooksecurefunc = function() end
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = function() end }
    time = os.time
    C_Item = { GetItemInfo = function() return nil end, GetItemCount = function() return 0 end }
    local settingsShown = true
    SettingsPanel = { IsShown = function() return settingsShown end }
    HideUIPanel = function(f) if f == SettingsPanel then settingsShown = false end end
    Settings = { RegisterCanvasLayoutCategory = function(p, n) return { GetID = function() return 7 end } end,
      RegisterAddOnCategory = noop, OpenToCategory = noop }
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 600,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 },
        { name = "Normal", group = "B", likely = false, alliance = 120, horde = 123, neutral = 126 } },
      houses = { [113] = { group = "A", faction = "horde", data = "" } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "", items = "" } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Prices.lua", "Options.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    local P = ns.OptionsPanel()
    P:Show()
    local out = {}
    -- every setting has a switch, and every switch a setting
    local missing, extra = {}, {}
    for key in pairs(ns.DEFAULTS.show) do if not P.boxes[key] then missing[#missing + 1] = key end end
    for key in pairs(P.boxes) do if ns.DEFAULTS.show[key] == nil then extra[#extra + 1] = key end end
    out[#out + 1] = "missing: " .. table.concat(missing, ",") .. "; extra: " .. table.concat(extra, ",")
    local heads = {}
    for _, s in ipairs(texts) do
      for _, h in ipairs({ "Tooltips", "Profession window", "Auction house", "Your gear and lists", "Minimap and chat", "Open", "Ruleset for this realm" }) do
        if s == h then heads[#heads + 1] = s end
      end
    end
    out[#out + 1] = "sections: " .. table.concat(heads, ", ")
    out[#out + 1] = "checked: vendor " .. tostring(P.boxes.vendor.checked) .. ", flips " .. tostring(P.boxes.flips.checked) .. "; status " .. P.status.text:gsub(" Prices.*", "")
    P.boxes.flips:Click()
    out[#out + 1] = "flips after a click: " .. tostring(ns.db.show.flips)
    P.boxes.vendor.OnEnter(P.boxes.vendor)
    out[#out + 1] = "hover: " .. table.concat(tip, " / ")
    -- the Open buttons close the settings and open the window
    local opened
    ns.ShowPrices = function() opened = "prices" end
    ns.PricesShown = function() return false end
    P.open[1]:Click()
    out[#out + 1] = "open: " .. P.open[1].value .. " -> " .. tostring(opened) .. ", settings closed " .. tostring(not settingsShown)
    P.open[2]:Click()
    out[#out + 1] = "open: " .. P.open[2].value .. " -> " .. tostring(ForeverAnvilWatchlist and ForeverAnvilWatchlist.shown)
    return table.concat(out, "\\n")`, { "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Prices.lua": src("Prices.lua"), "Options.lua": src("Options.lua") });
  assert.deepEqual(out.split("\n"), [
    "missing: ; extra: ",
    "sections: Tooltips, Profession window, Auction house, Your gear and lists, Minimap and chat, Open, Ruleset for this realm",
    "checked: vendor false, flips true; status PvP, horde auction house.",
    "flips after a click: false",
    "hover: Vendor price per item / Off by default: the game's own tooltip already shows the stack's sell price.",
    "open: Prices -> prices, settings closed true",
    "open: Watchlist -> true",
  ]);
});

// Translations (Locale.lua, Locales.lua): every text the addon looks up is translated in each language, with the
// same placeholders in the same order; a German client gets German text, ages and tags.
test("every addon file is in the toc, in an order that loads the translations first", () => {
  const toc = fs.readFileSync(path.join(ADDON, "ForeverAnvil.toc"), "utf8").split(/\r?\n/).filter((l) => l.endsWith(".lua"));
  const files = fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua")).sort();
  assert.deepEqual([...toc].sort(), files);
  assert.deepEqual(toc.slice(0, 4), ["Math.lua", "Locale.lua", "Locales.lua", "Core.lua"]);
});

test("translations cover every text, with matching placeholders", () => {
  const src = fs.readFileSync(path.join(ADDON, "Locales.lua"), "utf8");
  const unq = (s) => JSON.parse('"' + s + '"');
  const tables = {};
  for (const block of src.split("ns.AddLocale(").slice(1)) {
    const locale = block.match(/"(\w{4})"/)[1];
    const t = (tables[locale] = {});
    for (const m of block.matchAll(/\["((?:[^"\\]|\\.)*)"\] = "((?:[^"\\]|\\.)*)"/g)) t[unq(m[1])] = unq(m[2]);
  }
  assert.deepEqual(Object.keys(tables).sort(), ["deDE", "esES", "frFR"]);
  // the texts the code looks up: L["…"], plus labels passed through a variable (option and menu tables, …)
  const used = new Set();
  for (const f of fs.readdirSync(ADDON).filter((f) => f.endsWith(".lua") && !f.startsWith("Locale"))) {
    const s = fs.readFileSync(path.join(ADDON, f), "utf8");
    for (const m of s.matchAll(/L\["((?:[^"\\]|\\.)*)"\]/g)) used.add(unq(m[1]));
  }
  const opt = fs.readFileSync(path.join(ADDON, "Options.lua"), "utf8");
  const optTables = opt.slice(opt.indexOf("local LEFT = {"), opt.indexOf("local panel, category"));
  const keys = new Set(["market", "min", "sold", "region", "de", "vendor", "crates", "craft", "skillup", "flips", "deAll", "upgrades", "watch", "shopping", "minimap", "updates"]);
  for (const m of optTables.matchAll(/"((?:[^"\\]|\\.)*)"/g)) if (!keys.has(unq(m[1]))) used.add(unq(m[1]));
  const mm = fs.readFileSync(path.join(ADDON, "Minimap.lua"), "utf8");
  for (const m of mm.matchAll(/sectionLabel\(fr, "([^"]+)"|actionRow\(fr, y, "[^"]+", "([^"]+)"|\{ "([^"]+)", \{ "/g)) used.add(m[1] || m[2] || m[3]);
  for (const k of ["Shopping list", "Watchlist", "How many", "Have", "To buy", "Target price", "Lowest", "Edit", "Remove", "Add", "Cancel",
    "Clear all", "Watch", "Search AH", "Add to list", "Neutral", "Horde", "Alliance", "horde", "alliance", "neutral", "Auction house",
    ...JSON.parse(runLua(`local t = {}; for _, c in ipairs(M.CATEGORIES) do t[#t + 1] = '"' .. c[2] .. '"' end; return "[" .. table.concat(t, ",") .. "]"`)),
    "head", "neck", "shoulders", "back", "chest", "wrists", "hands", "waist", "legs", "feet", "ring", "trinket", "main hand", "off hand", "ranged",
    "that isn't a Forever Anvil string", "the string is damaged (copy it again from the site)", "the list is empty",
    "Head", "Neck", "Shoulders", "Back", "Chest", "Wrists", "Hands", "Waist", "Legs", "Feet", "Ring", "Trinket", "Main hand", "Off hand", "Ranged"]) used.add(k);
  // Upgrades.lua: stat short names and talent trees (M.SPECS)
  for (const k of ["Str", "Agi", "Sta", "Int", "Spi", "AP", "RAP", "SP", "Heal", "Crit", "Hit", "Def", "Dodge", "Parry", "Block", "MP5"]) used.add(k);
  for (const k of JSON.parse(runLua(`local t = {}; for _, s in pairs(M.SPECS) do for i = 2, 4 do t[#t + 1] = '"' .. s[i][1] .. '"' end end; return "[" .. table.concat(t, ",") .. "]"`))) used.add(k);
  // game names we couldn't confirm in each language stay English
  const english = new Set(["Merchant's Favor", "Waylaid crates", "Waylaid crate values", "The Merchant's Favor a crate pays and the cheapest bundle to fill it."]);
  const holes = (s) => (s.match(/%[sd%]/g) || []).join("");
  for (const [locale, t] of Object.entries(tables)) {
    const missing = [...used].filter((k) => !english.has(k) && !(k in t));
    assert.deepEqual(missing, [], `${locale} is missing translations`);
    for (const [k, v] of Object.entries(t)) {
      assert.equal(holes(v), holes(k), `${locale} "${k}": placeholders`);
      assert.equal((v.match(/\|c[0-9a-f]{8}/g) || []).length, (k.match(/\|c[0-9a-f]{8}/g) || []).length, `${locale} "${k}": colours`);
    }
  }
  // the M.CATEGORIES labels and slot names in the code are what the tables translate
  const cats = JSON.parse(runLua(`local t = {}; for _, c in ipairs(M.CATEGORIES) do t[#t + 1] = '"' .. c[2] .. '"' end; return "[" .. table.concat(t, ",") .. "]"`));
  for (const c of cats) assert.ok(c in tables.deDE, c);
});

test("a German client gets German text, ages, tags and slot names", () => {
  const out = runLua(`
    GetLocale = function() return "deDE" end
    local de = {}
    assert(load(LOCALE_SRC, "=Locale.lua"))("ForeverAnvil", de)
    de.Math = M
    assert(load(LOCALES_SRC, "=Locales.lua"))("ForeverAnvil", de)
    local L = de.L
    return table.concat({ L["Market"], M.Age(7300), M.Age(90), L["Need %d"]:format(3), L["over your %s"]:format(L["head"]),
      L["Merchant's Favor"], L["not a key"] }, " | ")`, { LOCALES_SRC: fs.readFileSync(path.join(ADDON, "Locales.lua"), "utf8") });
  assert.equal(out, "Markt | vor 2 Std. | vor 1 Min. | Fehlt 3 | über deinem Gegenstand (Kopf) | Merchant's Favor | not a key");
  // an English client keeps the English age
  assert.equal(runLua(`return M.Age(7300)`), "2h ago");
});

// The prices window on a client in another language: the game's names show and sort, and the search
// matches either name.
test("prices window prefers the game's names on other-language clients", () => {
  const out = runLua(`
    local items = M.DecodeHouse("1,10,10,5,5,;2,20,20,5,5,;")
    local names = M.DecodeItems("1,1,t,,,Linen Cloth\\n2,1,t,,,Wool Cloth\\n")
    local game = { [1] = "Leinenstoff", [2] = "Wollstoff" }
    local function ids(o) local t = {}; for _, r in ipairs(M.PriceRows(items, names, o, function(id) return game[id] end)) do t[#t + 1] = r.name end; return table.concat(t, ",") end
    return table.concat({
      ids({ sort = "name", dir = 1, gameFirst = true }),
      ids({ sort = "name", dir = 1, gameFirst = true, term = "woll" }),
      ids({ sort = "name", dir = 1, gameFirst = true, term = "linen" }),
      ids({ sort = "name", dir = 1, term = "woll" }),
    }, " | ")`);
  assert.equal(out, "Leinenstoff,Wollstoff | Wollstoff | Leinenstoff | ");
});

// Bag value (Bags.lua): the best of auction house (after its cut), disenchanting and a vendor, per item.
test("bag value picks the best way to sell each item", () => {
  const out = runLua(`
    local function f(...) local k, v = M.BestUse(...); return tostring(k) .. ":" .. tostring(v) end
    return table.concat({
      f(1000, 800, 50),   -- auction house: 950 after the cut
      f(900, 900, 50),    -- disenchanting beats 855
      f(nil, nil, 50),    -- soulbound or not listed: the vendor
      f(nil, 300, 500),   -- vendor beats disenchanting
      f(0, nil, nil),     -- nothing
    }, " ")`);
  assert.equal(out, "ah:950 de:900 vendor:50 vendor:500 nil:nil");
});

test("smoke: bag value window totals your bags and the menu shows it", () => {
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const house = encodeHouse({ 2589: [12, 15, 400, 30, 120], 2592: [40, 45, 200, 2, 60] });
  const out = runLua(`
    local noop = function() end
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s end
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
      function fr:SetText(s) self.value = s end
      if name then _G[name] = fr end
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    GameTooltip = frame()
    DEFAULT_CHAT_FRAME = { AddMessage = noop }
    SlashCmdList = {}
    hooksecurefunc = noop
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = noop }
    time = os.time
    -- bags: 30 Linen Cloth in two stacks, 3 Wool Cloth (a thin market), a soulbound sword (vendor 1s), a grey (vendor 5c)
    local bags = { [0] = { { 2589, 20 }, { 2589, 10 }, { 2592, 3 } }, [1] = { { 25, 1, true }, { 3300, 2 } } }
    C_Container = {
      GetContainerNumSlots = function(bag) return bags[bag] and #bags[bag] or 0 end,
      GetContainerItemInfo = function(bag, slot)
        local e = bags[bag] and bags[bag][slot]
        if e then return { itemID = e[1], stackCount = e[2], isBound = e[3] } end
      end,
    }
    local sells = { [2589] = 3, [2592] = 10, [25] = 100, [3300] = 5 }
    C_Item = { GetItemInfo = function(id) if sells[id] then return "item " .. id, nil, 1, 5, nil, nil, nil, nil, nil, nil, sells[id], 15 end end,
      GetItemCount = function() return 0 end }
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 600,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HOUSE } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "", items = "" } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Bags.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    SlashCmdList.FOREVERANVIL("bags")
    local B = ForeverAnvilBags
    local out = { "shown " .. tostring(B.shown) }
    for _, b in ipairs(B.rows) do
      if b.itemID and b.shown ~= false then out[#out + 1] = b.itemID .. " " .. b.kind.text .. " " .. b.value.text end
    end
    out[#out + 1] = B.total.text
    out[#out + 1] = B.split.text
    out[#out + 1] = "worth " .. ns.BagWorth()
    return table.concat(out, "\\n")`, { HOUSE: house, "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Bags.lua": src("Bags.lua") });
  // Linen: 15c × 0.95 = 14c each, 30 → 4s 20c; Wool: 43c × 3 = 1s 29c (thin: under 3 listings); sword 1s (bound: vendor); grey 5c × 2
  assert.deepEqual(out.split("\n"), [
    "shown true",
    "2589 |cffffd100Auction house|r 4s 20c",
    "2592 |cffffd100Auction house|r |cff999999~|r1s 29c",
    "25 |cffbbbbbbVendor|r|cff777777 · bound|r 1s",
    "3300 |cffbbbbbbVendor|r 10c",
    "Worth |cffc7c7cf6s|r |cffeda55f59c|r",
    "|cffffd100Auction house|r 5s 49c   |cffc080ffDisenchant|r 0c   |cffbbbbbbVendor|r 1s 10c",
    "worth 659",
  ]);
});

// The upgrades window (Upgrades.lua): M.FindUpgrades gives the same slots and options as the site's
// findUpgrades (src/lib/upgrades.js), over two houses, with a budget, for random characters.
test("upgrade finder matches upgrades.js findUpgrades for random characters, houses and budgets", () => {
  const rand = rng(11);
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const ARMOR = [["Cloth", ["HEAD", "CHEST", "ROBE", "LEGS", "CLOAK", "HAND"]], ["Leather", ["HEAD", "SHOULDER", "WAIST", "FEET", "WRIST"]],
    ["Mail", ["HEAD", "CHEST", "LEGS", "HAND"]], ["Plate", ["HEAD", "CHEST", "FEET"]], ["Miscellaneous", ["FINGER", "NECK", "TRINKET", "HOLDABLE"]],
    ["Shield", ["SHIELD"]], ["Libram", ["RELIC"]], ["Idol", ["RELIC"]], ["Totem", ["RELIC"]]];
  const WEAPON = [["Sword", ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND", "WEAPONOFFHAND"]], ["Axe", ["WEAPON", "TWOHWEAPON"]], ["Mace", ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"]],
    ["Dagger", ["WEAPON", "WEAPONOFFHAND"]], ["Fist Weapon", ["WEAPON"]], ["Polearm", ["TWOHWEAPON"]], ["Staff", ["TWOHWEAPON"]],
    ["Bow", ["RANGED"]], ["Gun", ["RANGEDRIGHT"]], ["Crossbow", ["RANGED"]], ["Thrown", ["THROWN"]], ["Wand", ["RANGEDRIGHT"]]];
  const QUALITIES = ["poor", "common", "uncommon", "rare", "epic"];
  const QN = { poor: 0, common: 1, uncommon: 2, rare: 3, epic: 4 };
  const items = {};
  for (let id = 1; id <= 400; id++) {
    const weapon = rand() < 0.4;
    const [sub, invs] = pick(weapon ? WEAPON : ARMOR);
    const ilvl = 5 + Math.floor(rand() * 60), req = rand() < 0.1 ? 1 : Math.max(1, ilvl - 5 - Math.floor(rand() * 5));
    items[id] = [`Item ${id}`, 0, 0, 0, pick(QUALITIES), weapon ? "Weapon" : "Armor", 0, null, sub, pick(invs), req, ilvl];
  }
  // as the data ships them: names (quality, category, level) and gear (subclass, slot, item level)
  const namesStr = encodeItems(items, new Set(Object.keys(items).map(Number)));
  const gearStr = encodeGear(items, new Set(Object.keys(items).map(Number)));
  const SHEET = { HEAD: ["HEAD"], NECK: ["NECK"], SHOULDER: ["SHOULDER"], BACK: ["CLOAK"], CHEST: ["CHEST", "ROBE"], WRIST: ["WRIST"], HANDS: ["HAND"],
    WAIST: ["WAIST"], LEGS: ["LEGS"], FEET: ["FEET"], FINGER_1: ["FINGER"], FINGER_2: ["FINGER"], TRINKET_1: ["TRINKET"], TRINKET_2: ["TRINKET"],
    MAIN_HAND: ["WEAPON", "TWOHWEAPON", "WEAPONMAINHAND"], OFF_HAND: ["SHIELD", "HOLDABLE", "WEAPON", "WEAPONOFFHAND"], RANGED: ["RANGED", "RANGEDRIGHT", "THROWN", "RELIC"] };
  const byInv = {};
  for (const [id, e] of Object.entries(items)) (byInv[e[9]] ||= []).push(Number(id));

  const cases = [], expected = [];
  for (let c = 0; c < 40; c++) {
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
    // two houses with different items and prices (no two prices alike, so the order is the same in both)
    const houses = ["horde", "neutral"].map((faction) => ({ faction, items: {} }));
    for (const id of Object.keys(items)) for (const h of houses) if (rand() < 0.6) h.items[id] = [1 + Math.floor(rand() * 300000) * 7 + Number(id) % 7, 0, 1, 1];
    const maxPrice = pick([null, 10000, 200000, 1000000]);
    const slots = findUpgrades(character, gear, items, houses, { maxPrice });
    expected.push(slots.map((s) => `${s.slot}:${s.wearing ? s.wearing.id : "-"}:` + s.options.map((o) => `${o.id}/${o.level}/${o.gain}/${o.price}/${o.house}`).join(" ")).join("|"));
    const luaGear = Object.fromEntries(gear.map((g) => [g.slotType, { id: g.id, ilvl: g.level, inv: items[g.id][9] }]));
    cases.push({ cls: character.class.toLowerCase(), level: character.level, gear: luaGear, maxPrice: maxPrice ?? 0,
      houses: houses.map((h) => ({ side: h.faction, items: Object.fromEntries(Object.entries(h.items).map(([id, p]) => [id, p])) })) });
  }
  const out = runLua(`
    local names, gearData = M.DecodeItems(NAMES), M.DecodeGear(GEAR)
    local function gearOf(id)
      local g, e = gearData[id], names[id]
      if not (g and e) then return nil end
      return { id = id, cls = e[3] == "w" and "Weapon" or "Armor", sub = g[1], inv = g[2], ilvl = g[3], req = e[4], quality = e[2] }
    end
    local CASES = ${toLua(cases)}
    local out = {}
    for c, k in ipairs(CASES) do
      local slots = {}
      for _, s in ipairs(M.FindUpgrades(k.gear, k.cls, k.level, k.houses, gearOf, { maxPrice = k.maxPrice > 0 and k.maxPrice or nil })) do
        local opts = {}
        for _, o in ipairs(s.options) do opts[#opts + 1] = o.id .. "/" .. o.ilvl .. "/" .. o.gain .. "/" .. o.price .. "/" .. o.side end
        slots[#slots + 1] = s.slot .. ":" .. (s.wearing and s.wearing.id or "-") .. ":" .. table.concat(opts, " ")
      end
      out[c] = table.concat(slots, "|")
    end
    return table.concat(out, "\\n")`, { NAMES: namesStr, GEAR: gearStr });
  assert.deepEqual(out.split("\n"), expected);
  assert.ok(expected.join("").split("/").length > 300, "the random cases should find plenty of upgrades");
});

test("spec scoring: stats from the game, the spec from talents, gear for other specs left out", () => {
  const out = runLua(`
    local parsed = M.ParseItemStats({ ITEM_MOD_AGILITY_SHORT = 6, ITEM_MOD_STAMINA_SHORT = 4, RESISTANCE0_NAME = 80,
      ITEM_MOD_CRIT_RATING_SHORT = 1, ITEM_MOD_SPELL_HEALING_DONE_SHORT = 22, ITEM_MOD_RANGED_ATTACK_POWER_SHORT = 12,
      ITEM_MOD_DAMAGE_PER_SECOND_SHORT = 9.5, ITEM_MOD_HIT_TAKEN_RATING_SHORT = 3, EMPTY_SOCKET_RED = 1 })
    local keys = {}
    for k, v in pairs(parsed) do keys[#keys + 1] = k .. "=" .. v end
    table.sort(keys)
    local rogue = M.SPECS.rogue[3][2]
    local function score(s, slot) return string.format("%.1f", M.StatScore(s, rogue, slot)) end
    local lines = {
      table.concat(keys, " "),
      -- talents: the tree with the most points; none spent: the class's usual leveling tree; a pick wins
      table.concat({ M.SpecIndex("rogue", { 0, 14, 3 }), M.SpecIndex("rogue", { 0, 0, 0 }), M.SpecIndex("warrior", {}),
        M.SpecIndex("druid", { 5, 5, 2 }), M.SpecIndex("rogue", { 0, 14, 3 }, 3), tostring(M.SpecIndex("monk", {})) }, " "),
      -- a rogue: agility counts, intellect doesn't; weapon dps only in a weapon slot
      score({ agi = 6, sta = 4 }) .. " " .. score({ int = 8, sta = 5 }) .. " " .. score({ dps = 10 }, "MAIN_HAND") .. " " .. score({ dps = 10 }, "HEAD"),
      tostring(M.OffSpec({ int = 8, sta = 5 }, rogue)) .. " " .. tostring(M.OffSpec({ agi = 3, int = 2 }, rogue)) .. " "
        .. tostring(M.OffSpec({ sta = 5 }, rogue)) .. " " .. tostring(M.OffSpec({ int = 8 }, M.SPECS.mage[2][2])),
      tostring(M.HasStats({ armor = 50, dps = 4 })) .. " " .. tostring(M.HasStats({ armor = 50, sta = 1 })),
    }
    local ks = {}
    for _, s in ipairs(M.KeyStats({ agi = 6, sta = 4, int = 3, crit = 1, armor = 90 }, rogue, 3)) do ks[#ks + 1] = s[1] .. s[2] end
    lines[#lines + 1] = table.concat(ks, " ")

    -- the finder: a level 30 rogue in an agility helm (score 3), nothing on the fingers
    local gear = { HEAD = { id = 1, ilvl = 25, inv = "HEAD" } }
    local items = {
      [2] = { cls = "Armor", sub = "Leather", inv = "HEAD", ilvl = 30, req = 25, quality = 2 }, -- intellect: another spec's
      [3] = { cls = "Armor", sub = "Leather", inv = "HEAD", ilvl = 28, req = 23, quality = 2 }, -- agility: the upgrade
      [4] = { cls = "Armor", sub = "Leather", inv = "HEAD", ilvl = 32, req = 27, quality = 2 }, -- "of the …": random stats
      [5] = { cls = "Armor", sub = "Leather", inv = "HEAD", ilvl = 20, req = 15, quality = 2 }, -- worse than the helm worn
      [6] = { cls = "Armor", sub = "Miscellaneous", inv = "FINGER", ilvl = 26, req = 21, quality = 2 }, -- a ring for an empty finger
      [7] = { cls = "Armor", sub = "Leather", inv = "HEAD", ilvl = 33, req = 28, quality = 3 }, -- not loaded yet
      [8] = { cls = "Armor", sub = "Cloth", inv = "HEAD", ilvl = 40, req = 30, quality = 3 }, -- cloth: a rogue can't use it well
    }
    local stats = { [1] = { agi = 3, armor = 60 }, [2] = { int = 8, sta = 5, armor = 70 }, [3] = { agi = 6, sta = 4, armor = 70 },
      [4] = { armor = 75 }, [5] = { agi = 2, armor = 50 }, [6] = { agi = 4 }, [8] = { agi = 20 } }
    local function gearOf(id) local t = items[id]; if t then t.id = id end; return t end
    local houses = { { side = "horde", items = { [2] = { 500 }, [3] = { 900 }, [4] = { 700 }, [5] = { 100 }, [7] = { 300 }, [8] = { 50 } } },
      { side = "neutral", items = { [3] = { 800 }, [6] = { 400 } } } }
    local function run(opts)
      local slots, pending, off = M.SpecUpgrades(gear, "rogue", 30, houses, gearOf, function(id) return stats[id] end, rogue, opts)
      local t = {}
      for _, s in ipairs(slots) do
        local o = {}
        for _, x in ipairs(s.options) do o[#o + 1] = x.id .. (x.random and "r" or "") .. "@" .. x.price .. x.side:sub(1, 1) end
        t[#t + 1] = s.slot .. ":" .. table.concat(o, ",")
      end
      return table.concat(t, " ") .. " pending " .. pending .. " off " .. off
    end
    lines[#lines + 1] = run({})
    lines[#lines + 1] = run({ showAll = true })
    lines[#lines + 1] = run({ maxPrice = 600 })
    return table.concat(lines, "\\n")`);
  assert.deepEqual(out.split("\n"), [
    "agi=6 armor=80 crit=1 dps=9.5 heal=22 rap=12 sta=4",
    "2 2 1 1 3 nil",
    "7.2 1.5 70.0 0.0",
    "true false false false",
    "false true",
    "crit1 agi6 sta4",
    "HEAD:3@800n,4r@700h FINGER:6@400n pending 1 off 1",
    "HEAD:3@800n,4r@700h FINGER:6@400n pending 1 off 0",
    "FINGER:6@400n pending 1 off 1",
  ]);
});

test("smoke: upgrades window ranks gear for your spec, hides other specs' gear, and lets you pick a spec", () => {
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const horde = encodeHouse({ 102: [5000, 5500, 1, 1], 103: [9000, 9500, 1, 1], 104: [7000, 7500, 2, 2], 105: [150000, 160000, 1, 1] });
  const neutral = encodeHouse({ 103: [8000, 8500, 1, 1], 106: [4000, 4500, 1, 1] });
  const cache = {
    102: ["Sage's Helm", 0, 0, 0, "uncommon", "Armor", 133071, null, "Leather", "HEAD", 25, 30],
    103: ["Bandit Helm", 0, 0, 0, "uncommon", "Armor", 133072, null, "Leather", "HEAD", 23, 28],
    104: ["Leather Helm", 0, 0, 0, "uncommon", "Armor", 133073, null, "Leather", "HEAD", 27, 32],
    105: ["Fine Helm", 0, 0, 0, "rare", "Armor", 133074, null, "Leather", "HEAD", 28, 34],
    106: ["Agile Band", 0, 0, 0, "uncommon", "Armor", 133344, null, "Miscellaneous", "FINGER", 21, 26],
  };
  const ids = new Set(Object.keys(cache).map(Number));
  const out = runLua(`
    local noop = function() end
    local function region()
      local r = setmetatable({}, { __index = function(_, k) if k:match("^%u") then return noop end end })
      function r:SetText(s) self.text = s end
      function r:Show() self.shown = true end
      function r:Hide() self.shown = false end
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
      function fr:SetText(s) self.value = s end
      function fr:SetChecked(on) self.checked = on end
      function fr:GetChecked() return self.checked end
      function fr:LockHighlight() self.lit = true end
      function fr:UnlockHighlight() self.lit = false end
      function fr:Click() if kind == "CheckButton" then self.checked = not self.checked end; self.OnClick(self, "LeftButton") end
      if name then _G[name] = fr end
      return fr
    end
    CreateFrame = frame
    UIParent, UISpecialFrames, ChatFontNormal = frame(), {}, {}
    tinsert = table.insert
    GameTooltip = frame()
    DEFAULT_CHAT_FRAME = { AddMessage = noop }
    SlashCmdList = {}
    hooksecurefunc = noop
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    UnitClass = function() return "Rogue", "ROGUE" end
    UnitLevel = function() return 30 end
    -- talents (classic: name, icon, points): Combat
    GetNumTalentTabs = function() return 3 end
    local points = { 0, 14, 3 }
    GetTalentTabInfo = function(i) return ({ "Assassination", "Combat", "Subtlety" })[i], "icon", points[i] end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = noop }
    time = os.time
    -- wearing an agility helm (+3 Agi, item level 25)
    GetInventoryItemLink = function(_, slot) if slot == 1 then return "|cff1eff00|Hitem:900::|h[Old Helm]|h|r" end end
    -- the game has loaded everything but the Fine Helm, which arrives later
    local loaded = { [900] = true, [102] = true, [103] = true, [104] = true, [106] = true }
    local info = { [900] = { "Old Helm", 2, 25, 20, 4, 2 }, [102] = { "Sage's Helm", 2, 30, 25, 4, 2 }, [103] = { "Bandit Helm", 2, 28, 23, 4, 2 },
      [104] = { "Leather Helm", 2, 32, 27, 4, 2 }, [105] = { "Fine Helm", 3, 34, 28, 4, 2 }, [106] = { "Agile Band", 2, 26, 21, 4, 0 } }
    local slots = { [106] = "INVTYPE_FINGER" }
    local requested = {}
    C_Item = {
      GetItemInfo = function(item)
        local id = type(item) == "number" and item or tonumber(tostring(item):match("item:(%d+)") or "")
        local e = info[id]
        if e and loaded[id] then return e[1], "|Hitem:" .. id .. "::|h[" .. e[1] .. "]|h", e[2], e[3], e[4], nil, nil, nil, slots[id] or "INVTYPE_HEAD", nil, 0, e[5], e[6] end
      end,
      GetItemCount = function() return 0 end,
      RequestLoadItemDataByID = function(id) requested[#requested + 1] = id end,
      GetItemStats = function(link)
        local id = tonumber(link:match("item:(%d+)"))
        return ({ [900] = { ITEM_MOD_AGILITY_SHORT = 3, RESISTANCE0_NAME = 60 },
          [102] = { ITEM_MOD_INTELLECT_SHORT = 8, ITEM_MOD_STAMINA_SHORT = 10, RESISTANCE0_NAME = 70 },
          [103] = { ITEM_MOD_AGILITY_SHORT = 7, ITEM_MOD_STAMINA_SHORT = 4, RESISTANCE0_NAME = 70 },
          [104] = { RESISTANCE0_NAME = 75 },
          [105] = { ITEM_MOD_AGILITY_SHORT = 12, ITEM_MOD_CRIT_RATING_SHORT = 1, RESISTANCE0_NAME = 80 },
          [106] = { ITEM_MOD_AGILITY_SHORT = 4, ITEM_MOD_STAMINA_SHORT = 2 } })[id]
      end,
    }
    ForeverAnvilData = { EU = { region = "eu", updated = os.time() - 600,
      rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
      houses = { [113] = { group = "A", faction = "horde", data = HORDE }, [116] = { group = "A", faction = "neutral", data = NEUTRAL } },
      regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "", items = ITEMS, gear = GEAR } }
    for _, f in ipairs({ "Core.lua", "Lists.lua", "Upgrades.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
    ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
    ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
    local strip = function(s) return ((s or ""):gsub("|c%x%x%x%x%x%x%x%x", ""):gsub("|r", "")) end
    local function rows(U)
      local t = {}
      for _, b in ipairs(U.rows) do
        if b.shown then
          t[#t + 1] = (b.slot.text ~= "" and ("[" .. b.slot.text .. "] ") or "") .. strip(b.name.text) .. " | " .. strip(b.stats.text) .. " | " .. (b.price.text or "")
        end
      end
      return table.concat(t, " / ")
    end
    local function specs(U)
      local t = {}
      for _, b in ipairs(U.specs) do t[#t + 1] = b.value .. (b.lit and "!" or "") end
      return table.concat(t, ", ")
    end
    SlashCmdList.FOREVERANVIL("upgrades")
    local U = ForeverAnvilUpgrades
    local out = { strip(U.who.text), specs(U), rows(U), (strip(U.total.text):gsub(" · prices.*", "")) }
    -- the Fine Helm arrives
    loaded[105] = true
    ns.ShowUpgrades(false); ns.ShowUpgrades(true)
    out[#out + 1] = "loaded: " .. rows(U)
    out[#out + 1] = "asked the game for: " .. table.concat(requested, ",")
    -- other specs' gear too
    U.showAll:Click()
    out[#out + 1] = "show all: " .. rows(U)
    U.showAll:Click()
    -- gear for Assassination (the same weights for a rogue), then back to the talents' pick
    U.specs[1]:Click()
    out[#out + 1] = "picked: " .. specs(U) .. "; saved " .. tostring(ns.db.upgradeSpec.rogue) .. "; " .. strip(U.who.text)
    U.specs[2]:Click()
    out[#out + 1] = "back: saved " .. tostring(ns.db.upgradeSpec.rogue)
    -- no item stats in this client: by item level, like the site
    C_Item.GetItemStats = nil
    ns.ShowUpgrades(false); ns.ShowUpgrades(true)
    out[#out + 1] = "no stats: " .. rows(U) .. " || " .. strip(U.total.text):gsub(" · prices.*", "")
    return table.concat(out, "\\n")`, { HORDE: horde, NEUTRAL: neutral, ITEMS: encodeItems(cache, ids), GEAR: encodeGear(cache, ids),
    "Core.lua": src("Core.lua"), "Lists.lua": src("Lists.lua"), "Upgrades.lua": src("Upgrades.lua") });
  assert.deepEqual(out.split("\n"), [
    "Level 30 Rogue  Combat (from your talents)",
    "Assassination, Combat *!, Subtlety",
    "[Head] Old Helm | +3 Agi | " +
      " / Bandit Helm  Blackwater | +7 Agi +4 Sta | 80s" +
      " / Leather Helm | random stats · ilvl 32 | 70s" +
      " / [Ring] nothing worn |  | " +
      " / Agile Band  Blackwater | +4 Agi +2 Sta | 40s",
    "3 upgrades for 2 slots  1 for other specs hidden · loading 1 items",
    "loaded: [Head] Old Helm | +3 Agi |  / Fine Helm | +12 Agi +1% Crit | 15g / Bandit Helm  Blackwater | +7 Agi +4 Sta | 80s / Leather Helm | random stats · ilvl 32 | 70s / [Ring] nothing worn |  |  / Agile Band  Blackwater | +4 Agi +2 Sta | 40s",
    "asked the game for: 105",
    "show all: [Head] Old Helm | +3 Agi |  / Fine Helm | +12 Agi +1% Crit | 15g / Bandit Helm  Blackwater | +7 Agi +4 Sta | 80s / Sage's Helm | +10 Sta | 50s / [Ring] nothing worn |  |  / Agile Band  Blackwater | +4 Agi +2 Sta | 40s",
    "picked: Assassination!, Combat *, Subtlety; saved 1; Level 30 Rogue  Assassination (your pick)",
    "back: saved nil",
    "no stats: [Head] Old Helm | ilvl 25 |  / Fine Helm | +9 ilvl 34 | 15g / Leather Helm | +7 ilvl 32 | 70s / Sage's Helm | +5 ilvl 30 | 50s / [Ring] nothing worn |  |  / Agile Band  Blackwater | +26 ilvl 26 | 40s || 4 upgrades for 2 slots  ranked by item level",
  ]);
});

// Old prices (Freshness.lua): a note at login when the prices are over a day old, and copies in a guild or group
// telling each other the time of their prices, so a player with older ones hears about newer ones.
test("price times sent between copies parse, and newer or older needs a whole release between them", () => {
  const out = runLua(`
    local t = M.ParseSync(M.SyncMessage(1700000000.7))
    return table.concat({ tostring(t), tostring(M.ParseSync("1:1700000000:2.4")), tostring(M.ParseSync("2:5")), tostring(M.ParseSync(nil)),
      tostring(M.SyncVerdict(1000000, 1000000 + 6 * 3600)), tostring(M.SyncVerdict(1000000, 1000000 - 6 * 3600)),
      tostring(M.SyncVerdict(1000000, 1000000 + 600)), tostring(M.SyncVerdict(nil, 5)) }, " ")`);
  assert.equal(out, "1700000000 1700000000 nil nil newer older nil nil");
});

test("smoke: old prices get a note at login, and copies in a guild tell each other about newer prices", () => {
  const src = (f) => fs.readFileSync(path.join(ADDON, f), "utf8");
  const out = runLua(`
    local noop = function() end
    local function frame()
      local fr = setmetatable({}, { __index = function(_, k) if k:match("^%u") and not k:match("^On") then return noop end end })
      function fr:SetScript(k, fn) rawset(self, k, fn) end
      return fr
    end
    local chat, sent, timers, now = {}, {}, {}, os.time()
    CreateFrame = frame
    UIParent = frame()
    DEFAULT_CHAT_FRAME = { AddMessage = function(_, m) chat[#chat + 1] = (m:gsub("^|cffe6a23cForever Anvil|r: ", "")) end }
    SlashCmdList = {}
    hooksecurefunc = noop
    GetCurrentRegion = function() return 3 end
    GetRealmName = function() return "Forever PvP" end
    UnitFactionGroup = function() return "Horde" end
    UnitName = function() return "Me" end
    IsInGuild = function() return true end
    IsInGroup = function() return false end
    IsInRaid = function() return false end
    C_AddOns = { IsAddOnLoaded = function() return false end, LoadAddOn = noop }
    C_Item = { GetItemInfo = function() return nil end, GetItemCount = function() return 0 end }
    C_Timer = { After = function(_, fn) timers[#timers + 1] = fn end }
    local prefix
    C_ChatInfo = { RegisterAddonMessagePrefix = function(p) prefix = p end,
      SendAddonMessage = function(p, text, channel) sent[#sent + 1] = channel .. " " .. text end }
    time = function() return now end
    local function runTimers() local t = timers; timers = {}; for _, fn in ipairs(t) do fn() end end
    local H = 3600
    local function login(age, notesOff)
      chat, sent, timers = {}, {}, {}
      local ns = { Math = M, L = setmetatable({}, { __index = function(_, k) return k end }) }
      ForeverAnvilDB = notesOff and { show = { updates = false } } or nil
      ForeverAnvilData = { EU = { region = "eu", updated = now - age,
        rulesets = { { name = "PvP", group = "A", likely = false, alliance = 110, horde = 113, neutral = 116 } },
        houses = { [113] = { group = "A", faction = "horde", data = "" } },
        regionMedian = "", vendorBuy = "", noDisenchant = "", skill = "", crates = "", items = "" } }
      for _, f in ipairs({ "Core.lua", "Freshness.lua" }) do assert(load(_G[f], "=" .. f))("ForeverAnvil", ns) end
      ns.frame.OnEvent(ns.frame, "ADDON_LOADED", "ForeverAnvil")
      ns.frame.OnEvent(ns.frame, "PLAYER_LOGIN")
      ns.freshnessFrame.OnEvent(ns.freshnessFrame, "PLAYER_LOGIN")
      runTimers()
      return function(text, channel, sender) ns.freshnessFrame.OnEvent(ns.freshnessFrame, "CHAT_MSG_ADDON", prefix, text, channel, sender) end,
        ForeverAnvilData.EU.updated
    end
    local out = {}
    local function log(label) out[#out + 1] = label .. ": chat [" .. table.concat(chat, " | ") .. "] sent [" .. table.concat(sent, ", ") .. "]"; chat, sent = {}, {} end

    -- 30 hours old: a note, and the time goes to the guild; a newer copy after that adds no second note
    local hear, ours = login(30 * H)
    log("old login (" .. tostring(prefix) .. ")")
    hear("1:" .. (ours + 24 * H), "GUILD", "Fresh-Forever")
    log("then newer")

    -- 8 hours old: no note; our own message and same-time copies are quiet
    hear, ours = login(8 * H)
    log("current login")
    hear("1:" .. ours, "GUILD", "Me-Forever")
    hear("1:" .. ours, "GUILD", "Same-Forever")
    log("same")
    -- an older copy: we answer a few seconds later, unless a copy as new as ours answers first
    now = now + 30
    hear("1:" .. (ours - 6 * H), "GUILD", "Behind-Forever")
    hear("1:" .. ours, "GUILD", "Quick-Forever")
    runTimers()
    log("older, answered by someone else")
    hear("1:" .. (ours - 6 * H), "GUILD", "Behind-Forever")
    runTimers()
    log("older, we answer")
    hear("1:" .. (ours - 6 * H), "WHISPER", "Behind-Forever")
    hear("2:" .. (ours + 6 * H), "GUILD", "Future-Forever")
    runTimers()
    log("whisper and unknown format")
    hear("1:" .. (ours + 6 * H), "GUILD", "Fresh-Forever")
    hear("1:" .. (ours + 12 * H), "PARTY", "Fresher-Forever")
    log("newer, twice")

    -- the switch off: no notes, but the time still goes out
    hear = login(30 * H, true)
    hear("1:" .. (now + H), "GUILD", "Fresh-Forever")
    log("notes off")
    return table.concat(out, "\\n")`, { "Core.lua": src("Core.lua"), "Freshness.lua": src("Freshness.lua") });
  const lines = out.split("\n").map((l) => l.replace(/1:\d+/g, "1:T"));
  assert.deepEqual(lines, [
    "old login (ForeverAnvil): chat [your prices were last updated 30h ago. Update the addon in your CurseForge or Wago app, or turn on auto-update there, for fresh ones.] sent [GUILD 1:T]",
    "then newer: chat [] sent []",
    "current login: chat [] sent [GUILD 1:T]",
    "same: chat [] sent []",
    "older, answered by someone else: chat [] sent []",
    "older, we answer: chat [] sent [GUILD 1:T]",
    "whisper and unknown format: chat [] sent []",
    "newer, twice: chat [Fresh has newer prices than you (updated 2h ago). Update the addon in your CurseForge or Wago app to get them.] sent []",
    "notes off: chat [] sent [GUILD 1:T]",
  ]);
});
