-- Loot Comets: the parts with no game calls, so they can be tested outside the game (pipeline/lootcomets.test.js).
-- What landed in your bags between two looks at them, and the arc a comet flies along.
local _, ns = ...
local C = {}
ns.Logic = C

-- A look at your bags: { slots = { ["bag:slot"] = { id, count, bag, slot } }, totals = { [itemID] = count } }.
-- items: a list of { bag, slot, id, count } for the filled slots.
function C.Snapshot(items)
  local slots, totals = {}, {}
  for _, it in ipairs(items) do
    slots[it.bag .. ":" .. it.slot] = it
    totals[it.id] = (totals[it.id] or 0) + it.count
  end
  return { slots = slots, totals = totals }
end

local function before(a, b)
  if a.bag ~= b.bag then return a.bag < b.bag end
  return a.slot < b.slot
end

-- What you gained between two looks: a list of { id, gained, bag, slot, new }, in bag order.
-- Only items whose total went up count, so moving or splitting stacks inside your bags is never a gain.
-- bag and slot are where most of it landed; new is true when you had none of that item before.
function C.Gains(old, now)
  local gains = {}
  for id, total in pairs(now.totals) do
    local had = old.totals[id] or 0
    if total > had then
      local gained = total - had
      -- the slot that grew by exactly what you gained, else the one that grew most (a stack moved meanwhile)
      local best, bestScore
      for key, s in pairs(now.slots) do
        if s.id == id then
          local o = old.slots[key]
          local up = s.count - ((o and o.id == id) and o.count or 0)
          local score = (up == gained) and math.huge or up
          if up > 0 and (not best or score > bestScore or (score == bestScore and before(s, best))) then
            best, bestScore = s, score
          end
        end
      end
      if not best then -- landed by moving another stack around: the first slot holding it
        for _, s in pairs(now.slots) do
          if s.id == id and (not best or before(s, best)) then best = s end
        end
      end
      gains[#gains + 1] = { id = id, gained = gained, bag = best.bag, slot = best.slot, new = had == 0 }
    end
  end
  table.sort(gains, before)
  return gains
end

-- The arc's bend: a point beside the straight line from (x0, y0) to (x1, y1), on its upper side, so comets
-- loop up and over like something thrown. side (-1 to 1) nudges each comet so a handful don't overlap;
-- height (the arc setting: 0.3 flat, 1 normal, 1.8 high) scales the bend.
function C.Control(x0, y0, x1, y1, side, height)
  local mx, my = (x0 + x1) / 2, (y0 + y1) / 2
  local dx, dy = x1 - x0, y1 - y0
  local len = math.sqrt(dx * dx + dy * dy)
  height = height or 1
  if len < 1 then return mx, my + 60 * height end
  local nx, ny = -dy / len, dx / len -- a right angle to the line
  if ny < 0 then nx, ny = -nx, -ny end -- the upper one
  local bend = len * (0.35 + 0.15 * (side or 0)) * height
  return mx + nx * bend, my + ny * bend
end

-- A colour from hue (0 to 1, wraps around), saturation and brightness: the rainbow colour mode.
function C.HSV(h, s, v)
  h = (h % 1) * 6
  local i = math.floor(h)
  local f = h - i
  local p, q, t = v * (1 - s), v * (1 - f * s), v * (1 - (1 - f) * s)
  if i == 0 then return v, t, p
  elseif i == 1 then return q, v, p
  elseif i == 2 then return p, v, t
  elseif i == 3 then return p, q, v
  elseif i == 4 then return t, p, v
  end
  return v, p, q
end

-- A slider's value snapped to its step and kept between its ends.
function C.Snap(v, lo, hi, step)
  v = math.floor(v / step + 0.5) * step
  if v < lo then v = lo elseif v > hi then v = hi end
  return v
end

-- The point at t (0 to 1) along the curve from (x0, y0) bent towards (cx, cy) to (x1, y1).
function C.Arc(t, x0, y0, cx, cy, x1, y1)
  local u = 1 - t
  return u * u * x0 + 2 * u * t * cx + t * t * x1, u * u * y0 + 2 * u * t * cy + t * t * y1
end

-- How far along the arc at time t: a quick launch, a float at the top, then speeding into the bag.
function C.Ease(t)
  if t <= 0 then return 0 elseif t >= 1 then return 1 end
  return 0.45 * t + 0.55 * t * t * t
end

-- The comet's size at time t: pops out big, settles, then shrinks as it drops into the slot.
function C.Scale(t)
  if t < 0.12 then return 0.3 + (1.35 - 0.3) * (t / 0.12) end
  if t < 0.3 then return 1.35 - 0.35 * ((t - 0.12) / 0.18) end
  if t < 0.75 then return 1 end
  return 1 - 0.45 * ((t - 0.75) / 0.25)
end

-- Seconds a flight takes: longer across the screen, shorter at a higher speed setting.
function C.Duration(x0, y0, x1, y1, speed)
  local d = math.sqrt((x1 - x0) ^ 2 + (y1 - y0) ^ 2)
  local s = 0.5 + d / 2200
  if s > 1.05 then s = 1.05 end
  return s / (speed or 1)
end

-- /comets test: which bag item each test comet shows and lands on. One comet per quality, grey to epic, plus
-- legendary when you carry one. A quality you have no item of borrows another item (the closest quality, one
-- not shown yet where possible), so no comet shows a "?" icon. items: { bag, slot, icon, quality } for the
-- filled slots. Returns a list of { quality, item }, item nil only when the bags are empty.
function C.TestPicks(items)
  local list = {}
  for _, it in ipairs(items) do list[#list + 1] = it end
  table.sort(list, before)
  local top = 4
  for _, it in ipairs(list) do
    if (it.quality or 1) == 5 then top = 5 end
  end
  local picks, used = {}, {}
  for q = 0, top do
    for _, it in ipairs(list) do
      if (it.quality or 1) == q then
        picks[q + 1] = { quality = q, item = it }
        used[it] = true
        break
      end
    end
  end
  for q = 0, top do
    if not picks[q + 1] then
      local best, bestScore
      for _, it in ipairs(list) do
        local score = math.abs((it.quality or 1) - q) + (used[it] and 100 or 0)
        if not best or score < bestScore then best, bestScore = it, score end
      end
      if best then used[best] = true end
      picks[q + 1] = { quality = q, item = best }
    end
  end
  return picks
end

-- Whether an item of this quality gets a comet. quality nil (not known yet) counts as common.
function C.Flies(quality, db)
  quality = quality or 1
  if quality == 0 then return db.grey and true or false end
  return true
end
