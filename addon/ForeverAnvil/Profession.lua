-- Profession window: profit per craft next to each recipe, from your auction house's prices:
-- market price of what it makes × average made, minus the AH's 5% cut, minus reagents (AH market, or the
-- vendor's price when a reagent isn't on the AH). Grey "?" when something has no price.
-- Two windows: the modern one (Blizzard_Professions, which the Forever client uses) and the classic one
-- (Blizzard_TradeSkillUI). Recipes that make no item (enchants) show nothing.
-- Since version 2: the recipe that levels you cheapest right now is tagged "skill-up" (see below).
local _, ns = ...
local M = ns.Math
local L = ns.L

local texts = {}

local function textFor(frame, point, rel, x, y)
  local t = texts[frame]
  if not t then
    t = frame:CreateFontString(nil, "OVERLAY", "GameFontNormalSmall")
    t:SetPoint(point or "RIGHT", rel or frame, point or "RIGHT", x or -4, y or 0)
    t:SetJustifyH("RIGHT")
    texts[frame] = t
  end
  return t
end

local function profitText(profit)
  if profit == false then return "" end                -- makes no item
  if not profit then return "|cff777777?|r" end        -- something has no price
  return (profit >= 0 and "|cff33dd55+" or "|cffff5555") .. M.ShortMoney(profit, true) .. "|r"
end

---------------------------------------------------------------------------------------------------
-- Leveling helper (src/lib/levelmath.js): of the recipes you know, the one whose reagents cost least per
-- expected skill point at your skill right now is marked "skill-up". The chance uses the recipe's yellow
-- and grey skill from the game files (shipped in the data); without them, an orange recipe counts as sure.
local SKILL_TAG = "|cff40c0ff" .. L["skill-up"] .. "|r "
local DIFFICULTY = { optimal = 0, medium = 1, easy = 2, trivial = 3 } -- classic names → modern numbers

-- chance (0–1) that one craft of a recipe you know gives a point, or nil when it can't be told.
-- You know it, so the skill a pattern needs (and the site's "trainer recipes from yellow") doesn't matter.
function ns.RecipeChance(spellID, skill, difficulty)
  local info = ns.SkillInfo(spellID)
  if info then return M.SkillUpChance(0, info[2], info[3], skill) end
  if difficulty == 0 then return 1 end
  if difficulty == 3 then return 0 end
end

-- best = { key, cost, chance } for the current list, recomputed when the skill or the known recipes change
local skillUp = { key = nil, best = nil, per = nil }
function ns.ResetSkillUp() skillUp.key = nil end

-- entries(): { { key, cost|nil, chance|nil }, … } for every known recipe; key: what the row is matched by
local function bestSkillUp(stamp, entries)
  if skillUp.key == stamp then return skillUp.best, skillUp.per end
  local best, per = M.CheapestSkillUp(entries())
  skillUp.key, skillUp.best, skillUp.per = stamp, best, per
  return best, per
end

local function chanceText(chance, cost)
  if not chance or chance <= 0 then return "" end
  return "  |cff40c0ff" .. L["skill-up %d%%"]:format(math.floor(chance * 100 + 0.5))
    .. (cost and (", " .. L["%s per point"]:format(M.ShortMoney(cost / chance, true))) or "") .. "|r"
end

---------------------------------------------------------------------------------------------------
-- Modern window

-- The reagents every craft of a recipe needs (not optional or finishing ones): { {itemID, count}, … } and the
-- schematic, or nil when the game doesn't say
function ns.SchematicReagents(recipeID)
  local s = C_TradeSkillUI.GetRecipeSchematic(recipeID, false)
  if not s then return nil end
  local basicType = Enum and Enum.CraftingReagentType and Enum.CraftingReagentType.Basic
  local reagents = {}
  for _, slot in ipairs(s.reagentSlotSchematics or {}) do
    local needed = slot.required
    if needed == nil then needed = basicType == nil or slot.reagentType == basicType end
    if needed then
      local r = slot.reagents and slot.reagents[1]
      if not (r and r.itemID) then return nil end
      reagents[#reagents + 1] = { r.itemID, slot.quantityRequired or 1 }
    end
  end
  return reagents, s
end

-- "Add to shopping list": a small bag button beside the window's Create All button. It adds the reagents for
-- the number of crafts in the window's own quantity box (at least one). A wide text button with a box of its
-- own didn't fit: in game it ran over the recipe list, which hid its frame. In the modern window it sits in the
-- gap right of Create All (left of it is the recipe list's scroll bar); in the classic one, left of it.
-- current() → materials of one craft ({ {itemID, count}, … }) and the recipe's name, or nil;
-- countBox: the window's quantity box (modern GetValue, classic GetNumber), or nil
local function crafts(countBox)
  if not countBox then return 1 end
  local n
  for _, method in ipairs({ "GetValue", "GetNumber" }) do
    if not n and type(countBox[method]) == "function" then
      local ok, v = pcall(countBox[method], countBox)
      if ok then n = tonumber(v) end
    end
  end
  if not n and type(countBox.GetText) == "function" then n = tonumber(countBox:GetText()) end
  n = n and math.floor(n) or 1
  if n < 1 then return 1 end
  return math.min(n, 9999)
end

local function shoppingButton(parent, anchor, current, countBox, right)
  local add = CreateFrame("Button", nil, parent)
  add:SetSize(24, 24)
  if anchor then
    if right then add:SetPoint("LEFT", anchor, "RIGHT", 10, 0) else add:SetPoint("RIGHT", anchor, "LEFT", -6, 0) end
    add:SetFrameLevel(anchor:GetFrameLevel() + 2)
  else
    add:SetPoint("BOTTOMLEFT", parent, "BOTTOMLEFT", 60, 8)
  end
  add:SetNormalTexture("Interface\\Icons\\INV_Misc_Bag_10")
  local icon = add:GetNormalTexture()
  if icon then icon:SetTexCoord(0.07, 0.93, 0.07, 0.93) end
  add:SetPushedTexture("Interface\\Icons\\INV_Misc_Bag_10")
  local pushed = add:GetPushedTexture()
  if pushed then pushed:SetTexCoord(0.1, 0.9, 0.1, 0.9) end
  add:SetHighlightTexture("Interface\\Buttons\\ButtonHilight-Square", "ADD")
  local border = add:CreateTexture(nil, "OVERLAY")
  border:SetTexture("Interface\\Buttons\\UI-Quickslot2")
  border:SetPoint("TOPLEFT", -9, 9)
  border:SetPoint("BOTTOMRIGHT", 9, -9)
  add:SetScript("OnClick", function()
    ns.Safe("shopping", function()
      local mats, name = current()
      if not (mats and #mats > 0) then ns.Print(L["pick a recipe with reagents first."]); return end
      ns.AddToShopping(mats, crafts(countBox), name)
    end)
  end)
  add:SetScript("OnEnter", function(self)
    GameTooltip:SetOwner(self, "ANCHOR_TOP")
    GameTooltip:AddLine(L["Add to shopping list"])
    local n = crafts(countBox)
    GameTooltip:AddLine((n == 1 and L["Adds this recipe's reagents for 1 craft (the number in the box beside Create) to your Forever Anvil shopping list. It ticks them off as they reach your bags."]
      or L["Adds this recipe's reagents for %d crafts (the number in the box beside Create) to your Forever Anvil shopping list. It ticks them off as they reach your bags."]:format(n)), 1, 1, 1, true)
    GameTooltip:Show()
  end)
  add:SetScript("OnLeave", function() GameTooltip:Hide() end)
  return add
end

-- cost, complete, profit for a recipe ID; profit false when it makes no item, nil when unpriced
function ns.SchematicProfit(recipeID)
  local reagents, s = ns.SchematicReagents(recipeID)
  if not reagents then return nil end
  if not s.outputItemID then -- an enchant: reagents only (they count for the leveling helper)
    local cost, complete = M.CraftProfit(reagents, ns.ReagentCost)
    return cost, complete, false
  end
  local lo = s.quantityMin or 1
  local made = (lo + (s.quantityMax or lo)) / 2
  return M.CraftProfit(reagents, ns.ReagentCost, ns.Market(s.outputItemID), made)
end

-- your skill in the open profession: level, max (nil when the game doesn't say)
local function modernSkill()
  local T = C_TradeSkillUI
  for _, fn in ipairs({ T.GetChildProfessionInfo, T.GetBaseProfessionInfo }) do
    if fn then
      local ok, info = pcall(fn)
      if ok and type(info) == "table" and info.skillLevel and info.maxSkillLevel and info.maxSkillLevel > 0 then
        return info.skillLevel, info.maxSkillLevel, info.professionName or info.parentProfessionName
      end
    end
  end
end

-- the cheapest known recipe per skill point in the modern window: { recipeID, cost, chance }, cost per point
local function modernSkillUp()
  if not (ns.db.show.skillup and ns.House() and C_TradeSkillUI.GetAllRecipeIDs and C_TradeSkillUI.GetRecipeInfo) then return nil end
  local skill, max, name = modernSkill()
  if not skill or skill >= max then return nil end
  return bestSkillUp((name or "?") .. ":" .. skill, function()
    local entries = {}
    for _, id in ipairs(C_TradeSkillUI.GetAllRecipeIDs() or {}) do
      local info = C_TradeSkillUI.GetRecipeInfo(id)
      if info and info.learned then
        local chance = ns.RecipeChance(id, skill, info.relativeDifficulty)
        if chance and chance > 0 then
          local cost, complete = ns.SchematicProfit(id)
          if cost and complete then entries[#entries + 1] = { id, cost, chance } end
        end
      end
    end
    return entries
  end)
end

local function recipeRow(frame, node)
  local t = textFor(frame)
  t:SetText("")
  local data = node and node.GetData and node:GetData()
  local info = data and data.recipeInfo
  if not (info and info.recipeID and ns.House()) then return end
  local text = ""
  if ns.db.show.craft then
    local _, _, profit = ns.SchematicProfit(info.recipeID)
    text = profitText(profit)
  end
  local best = modernSkillUp()
  if best and best[1] == info.recipeID then text = SKILL_TAG .. text end
  t:SetText(text)
end

local function initModern()
  local page = ProfessionsFrame.CraftingPage
  local list = page and page.RecipeList and page.RecipeList.ScrollBox
  if not (C_TradeSkillUI and C_TradeSkillUI.GetRecipeSchematic and ns.HookScrollRows(list, recipeRow, "profession")) then
    ns.professionUI = "modern, unsupported"
    ns.Print(L["this profession window isn't supported yet, so craft profits aren't shown. Tooltips still work."])
    return
  end
  ns.professionUI = "modern"
  -- the selected recipe: profit and reagent cost under the recipe's name
  local form = page.SchematicForm
  if form and form.Init then
    local line = form:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    -- Under the recipe's name, beside its icon, where the form has room for two lines. (In the form's top right
    -- corner the line ran over the form's buttons, then into the name, then into the window's border.)
    -- Recipes that need a tool or place ("Requires: Cooking Fire") show that under the name: then under it.
    local function place()
      line:ClearAllPoints()
      if type(form.OutputText) == "table" then
        local below = form.OutputText
        local tools = form.RequiredTools
        if type(tools) == "table" and tools:IsShown() and (tools:GetText() or "") ~= "" then below = tools end
        line:SetPoint("TOPLEFT", below, "BOTTOMLEFT", 0, -4)
        line:SetJustifyH("LEFT")
      else
        line:SetPoint("TOPRIGHT", form, "TOPRIGHT", -12, -12)
        line:SetJustifyH("RIGHT")
      end
    end
    place()
    local selected -- the recipe on the form, for "Add to shopping list"
    shoppingButton(page, page.CreateAllButton, function()
      if not selected then return nil end
      local info = C_TradeSkillUI.GetRecipeInfo and C_TradeSkillUI.GetRecipeInfo(selected)
      return ns.SchematicReagents(selected), info and info.name
    end, page.CreateMultipleInputBox, true)
    hooksecurefunc(form, "Init", function(_, recipeInfo)
      selected = recipeInfo and recipeInfo.recipeID
      ns.Safe("profession", function()
        line:SetText("")
        place()
        if not (recipeInfo and recipeInfo.recipeID and ns.House()) then return end
        local cost, complete, profit = ns.SchematicProfit(recipeInfo.recipeID)
        if not cost then return end
        local s, up = "", ""
        if ns.db.show.craft and profit ~= false then
          s = "  " .. L["profit"] .. " " .. profitText(profit) .. "  |cff999999" .. L["reagents"] .. " " .. (complete and "" or "~") .. M.ShortMoney(cost, true) .. "|r"
        end
        if ns.db.show.skillup then
          local skill, max = modernSkill()
          if skill and skill < max then
            up = chanceText(ns.RecipeChance(recipeInfo.recipeID, skill, recipeInfo.relativeDifficulty), complete and cost or nil)
          end
        end
        -- profit and skill-up on two lines: on one, the line ran left over the form's own buttons
        if s ~= "" and up ~= "" then s = s .. "\n" .. up:gsub("^%s+", "") else s = s .. up end
        if s ~= "" then line:SetText("|cffe6a23cForever Anvil|r" .. s) end
      end)
    end)
  end
end

---------------------------------------------------------------------------------------------------
-- Classic window

-- cost, complete, profit (or nil) for one recipe in the open window
-- { {itemID, count}, … } for one craft of a recipe in the open classic window, or nil
local function classicReagents(index)
  local reagents = {}
  for r = 1, GetTradeSkillNumReagents(index) do
    local _, _, count = GetTradeSkillReagentInfo(index, r)
    local id = ns.ItemID(GetTradeSkillReagentItemLink(index, r))
    if not id or not count then return nil end
    reagents[#reagents + 1] = { id, count }
  end
  return reagents
end

function ns.RecipeProfit(index)
  local product = ns.ItemID(GetTradeSkillItemLink(index))
  local reagents = classicReagents(index)
  if not reagents then return nil end
  if not product then -- an enchant: reagents only
    local cost, complete = M.CraftProfit(reagents, ns.ReagentCost)
    return cost, complete, false
  end
  local lo, hi = GetTradeSkillNumMade(index)
  local made = ((lo or 1) + (hi or lo or 1)) / 2
  return M.CraftProfit(reagents, ns.ReagentCost, ns.Market(product), made)
end

-- the cheapest recipe per skill point in the classic window: { index, cost, chance }
local function classicSkillUp()
  if not (ns.db.show.skillup and GetTradeSkillLine and GetNumTradeSkills) then return nil end
  local name, skill, max = GetTradeSkillLine()
  if not (skill and max) or skill >= max then return nil end
  return bestSkillUp((name or "?") .. ":" .. skill .. ":" .. GetNumTradeSkills(), function()
    local entries = {}
    for i = 1, GetNumTradeSkills() do
      local _, kind = GetTradeSkillInfo(i)
      if kind and kind ~= "header" then
        local link = GetTradeSkillRecipeLink and GetTradeSkillRecipeLink(i)
        local spell = link and tonumber(link:match("enchant:(%d+)"))
        local chance = ns.RecipeChance(spell, skill, DIFFICULTY[kind])
        if chance and chance > 0 then
          local cost, complete = ns.RecipeProfit(i)
          if cost and complete then entries[#entries + 1] = { i, cost, chance } end
        end
      end
    end
    return entries
  end)
end

local function updateClassic()
  local on = ns.db and ns.House()
  local best = on and classicSkillUp()
  for i = 1, (TRADE_SKILLS_DISPLAYED or 8) do
    local button = _G["TradeSkillSkill" .. i]
    if button then
      local t = textFor(button)
      t:SetText("")
      local index = button:GetID()
      if on and button:IsShown() and index and index > 0 then
        local _, kind = GetTradeSkillInfo(index)
        if kind and kind ~= "header" then
          local text = ""
          if ns.db.show.craft then
            local _, _, profit = ns.RecipeProfit(index)
            text = profitText(profit)
          end
          if best and best[1] == index then text = SKILL_TAG .. text end
          t:SetText(text)
        end
      end
    end
  end
end

-- learning a recipe or gaining a point changes the pick
local events = CreateFrame("Frame")
for _, e in ipairs({ "TRADE_SKILL_LIST_UPDATE", "SKILL_LINES_CHANGED", "NEW_RECIPE_LEARNED" }) do
  pcall(events.RegisterEvent, events, e)
end
events:SetScript("OnEvent", function() ns.ResetSkillUp() end)

-- Hooks whichever profession window exists, once. Runs when a profession UI addon loads and again when the
-- window opens (TRADE_SKILL_SHOW, in Core.lua), so it works however and whenever the client loads that UI.
function ns.InitProfession()
  if ns.professionUI then return end
  if ProfessionsFrame then
    initModern()
  elseif type(TradeSkillFrame_Update) == "function" and GetTradeSkillInfo then
    ns.professionUI = "classic"
    hooksecurefunc("TradeSkillFrame_Update", function() ns.Safe("profession", updateClassic) end)
    if TradeSkillFrame and GetTradeSkillSelectionIndex then
      shoppingButton(TradeSkillFrame, TradeSkillCreateAllButton, function()
        local index = GetTradeSkillSelectionIndex()
        if not index or index == 0 then return nil end
        return classicReagents(index), (GetTradeSkillInfo(index))
      end, TradeSkillInputBox)
    end
  elseif TradeSkillFrame then
    ns.professionUI = "classic, unsupported"
    ns.Print(L["this profession window isn't supported yet, so craft profits aren't shown. Tooltips still work."])
  end
end
ns.onAddon["Blizzard_Professions"] = ns.InitProfession
ns.onAddon["Blizzard_TradeSkillUI"] = ns.InitProfession
