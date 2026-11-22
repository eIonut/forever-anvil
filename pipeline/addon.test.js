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
import { encodeHouse, regionMedians } from "./addon-data.js";

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
      local fr = { parent = parent }
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
