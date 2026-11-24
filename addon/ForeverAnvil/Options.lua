-- Settings panel (Esc → Options → AddOns → Forever Anvil): switches grouped by where they show (tooltips,
-- auction house, profession window, your gear and lists), shortcuts to the windows, this realm's ruleset,
-- and the About text with Blizzard's data credit. Hover a switch for what it does.
local addonName, ns = ...
local M = ns.Math
local L = ns.L

-- section title, then { setting key, label, what it does }
local LEFT = {
  { "Tooltips",
    { "market", "Market price", "The typical price on your auction house right now." },
    { "min", "Lowest listed price", "The cheapest listing, and how many are up." },
    { "sold", "Sold per day", "Estimated from how listings change hour to hour." },
    { "region", "Region median", "The typical price across all the region's auction houses." },
    { "de", "Disenchant value", "What disenchanting the item is worth after the auction cut, and the Enchanting skill it needs." },
    { "vendor", "Vendor price per item", "Off by default: the game's own tooltip already shows the stack's sell price." },
    { "crates", "Waylaid crates", "The Merchant's Favor a crate pays and the cheapest bundle to fill it." },
  },
  { "Profession window",
    { "craft", "Profit per craft", "On every recipe, after the 5% auction cut and the reagents." },
    { "skillup", "Cheapest skill-up", "Marks the recipe you know that gives skill points for the least gold, with its chance and cost per point." },
  },
}
local RIGHT = {
  { "Auction house",
    { "flips", "Flip tags", "Tags listings worth buying to disenchant (DE +X) or to sell to a vendor (Vendor +X)." },
    { "deAll", "Disenchant value on other rows", "Shows every disenchantable item's value in grey, to see how close it is to a flip." },
  },
  { "Your gear and lists",
    { "upgrades", "Upgrades", "Gear with a higher item level than what you wear in that slot, that your class can use at your level: on tooltips and as Upgrade +X in the auction house." },
    { "watch", "Watchlist", "Your target price on tooltips, and Target tags in the auction house. /fa watch opens the list." },
    { "shopping", "Shopping list", "A window beside the auction house while you still need materials, and Need X tags. /fa list opens the list." },
  },
  { "Minimap and chat",
    { "minimap", "Minimap button", "Click: menu. Right-click: these settings. Drag: move it. /fa minimap brings it back." },
    { "updates", "Old price notes", "A note in chat when your prices are over two days old, or when someone in your guild or group has newer ones. For current prices, press Scan at the auction house, or turn on auto-update in your CurseForge or Wago app." },
  },
}

local panel, category
local COL_X = { 16, 330 }

local function header(parent, text, x, y)
  local fs = parent:CreateFontString(nil, "ARTWORK", "GameFontNormal")
  fs:SetPoint("TOPLEFT", x, y)
  fs:SetText(L[text])
  local rule = parent:CreateTexture(nil, "ARTWORK")
  rule:SetColorTexture(1, 0.82, 0, 0.25)
  rule:SetPoint("TOPLEFT", x, y - 16)
  rule:SetSize(280, 1)
  return fs
end

local function build()
  panel = CreateFrame("Frame")
  panel.name = "Forever Anvil"

  local logo = panel:CreateTexture(nil, "ARTWORK")
  logo:SetSize(32, 32)
  logo:SetPoint("TOPLEFT", 16, -14)
  logo:SetTexture(ns.ICON)
  local title = panel:CreateFontString(nil, "ARTWORK", "GameFontNormalLarge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 8, -1)
  title:SetText("Forever Anvil")
  local status = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  status:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -4)
  status:SetJustifyH("LEFT")
  panel.status = status

  local boxes = {}
  panel.boxes = boxes
  local bottom = 0
  for col, sections in ipairs({ LEFT, RIGHT }) do
    local x, y = COL_X[col], -62
    for _, section in ipairs(sections) do
      header(panel, section[1], x, y)
      y = y - 22
      for i = 2, #section do
        local c = section[i]
        local cb = CreateFrame("CheckButton", nil, panel, "UICheckButtonTemplate")
        cb:SetSize(24, 24)
        cb:SetPoint("TOPLEFT", x, y)
        local label = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlight")
        label:SetPoint("LEFT", cb, "RIGHT", 2, 0)
        label:SetText(L[c[2]])
        cb.label = label
        cb:SetHitRectInsets(0, -250, 0, 0) -- the label clicks too
        cb:SetScript("OnClick", function(self)
          ns.db.show[c[1]] = self:GetChecked() and true or false
          if ns.OnSetting then ns.OnSetting(c[1]) end
        end)
        cb:SetScript("OnEnter", function(self)
          GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
          GameTooltip:AddLine(L[c[2]])
          GameTooltip:AddLine(L[c[3]], 1, 1, 1, true)
          GameTooltip:Show()
        end)
        cb:SetScript("OnLeave", function() GameTooltip:Hide() end)
        boxes[c[1]] = cb
        y = y - 24
      end
      y = y - 10
    end
    bottom = math.min(bottom, y)
  end

  -- shortcuts to the windows
  local y = bottom - 4
  header(panel, "Open", COL_X[1], y)
  local x = COL_X[1]
  panel.open = {}
  -- the settings window would cover the one you open: close it first
  local function closeSettings()
    for _, f in ipairs({ SettingsPanel, InterfaceOptionsFrame }) do
      if f and f:IsShown() and HideUIPanel then HideUIPanel(f) end
    end
  end
  for _, s in ipairs({
    { "Prices", function() if not ns.PricesShown() then ns.ShowPrices() end end },
    { "Watchlist", function() ns.ShowWatch(true) end },
    { "Shopping list", function() ns.ShowShopping(true) end },
    { "Bag value", function() ns.ShowBags(true) end },
    { "Upgrades", function() ns.ShowUpgrades(true) end },
    { "Import", function() ns.ShowImport() end },
  }) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(96, 22)
    b:SetPoint("TOPLEFT", x, y - 24)
    b:SetText(L[s[1]])
    b:SetScript("OnClick", function() closeSettings(); ns.Safe("options", s[2]) end)
    panel.open[#panel.open + 1] = b
    x = x + 100
  end

  -- the auction house scan (Scan.lua): when you last scanned, and how
  y = y - 60
  header(panel, "Auction house scan", COL_X[1], y)
  local scanNow = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
  scanNow:SetSize(96, 22)
  scanNow:SetPoint("TOPLEFT", COL_X[1], y - 24)
  scanNow:SetText(L["Scan now"])
  scanNow:SetScript("OnClick", function() ns.Safe("options", ns.StartScan) end)
  panel.scanNow = scanNow
  local scanText = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  scanText:SetPoint("TOPLEFT", COL_X[1] + 104, y - 22)
  scanText:SetWidth(500)
  scanText:SetJustifyH("LEFT")
  panel.scanText = scanText

  y = y - 64
  header(panel, "Ruleset for this realm", COL_X[1], y)
  local buttons = {}
  x = COL_X[1]
  for i, r in ipairs((ns.data and ns.data.rulesets) or {}) do
    local b = CreateFrame("Button", nil, panel, "UIPanelButtonTemplate")
    b:SetSize(110, 22)
    b:SetPoint("TOPLEFT", x, y - 24)
    b:SetText(r.name .. (r.likely and "?" or ""))
    b:SetScript("OnClick", function() ns.SetRuleset(r.name); panel.refresh() end)
    buttons[i] = { b, r }
    x = x + 116
  end

  local about = panel:CreateFontString(nil, "ARTWORK", "GameFontHighlightSmall")
  about:SetPoint("TOPLEFT", COL_X[1], y - 62)
  about:SetWidth(600)
  about:SetJustifyH("LEFT")
  about:SetText(L["Prices are the same hourly snapshots as %s, from the version of this addon you have installed, or from your own scan of the auction house when that's newer. Flips and profits are estimates; check before you buy. Every buy, post and craft is still your own click."]:format(ns.SITE)
    .. "\n\n" .. L["Bring your watchlist and crafting plan over with \"Copy for the addon\" on the site and Import. More tools (price history, crafting planner, leveling routes, talents) at %s."]:format(ns.SITE)
    .. "\n\n|cff999999" .. L["Data provided by Blizzard Entertainment. Forever Anvil is not made or endorsed by Blizzard."] .. "|r")

  function panel.refresh()
    for key, cb in pairs(boxes) do cb:SetChecked(ns.db.show[key]) end
    local current = ns.Ruleset()
    for _, e in ipairs(buttons) do e[1]:SetEnabled(e[2] ~= current) end
    local scan = ns.LastScan and ns.LastScan()
    scanText:SetText((scan and L["Last scan of this auction house: %s."]:format(M.Age(time() - scan.time)) or L["You haven't scanned this auction house yet."])
      .. "\n|cff999999" .. L["At the auction house, press Scan under its window or type /fa scan to read its current prices yourself, between addon updates. The game allows one scan every 15 minutes."] .. "|r")
    local id, r, side = ns.House()
    if not ns.data then
      status:SetText(L["No price data loaded."])
    elseif id then
      status:SetText(L["%s, %s auction house. Prices from %s."]:format(r.name, L[side], M.Age(ns.DataAge())))
    else
      status:SetText(L["Pick this realm's ruleset below to see prices. Data from %s."]:format(M.Age(ns.DataAge())))
    end
  end
  panel:SetScript("OnShow", panel.refresh)
  panel:Hide() -- a new frame starts out shown: hidden, so opening the settings runs OnShow

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

-- the panel, for tests
function ns.OptionsPanel() return panel end

function ns.OpenOptions()
  ns.InitOptions()
  if Settings and Settings.OpenToCategory and category then
    Settings.OpenToCategory(category:GetID())
  elseif InterfaceOptionsFrame_OpenToCategory then
    InterfaceOptionsFrame_OpenToCategory(panel)
    InterfaceOptionsFrame_OpenToCategory(panel) -- the old panel needs it twice to scroll to the entry
  end
end
