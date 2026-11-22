-- Profession window: profit per craft next to each recipe, from your auction house's prices:
-- market price of what it makes × average made, minus the AH's 5% cut, minus reagents (AH market, or the
-- vendor's price when a reagent isn't on the AH). Grey "?" when something has no price.
-- Two windows: the modern one (Blizzard_Professions, which the Forever client uses) and the classic one
-- (Blizzard_TradeSkillUI). Recipes that make no item (enchants) show nothing.
local _, ns = ...
local M = ns.Math

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
-- Modern window

-- cost, complete, profit for a recipe ID; profit false when it makes no item, nil when unpriced
function ns.SchematicProfit(recipeID)
  local s = C_TradeSkillUI.GetRecipeSchematic(recipeID, false)
  if not s then return nil end
  if not s.outputItemID then return 0, true, false end
  local basicType = Enum and Enum.CraftingReagentType and Enum.CraftingReagentType.Basic
  local reagents = {}
  for _, slot in ipairs(s.reagentSlotSchematics or {}) do
    -- only the reagents every craft needs (not optional or finishing ones)
    local needed = slot.required
    if needed == nil then needed = basicType == nil or slot.reagentType == basicType end
    if needed then
      local r = slot.reagents and slot.reagents[1]
      if not (r and r.itemID) then return nil end
      reagents[#reagents + 1] = { r.itemID, slot.quantityRequired or 1 }
    end
  end
  local lo = s.quantityMin or 1
  local made = (lo + (s.quantityMax or lo)) / 2
  return M.CraftProfit(reagents, ns.ReagentCost, ns.Market(s.outputItemID), made)
end

local function recipeRow(frame, node)
  local t = textFor(frame)
  t:SetText("")
  local data = node and node.GetData and node:GetData()
  local info = data and data.recipeInfo
  if not (info and info.recipeID and ns.db.show.craft and ns.House()) then return end
  local _, _, profit = ns.SchematicProfit(info.recipeID)
  t:SetText(profitText(profit))
end

local function initModern()
  local page = ProfessionsFrame.CraftingPage
  local list = page and page.RecipeList and page.RecipeList.ScrollBox
  if not (C_TradeSkillUI and C_TradeSkillUI.GetRecipeSchematic and ns.HookScrollRows(list, recipeRow, "profession")) then
    ns.professionUI = "modern, unsupported"
    ns.Print("this profession window isn't supported yet, so craft profits aren't shown. Tooltips still work.")
    return
  end
  ns.professionUI = "modern"
  -- the selected recipe: profit and reagent cost under the recipe's name
  local form = page.SchematicForm
  if form and form.Init then
    local line = form:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
    line:SetPoint("TOPRIGHT", form, "TOPRIGHT", -12, -12)
    line:SetJustifyH("RIGHT")
    hooksecurefunc(form, "Init", function(_, recipeInfo)
      ns.Safe("profession", function()
        line:SetText("")
        if not (recipeInfo and recipeInfo.recipeID and ns.db.show.craft and ns.House()) then return end
        local cost, complete, profit = ns.SchematicProfit(recipeInfo.recipeID)
        if profit == false or not cost then return end
        line:SetText("|cffe6a23cForever Anvil|r  profit " .. profitText(profit)
          .. "  |cff999999reagents " .. (complete and "" or "~") .. M.ShortMoney(cost, true) .. "|r")
      end)
    end)
  end
end

---------------------------------------------------------------------------------------------------
-- Classic window

-- cost, complete, profit (or nil) for one recipe in the open window
function ns.RecipeProfit(index)
  local product = ns.ItemID(GetTradeSkillItemLink(index))
  if not product then return 0, true, false end
  local reagents = {}
  for r = 1, GetTradeSkillNumReagents(index) do
    local _, _, count = GetTradeSkillReagentInfo(index, r)
    local id = ns.ItemID(GetTradeSkillReagentItemLink(index, r))
    if not id or not count then return nil end
    reagents[#reagents + 1] = { id, count }
  end
  local lo, hi = GetTradeSkillNumMade(index)
  local made = ((lo or 1) + (hi or lo or 1)) / 2
  return M.CraftProfit(reagents, ns.ReagentCost, ns.Market(product), made)
end

local function updateClassic()
  local on = ns.db and ns.db.show.craft and ns.House()
  for i = 1, (TRADE_SKILLS_DISPLAYED or 8) do
    local button = _G["TradeSkillSkill" .. i]
    if button then
      local t = textFor(button)
      t:SetText("")
      local index = button:GetID()
      if on and button:IsShown() and index and index > 0 then
        local _, kind = GetTradeSkillInfo(index)
        if kind and kind ~= "header" then
          local _, _, profit = ns.RecipeProfit(index)
          t:SetText(profitText(profit))
        end
      end
    end
  end
end

-- Hooks whichever profession window exists, once. Runs when a profession UI addon loads and again when the
-- window opens (TRADE_SKILL_SHOW, in Core.lua), so it works however and whenever the client loads that UI.
function ns.InitProfession()
  if ns.professionUI then return end
  if ProfessionsFrame then
    initModern()
  elseif type(TradeSkillFrame_Update) == "function" and GetTradeSkillInfo then
    ns.professionUI = "classic"
    hooksecurefunc("TradeSkillFrame_Update", function() ns.Safe("profession", updateClassic) end)
  elseif TradeSkillFrame then
    ns.professionUI = "classic, unsupported"
    ns.Print("this profession window isn't supported yet, so craft profits aren't shown. Tooltips still work.")
  end
end
ns.onAddon["Blizzard_Professions"] = ns.InitProfession
ns.onAddon["Blizzard_TradeSkillUI"] = ns.InitProfession
