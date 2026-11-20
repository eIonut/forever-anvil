// Character lookup: fetches a WoW: Forever character from Blizzard and returns only
// the fields the website shows. Used by the local dev server (pipeline/character-api.js) and by the
// Cloudflare Worker in production. Nothing is stored; callers may cache for ≤ 15 minutes.

// "Thrallina Stormhoof" / "thrallina-stormhoof" → "thrallina-stormhoof"
function normalizeName(input) {
  const parts = String(input || "").trim().replace(/\s+/g, " ").split(/[ -]/).filter(Boolean);
  if (parts.length !== 2) return null;
  if (!parts.every((p) => /^[\p{L}']{2,20}$/u.test(p))) return null;
  return parts.map((p) => p.toLowerCase()).join("-");
}

const pick = (o, k) => (o && o[k] && (o[k].name || o[k])) || null;

// Item icons never change, so they're remembered between lookups (per server process / Worker isolate).
// item id → Blizzard icon file id (0 when Blizzard has no icon)
const iconCache = new Map();
const ICON_CACHE_MAX = 5000;

async function itemIcons(api, ids) {
  const missing = [...new Set(ids)].filter((id) => !iconCache.has(id));
  await Promise.all(missing.map(async (id) => {
    const r = await api.get(`/data/wow/media/item/${id}`, api.ns.static, { retries: 1 });
    if (r.status !== 200 && r.status !== 404) return; // try again on the next lookup
    const a = r.json && Array.isArray(r.json.assets) ? r.json.assets.find((x) => x.key === "icon") : null;
    if (iconCache.size >= ICON_CACHE_MAX) iconCache.delete(iconCache.keys().next().value);
    iconCache.set(id, (a && a.file_data_id) || 0);
  }));
  return (id) => iconCache.get(id) || null;
}

// An image from the character-media response, only when it's on Blizzard's own image host.
// Tries the keys in order and returns the first one found.
const RENDER_HOST = /^https:\/\/render\.worldofwarcraft\.com\//;
function mediaAsset(media, ...keys) {
  const assets = media && Array.isArray(media.assets) ? media.assets : [];
  for (const k of keys) {
    const a = assets.find((x) => x.key === k);
    if (a && RENDER_HOST.test(a.value)) return a.value;
  }
  return null;
}

// latest of several HTTP dates, as ISO text (or null)
function newest(dates) {
  const t = dates.map((d) => (d ? Date.parse(d) : NaN)).filter((x) => !isNaN(x));
  return t.length ? new Date(Math.max.apply(null, t)).toISOString() : null;
}

async function lookupCharacter(api, nameInput) {
  const slug = normalizeName(nameInput);
  if (!slug) return { error: "bad-name" };
  const base = `/profile/wow/character/${encodeURIComponent(slug)}`;
  const [sum, eq, prof, rep, media] = await Promise.all([
    api.get(base, api.ns.profile),
    api.get(base + "/equipment", api.ns.profile),
    api.get(base + "/professions", api.ns.profile),
    api.get(base + "/reputations", api.ns.profile),
    api.get(base + "/character-media", api.ns.profile)
  ]);
  if (sum.status === 404) return { error: "not-found", slug };
  if (sum.status !== 200 || !sum.json) return { error: "unavailable", status: sum.status };
  const s = sum.json;

  const equipped = (eq.json && eq.json.equipped_items) || [];
  const iconOf = await itemIcons(api, equipped.map((it) => it.item && it.item.id).filter(Boolean));
  const gear = equipped.map((it) => ({
    slot: pick(it, "slot"),
    slotType: it.slot && it.slot.type ? it.slot.type : null, // HEAD, NECK, FINGER_1, MAIN_HAND, …
    id: it.item && it.item.id,
    icon: it.item ? iconOf(it.item.id) : null,                // icon file id, see iconUrl() in pricemath.js
    // "Enchanted: Stamina +4" → "Stamina +4", as the game's tooltip shows it
    enchant: (it.enchantments || []).map((e) => String(e.display_string || "").replace(/^Enchanted:\s*/i, "")).filter(Boolean)[0] || null,
    name: it.name || null,
    quality: it.quality && it.quality.type ? it.quality.type.toLowerCase() : null,
    level: it.level && it.level.value != null ? it.level.value : null
  })).filter((g) => g.id);

  // professions: classic-style responses list primaries/secondaries, sometimes with tiers
  const professions = [];
  const addProf = (p) => {
    const name = pick(p, "profession");
    let skill = p.skill_points, max = p.max_skill_points;
    if (skill == null && p.tiers && p.tiers[0]) { skill = p.tiers[0].skill_points; max = p.tiers[0].max_skill_points; }
    const id = p.profession && p.profession.id != null ? p.profession.id : null;
    if (name) professions.push({ id, name, skill: skill != null ? skill : null, max: max != null ? max : null });
  };
  if (prof.json) ((prof.json.primaries || []).concat(prof.json.secondaries || [])).forEach(addProf);

  const reputations = ((rep.json && rep.json.reputations) || []).map((r) => ({
    faction: pick(r, "faction"),
    standing: r.standing ? r.standing.name || null : null,
    value: r.standing ? r.standing.value : null,
    max: r.standing ? r.standing.max : null,
    raw: r.standing ? r.standing.raw : null
  })).filter((r) => r.faction).sort((a, b) => (b.raw || 0) - (a.raw || 0)).slice(0, 15);

  // avatar: small face portrait; inset: head and shoulders; render: the whole character (the
  // transparent "main-raw" when Blizzard offers it, else "main" with its own backdrop). Any may be missing.
  const avatar = mediaAsset(media.json, "avatar") || (media.json && media.json.assets && media.json.assets[0] && RENDER_HOST.test(media.json.assets[0].value) ? media.json.assets[0].value : null);
  const inset = mediaAsset(media.json, "inset");
  const render = mediaAsset(media.json, "main-raw", "main");
  const renderRaw = !!mediaAsset(media.json, "main-raw");

  return {
    character: {
      slug,
      name: s.name || null,
      surname: s.surname || null,
      level: s.level != null ? s.level : null,
      race: pick(s, "race"),
      class: pick(s, "character_class"),
      faction: pick(s, "faction"),
      gender: pick(s, "gender"),
      guild: s.guild ? s.guild.name || null : null,
      ruleset: s.ruleset ? s.ruleset.name || null : null,
      lastLogin: s.last_login_timestamp ? new Date(s.last_login_timestamp).toISOString() : null,
      avatar,
      inset,
      render,
      renderRaw
    },
    // when Blizzard last refreshed this profile (profiles only update after the character logs out)
    blizzardUpdated: newest([sum, eq, prof, rep].map((r) => r.lastModified)),
    gear, professions, reputations,
    partial: [eq, prof, rep].some((r) => r.status !== 200) // some sections not ready yet (e.g. right after logout)
  };
}

export { lookupCharacter, normalizeName };
