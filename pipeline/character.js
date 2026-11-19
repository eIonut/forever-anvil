// Character lookup: fetches a WoW: Forever character from Blizzard and returns only
// the fields the website shows. Used by the local dev server now (serve.js) and by the
// Cloudflare Worker in production. Nothing is stored; callers may cache for ≤ 15 minutes.

// "Thrallina Stormhoof" / "thrallina-stormhoof" → "thrallina-stormhoof"
function normalizeName(input) {
  const parts = String(input || "").trim().replace(/\s+/g, " ").split(/[ -]/).filter(Boolean);
  if (parts.length !== 2) return null;
  if (!parts.every((p) => /^[\p{L}']{2,20}$/u.test(p))) return null;
  return parts.map((p) => p.toLowerCase()).join("-");
}

const pick = (o, k) => (o && o[k] && (o[k].name || o[k])) || null;

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

  const gear = ((eq.json && eq.json.equipped_items) || []).map((it) => ({
    slot: pick(it, "slot"),
    id: it.item && it.item.id,
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
    if (name) professions.push({ name, skill: skill != null ? skill : null, max: max != null ? max : null });
  };
  if (prof.json) ((prof.json.primaries || []).concat(prof.json.secondaries || [])).forEach(addProf);

  const reputations = ((rep.json && rep.json.reputations) || []).map((r) => ({
    faction: pick(r, "faction"),
    standing: r.standing ? r.standing.name || null : null,
    value: r.standing ? r.standing.value : null,
    max: r.standing ? r.standing.max : null,
    raw: r.standing ? r.standing.raw : null
  })).filter((r) => r.faction).sort((a, b) => (b.raw || 0) - (a.raw || 0)).slice(0, 15);

  let avatar = null;
  if (media.json && Array.isArray(media.json.assets)) {
    const a = media.json.assets.find((x) => x.key === "avatar") || media.json.assets[0];
    if (a && /^https:\/\/render\.worldofwarcraft\.com\//.test(a.value)) avatar = a.value;
  }

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
      avatar
    },
    // when Blizzard last refreshed this profile (profiles only update after the character logs out)
    blizzardUpdated: newest([sum, eq, prof, rep].map((r) => r.lastModified)),
    gear, professions, reputations,
    partial: [eq, prof, rep].some((r) => r.status !== 200) // some sections not ready yet (e.g. right after logout)
  };
}

export { lookupCharacter, normalizeName };
