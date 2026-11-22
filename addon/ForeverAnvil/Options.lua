-- Settings panel (Esc → Options → AddOns → Forever Anvil): what the tooltip shows, flips and craft profits,
-- this realm's ruleset, and the About text with Blizzard's data credit.
local addonName, ns = ...
local M = ns.Math

local CHECKS = {
  { "market", "Tooltip: market price" },
  { "min", "Tooltip: lowest listed price" },
  { "sold", "Tooltip: sold per day" },
  { "region", "Tooltip: region median" },
  { "de", "Tooltip: disenchant value" },
  { "vendor", "Tooltip: vendor price per item (the game already shows the stack's sell price)" },
  { "flips", "Auction house: tag vendor and disenchant flips" },
  { "deAll", "Auction house: also show the disenchant value (grey) on rows that aren't flips" },
  { "craft", "Profession window: profit per craft" },
}

local panel, category

local function build()
  panel = CreateFrame("Frame")
  panel.name = "Forever Anvil"

  local title = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", 16, -16)
  title:SetText("Forever Anvil")

  local status = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  status:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -6)
  status:SetJustifyH("LEFT")

  local y = -64
  local boxes = {}
  for _, c in ipairs(CHECKS) do
    local cb = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
    cb:SetPoint("TOPLEFT", 16, y)
    local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
    label:SetPoint("LEFT", cb, "RIGHT", 4, 0)
    label:SetText(c[2])
    cb:SetScript("OnClick", function(self) ns.db.show[c[1]] = self:GetChecked() and true or false end)
    boxes[c[1]] = cb
    y = y - 28
  end

  local rsLabel = panel:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  rsLabel:SetPoint("TOPLEFT", 16, y - 10)
  rsLabel:SetText("Ruleset for this realm")
  local buttons = {}
  local x = 16
  for i, r in ipairs((ns.data and ns.data.rulesets) or {}) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(96, 22)
    b:SetPoint("TOPLEFT", x, y - 32)
    b:SetText(r.name .. (r.likely and "?" or ""))
    b:SetScript("OnClick", function() ns.SetRuleset(r.name); panel.refresh() end)
    buttons[i] = { b, r }
    x = x + 100
  end

  local about = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  about:SetPoint("TOPLEFT", 16, y - 74)
  about:SetWidth(560)
  about:SetJustifyH("LEFT")
  about:SetText("Prices are the same hourly snapshots as " .. ns.SITE .. ", from the version of this addon you have installed: "
    .. "update it often for fresh prices. Flips and profits are estimates; check before you buy. "
    .. "Every buy, post and craft is still your own click.\n\n"
    .. "More tools (crafting planner, upgrades, watchlist, talents) at " .. ns.SITE .. ".\n\n"
    .. "Data provided by Blizzard Entertainment. Forever Anvil is not made or endorsed by Blizzard.")

  function panel.refresh()
    for key, cb in pairs(boxes) do cb:SetChecked(ns.db.show[key]) end
    local current = ns.Ruleset()
    for _, e in ipairs(buttons) do e[1]:SetEnabled(e[2] ~= current) end
    local id, r, side = ns.House()
    if not ns.data then
      status:SetText("No price data loaded.")
    elseif id then
      status:SetText(("%s, %s auction house. Prices from %s."):format(r.name, side, M.Age(ns.DataAge())))
    else
      status:SetText("Pick this realm's ruleset below to see prices. Data from " .. M.Age(ns.DataAge()) .. ".")
    end
  end
  panel:SetScript("OnShow", panel.refresh)

  if Settings and Settings.RegisterCanvasLayoutCategory then
    category = Settings.RegisterCanvasLayoutCategory(panel, panel.name)
    Settings.RegisterAddOnCategory(category)
  elseif InterfaceOptions_AddCategory then
    InterfaceOptions_AddCategory(panel)
  end
end

function ns.InitOptions()
  if not panel then build() end
end

function ns.OpenOptions()
  ns.InitOptions()
  if Settings and Settings.OpenToCategory and category then
    Settings.OpenToCategory(category:GetID())
  elseif InterfaceOptionsFrame_OpenToCategory then
    InterfaceOptionsFrame_OpenToCategory(panel)
    InterfaceOptionsFrame_OpenToCategory(panel) -- the old panel needs it twice to scroll to the entry
  end
end
