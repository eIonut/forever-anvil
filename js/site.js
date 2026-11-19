/* Forever Tome — shared layout + page renderers. No dependencies. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var page = document.body.getAttribute("data-page") || "home";

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  var ICON = {
    settings: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="16" cy="7" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="10" cy="17" r="2.3" fill="none" stroke="currentColor" stroke-width="2"/></svg>',
    menu: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    up: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"><path d="M6 14l6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  // screen-reader announcements (one shared polite live region)
  function announce(msg) {
    var r = $("#sr-status");
    if (!r) return;
    r.textContent = "";
    setTimeout(function () { r.textContent = msg; }, 60);
  }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- header / footer ---------- */
  // header links: [href, label, data-page values that mark it active]
  var NAV = [
    ["prices.html", "Prices", ["prices", "items"]], ["flips.html", "Vendor flips", ["flips"]],
    ["crafting.html", "Craft profits", ["crafting", "recipe", "recipes"]], ["planner.html", "Planner", ["planner"]],
    ["talents.html", "Talents", ["talents"]], ["character.html", "Character", ["character"]]
  ];
  // footer: every tool, plus the browsable item/recipe pages
  var TOOLS = [
    ["prices.html", "Auction prices"], ["flips.html", "Vendor flips"], ["item/index.html", "Item price pages"],
    ["crafting.html", "Craft profits"], ["planner.html", "Crafting planner"], ["recipe/index.html", "Recipe pages"],
    ["talents.html", "Talent calculator"], ["character.html", "Character lookup"]
  ];
  var NAV_MORE = [["about.html", "About & credits"], ["privacy.html", "Privacy policy"]];

  function donateBtn(extraCls) {
    if (!C.donateUrl) return "";
    return '<a class="btn btn-donate ' + (extraCls || "") + '" href="' + esc(C.donateUrl) + '" target="_blank" rel="noopener">&#9829; ' + esc(C.donateLabel || "Donate") + "</a>";
  }

  // was the click inside an element matching sel? (safe when the target isn't an element)
  function inside(e, sel) { var t = e.target; return !!(t && t.closest && t.closest(sel)); }

  function navLink(n) { return '<a href="' + n[0] + '"' + (n[2].indexOf(page) >= 0 ? ' class="active" aria-current="page"' : "") + ">" + n[1] + "</a>"; }

  function renderHeader() {
    var el = $("#site-header");
    if (!el) return;
    var main = $("main");
    if (main) { main.id = "main"; main.setAttribute("tabindex", "-1"); }
    el.outerHTML =
      '<a class="skip-link" href="#main" id="skip-link">Skip to main content</a>' +
      '<header class="topbar"><div class="wrap">' +
      '<a class="brand" href="index.html" aria-label="' + esc(C.siteName) + ' home"><img src="img/logo.svg" alt="" width="38" height="38">' +
      '<span><span class="brand-name">' + esc(C.siteName) + '</span><span class="brand-sub">' + esc(C.tagline) + "</span></span></a>" +
      '<nav class="nav" id="main-nav" aria-label="Main">' +
      NAV.map(navLink).join("") +
      "</nav>" +
      '<div class="tools">' +
      '<button class="icon-btn" id="open-settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings-panel" title="Display settings"><span class="sr-only">Display settings</span>' + ICON.settings + "</button>" +
      '<button class="icon-btn nav-toggle" aria-controls="main-nav" aria-expanded="false"><span class="sr-only">Menu</span>' + ICON.menu + "</button>" +
      donateBtn("btn-sm") + "</div>" +
      "</div></header>" +
      '<div id="sr-status" class="sr-only" role="status" aria-live="polite"></div>';

    // item pages use <base href="../">, which would send "#main" to another page — focus in place instead
    $("#skip-link").addEventListener("click", function (e) {
      var m = $("#main"); if (!m) return;
      e.preventDefault(); m.focus(); m.scrollIntoView();
    });

    var t = $(".nav-toggle"), nav = $(".nav");
    function setMenu(open, focusToggle) {
      nav.classList.toggle("open", open);
      t.setAttribute("aria-expanded", open ? "true" : "false");
      if (!open && focusToggle) t.focus();
    }
    t.addEventListener("click", function () {
      var open = !nav.classList.contains("open");
      setMenu(open);
      if (open) { var first = nav.querySelector("a"); if (first) first.focus(); }
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && nav.classList.contains("open")) setMenu(false, true);
    });
    document.addEventListener("click", function (e) {
      if (nav.classList.contains("open") && !inside(e, ".nav") && !inside(e, ".nav-toggle")) setMenu(false);
    });
    fitHeader();
    window.addEventListener("resize", fitHeader);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitHeader);
  }

  // collapse the menu into the ☰ button whenever the links don't fit on one line
  function fitHeader() {
    var bar = $(".topbar"), nav = $(".nav");
    if (!bar || !nav) return;
    if (nav.classList.contains("open")) return;
    bar.classList.remove("compact");
    if (getComputedStyle(nav).display === "none") return; // already collapsed by the media query
    if (nav.scrollWidth > nav.clientWidth + 1) bar.classList.add("compact");
  }

  function renderFooter() {
    var el = $("#site-footer");
    if (!el) return;
    el.outerHTML =
      '<footer class="site"><div class="wrap"><div class="cols">' +
      "<div><h4>" + esc(C.siteName) + '</h4><p>Free, unofficial tools for WoW: Forever: live auction prices, crafting profits, talents and character lookups.</p>' + donateBtn("btn-sm") + "</div>" +
      "<div><h4>Tools</h4><ul>" + TOOLS.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + "</a></li>"; }).join("") + "</ul></div>" +
      "<div><h4>Site</h4><ul>" + NAV_MORE.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + "</a></li>"; }).join("") + "</ul></div></div>" +
      '<div class="legal">World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. ' +
      esc(C.siteName) + ' is a fan site and is not affiliated with, endorsed or sponsored by Blizzard Entertainment. Game data provided by Blizzard Entertainment. ' +
      '<a href="about.html#legal">Credits &amp; legal</a> · Last updated ' + esc(C.lastUpdated || "") + "</div></div></footer>";
  }

  /* ---------- ads ---------- */
  function setupAds() {
    var slots = $all(".ad-slot");
    if (!slots.length) return;
    if (C.adsenseClient) {
      var s = document.createElement("script");
      s.async = true; s.crossOrigin = "anonymous";
      s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + encodeURIComponent(C.adsenseClient);
      document.head.appendChild(s);
      slots.forEach(function (slot) {
        var id = (C.adSlots || {})[slot.getAttribute("data-slot")] || "";
        slot.classList.add("on");
        slot.setAttribute("role", "complementary");
        slot.setAttribute("aria-label", "Advertisement");
        slot.innerHTML = '<div class="ad-label">Advertisement</div><ins class="adsbygoogle" style="display:block" data-ad-client="' + esc(C.adsenseClient) + '"' +
          (id ? ' data-ad-slot="' + esc(id) + '"' : "") + ' data-ad-format="auto" data-full-width-responsive="true"></ins>';
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) { /* ignore */ }
      });
    } else if (C.showAdPlaceholders) {
      slots.forEach(function (slot) { slot.classList.add("on", "placeholder"); slot.textContent = "Ad space (" + slot.getAttribute("data-slot") + ")"; });
    }
  }

  function setupDonateBoxes() {
    $all("[data-donate-box]").forEach(function (box) {
      if (!C.donateUrl) { box.style.display = "none"; return; }
      box.innerHTML = '<h3>Keep the Tome running</h3><p>This site is free and made by one fan. If it saved you time, a small tip pays for hosting and keeps updates coming.</p>' + donateBtn();
    });
  }

  /* ---------- pages ---------- */
  var PAGES = {};

  // Load Wowhead's tooltip script only on pages with item links (Wowhead links or data-wowhead tooltips).
  // Our links carry their own icon and name, so tooltip data loads only on hover. Two Wowhead options:
  //  - renameLinks: on everywhere. Wowhead then fetches names up front only for links that ask for it
  //    (data-wh-rename-link="true": items Blizzard has no name for), and leaves our own links alone.
  //  - iconizeLinks: only where a Wowhead link has no icon of ours (character gear). With it on,
  //    Wowhead downloads data for every link on page load — thousands of requests on the item index.
  var whLoaded = false;
  function setupWowhead() {
    if (!document.querySelector('a.wh:not(.wh-search), [data-wowhead]')) return;
    if (whLoaded) {
      // links added after page load: ask the script to scan again
      try {
        if (window.$WowheadPower && $WowheadPower.refreshLinks) $WowheadPower.refreshLinks();
        else if (window.WH && WH.Tooltips && WH.Tooltips.refreshLinks) WH.Tooltips.refreshLinks();
      } catch (e) { /* ignore */ }
      return;
    }
    whLoaded = true;
    var needsWh = !!document.querySelector("a.wh:not([data-wh-icon-added])");
    window.whTooltips = { colorLinks: false, iconizeLinks: needsWh, renameLinks: true };
    var s = document.createElement("script");
    s.src = "https://wow.zamimg.com/js/tooltips.js";
    s.async = true;
    document.head.appendChild(s);
  }

  /* ---------- auction prices ---------- */
  // Money in copper → "1g 40s 5c" with coloured coins (text stays readable without colour).
  function money(c) {
    if (c == null || isNaN(c)) return '<span class="faint">—</span>';
    c = Math.round(c);
    var g = Math.floor(c / 10000), s = Math.floor((c % 10000) / 100), cu = c % 100, out = [];
    if (g) out.push('<span class="coin g">' + g.toLocaleString() + "g</span>");
    if (g || s) out.push('<span class="coin s">' + s + "s</span>");
    out.push('<span class="coin c">' + cu + "c</span>");
    return '<span class="money">' + out.join(" ") + "</span>";
  }

  // Where price files come from: SITE_CONFIG.pricesApi in production (Cloudflare Worker),
  // or the local ./out folder written by `node pipeline/run.js` while developing.
  function priceUrl(kind, region, part) {
    var base = C.pricesApi;
    if (base) return base.replace(/\/$/, "") + "/" + kind + "/" + region + (part != null ? "/" + part : "");
    return "out/" + kind + "_" + region + (part != null ? "_" + part : "") + ".json";
  }
  // "PvP" once confirmed by an in-game check, otherwise "Group B — not confirmed yet"
  function groupLabel(meta, g) {
    var r = meta && meta.rulesets && meta.rulesets[g];
    return r ? r : "Group " + g + " — ruleset not confirmed yet";
  }
  function getJSON(url) { return fetch(url, { cache: "no-cache" }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); }

  // Is it better to sell on the auction house or to a vendor? (AH keeps 5% of the sale price.)
  function verdict(market, vendor) {
    if (vendor == null || vendor === 0) return ["AH only", "v-ah", "Vendors won't buy it"];
    var net = market * 0.95;
    if (net > vendor * 1.15) return ["Sell on AH", "v-ah", "After the 5% AH cut you get about " + Math.round(net / vendor * 10) / 10 + "× the vendor price"];
    if (net < vendor) return ["Vendor it", "v-vendor", "Vendors pay more than the AH after its 5% cut"];
    return ["About even", "v-even", "AH and vendor pay about the same"];
  }

  PAGES.prices = function () {
    var regionSel = $("#pr-region"), groupSel = $("#pr-group"), facSel = $("#pr-faction"), q = $("#pr-search"), sortSel = $("#pr-sort");
    var body = $("#pr-rows"), status = $("#pr-status"), more = $("#pr-more"), detail = $("#pr-detail");
    var prefs = store("codex-prices") || {};
    var state = { region: prefs.region || "eu", group: prefs.group || "", faction: prefs.faction || "alliance", sort: prefs.sort || "value", shown: 100 };
    var meta = null, groupData = null, names = {}, rows = [], histCache = {};
    var FACTIONS = { alliance: "Alliance", horde: "Horde", neutral: "Blackwater (neutral)" };

    regionSel.value = state.region; facSel.value = state.faction; sortSel.value = state.sort;

    function save() { store("codex-prices", { region: state.region, group: state.group, faction: state.faction, sort: state.sort }); }

    function showUnavailable(msg) {
      $("#pr-app").hidden = true;
      $("#pr-empty").hidden = false;
      $("#pr-empty-msg").textContent = msg;
    }

    function loadRegion() {
      status.textContent = "Loading prices…";
      Promise.all([getJSON(priceUrl("meta", state.region)), getJSON(priceUrl("items", state.region))]).then(function (res) {
        meta = res[0]; names = res[1] || {};
        useItemIcons(state.region, names);
        if (!meta || !meta.groups || !meta.groups.length) {
          showUnavailable(C.pricesApi ? "Live prices are temporarily unavailable. Please try again later." :
            "No price data on this computer yet. Run `node pipeline/run.js` in the project folder, then reload this page.");
          return;
        }
        $("#pr-app").hidden = false; $("#pr-empty").hidden = true;
        groupSel.innerHTML = meta.groups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(groupLabel(meta, g)) + "</option>"; }).join("");
        if (meta.groups.indexOf(state.group) < 0) state.group = meta.groups[0];
        groupSel.value = state.group;
        loadGroup();
      });
    }

    function loadGroup() {
      status.textContent = "Loading prices…";
      getJSON(priceUrl("prices", state.region, state.group)).then(function (g) {
        groupData = g;
        if (!g) { status.textContent = "Couldn't load this group's prices."; body.innerHTML = ""; return; }
        // label options with the confirmed ruleset name when we know it
        $all("option", groupSel).forEach(function (o) {
          if (o.value === g.group) o.textContent = groupLabel({ rulesets: g.ruleset ? { [g.group]: g.ruleset } : {} }, g.group);
        });
        build();
      });
    }

    function build() {
      var house = null, houseId = null;
      Object.keys(groupData.houses).forEach(function (id) { if (groupData.houses[id].faction === state.faction) { house = groupData.houses[id]; houseId = id; } });
      if (!house) { rows = []; draw(); return; }
      rows = Object.keys(house.items).map(function (id) {
        var a = house.items[id], n = names[id] || [];
        // vendor price 0 means vendors won't buy it — treat like "no vendor price"
        return { id: +id, min: a[0], market: a[1], qty: a[2], n: a[3], name: n[0] || null, vendor: n[1] ? n[1] : null };
      });
      state.houseId = houseId;
      drawMovers();
      var upd = new Date(groupData.updated);
      $("#pr-updated").innerHTML = 'Updated <time datetime="' + esc(groupData.updated) + '">' + upd.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + "</time> · " +
        house.listings.toLocaleString() + " listings · " + rows.length.toLocaleString() + " different items";
      draw();
    }

    function sorted(list) {
      var s = state.sort;
      return list.sort(function (a, b) {
        if (s === "name") return (a.name || "~").localeCompare(b.name || "~");
        if (s === "market") return b.market - a.market;
        if (s === "listings") return b.n - a.n;
        if (s === "ahgain") return ((b.vendor ? b.market * 0.95 / b.vendor : 0) - (a.vendor ? a.market * 0.95 / a.vendor : 0));
        if (s === "qty") return b.qty - a.qty;
        return b.market * b.qty - a.market * a.qty; // "value": total gold worth listed
      });
    }

    // named items link to their own item page (good for visitors and search engines)
    function itemLink(r) { return itemPageLink(r.id, r.name); }

    var searchTimer;
    function draw() {
      var term = (q.value || "").toLowerCase().trim();
      var list = rows.filter(function (r) { return !term || (r.name && r.name.toLowerCase().indexOf(term) >= 0) || String(r.id) === term; });
      list = sorted(list);
      var page = list.slice(0, state.shown);
      body.innerHTML = page.map(function (r) {
        var v = verdict(r.market, r.vendor);
        return '<tr data-id="' + r.id + '"><th scope="row">' + itemLink(r) + '</th><td>' + money(r.market) + "</td><td>" + money(r.min) + "</td><td>" + r.qty.toLocaleString() +
          "</td><td class=\"col-hide-sm\">" + r.n.toLocaleString() + "</td><td class=\"col-hide-sm\">" + money(r.vendor) + '</td><td><span class="verdict ' + v[1] + '" title="' + esc(v[2]) + '">' + v[0] + "</span></td>" +
          '<td><button type="button" class="btn btn-ghost btn-sm pr-open" data-id="' + r.id + '">Details<span class="sr-only"> for ' + esc(r.name || "item " + r.id) + "</span></button></td></tr>";
      }).join("") || '<tr><td colspan="8" class="empty">No items match.</td></tr>';
      more.hidden = list.length <= state.shown;
      status.textContent = (term
        ? list.length.toLocaleString() + (list.length === 1 ? " matching item" : " matching items") + (list.length > state.shown ? " (showing " + state.shown + ")" : "")
        : "Showing " + Math.min(state.shown, list.length) + " of " + list.length.toLocaleString() + " items");
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { announce(status.textContent); }, 600);
      setupWowhead();
    }

    /* rising / falling / deals for the selected auction house (computed daily by the price job) */
    var moversCache = {}, moversTab = "rising";
    function nameOf(id) { var n = names[id]; return n && n[0] ? n[0] : null; }
    function drawMovers() {
      var box = $("#mv-body"), key = state.region + ":" + state.group;
      (moversCache[key] !== undefined ? Promise.resolve(moversCache[key]) : getJSON(priceUrl("movers", state.region, state.group))).then(function (mv) {
        moversCache[key] = mv;
        var h = mv && mv.houses && mv.houses[state.houseId];
        if (!h) { box.innerHTML = '<p class="faint">Price changes will appear after the first daily update.</p>'; return; }
        if (h.days < 2) {
          box.innerHTML = '<p class="faint">We have ' + h.days + " day of price history so far. Rising and falling prices appear from the second day, and deals once there are a few days to compare against.</p>";
          return;
        }
        var list = h[moversTab] || [];
        if (!list.length) { box.innerHTML = '<p class="faint">Nothing notable here right now.</p>'; return; }
        var head = moversTab === "deals"
          ? "<tr><th scope=\"col\">Item</th><th scope=\"col\">Cheapest now</th><th scope=\"col\">Usual price</th><th scope=\"col\">Saving</th><th scope=\"col\">Listed</th></tr>"
          : "<tr><th scope=\"col\">Item</th><th scope=\"col\">Change</th><th scope=\"col\">Market now</th><th scope=\"col\">Before</th></tr>";
        var rowsHtml = list.slice(0, 15).map(function (x) {
          var link = itemLink({ id: x[0], name: nameOf(x[0]) });
          if (moversTab === "deals") {
            return "<tr><th scope=\"row\">" + link + "</th><td>" + money(x[1]) + "</td><td>" + money(x[2]) + '</td><td><span class="pct up">' + Math.round((1 - x[1] / x[2]) * 100) + "% off</span></td><td>" + x[3].toLocaleString() + "</td></tr>";
          }
          return "<tr><th scope=\"row\">" + link + '</th><td><span class="pct ' + (x[1] > 0 ? "up" : "down") + '">' + (x[1] > 0 ? "▲ +" : "▼ ") + x[1] + "%</span></td><td>" + money(x[2]) + "</td><td>" + money(x[3]) + "</td></tr>";
        }).join("");
        box.innerHTML = '<div class="table-wrap"><table class="prices"><caption class="sr-only">' + moversTab + " items</caption><thead>" + head + "</thead><tbody>" + rowsHtml + "</tbody></table></div>" +
          '<p class="faint" style="margin-top:8px">' + (moversTab === "deals"
            ? "Cheapest listing at 60% or less of the item's usual price over recent days. Deals sell fast — check in-game."
            : "Market price now compared with about 7 days ago (or the oldest day we have). Items with very few units are left out.") +
          " Updated once a day.</p>";
        setupWowhead();
      });
    }
    $("#mv-tabs").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      moversTab = b.getAttribute("data-t");
      $all("#mv-tabs button").forEach(function (x) { var on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", on); });
      drawMovers();
    });

    function shardOf(id) { return id % 32; }
    function openDetail(id) {
      var r = rows.filter(function (x) { return x.id === id; })[0];
      if (!r) return;
      var v = verdict(r.market, r.vendor);
      detail.hidden = false;
      detail.innerHTML = '<div class="section-head"><h2 id="pr-detail-title">' + itemLink(r) + '</h2><button type="button" class="icon-btn" id="pr-close" aria-label="Close details">×</button></div>' +
        '<div class="pr-stats">' +
        '<div class="stat"><b>' + money(r.market) + "</b><span>Market price (cheapest 10% of units)</span></div>" +
        '<div class="stat"><b>' + money(r.min) + "</b><span>Lowest price</span></div>" +
        '<div class="stat"><b>' + r.qty.toLocaleString() + "</b><span>Units listed (" + r.n.toLocaleString() + " listings)</span></div>" +
        '<div class="stat"><b>' + money(r.vendor) + "</b><span>Vendor buys for</span></div></div>" +
        '<p class="verdict-line"><span class="verdict ' + v[1] + '">' + v[0] + "</span> " + esc(v[2]) + ".</p>" +
        '<h3 class="mini-head">Market price, last 30 days</h3><div id="pr-chart" class="pr-chart">Loading history…</div>';
      $("#pr-close").addEventListener("click", function () { detail.hidden = true; var b = $('.pr-open[data-id="' + id + '"]'); if (b) b.focus(); });
      detail.scrollIntoView({ block: "nearest" });
      $("#pr-close").focus();
      setupWowhead();
      var part = state.group + "_" + shardOf(id), key = state.region + ":" + part; // history is split per server group
      (histCache[key] ? Promise.resolve(histCache[key]) : getJSON(priceUrl("history", state.region, part))).then(function (h) {
        histCache[key] = h;
        var pts = h && h[state.houseId] && h[state.houseId][id];
        $("#pr-chart").innerHTML = chartSVG(pts);
      });
    }

    // Simple line chart of daily market price. points: [[day, market, min, qty], ...]
    function chartSVG(pts) {
      if (!pts || !pts.length) return '<p class="faint">No history yet.</p>';
      if (pts.length < 2) return '<p class="faint">History starts building today — the chart appears after the second day of data (' + money(pts[0][1]) + " today).</p>";
      var W = 640, H = 180, P = 34;
      var days = pts.map(function (p) { return p[0]; }), vals = pts.map(function (p) { return p[1]; });
      var x0 = Math.min.apply(null, days), x1 = Math.max.apply(null, days);
      var y0 = Math.min.apply(null, vals), y1 = Math.max.apply(null, vals);
      if (y0 === y1) { y0 = y0 * 0.9; y1 = y1 * 1.1 + 1; }
      function X(d) { return P + (d - x0) / Math.max(1, x1 - x0) * (W - P * 2); }
      function Y(v) { return H - P + 6 - (v - y0) / (y1 - y0) * (H - P * 2); }
      var line = pts.map(function (p, i) { return (i ? "L" : "M") + X(p[0]).toFixed(1) + " " + Y(p[1]).toFixed(1); }).join(" ");
      var label = function (d) { var dt = new Date(d * 86400000); return dt.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
      var first = pts[0][1], last = pts[pts.length - 1][1], change = Math.round((last - first) / first * 100);
      return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Market price from ' + label(x0) + " to " + label(x1) + ": " + (change >= 0 ? "up " : "down ") + Math.abs(change) + '%">' +
        '<line x1="' + P + '" y1="' + (H - P + 6) + '" x2="' + (W - P) + '" y2="' + (H - P + 6) + '" class="axis"/>' +
        '<path d="' + line + '" class="pline"/>' +
        pts.map(function (p) { return '<circle cx="' + X(p[0]).toFixed(1) + '" cy="' + Y(p[1]).toFixed(1) + '" r="3" class="pdot"/>'; }).join("") +
        '<text x="' + P + '" y="' + (H - 6) + '" class="plabel">' + label(x0) + '</text><text x="' + (W - P) + '" y="' + (H - 6) + '" class="plabel" text-anchor="end">' + label(x1) + "</text></svg>" +
        '<p class="faint">' + (change >= 0 ? "Up " : "Down ") + Math.abs(change) + "% over " + (x1 - x0) + " days.</p>";
    }

    regionSel.addEventListener("change", function () { state.region = regionSel.value; state.shown = 100; save(); detail.hidden = true; loadRegion(); });
    groupSel.addEventListener("change", function () { state.group = groupSel.value; state.shown = 100; save(); detail.hidden = true; loadGroup(); });
    facSel.addEventListener("change", function () { state.faction = facSel.value; state.shown = 100; save(); detail.hidden = true; if (groupData) build(); });
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; save(); draw(); });
    q.addEventListener("input", function () { state.shown = 100; draw(); });
    more.addEventListener("click", function () { state.shown += 100; draw(); });
    body.addEventListener("click", function (e) { var b = e.target.closest(".pr-open"); if (b) openDetail(+b.getAttribute("data-id")); });

    // prices.html?item=2770 (from an item page): search for it and open its details
    var deepItem = +new URLSearchParams(location.search).get("item") || 0;
    var origBuild = build;
    build = function () {
      origBuild();
      if (!deepItem) return;
      var r = rows.filter(function (x) { return x.id === deepItem; })[0];
      if (r) { q.value = r.name || String(r.id); draw(); openDetail(r.id); }
      deepItem = 0;
    };

    loadRegion();
  };

  /* ---------- item icons ---------- */
  // Pages that load the item cache (items_<region>.json) register it here, so any item link can show its icon.
  var iconSrc = { region: "eu", items: {} };
  function useItemIcons(region, items) { iconSrc = { region: region, items: items || {} }; }
  // Small icon for an item (empty space of the same size when we have none, so lists stay aligned)
  function itemIcon(id) {
    var it = iconSrc.items[id] || [], url = window.PriceMath ? window.PriceMath.iconUrl(it[6], iconSrc.region, 36) : null;
    if (!url) return '<span class="item-icon" aria-hidden="true"></span>';
    return '<img class="item-icon' + (it[4] ? " qb-" + esc(it[4]) : "") + '" src="' + esc(url) + '" alt="" width="20" height="20" loading="lazy" decoding="async">';
  }

  // Wowhead hover tooltip on one of our own links (keeps our icon and text)
  function whTip(id) { return id ? ' data-wowhead="item=' + Number(id) + '&amp;domain=forever" data-wh-icon-added="true" data-wh-rename-link="false"' : ""; }

  // Link to our own item page when we know the item's name. Otherwise link to Wowhead, which fills in
  // the name (brand-new Forever items Blizzard's API doesn't describe yet); our icon stays.
  function itemPageLink(id, name, cls) {
    if (name && window.PriceMath) return '<a class="item-link' + (cls ? " " + cls : "") + '" href="' + esc(window.PriceMath.itemPath(id, name)) + '"' + whTip(id) + ">" + itemIcon(id) + esc(name) + "</a>";
    return itemIcon(id) + '<a class="wh item-link" href="https://www.wowhead.com/forever/item=' + id + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="true" data-wh-icon-added="true">Item #' + id + "</a>";
  }

  /* ---------- talent calculator ---------- */
  PAGES.talents = function () {
    var TM = window.TalentMath;
    var data = null, cls = null, specs = [], build = {}, level = 60, selected = null; // selected = { t, node }
    var classBar = $("#tc-classes"), treesBox = $("#tc-trees"), tip = $("#tc-tip"), detail = $("#tc-detail");
    var levelIn = $("#tc-level");

    function readHash() {
      var h = new URLSearchParams(location.hash.replace(/^#/, ""));
      return { c: h.get("c"), b: h.get("b"), l: parseInt(h.get("l"), 10) };
    }
    function writeHash() {
      if (!cls) return;
      var code = TM.encode(specs, build);
      var hash = "c=" + encodeURIComponent(cls.name.toLowerCase()) + (code !== "-" && code.replace(/-/g, "") ? "&b=" + code : "") + (level !== 60 ? "&l=" + level : "");
      history.replaceState(null, "", "#" + hash);
      store("codex-talents", { c: cls.name.toLowerCase(), b: code, l: level });
    }

    getJSON(priceUrl("talents", "eu")).then(function (d) {
      if (!d || !d.classes) { $("#tc-app").hidden = true; $("#tc-empty").hidden = false; return; }
      data = d;
      classBar.innerHTML = d.classes.map(function (c) {
        var col = "var(--c-" + c.name.toLowerCase() + ")";
        return '<button type="button" class="tc-class" data-c="' + esc(c.name.toLowerCase()) + '" aria-pressed="false" style="--cc:' + col + '">' +
          (c.icon ? '<img src="' + esc(c.icon) + '" alt="" width="28" height="28">' : "") + "<span>" + esc(c.name) + "</span></button>";
      }).join("");
      var h = readHash(), saved = store("codex-talents") || {};
      var pick = h.c || saved.c || "warrior";
      level = h.l || saved.l || 60;
      levelIn.value = level;
      selectClass(pick, h.c ? h.b : (pick === saved.c ? saved.b : null));
    });

    function selectClass(name, code) {
      cls = data.classes.filter(function (c) { return c.name.toLowerCase() === name; })[0] || data.classes[0];
      specs = cls.specs;
      // links can be hand-edited: re-apply the real rules before showing a shared build
      build = code ? TM.sanitize(specs, TM.decode(specs, code), TM.pointsForLevel(level)) : {};
      selected = null;
      detail.hidden = true;
      $all(".tc-class", classBar).forEach(function (b) { var on = b.getAttribute("data-c") === cls.name.toLowerCase(); b.setAttribute("aria-pressed", on); b.classList.toggle("active", on); });
      document.querySelector(".tc-app").style.setProperty("--cc", "var(--c-" + cls.name.toLowerCase() + ")");
      drawTrees();
    }

    function nodeState(t, n) {
      var r = TM.rankOf(build, t, n), max = TM.maxRank(n);
      if (r >= max) return "max";
      if (r > 0) return "partial";
      return TM.whyLocked(specs, build, t, n, TM.pointsForLevel(level)) ? "locked" : "open";
    }
    function reqText(t, n) {
      var why = TM.whyLocked(specs, build, t, n, TM.pointsForLevel(level));
      if (!why || why === "max") return "";
      if (why === "no-points") return "No talent points left at level " + level + ".";
      if (why.indexOf("row:") === 0) return "Requires " + why.slice(4) + " points in " + specs[t].name + ".";
      var req = specs[t].nodes.filter(function (x) { return String(x[0]) === why.slice(4); })[0];
      return req ? "Requires " + TM.maxRank(req) + " point" + (TM.maxRank(req) > 1 ? "s" : "") + " in " + req[3] + "." : "";
    }
    function label(t, n) {
      var r = TM.rankOf(build, t, n), max = TM.maxRank(n), req = reqText(t, n);
      return n[3] + ", rank " + r + " of " + max + "." + (req ? " " + req : "");
    }

    function drawTrees() {
      var available = TM.pointsForLevel(level), spent = TM.total(build);
      $("#tc-name").textContent = cls.name;
      $("#tc-split").textContent = specs.map(function (s, t) { return TM.treeTotal(build, t); }).join(" / ");
      $("#tc-left").textContent = available - spent;
      $("#tc-left").classList.toggle("over", spent > available);
      $("#tc-spent").textContent = spent + " / " + available + " spent";
      $("#tc-bar").style.width = Math.min(100, available ? spent / available * 100 : 0) + "%";
      $("#tc-split-sr").textContent = specs.map(function (s, t) { return s.name + " " + TM.treeTotal(build, t); }).join(", ");

      treesBox.innerHTML = specs.map(function (s, t) {
        // arrows: from prerequisite (row, col) to dependent (row, col), in grid units
        var arrows = "";
        s.nodes.forEach(function (n) {
          n[6].forEach(function (req) {
            var p = s.nodes.filter(function (x) { return x[0] === req; })[0];
            if (!p) return;
            var met = TM.rankOf(build, t, p) >= TM.maxRank(p);
            var x1 = (p[2] - 0.5) * 100, y1 = (p[1] - 0.5) * 100 + 30, x2 = (n[2] - 0.5) * 100, y2 = (n[1] - 0.5) * 100 - 32;
            if (p[1] === n[1]) { y1 = y2 = (n[1] - 0.5) * 100; x1 += (n[2] > p[2] ? 32 : -32); x2 += (n[2] > p[2] ? -32 : 32); }
            arrows += '<path class="tc-arrow' + (met ? " met" : "") + '" d="M' + x1 + " " + y1 + (p[2] !== n[2] && p[1] !== n[1] ? " L" + x1 + " " + ((y1 + y2) / 2) + " L" + x2 + " " + ((y1 + y2) / 2) : "") + " L" + x2 + " " + y2 + '" marker-end="url(#tc-head-' + (met ? "met" : "off") + ')"/>';
          });
        });
        return '<section class="tc-tree" aria-labelledby="tc-tree-' + t + '" style="--spec-icon:url(\'' + esc(s.icon || "") + '\')">' +
          '<header class="tc-tree-head">' + (s.icon ? '<img src="' + esc(s.icon) + '" alt="" width="30" height="30">' : "") +
          '<h2 id="tc-tree-' + t + '">' + esc(s.name) + '</h2><span class="tc-tree-pts">' + TM.treeTotal(build, t) + "</span>" +
          '<button type="button" class="icon-btn tc-reset-tree" data-t="' + t + '" title="Reset ' + esc(s.name) + '"><span aria-hidden="true">↺</span><span class="sr-only">Reset ' + esc(s.name) + "</span></button></header>" +
          '<div class="tc-grid">' +
          '<svg class="tc-lines" viewBox="0 0 400 700" preserveAspectRatio="none" aria-hidden="true"><defs>' +
          '<marker id="tc-head-off" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" class="tc-arrowhead"/></marker>' +
          '<marker id="tc-head-met" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8z" class="tc-arrowhead met"/></marker></defs>' + arrows + "</svg>" +
          [1, 2, 3, 4, 5, 6, 7].map(function (row) { return '<span class="tc-rowlabel" style="grid-row:' + row + '" aria-hidden="true">' + (row - 1) * 5 + "</span>"; }).join("") +
          s.nodes.map(function (n) {
            var st = nodeState(t, n), r = TM.rankOf(build, t, n);
            return '<button type="button" class="tc-talent s-' + st + '" style="grid-row:' + n[1] + ";grid-column:" + (n[2] + 1) + '" data-t="' + t + '" data-n="' + n[0] + '" aria-label="' + esc(label(t, n)) + '"' +
              (st === "locked" ? ' aria-disabled="true"' : "") + ">" +
              (n[4] ? '<img src="' + esc(n[4]) + '" alt="" width="44" height="44" loading="lazy">' : "") +
              '<span class="tc-rank" aria-hidden="true">' + r + "/" + TM.maxRank(n) + "</span></button>";
          }).join("") + "</div></section>";
      }).join("");
      writeHash();
      if (selected) showDetail(selected.t, selected.node);
    }

    function find(t, id) { return specs[t].nodes.filter(function (n) { return String(n[0]) === String(id); })[0]; }
    function descHTML(t, n) {
      var r = TM.rankOf(build, t, n), max = TM.maxRank(n), req = reqText(t, n);
      var cur = r > 0 ? n[5][r - 1] : n[5][0], next = r > 0 && r < max ? n[5][r] : null;
      return "<b class=\"tc-tip-name\">" + esc(n[3]) + '</b><span class="tc-tip-rank">Rank ' + r + "/" + max + "</span>" +
        (req ? '<p class="tc-req">' + esc(req) + "</p>" : "") +
        "<p>" + esc(cur) + "</p>" + (next ? '<p class="tc-next"><b>Next rank:</b> ' + esc(next) + "</p>" : "");
    }
    function showTip(btn) {
      var t = +btn.getAttribute("data-t"), n = find(t, btn.getAttribute("data-n"));
      tip.innerHTML = descHTML(t, n) + '<p class="faint tc-tip-help">Click to learn · right-click to unlearn</p>';
      tip.hidden = false;
      var b = btn.getBoundingClientRect(), app = $(".tc-app").getBoundingClientRect();
      var left = Math.min(b.right - app.left + 10, app.width - tip.offsetWidth - 8);
      if (b.right + tip.offsetWidth + 20 > window.innerWidth) left = Math.max(8, b.left - app.left - tip.offsetWidth - 10);
      tip.style.left = left + "px";
      tip.style.top = (b.top - app.top) + "px";
    }
    function showDetail(t, n) {
      selected = { t: t, node: n };
      detail.innerHTML = '<div class="tc-detail-icon">' + (n[4] ? '<img src="' + esc(n[4]) + '" alt="" width="48" height="48">' : "") + "</div><div>" + descHTML(t, n) + "</div>" +
        '<div class="tc-detail-btns"><button type="button" class="btn btn-ghost btn-sm" data-act="minus">− Unlearn</button><button type="button" class="btn btn-sm" data-act="plus">+ Learn</button>' +
        '<button type="button" class="btn btn-ghost btn-sm" data-act="close">Close</button></div>';
      detail.hidden = false;
    }
    function change(btn, dir) {
      var t = +btn.getAttribute("data-t"), n = find(t, btn.getAttribute("data-n"));
      var ok = dir > 0 ? TM.add(specs, build, t, n, TM.pointsForLevel(level)) : TM.remove(specs, build, t, n);
      if (!ok) {
        announce(dir > 0 ? (reqText(t, n) || n[3] + " is at max rank.") : "Can't unlearn " + n[3] + " — other talents depend on it.");
        btn.classList.add("tc-shake"); setTimeout(function () { btn.classList.remove("tc-shake"); }, 300);
      }
      selected = { t: t, node: n };
      var id = btn.getAttribute("data-n");
      drawTrees();
      var again = treesBox.querySelector('.tc-talent[data-t="' + t + '"][data-n="' + id + '"]');
      if (again) { again.focus(); if (!tip.hidden) showTip(again); }
      if (ok) announce(n[3] + " rank " + TM.rankOf(build, t, n) + " of " + TM.maxRank(n) + ". " + (TM.pointsForLevel(level) - TM.total(build)) + " points left.");
    }

    treesBox.addEventListener("click", function (e) {
      var b = e.target.closest(".tc-talent");
      if (b) { change(b, e.shiftKey ? -1 : 1); return; }
      var r = e.target.closest(".tc-reset-tree");
      if (r) { delete build[+r.getAttribute("data-t")]; selected = null; detail.hidden = true; drawTrees(); announce("Tree reset"); }
    });
    treesBox.addEventListener("contextmenu", function (e) { var b = e.target.closest(".tc-talent"); if (b) { e.preventDefault(); change(b, -1); } });
    treesBox.addEventListener("keydown", function (e) {
      var b = e.target.closest(".tc-talent"); if (!b) return;
      if (e.key === "Delete" || e.key === "Backspace" || e.key === "-") { e.preventDefault(); change(b, -1); }
      else if (e.key === "+" ) { e.preventDefault(); change(b, 1); }
    });
    treesBox.addEventListener("mouseover", function (e) { var b = e.target.closest(".tc-talent"); if (b) showTip(b); });
    treesBox.addEventListener("mouseout", function (e) { if (e.target.closest(".tc-talent")) tip.hidden = true; });
    treesBox.addEventListener("focusin", function (e) { var b = e.target.closest(".tc-talent"); if (b) { showTip(b); var t = +b.getAttribute("data-t"); showDetail(t, find(t, b.getAttribute("data-n"))); } });
    treesBox.addEventListener("focusout", function () { tip.hidden = true; });
    detail.addEventListener("click", function (e) {
      var a = e.target.closest("[data-act]"); if (!a || !selected) return;
      if (a.getAttribute("data-act") === "close") {
        var back = treesBox.querySelector('.tc-talent[data-t="' + selected.t + '"][data-n="' + selected.node[0] + '"]');
        detail.hidden = true; selected = null; if (back) back.focus({ preventScroll: true }); detail.hidden = true; return;
      }
      var b = treesBox.querySelector('.tc-talent[data-t="' + selected.t + '"][data-n="' + selected.node[0] + '"]');
      if (b) change(b, a.getAttribute("data-act") === "plus" ? 1 : -1);
      var again = detail.querySelector('[data-act="' + a.getAttribute("data-act") + '"]'); if (again) again.focus();
    });
    classBar.addEventListener("click", function (e) {
      var b = e.target.closest(".tc-class"); if (!b) return;
      detail.hidden = true; selectClass(b.getAttribute("data-c"), null); announce(cls.name + " talents");
    });
    levelIn.addEventListener("change", function () {
      level = Math.max(10, Math.min(60, parseInt(levelIn.value, 10) || 60)); levelIn.value = level; drawTrees();
    });
    $("#tc-reset").addEventListener("click", function () { build = {}; selected = null; detail.hidden = true; drawTrees(); announce("All talents reset"); });
    $("#tc-share").addEventListener("click", function () {
      var url = location.href;
      var done = function () { announce("Build link copied"); $("#tc-share").textContent = "Link copied!"; setTimeout(function () { $("#tc-share").textContent = "Copy build link"; }, 2500); };
      if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, function () { prompt("Copy this link:", url); }); else prompt("Copy this link:", url);
    });
    window.addEventListener("hashchange", function () { var h = readHash(); if (data && h.c) { level = h.l || 60; levelIn.value = level; selectClass(h.c, h.b); } });
  };

  /* ---------- crafting plan (shared by planner, craft page and recipe pages) ---------- */
  var PLAN_KEY = "codex-plan";
  function getPlan() { var p = store(PLAN_KEY); return p && Array.isArray(p.list) ? p : { list: [], have: {} }; }
  function setPlan(p) { store(PLAN_KEY, p); updatePlanBadge(); }
  function addToPlan(recipeId, crafts) {
    var p = getPlan(), id = Number(recipeId), e = p.list.filter(function (x) { return x.r === id; })[0];
    if (e) e.n += crafts || 1; else p.list.push({ r: id, n: crafts || 1 });
    setPlan(p);
    return p.list.length;
  }
  function updatePlanBadge() {
    var n = getPlan().list.length;
    $all("[data-plan-count]").forEach(function (el) { el.textContent = n; el.hidden = !n; });
  }
  // "+ Add to my crafting plan" buttons anywhere on the page
  document.addEventListener("click", function (e) {
    var b = e.target && e.target.closest ? e.target.closest(".plan-add") : null;
    if (!b) return;
    var n = addToPlan(b.getAttribute("data-recipe"), 1);
    var old = b.textContent;
    b.textContent = "✓ Added (" + n + " in plan)";
    announce("Added to your crafting plan");
    setTimeout(function () { if (document.body.contains(b)) b.textContent = old; }, 3000);
  });

  PAGES.planner = function () {
    var PM = window.PriceMath;
    var regionSel = $("#pl-region"), groupSel = $("#pl-group"), facSel = $("#pl-faction"), addIn = $("#pl-add"), addList = $("#pl-suggest");
    var prefs = store("codex-prices") || {};
    var state = { region: prefs.region || "eu", group: prefs.group || "", faction: prefs.faction || "alliance" };
    var meta, items = {}, recipes = null, group = null, byId = {};
    regionSel.value = state.region; facSel.value = state.faction;
    function save() { var p = store("codex-prices") || {}; p.region = state.region; p.group = state.group; p.faction = state.faction; store("codex-prices", p); }

    function load() {
      Promise.all([getJSON(priceUrl("meta", state.region)), getJSON(priceUrl("items", state.region)), getJSON(priceUrl("recipes", state.region))]).then(function (r) {
        meta = r[0]; items = r[1] || {}; recipes = r[2];
        useItemIcons(state.region, items);
        if (!meta || !recipes) { $("#pl-app").hidden = true; $("#pl-empty").hidden = false; return; }
        byId = {};
        recipes.professions.forEach(function (p) { p.recipes.forEach(function (x) { if (x[6].length) byId[x[0]] = { id: x[0], name: x[1], prof: p.name, item: x[3], itemName: x[4], q: x[5], r: x[6] }; }); });
        groupSel.innerHTML = meta.groups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(groupLabel(meta, g)) + "</option>"; }).join("");
        if (meta.groups.indexOf(state.group) < 0) state.group = meta.groups[0];
        groupSel.value = state.group;
        loadGroup();
      });
    }
    function loadGroup() { getJSON(priceUrl("prices", state.region, state.group)).then(function (g) { group = g; draw(); }); }
    function priceFn() {
      var house = null;
      if (group) Object.keys(group.houses).forEach(function (id) { if (group.houses[id].faction === state.faction) house = group.houses[id]; });
      var hi = house ? house.items : {};
      return function (id) { var a = hi[id], it = items[id] || []; return { ah: a ? a[1] : null, vendor: it[3] || null, sell: it[1] || null }; };
    }
    function nameOf(id) { var n = items[id]; return n && n[0] ? n[0] : null; }

    function draw() {
      var plan = getPlan(), price = priceFn();
      plan.list = plan.list.filter(function (x) { return byId[x.r]; });
      var rows = plan.list.map(function (x) { return { recipe: byId[x.r], crafts: x.n }; });
      var res = PM.planShoppingList(rows.map(function (x) { return { recipe: x.recipe, crafts: x.crafts }; }), plan.have, price);

      $("#pl-recipes").innerHTML = rows.length ? rows.map(function (x) {
        var r = x.recipe;
        return '<li><div class="pl-rec"><a href="' + esc(PM.recipePath(r.id, r.name)) + '"' + whTip(r.item) + ">" + itemIcon(r.item) + esc(r.name) + '</a> <span class="faint">' + esc(r.prof) + "</span></div>" +
          '<label class="pl-qty"><span class="sr-only">Times to craft ' + esc(r.name) + '</span><input class="input" type="number" min="1" max="999" value="' + x.crafts + '" data-r="' + r.id + '"></label>' +
          '<button type="button" class="icon-btn pl-remove" data-r="' + r.id + '"><span aria-hidden="true">×</span><span class="sr-only">Remove ' + esc(r.name) + "</span></button></li>";
      }).join("") : '<li class="empty">Your plan is empty. Add recipes with the search box above, or with "+ Add to my crafting plan" on any recipe page.</li>';

      $("#pl-mats").innerHTML = res.mats.length ? res.mats.sort(function (a, b) { return (b.cost || 0) - (a.cost || 0); }).map(function (m) {
        var n = nameOf(m.id) || ("Item #" + m.id);
        return '<tr><th scope="row">' + itemPageLink(m.id, nameOf(m.id)) + "</th><td>" + m.need + "</td>" +
          '<td><label><span class="sr-only">Already have ' + esc(n) + '</span><input class="input pl-have" type="number" min="0" value="' + m.have + '" data-i="' + m.id + '"></label></td>' +
          "<td><b>" + m.buy + "</b></td><td>" + (m.unit != null ? money(m.unit) : '<span class="faint">no price</span>') +
          ' <span class="faint">' + (m.source === "ah" ? "AH" : m.source === "vendor" ? "vendor" : "") + "</span></td><td>" + (m.cost != null ? money(m.cost) : "—") + "</td></tr>";
      }).join("") : '<tr><td colspan="6" class="empty">Materials appear here once you add recipes.</td></tr>';

      $("#pl-total-cost").innerHTML = res.complete ? money(res.cost) : money(res.cost) + ' <span class="faint">+ items with no price</span>';
      $("#pl-total-sales").innerHTML = res.sales ? money(res.sales) + (res.salesComplete ? "" : ' <span class="faint">(some results not on AH)</span>') : '<span class="faint">—</span>';
      $("#pl-total-profit").innerHTML = res.profit != null ? '<span class="pct ' + (res.profit >= 0 ? "up" : "down") + '">' + (res.profit >= 0 ? "+" : "−") + "</span> " + money(Math.abs(res.profit)) : '<span class="faint">—</span>';
      $("#pl-updated").textContent = group ? "Prices from " + new Date(group.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "";
      $("#pl-copy").hidden = !res.mats.some(function (m) { return m.buy > 0; });
      state.lastList = res.mats.filter(function (m) { return m.buy > 0; }).map(function (m) { return m.buy + "x " + (nameOf(m.id) || "Item #" + m.id) + (m.source === "vendor" ? " (vendor)" : ""); });
      setupWowhead();
    }

    // add recipes by name
    addIn.addEventListener("input", function () {
      var term = addIn.value.toLowerCase().trim();
      if (term.length < 2) { addList.innerHTML = ""; return; }
      var hits = Object.keys(byId).map(function (k) { return byId[k]; }).filter(function (r) {
        return r.name.toLowerCase().indexOf(term) >= 0 || (r.itemName || "").toLowerCase().indexOf(term) >= 0;
      }).slice(0, 8);
      addList.innerHTML = hits.map(function (r) { return '<li><button type="button" class="pl-pick" data-r="' + r.id + '">' + itemIcon(r.item) + esc(r.name) + ' <span class="faint">' + esc(r.prof) + "</span></button></li>"; }).join("") ||
        '<li class="faint" style="padding:8px">No recipe matches.</li>';
    });
    addList.addEventListener("click", function (e) {
      var b = e.target.closest(".pl-pick"); if (!b) return;
      addToPlan(b.getAttribute("data-r"), 1); addIn.value = ""; addList.innerHTML = ""; addIn.focus();
      announce("Recipe added"); draw();
    });
    $("#pl-recipes").addEventListener("change", function (e) {
      var r = e.target.getAttribute("data-r"); if (!r) return;
      var p = getPlan(); p.list.forEach(function (x) { if (String(x.r) === r) x.n = Math.max(1, Math.min(999, parseInt(e.target.value, 10) || 1)); });
      setPlan(p); draw();
    });
    $("#pl-recipes").addEventListener("click", function (e) {
      var b = e.target.closest(".pl-remove"); if (!b) return;
      var p = getPlan(); p.list = p.list.filter(function (x) { return String(x.r) !== b.getAttribute("data-r"); });
      setPlan(p); announce("Recipe removed"); draw(); addIn.focus();
    });
    $("#pl-mats").addEventListener("change", function (e) {
      var i = e.target.getAttribute("data-i"); if (!i) return;
      var p = getPlan(); var v = Math.max(0, parseInt(e.target.value, 10) || 0);
      if (v) p.have[i] = v; else delete p.have[i];
      setPlan(p); draw();
    });
    $("#pl-clear").addEventListener("click", function () {
      if (!confirm("Remove every recipe from your plan?")) return;
      setPlan({ list: [], have: {} }); announce("Plan cleared"); draw();
    });
    $("#pl-copy").addEventListener("click", function () {
      var text = "Shopping list (Forever Tome):\n" + (state.lastList || []).join("\n");
      var done = function () { announce("Shopping list copied"); $("#pl-copy").textContent = "Copied!"; setTimeout(function () { $("#pl-copy").textContent = "Copy shopping list"; }, 2500); };
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, function () { prompt("Copy this list:", text); }); else prompt("Copy this list:", text);
    });
    regionSel.addEventListener("change", function () { state.region = regionSel.value; save(); load(); });
    groupSel.addEventListener("change", function () { state.group = groupSel.value; save(); loadGroup(); });
    facSel.addEventListener("change", function () { state.faction = facSel.value; save(); draw(); });
    load();
  };

  /* ---------- item index (item/index.html): filter the A–Z list as you type ---------- */
  // A–Z index search (item index and recipe index share the markup)
  PAGES.items = PAGES.recipes = function () {
    var box = $("#idx-search");
    if (!box) return; // individual item pages have nothing to set up
    var lists = $all(".item-index ul"), t;
    box.addEventListener("input", function () {
      var term = box.value.toLowerCase().trim(), shown = 0;
      lists.forEach(function (ul) {
        var any = false;
        $all("li", ul).forEach(function (li) {
          var hit = !term || li.textContent.toLowerCase().indexOf(term) >= 0;
          li.hidden = !hit; if (hit) { any = true; shown++; }
        });
        ul.hidden = !any;
        var h = ul.previousElementSibling; if (h && h.tagName === "H2") h.hidden = !any;
      });
      clearTimeout(t); t = setTimeout(function () { announce(shown + " items"); }, 500);
    });
  };

  /* ---------- vendor flips ---------- */
  PAGES.flips = function () {
    var regionSel = $("#fl-region"), groupSel = $("#fl-group"), facSel = $("#fl-faction"), body = $("#fl-rows"), summary = $("#fl-summary");
    var prefs = store("codex-prices") || {};
    var state = { region: prefs.region || "eu", group: prefs.group || "", faction: prefs.faction || "alliance" };
    var names = {}, group = null;
    regionSel.value = state.region; facSel.value = state.faction;
    function save() { var p = store("codex-prices") || {}; p.region = state.region; p.group = state.group; p.faction = state.faction; store("codex-prices", p); }

    function load() {
      summary.textContent = "Loading…";
      Promise.all([getJSON(priceUrl("meta", state.region)), getJSON(priceUrl("items", state.region))]).then(function (r) {
        var meta = r[0]; names = r[1] || {};
        useItemIcons(state.region, names);
        if (!meta || !meta.groups || !meta.groups.length) { $("#fl-app").hidden = true; $("#fl-empty").hidden = false; return; }
        $("#fl-app").hidden = false; $("#fl-empty").hidden = true;
        groupSel.innerHTML = meta.groups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(groupLabel(meta, g)) + "</option>"; }).join("");
        if (meta.groups.indexOf(state.group) < 0) state.group = meta.groups[0];
        groupSel.value = state.group;
        loadGroup();
      });
    }
    function loadGroup() {
      getJSON(priceUrl("prices", state.region, state.group)).then(function (g) { group = g; draw(); });
    }
    function draw() {
      var house = null;
      if (group) Object.keys(group.houses).forEach(function (id) { if (group.houses[id].faction === state.faction) house = group.houses[id]; });
      var flips = (house && house.flips) || [];
      var total = flips.reduce(function (s, f) { return s + f[2]; }, 0);
      summary.innerHTML = flips.length
        ? "<b>" + flips.length + "</b> item" + (flips.length > 1 ? "s" : "") + " listed below vendor price right now — about " + money(total) + " profit if you bought them all. " +
          '<span class="faint">Snapshot from ' + new Date(group.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + ".</span>"
        : "No vendor flips on this auction house right now. Check back after the next hourly update.";
      body.innerHTML = flips.map(function (f) {
        var n = names[f[0]] || [];
        return "<tr><th scope=\"row\">" + itemPageLink(f[0], n[0]) + "</th><td>" + money(f[3]) + "</td><td>" + money(f[4]) + '</td><td><span class="pct up">+' + money(f[4] - f[3]) + "</span></td><td>" + f[1].toLocaleString() + "</td><td><b>" + money(f[2]) + "</b></td></tr>";
      }).join("") || '<tr><td colspan="6" class="empty">Nothing to flip here right now.</td></tr>';
      announce(flips.length + " vendor flips");
      setupWowhead();
    }
    regionSel.addEventListener("change", function () { state.region = regionSel.value; save(); load(); });
    groupSel.addEventListener("change", function () { state.group = groupSel.value; save(); loadGroup(); });
    facSel.addEventListener("change", function () { state.faction = facSel.value; save(); draw(); });
    load();
  };

  /* ---------- craft profit calculator ---------- */
  PAGES.crafting = function () {
    var PM = window.PriceMath;
    var regionSel = $("#cr-region"), groupSel = $("#cr-group"), facSel = $("#cr-faction"), profSel = $("#cr-prof"),
        q = $("#cr-search"), onlyProfit = $("#cr-profitable"), hideThin = $("#cr-hidethin"), sortSel = $("#cr-sort"), body = $("#cr-rows"), status = $("#cr-status"), more = $("#cr-more");
    var prefs = store("codex-prices") || {}, cprefs = store("codex-crafting") || {};
    var state = { region: prefs.region || "eu", group: prefs.group || "", faction: prefs.faction || "alliance", prof: cprefs.prof || "", sort: cprefs.sort || "profit", shown: 100 };
    var meta, items = {}, recipes = null, group = null, rows = [], open = {};
    regionSel.value = state.region; facSel.value = state.faction; sortSel.value = state.sort;

    function save() {
      var p = store("codex-prices") || {}; p.region = state.region; p.group = state.group; p.faction = state.faction; store("codex-prices", p);
      store("codex-crafting", { prof: state.prof, sort: state.sort });
    }
    function unavailable(msg) { $("#cr-app").hidden = true; $("#cr-empty").hidden = false; $("#cr-empty-msg").textContent = msg; }

    function loadRegion() {
      status.textContent = "Loading recipes and prices…";
      Promise.all([getJSON(priceUrl("meta", state.region)), getJSON(priceUrl("items", state.region)), getJSON(priceUrl("recipes", state.region))]).then(function (r) {
        meta = r[0]; items = r[1] || {}; recipes = r[2];
        useItemIcons(state.region, items);
        if (!meta || !meta.groups || !meta.groups.length || !recipes) {
          unavailable(C.pricesApi ? "The craft calculator is temporarily unavailable." : "No recipe/price data on this computer yet. Run `node pipeline/run.js`, then reload.");
          return;
        }
        $("#cr-app").hidden = false; $("#cr-empty").hidden = true;
        groupSel.innerHTML = meta.groups.map(function (g) { return '<option value="' + esc(g) + '">' + esc(groupLabel(meta, g)) + "</option>"; }).join("");
        if (meta.groups.indexOf(state.group) < 0) state.group = meta.groups[0];
        groupSel.value = state.group;
        var profs = recipes.professions.filter(function (p) { return p.recipes.some(function (r) { return r[6].length; }); });
        profSel.innerHTML = profs.map(function (p) { return '<option value="' + p.id + '">' + esc(p.name) + " (" + p.recipes.length + ")</option>"; }).join("");
        if (!profs.some(function (p) { return String(p.id) === String(state.prof); })) state.prof = String(profs[0].id);
        // crafting.html?q=Copper Bar (from an item page): search it, in the profession that makes or uses it
        var deepQ = new URLSearchParams(location.search).get("q");
        if (deepQ && !q.value) {
          q.value = deepQ;
          var lower = deepQ.toLowerCase();
          var hit = profs.filter(function (p) { return p.recipes.some(function (r) { return (r[4] || r[1] || "").toLowerCase() === lower; }); })[0] ||
                    profs.filter(function (p) { return p.recipes.some(function (r) { return r[6].some(function (m) { return (m[2] || "").toLowerCase() === lower; }); }); })[0];
          if (hit) state.prof = String(hit.id);
          hideThin.checked = false; // show every match when arriving from an item page
        }
        profSel.value = state.prof;
        loadGroup();
      });
    }
    function loadGroup() {
      getJSON(priceUrl("prices", state.region, state.group)).then(function (g) {
        group = g;
        $all("option", groupSel).forEach(function (o) {
          if (g && o.value === g.group) o.textContent = groupLabel({ rulesets: g.ruleset ? { [g.group]: g.ruleset } : {} }, g.group);
        });
        compute();
      });
    }

    function priceFn(houseItems) {
      return function (id) {
        var a = houseItems[id], it = items[id] || [];
        return { ah: a ? a[1] : null, vendor: it[3] ? it[3] : null, sell: it[1] ? it[1] : null };
      };
    }
    function compute() {
      var house = null;
      if (group) Object.keys(group.houses).forEach(function (id) { if (group.houses[id].faction === state.faction) house = group.houses[id]; });
      var price = priceFn(house ? house.items : {});
      var prof = recipes.professions.filter(function (p) { return String(p.id) === String(state.prof); })[0];
      rows = (prof ? prof.recipes : []).filter(function (r) { return r[6].length; }).map(function (r) {
        var res = PM.craftProfit({ q: r[5], item: r[3], r: r[6] }, price);
        var sold = house && r[3] ? house.items[r[3]] : null;
        return { id: r[0], name: r[1], cat: r[2], item: r[3], itemName: r[4], q: r[5], reagents: r[6], res: res, listed: sold ? sold[3] : 0 };
      });
      $("#cr-updated").textContent = group ? "Prices from " + new Date(group.updated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) + " · " + (prof ? prof.name : "") + ": " + rows.length + " recipes" : "";
      draw();
    }

    function sortRows(list) {
      return list.sort(function (a, b) {
        if (state.sort === "name") return a.name.localeCompare(b.name);
        if (state.sort === "margin") return (b.res.margin == null ? -1e9 : b.res.margin) - (a.res.margin == null ? -1e9 : a.res.margin);
        if (state.sort === "cost") return (a.res.costComplete ? a.res.cost : 1e12) - (b.res.costComplete ? b.res.cost : 1e12);
        return (b.res.profit == null ? -1e12 : b.res.profit) - (a.res.profit == null ? -1e12 : a.res.profit);
      });
    }
    function profitCell(p) {
      if (p == null) return '<span class="faint">—</span>';
      return '<span class="' + (p >= 0 ? "pct up" : "pct down") + '">' + (p < 0 ? "−" : "+") + "</span> " + money(Math.abs(p));
    }
    // recipe name → its own recipe page (cost, profit on every AH)
    function itemOrRecipe(r) {
      var href = esc(PM.recipePath(r.id, r.name));
      if (!r.item) return '<a class="item-link" href="' + href + '">' + itemIcon(null) + esc(r.name) + '</a> <span class="tag">enchant</span>';
      var it = items[r.item] || [];
      return '<a class="item-link" href="' + href + '"' + whTip(r.item) + ">" + itemIcon(r.item) + esc(r.itemName || it[0] || r.name) + "</a>" + (r.q > 1 ? ' <span class="faint">×' + r.q + "</span>" : "");
    }
    function detailRow(r) {
      var res = r.res;
      return '<tr class="cr-detail"><td colspan="6"><ul class="mats">' + r.reagents.map(function (x, i) {
        var p = res.parts[i];
        var src = p.source === "ah" ? "Auction House" : p.source === "vendor" ? "vendor price (estimate — check a vendor sells it)" : "no price found";
        // our icon sits outside the Wowhead link, which is told not to add its own
        return '<li><b>' + x[1] + "×</b> " + itemIcon(x[0]) + '<a class="wh item-link" href="https://www.wowhead.com/forever/item=' + x[0] + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="false" data-wh-icon-added="true">' + esc(x[2]) + "</a> — " +
          (p.unit != null ? money(p.unit) + " each = " + money(p.unit * x[1]) : "?") + ' <span class="faint">(' + src + ")</span></li>";
      }).join("") + "</ul>" +
        '<p class="faint">Sells on the AH for ' + money(res.sellAh) + (res.sellVendor ? ", to a vendor for " + money(res.sellVendor) : "") + ". Profit = AH price minus the 5% AH cut minus materials. It ignores deposits, whether it sells, and your time.</p></td></tr>";
    }
    var announceTimer;
    function draw() {
      var term = (q.value || "").toLowerCase().trim();
      var list = rows.filter(function (r) {
        if (onlyProfit.checked && !(r.res.profit > 0)) return false;
        if (hideThin.checked && r.item && r.listed < 3) return false;
        return !term || r.name.toLowerCase().indexOf(term) >= 0 || (r.itemName || "").toLowerCase().indexOf(term) >= 0 ||
          r.reagents.some(function (x) { return (x[2] || "").toLowerCase().indexOf(term) >= 0; });
      });
      sortRows(list);
      body.innerHTML = list.slice(0, state.shown).map(function (r) {
        var res = r.res, isOpen = !!open[r.id];
        return '<tr><th scope="row">' + itemOrRecipe(r) + '<span class="cat">' + esc(r.cat) + "</span></th>" +
          "<td>" + (res.costComplete ? money(res.cost) : '<span class="faint" title="A material has no price">?</span>') + "</td>" +
          "<td>" + (r.item ? money(res.sellAh) + (res.sellAh != null ? '<span class="cat">' + r.listed + " listed" +
            (r.listed < 3 ? ' · <span class="thin" title="Very few on sale, so this asking price may not be what it really sells for">⚠ thin market</span>' : "") + "</span>" : "") : '<span class="faint">—</span>') + "</td>" +
          "<td>" + profitCell(res.profit) + "</td>" +
          '<td class="col-hide-sm">' + (res.margin != null ? res.margin + "%" : '<span class="faint">—</span>') + "</td>" +
          '<td class="cr-actions"><button type="button" class="btn btn-ghost btn-sm cr-toggle" data-id="' + r.id + '" aria-expanded="' + isOpen + '">Materials<span class="sr-only"> for ' + esc(r.name) + "</span></button>" +
          '<button type="button" class="btn btn-sm plan-add" data-recipe="' + r.id + '" title="Add to my crafting plan">+ Plan<span class="sr-only"> ' + esc(r.name) + "</span></button></td></tr>" +
          (isOpen ? detailRow(r) : "");
      }).join("") || '<tr><td colspan="6" class="empty">No recipes match.</td></tr>';
      more.hidden = list.length <= state.shown;
      status.textContent = "Showing " + Math.min(state.shown, list.length) + " of " + list.length + " recipes";
      clearTimeout(announceTimer); announceTimer = setTimeout(function () { announce(status.textContent); }, 600);
      setupWowhead();
    }

    regionSel.addEventListener("change", function () { state.region = regionSel.value; save(); loadRegion(); });
    groupSel.addEventListener("change", function () { state.group = groupSel.value; save(); loadGroup(); });
    facSel.addEventListener("change", function () { state.faction = facSel.value; save(); compute(); });
    profSel.addEventListener("change", function () { state.prof = profSel.value; state.shown = 100; open = {}; save(); compute(); });
    sortSel.addEventListener("change", function () { state.sort = sortSel.value; save(); draw(); });
    q.addEventListener("input", function () { state.shown = 100; draw(); });
    onlyProfit.addEventListener("change", draw);
    hideThin.addEventListener("change", draw);
    more.addEventListener("click", function () { state.shown += 100; draw(); });
    body.addEventListener("click", function (e) {
      var b = e.target.closest(".cr-toggle"); if (!b) return;
      var id = b.getAttribute("data-id"); open[id] = !open[id]; draw();
      var nb = $('.cr-toggle[data-id="' + id + '"]'); if (nb) nb.focus();
    });
    loadRegion();
  };

  // "3 hours ago", "yesterday", "5 days ago"
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (isNaN(s)) return "";
    if (s < 90) return "just now";
    if (s < 3600) return Math.round(s / 60) + " minutes ago";
    if (s < 86400) { var h = Math.round(s / 3600); return h + (h === 1 ? " hour ago" : " hours ago"); }
    var dd = Math.floor(s / 86400);
    return dd === 1 ? "yesterday" : dd + " days ago";
  }

  /* ---------- character lookup ---------- */
  // classes with a colour variable (--c-<id>) in style.css
  var CLASS_IDS = ["druid", "hunter", "mage", "paladin", "priest", "rogue", "shaman", "warlock", "warrior"];
  PAGES.character = function () {
    var form = $("#ch-form"), regionSel = $("#ch-region"), nameIn = $("#ch-name"), out = $("#ch-result");
    var params = new URLSearchParams(location.search);
    var saved = store("codex-char") || {};
    regionSel.value = params.get("r") || saved.region || "eu";
    nameIn.value = (params.get("n") || "").replace(/-/g, " ");
    var QUAL = { poor: "q-poor", common: "q-common", uncommon: "q-uncommon", rare: "q-rare", epic: "q-epic", legendary: "q-legendary" };
    var ERR = {
      "not-found": "We couldn't find that character. Check the spelling (first and last name), and note that characters only appear after reaching level 10 and logging out once.",
      "bad-name": "Please enter a first and last name, like \"Thrallina Stormhoof\".",
      "too-many": "Too many lookups in a short time — wait a minute and try again.",
      "not-configured": "The character lookup isn't set up on this server yet (missing Blizzard API keys).",
      "unavailable": "Blizzard's character service didn't answer. Please try again in a few minutes."
    };

    function render(d) {
      var c = d.character, cid = String(c.class || "").toLowerCase(), cls = CLASS_IDS.indexOf(cid) >= 0 ? { id: cid } : null;
      var full = esc([c.name, c.surname].filter(Boolean).join(" ") || c.slug);
      var share = location.origin + location.pathname + "?r=" + encodeURIComponent(d.region) + "&n=" + encodeURIComponent(c.slug);
      out.innerHTML =
        '<article class="panel ch-card"' + (cls ? ' style="--cc: var(--c-' + cls.id + ')"' : "") + ">" +
        '<div class="ch-head">' + (c.avatar ? '<img class="ch-avatar" src="' + esc(c.avatar) + '" alt="" width="84" height="84">' : '<span class="class-icon ch-avatar" aria-hidden="true">' + esc((c.class || "?").charAt(0)) + "</span>") +
        "<div><h2>" + full + "</h2>" +
        '<p class="ch-sub">Level ' + esc(c.level) + " " + esc(c.race || "") + ' <b style="color:var(--cc, var(--gold))">' + esc(c.class || "") + "</b>" +
        (c.guild ? ' · &lt;' + esc(c.guild) + "&gt;" : "") + "</p>" +
        '<p class="faint">' + [c.faction, c.ruleset ? c.ruleset + " ruleset" : null, d.region.toUpperCase(), c.lastLogin ? "last logged in " + ago(c.lastLogin) : null].filter(Boolean).map(esc).join(" · ") + "</p></div>" +
        '<button type="button" class="btn btn-ghost btn-sm" id="ch-share">Copy link</button></div>' +
        '<p class="note fresh">' + (d.blizzardUpdated
          ? "<b>Blizzard last updated this profile " + esc(ago(d.blizzardUpdated)) + "</b> (" + esc(new Date(d.blizzardUpdated).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })) + "). "
          : "") +
          "Profiles only refresh after the character logs out, and Blizzard can take several hours — sometimes until the next day — so very recent gear or skill changes may not show yet." +
          (d.partial ? " Some sections aren't available yet." : "") + "</p>" +
        '<div class="grid grid-2 ch-sections">' +
        '<section><h3>Equipped gear</h3>' + (d.gear.length ? '<ul class="ch-gear">' + d.gear.map(function (g) {
          return '<li><span class="slot">' + esc(g.slot || "") + '</span><a class="wh ' + (QUAL[g.quality] || "") + '" href="https://www.wowhead.com/forever/item=' + g.id + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="false">' + esc(g.name || "Item #" + g.id) + "</a>" + (g.level ? ' <span class="faint">ilvl ' + g.level + "</span>" : "") + "</li>";
        }).join("") + "</ul>" : '<p class="faint">No gear data.</p>') + "</section>" +
        "<section><h3>Professions</h3>" + (d.professions.length ? '<ul class="ch-prof">' + d.professions.map(function (p) {
          var pct = p.max ? Math.round(p.skill / p.max * 100) : 0;
          return "<li><span>" + esc(p.name) + "</span><b>" + (p.skill != null ? p.skill + (p.max ? " / " + p.max : "") : "") + '</b><div class="progress" aria-hidden="true"><i style="width:' + pct + '%"></i></div></li>';
        }).join("") + "</ul>" : '<p class="faint">No professions learned.</p>') +
        '<h3 style="margin-top:18px">Top reputations</h3>' + (d.reputations.length ? '<ul class="clean ch-rep">' + d.reputations.map(function (r) {
          return "<li><span>" + esc(r.faction) + '</span> <b class="faint">' + esc(r.standing || "") + "</b></li>";
        }).join("") + "</ul>" : '<p class="faint">No reputation data.</p>') + "</section></div>" +
        '<p class="faint">Fetched ' + new Date(d.fetched).toLocaleString() + ". Data provided by Blizzard Entertainment.</p></article>";
      $("#ch-share").addEventListener("click", function () {
        var done = function () { announce("Link copied"); $("#ch-share").textContent = "Copied!"; };
        if (navigator.clipboard) navigator.clipboard.writeText(share).then(done, function () { prompt("Copy this link:", share); });
        else prompt("Copy this link:", share);
      });
      setupWowhead();
    }

    function lookup() {
      var name = nameIn.value.trim(), region = regionSel.value;
      if (!name) { nameIn.focus(); return; }
      store("codex-char", { region: region });
      out.innerHTML = '<p class="faint">Looking up ' + esc(name) + "…</p>";
      var base = (C.characterApi || "/api").replace(/\/$/, "");
      fetch(base + "/character?region=" + encodeURIComponent(region) + "&name=" + encodeURIComponent(name))
        .then(function (r) { return r.json().catch(function () { return { error: "unavailable" }; }); })
        .then(function (d) {
          if (!d || d.error) { out.innerHTML = '<div class="panel note warn">' + esc(ERR[d && d.error] || ERR.unavailable) + "</div>"; return; }
          render(d);
          history.replaceState(null, "", "?r=" + encodeURIComponent(region) + "&n=" + encodeURIComponent(d.character.slug));
        })
        .catch(function () { out.innerHTML = '<div class="panel note warn">' + esc(ERR.unavailable) + "</div>"; });
    }
    form.addEventListener("submit", function (e) { e.preventDefault(); lookup(); });
    if (nameIn.value) lookup();
  };

  PAGES.about = function () {
    var m = $("#contact");
    if (m) m.innerHTML = C.contactEmail ? 'Spotted a mistake or want your guide listed? Email <a href="mailto:' + esc(C.contactEmail) + '">' + esc(C.contactEmail) + "</a>." : "";
  };

  /* ---------- display settings (text size, contrast, motion, link underlines) ---------- */
  var PREF_KEY = "codex-prefs";
  function applyPrefs(p) {
    var h = document.documentElement;
    h.setAttribute("data-text", p.text || "md");
    h.toggleAttribute("data-contrast", !!p.contrast);
    h.toggleAttribute("data-calm", !!p.calm);
    h.toggleAttribute("data-underline", !!p.underline);
  }
  function setupSettings() {
    var prefs = store(PREF_KEY) || {};
    applyPrefs(prefs);
    var btn = $("#open-settings");
    if (!btn) return;
    var panel = document.createElement("div");
    panel.id = "settings-panel";
    panel.className = "settings-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-labelledby", "settings-title");
    panel.hidden = true;
    var sizes = [["md", "Default"], ["lg", "Large"], ["xl", "Larger"]];
    panel.innerHTML =
      '<h2 id="settings-title">Display settings</h2>' +
      '<fieldset><legend>Text size</legend><div class="seg">' +
      sizes.map(function (s) {
        return '<label><input type="radio" name="textsize" value="' + s[0] + '"' + ((prefs.text || "md") === s[0] ? " checked" : "") + "><span>" + s[1] + "</span></label>";
      }).join("") + "</div></fieldset>" +
      '<label class="switch"><input type="checkbox" data-pref="contrast"' + (prefs.contrast ? " checked" : "") + '><span class="track" aria-hidden="true"></span><span>High contrast</span></label>' +
      '<label class="switch"><input type="checkbox" data-pref="underline"' + (prefs.underline ? " checked" : "") + '><span class="track" aria-hidden="true"></span><span>Underline all links</span></label>' +
      '<label class="switch"><input type="checkbox" data-pref="calm"' + (prefs.calm ? " checked" : "") + '><span class="track" aria-hidden="true"></span><span>Reduce motion &amp; textures</span></label>' +
      '<div class="settings-foot"><button class="btn btn-ghost btn-sm" id="reset-settings">Reset</button><button class="btn btn-sm" id="close-settings">Done</button></div>';
    $(".topbar").appendChild(panel);

    function save() { store(PREF_KEY, prefs); applyPrefs(prefs); fitHeader(); }
    function open(state) {
      panel.hidden = !state;
      btn.setAttribute("aria-expanded", state ? "true" : "false");
      if (state) { var f = panel.querySelector("input:checked") || panel.querySelector("input"); if (f) f.focus(); }
      else btn.focus();
    }
    btn.addEventListener("click", function () { open(panel.hidden); });
    $("#close-settings").addEventListener("click", function () { open(false); });
    $("#reset-settings").addEventListener("click", function () {
      prefs = {}; save();
      $all("input", panel).forEach(function (i) { i.checked = i.type === "radio" ? i.value === "md" : false; });
      announce("Display settings reset");
    });
    panel.addEventListener("change", function (e) {
      var i = e.target;
      if (i.name === "textsize") prefs.text = i.value;
      else if (i.getAttribute("data-pref")) prefs[i.getAttribute("data-pref")] = i.checked;
      save();
    });
    panel.addEventListener("keydown", function (e) { if (e.key === "Escape") { e.stopPropagation(); open(false); } });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !inside(e, "#settings-panel") && !inside(e, "#open-settings")) {
        panel.hidden = true; btn.setAttribute("aria-expanded", "false");
      }
    });
  }

  /* ---------- back to top ---------- */
  function setupBackToTop() {
    var b = document.createElement("button");
    b.className = "to-top";
    b.innerHTML = ICON.up + '<span class="sr-only">Back to top</span>';
    b.hidden = true;
    document.body.appendChild(b);
    window.addEventListener("scroll", function () { b.hidden = window.scrollY < 700; }, { passive: true });
    b.addEventListener("click", function () {
      window.scrollTo({ top: 0, behavior: document.documentElement.hasAttribute("data-calm") ? "auto" : "smooth" });
      var m = $("#main"); if (m) m.focus({ preventScroll: true });
    });
  }

  /* ---------- boot ---------- */
  renderHeader();
  renderFooter();
  setupSettings();
  setupBackToTop();
  if (PAGES[page]) PAGES[page]();
  setupDonateBoxes();
  setupAds();
  setupWowhead();
  updatePlanBadge();
  // sections are rendered by script, so re-apply #anchor jumps once they exist
  if (location.hash) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: "instant", block: "start" }); }, 0);
  }
})();
