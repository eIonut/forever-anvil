-- The addon's text in the game client's language. ns.L["English text"] gives the translation, or the English
-- text itself when there's none (English clients, and anything not translated yet). Keys are the English
-- text, with %s / %d where numbers and names go; a translation keeps the same placeholders in the same order.
-- Translations are in Locales.lua. Money keeps g / s / c, as typed and shown everywhere in the addon.
local _, ns = ...

local L = setmetatable({}, { __index = function(_, key) return key end })
ns.L = L
ns.LOCALE = (GetLocale and GetLocale()) or "enUS"

-- Locales.lua calls this once per language; only the client's language is kept
function ns.AddLocale(locales, t)
  for _, loc in ipairs(locales) do
    if loc == ns.LOCALE then
      for k, v in pairs(t) do rawset(L, k, v) end
      return
    end
  end
end

-- after Locales.lua: the age format the pure math uses ("3h ago")
function ns.ApplyLocale()
  local M = ns.Math
  M.AGE.m, M.AGE.h, M.AGE.d = L["%dm ago"], L["%dh ago"], L["%dd ago"]
end
