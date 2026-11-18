/* Forever Tome — shared layout + page renderers. No dependencies. */
(function () {
  "use strict";
  var C = window.SITE_CONFIG || {};
  var D = window.CODEX || {};
  var page = document.body.getAttribute("data-page") || "home";

  /* ---------- helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  // external link: opens in a new tab, says so to screen readers, shows a small arrow
  function ext(url, text, cls) {
    return '<a href="' + esc(url) + '" target="_blank" rel="noopener nofollow" class="ext' + (cls ? " " + cls : "") + '">' + text +
      '<span class="sr-only"> (opens in a new tab)</span></a>';
  }
  var ICON = {
    search: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5L21 21" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
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
  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function parseDay(s) { var p = s.split("-"); return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])); }
  function store(key, val) {
    try {
      if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null");
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) { return null; }
  }

  /* ---------- header / footer ---------- */
  var NAV = [
    ["index.html", "Home", "home"], ["news.html", "News", "news"], ["guides.html", "Guides", "guides"],
    ["classes.html", "Classes", "classes"], ["dungeons.html", "Dungeons", "dungeons"],
    ["raids.html", "Raids", "raids"], ["systems.html", "Systems", "systems"], ["faq.html", "FAQ", "faq"]
  ];
  // shown in the "Tools" dropdown
  var TOOLS = [
    ["prices.html", "Auction prices", "prices"], ["crafting.html", "Craft profits", "crafting"], ["character.html", "Character lookup", "character"],
    ["resets.html", "Reset & lockouts", "resets"], ["checklist.html", "Journey checklist", "checklist"], ["dungeons.html", "Dungeon finder", "dungeons-tool"]
  ];
  // footer-only links
  var NAV_MORE = [["roadmap.html", "Roadmap"], ["about.html", "About & credits"], ["privacy.html", "Privacy policy"]];

  function donateBtn(extraCls) {
    if (!C.donateUrl) return "";
    return '<a class="btn btn-donate ' + (extraCls || "") + '" href="' + esc(C.donateUrl) + '" target="_blank" rel="noopener">&#9829; ' + esc(C.donateLabel || "Donate") + "</a>";
  }

  // was the click inside an element matching sel? (safe when the target isn't an element)
  function inside(e, sel) { var t = e.target; return !!(t && t.closest && t.closest(sel)); }

  function navLink(n) { return '<a href="' + n[0] + '"' + (n[2] === page ? ' class="active" aria-current="page"' : "") + ">" + n[1] + "</a>"; }

  function renderHeader() {
    var el = $("#site-header");
    if (!el) return;
    var main = $("main");
    if (main) { main.id = "main"; main.setAttribute("tabindex", "-1"); }
    el.outerHTML =
      '<a class="skip-link" href="#main">Skip to main content</a>' +
      '<header class="topbar"><div class="wrap">' +
      '<a class="brand" href="index.html" aria-label="' + esc(C.siteName) + ' home"><img src="img/logo.svg" alt="" width="38" height="38">' +
      '<span><span class="brand-name">' + esc(C.siteName) + '</span><span class="brand-sub">' + esc(C.tagline) + "</span></span></a>" +
      '<nav class="nav" id="main-nav" aria-label="Main">' +
      NAV.slice(0, -1).map(navLink).join("") +
      // Tools dropdown (a disclosure button + list; works with keyboard and in the mobile menu)
      '<div class="nav-tools"><button type="button" class="nav-tools-btn' + (TOOLS.some(function (t) { return t[2] === page; }) ? " active" : "") +
      '" aria-expanded="false" aria-controls="tools-menu">Tools <span aria-hidden="true">▾</span></button>' +
      '<ul class="tools-menu" id="tools-menu" hidden>' + TOOLS.map(function (t) { return "<li>" + navLink(t) + "</li>"; }).join("") + "</ul></div>" +
      navLink(NAV[NAV.length - 1]) +
      "</nav>" +
      '<div class="tools">' +
      '<button class="icon-btn" id="open-search" aria-haspopup="dialog" title="Search (press /)"><span class="sr-only">Search the site</span>' + ICON.search + "</button>" +
      '<button class="icon-btn" id="open-settings" aria-haspopup="dialog" aria-expanded="false" aria-controls="settings-panel" title="Display settings"><span class="sr-only">Display settings</span>' + ICON.settings + "</button>" +
      '<button class="icon-btn nav-toggle" aria-controls="main-nav" aria-expanded="false"><span class="sr-only">Menu</span>' + ICON.menu + "</button>" +
      donateBtn("btn-sm") + "</div>" +
      "</div></header>" +
      '<div id="sr-status" class="sr-only" role="status" aria-live="polite"></div>';

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
    // Tools dropdown
    var tb = $(".nav-tools-btn"), tm = $("#tools-menu");
    function setTools(openIt, focusBtn) {
      tm.hidden = !openIt; tb.setAttribute("aria-expanded", openIt ? "true" : "false");
      if (openIt) { var f = tm.querySelector("a"); if (f) f.focus(); } else if (focusBtn) tb.focus();
    }
    tb.addEventListener("click", function () { setTools(tm.hidden); });
    tm.addEventListener("keydown", function (e) {
      var links = $all("a", tm), i = links.indexOf(document.activeElement);
      if (e.key === "Escape") { e.stopPropagation(); setTools(false, true); }
      else if (e.key === "ArrowDown") { e.preventDefault(); (links[i + 1] || links[0]).focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (links[i - 1] || links[links.length - 1]).focus(); }
    });
    document.addEventListener("click", function (e) { if (!tm.hidden && !inside(e, ".nav-tools")) setTools(false); });

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
      "<div><h4>" + esc(C.siteName) + '</h4><p>An unofficial, fan-made hub that collects the best WoW: Forever news, guides and tools from around the web — and always links back to the original creators.</p>' + donateBtn("btn-sm") + "</div>" +
      "<div><h4>Explore</h4><ul>" + NAV.slice(1).concat(NAV_MORE).map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + "</a></li>"; }).join("") + "</ul></div>" +
      "<div><h4>Tools</h4><ul>" + TOOLS.map(function (n) { return '<li><a href="' + n[0] + '">' + n[1] + "</a></li>"; }).join("") + "</ul></div>" +
      "<div><h4>Great sources</h4><ul>" +
      ["https://worldofwarcraft.blizzard.com/en-us/news|Blizzard news", "https://www.wowhead.com/|Wowhead", "https://www.icy-veins.com/wow-forever/class-guides|Icy Veins", "https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever|Warcraft Wiki", "https://mobalytics.gg/wow-forever|Mobalytics"]
        .map(function (s) { var p = s.split("|"); return "<li>" + ext(p[0], p[1]) + "</li>"; }).join("") +
      "</ul></div></div>" +
      '<div class="legal">World of Warcraft, Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard Entertainment, Inc. ' +
      esc(C.siteName) + ' is a fan site and is not affiliated with, endorsed or sponsored by Blizzard Entertainment. ' +
      'Summaries are our own words; every item links to its original source. Some reference text is adapted from <a href="https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Forever" target="_blank" rel="noopener">Warcraft Wiki</a> under CC BY-SA 4.0. ' +
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

  /* ---------- shared widgets ---------- */
  function newsItemHTML(n) {
    var d = parseDay(n.date);
    return '<article class="panel news-item">' +
      '<div class="news-date" aria-hidden="true"><b>' + d.getUTCDate() + "</b><span>" + MONTHS[d.getUTCMonth()] + "</span></div>" +
      "<div><h3>" + '<span class="tag tag-' + esc(n.tag) + '">' + esc(n.tag) + "</span>" +
      (Date.now() - d.getTime() < 3 * 86400000 ? '<span class="tag tag-fresh">new</span>' : "") + ext(n.url, esc(n.title)) + "</h3>" +
      "<p>" + esc(n.summary) + "</p>" +
      '<div class="source">Source: ' + esc(n.source) + ' · <time datetime="' + esc(n.date) + '">' + MONTHS[d.getUTCMonth()] + " " + d.getUTCDate() + ", " + d.getUTCFullYear() + "</time></div></div></article>";
  }

  function nextMilestone() {
    var now = Date.now();
    var list = (D.roadmap || []).filter(function (r) { return r.countdown; });
    for (var i = 0; i < list.length; i++) {
      var t = (list[i].date.length > 10 ? new Date(list[i].date) : parseDay(list[i].date)).getTime();
      if (t > now) return { item: list[i], t: t };
    }
    return null;
  }

  function startCountdown(el) {
    var m = nextMilestone();
    if (!el) return;
    if (!m) { el.innerHTML = '<p class="muted">All announced milestones are live — check the roadmap for what\'s next.</p>'; return; }
    // role="timer" is not announced every second (live region off by default), so screen readers aren't spammed
    var days = Math.ceil((m.t - Date.now()) / 86400000);
    el.innerHTML = '<div class="eyebrow-sm">Next milestone</div><h3 style="margin-bottom:0">' + esc(m.item.title) + '</h3><div class="faint">' + esc(m.item.when) + "</div>" +
      '<p class="sr-only">About ' + days + " days to go.</p>" +
      '<div class="countdown" role="timer" aria-hidden="true"><div><b data-u="d">0</b><span>days</span></div><div><b data-u="h">0</b><span>hours</span></div><div><b data-u="m">0</b><span>min</span></div><div><b data-u="s">0</b><span>sec</span></div></div>' +
      '<ul class="gems">' + m.item.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" +
      '<p class="faint">Counting to the start of the day (UTC). Exact unlock time not yet announced — usually tied to weekly reset in your region.</p>' +
      (page !== "raids" && m.item.title === "Raids unlock" ? '<a class="btn btn-sm" href="raids.html">Raid prep hub</a>' : "");
    function tick() {
      var diff = Math.max(0, m.t - Date.now());
      var s = Math.floor(diff / 1000);
      var parts = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
      Object.keys(parts).forEach(function (k) { var b = el.querySelector('[data-u="' + k + '"]'); if (b) b.textContent = parts[k]; });
    }
    tick(); setInterval(tick, 1000);
  }

  // filter buttons: a labelled group of toggle buttons (aria-pressed)
  function chips(container, values, onPick, allLabel) {
    var all = [allLabel || "All"].concat(values);
    container.setAttribute("role", "group");
    if (!container.getAttribute("aria-label")) container.setAttribute("aria-label", "Filter");
    container.innerHTML = all.map(function (v, i) {
      return '<button type="button" class="chip' + (i === 0 ? " active" : "") + '" aria-pressed="' + (i === 0) + '" data-v="' + (i === 0 ? "" : esc(v)) + '">' + esc(v) + "</button>";
    }).join("");
    container.addEventListener("click", function (e) {
      var b = e.target.closest(".chip");
      if (!b) return;
      $all(".chip", container).forEach(function (c) { c.classList.remove("active"); c.setAttribute("aria-pressed", "false"); });
      b.classList.add("active");
      b.setAttribute("aria-pressed", "true");
      onPick(b.getAttribute("data-v"));
    });
  }

  function raceChip(r, faction) {
    var isNew = r.charAt(0) === "*";
    var name = isNew ? r.slice(1) : r;
    var f = faction[name] || "";
    var fi = f === "Alliance" ? '<span class="fac fac-a" aria-hidden="true">A</span>' : f === "Horde" ? '<span class="fac fac-h" aria-hidden="true">H</span>' : "";
    return '<li class="race' + (isNew ? " new" : "") + '">' + fi + esc(name) +
      '<span class="sr-only"> (' + esc(f) + (isNew ? ", new in Forever" : "") + ")</span>" + (isNew ? ' <span aria-hidden="true">★</span>' : "") + "</li>";
  }
  function factionMap() {
    var m = {}; (D.races || []).forEach(function (r) { m[r.name] = r.faction; }); return m;
  }

  /* ---------- pages ---------- */
  var PAGES = {};

  PAGES.home = function () {
    var f = $("#facts");
    if (f) f.innerHTML = D.facts.map(function (x) { return '<div class="stat"><b>' + esc(x.value) + "</b><span>" + esc(x.label) + "</span></div>"; }).join("");
    startCountdown($("#countdown"));
    var n = $("#latest-news");
    if (n) n.innerHTML = D.news.slice(0, 5).map(newsItemHTML).join("");
    var t = $("#tips");
    if (t) {
      var tips = D.tips.slice();
      for (var i = tips.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var k = tips[i]; tips[i] = tips[j]; tips[j] = k; }
      t.innerHTML = tips.slice(0, 5).map(function (x) {
        return "<li>" + esc(x.text) + ' <span class="source">— ' + ext(x.url, esc(x.source)) + "</span></li>";
      }).join("");
    }
    var z = $("#zones");
    if (z) z.innerHTML = D.zones.map(function (x) { return "<li><b>" + esc(x.name) + "</b> — " + esc(x.text) + "</li>"; }).join("");
  };

  PAGES.news = function () {
    var list = $("#news-list"), current = "";
    var tags = []; D.news.forEach(function (n) { if (tags.indexOf(n.tag) < 0) tags.push(n.tag); });
    function draw() {
      var items = D.news.filter(function (n) { return !current || n.tag === current; });
      list.innerHTML = items.length ? items.map(newsItemHTML).join("") : '<div class="empty">Nothing here yet.</div>';
      if (current) announce(items.length + " " + current + " stories shown");
    }
    chips($("#news-filters"), tags, function (v) { current = v; draw(); });
    draw();
  };

  PAGES.guides = function () {
    var out = $("#guide-list"), q = $("#guide-search"), cat = "";
    function draw() {
      var term = (q.value || "").toLowerCase().trim();
      var html = "", total = 0;
      D.guideCategories.forEach(function (c) {
        if (cat && c !== cat) return;
        var items = D.guides.filter(function (g) {
          return g.cat === c && (!term || (g.title + " " + g.desc + " " + g.site).toLowerCase().indexOf(term) >= 0);
        });
        if (!items.length) return;
        total += items.length;
        html += '<section class="section" style="padding-top:18px"><h2>' + esc(c) + '</h2><ul class="grid grid-3 card-list">' +
          items.map(function (g) {
            return '<li><a class="panel link-card" href="' + esc(g.url) + '" target="_blank" rel="noopener nofollow">' +
              '<span class="site">' + esc(g.site) + "</span><h3>" + esc(g.title) + "</h3><p>" + esc(g.desc) + '</p><span class="go">Open guide <span aria-hidden="true">&#8599;</span><span class="sr-only">(opens in a new tab)</span></span></a></li>';
          }).join("") + "</ul></section>";
      });
      out.innerHTML = html || '<div class="empty">No guides match that search.</div>';
      return total;
    }
    chips($("#guide-filters"), D.guideCategories, function (v) { cat = v; announce(draw() + " guides shown"); });
    var t;
    q.addEventListener("input", function () { var n = draw(); clearTimeout(t); t = setTimeout(function () { announce(n + " guides match"); }, 500); });
    draw();
  };

  PAGES.classes = function () {
    var fm = factionMap();
    var cards = $("#class-cards");
    cards.innerHTML = D.classes.map(function (c) {
      return '<article class="panel class-card" id="' + c.id + '" style="--cc: var(--c-' + c.id + ')">' +
        '<h3><span class="class-icon" aria-hidden="true">' + c.name.charAt(0) + "</span>" + esc(c.name) + "</h3>" +
        '<p class="sr-only">Roles:</p><ul class="roles">' + c.roles.map(function (r) { return '<li class="role">' + esc(r) + "</li>"; }).join("") + "</ul>" +
        '<div class="specs"><span class="sr-only">Talent trees: </span>' + esc(c.specs) + "</div><p>" + esc(c.blurb) + "</p>" +
        '<h4 class="mini-head">Playable races</h4><ul class="races">' + c.races.map(function (r) { return raceChip(r, fm); }).join("") + "</ul>" +
        (c.changes ? '<h4 class="mini-head">Worth knowing in Forever</h4><ul class="gems small">' + c.changes.map(function (x) { return "<li>" + linkSpells(x) + "</li>"; }).join("") + "</ul>" +
          '<div class="source">Source: ' + ext("https://warcraft.wiki.gg/wiki/" + c.name + "_abilities_(Forever)", c.name + " abilities (Forever) — Warcraft Wiki") + "</div>" : "") +
        "</article>";
    }).join("");

    // matrix
    var races = D.races.map(function (r) { return r.name; });
    var head = '<tr><th scope="col">Class</th>' + races.map(function (r) { return '<th scope="col">' + esc(r.replace("Skyborne ", "Skyborne<br>")).replace("&lt;br&gt;", "<br>") + "</th>"; }).join("") + "</tr>";
    var body = D.classes.map(function (c) {
      return '<tr><th scope="row" style="color:var(--c-' + c.id + ')">' + esc(c.name) + "</th>" + races.map(function (r) {
        if (c.races.indexOf("*" + r) >= 0) return '<td class="newc"><span class="sr-only">Yes, new in Forever</span></td>';
        if (c.races.indexOf(r) >= 0) return '<td class="yes"><span class="sr-only">Yes</span></td>';
        return '<td class="no"><span class="sr-only">No</span></td>';
      }).join("") + "</tr>";
    }).join("");
    $("#matrix").innerHTML = '<caption class="sr-only">Which races can play each class. Rows are classes, columns are races.</caption><thead>' + head + "</thead><tbody>" + body + "</tbody>";

    $("#race-cards").innerHTML = D.races.map(function (r) {
      return '<article class="panel"><h3>' + esc(r.name) + (r.isNew ? ' <span class="tag tag-new">new</span>' : "") + '</h3><div class="faint" style="margin-bottom:8px">' + esc(r.faction) + '</div><ul class="gems">' +
        r.racials.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></article>";
    }).join("");
  };

  /* ---------- shared: bosses, raids, Wowhead links ---------- */
  function bossList(b) {
    if (!b || !b.length) return '<p class="faint">Boss list not documented yet.</p>';
    return '<ol class="bosses">' + b.map(function (x, i) {
      var last = i === b.length - 1 && b.length > 1;
      return "<li" + (last ? ' class="final"' : "") + ">" + esc(x) + (last ? '<span class="sr-only"> (final boss)</span>' : "") + "</li>";
    }).join("") + "</ol>";
  }

  // Escape text, then turn known ability names into Wowhead (Forever) links
  var spellRe = null;
  function linkSpells(text) {
    var safe = esc(text), map = D.spells || {};
    if (!spellRe) {
      var names = Object.keys(map).sort(function (a, b) { return b.length - a.length; })
        .map(function (n) { return esc(n).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); });
      if (!names.length) return safe;
      spellRe = new RegExp("(" + names.join("|") + ")", "g");
    }
    return safe.replace(spellRe, function (m) {
      var name = m.replace(/&#39;/g, "'").replace(/&amp;/g, "&");
      var id = map[name];
      var url = id ? "https://www.wowhead.com/forever/spell=" + id : "https://www.wowhead.com/forever/search?q=" + encodeURIComponent(name);
      return '<a class="wh' + (id ? "" : " wh-search") + '" href="' + url + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="false"' + (id ? "" : ' data-wh-icon-added="true"') + ">" + m +
        '<span class="sr-only"> (Wowhead, opens in a new tab)</span></a>';
    });
  }

  // Load Wowhead's tooltip script only on pages that have Wowhead database links
  // Wowhead renames links only when asked per link (data-wh-rename-link="true"), so our own text stays.
  var whLoaded = false;
  function setupWowhead() {
    if (!document.querySelector('a.wh:not(.wh-search)')) return;
    if (whLoaded) {
      // links added after page load: ask the script to scan again
      try {
        if (window.$WowheadPower && $WowheadPower.refreshLinks) $WowheadPower.refreshLinks();
        else if (window.WH && WH.Tooltips && WH.Tooltips.refreshLinks) WH.Tooltips.refreshLinks();
      } catch (e) { /* ignore */ }
      return;
    }
    whLoaded = true;
    window.whTooltips = { colorLinks: false, iconizeLinks: true, renameLinks: true };
    var s = document.createElement("script");
    s.src = "https://wow.zamimg.com/js/tooltips.js";
    s.async = true;
    document.head.appendChild(s);
  }

  PAGES.dungeons = function () {
    var lvl = $("#level"), range = $("#level-range"), q = $("#dungeon-search"), onlyNew = $("#only-new"), body = $("#dungeon-rows"), summary = $("#dungeon-summary");
    var saved = store("codex-level");
    if (saved) { lvl.value = saved; range.value = saved; }
    function status(d, L) {
      if (L >= d.min && L <= d.max) return ["Right for you", "lvl-ok"];
      if (L < d.min && d.min - L <= 3) return ["Soon (" + (d.min - L) + " lvl)", "lvl-hard"];
      if (L < d.min) return ["Too high", "lvl-hard"];
      return ["Below your level", "lvl-easy"];
    }
    function draw() {
      var L = Math.max(1, Math.min(60, parseInt(lvl.value, 10) || 1));
      store("codex-level", L);
      var term = (q.value || "").toLowerCase().trim();
      var rows = D.dungeons.filter(function (d) {
        return (!onlyNew.checked || d.isNew) && (!term || (d.name + " " + d.zone).toLowerCase().indexOf(term) >= 0);
      });
      var fit = rows.filter(function (d) { return L >= d.min && L <= d.max; });
      var plain = fit.length
        ? "At level " + L + " you can run " + fit.length + " dungeon" + (fit.length > 1 ? "s" : "") + ": " + fit.map(function (d) { return d.name; }).join(", ") + "."
        : "At level " + L + " nothing in the list fits yet" + (L < 13 ? ". Dungeons start at level 13." : ".");
      summary.innerHTML = fit.length
        ? "At level <b>" + L + "</b> you can run <b>" + fit.length + "</b> dungeon" + (fit.length > 1 ? "s" : "") + ": " + fit.map(function (d) { return esc(d.name) + (d.isNew ? ' <span aria-hidden="true">★</span>' : ""); }).join(", ") + "."
        : "At level <b>" + L + "</b> nothing in the list fits yet" + (L < 13 ? " — dungeons start at level 13. Keep questing!" : ".");
      body.innerHTML = rows.map(function (d) {
        var st = status(d, L);
        var left = (d.min - 1) / 60 * 100, w = (d.max - d.min + 1) / 60 * 100;
        return '<tr class="' + (st[1] === "lvl-ok" ? "fit" : "") + '"><th scope="row"><b>' + esc(d.name) + "</b>" + (d.isNew ? ' <span class="tag tag-new">new</span>' : "") + "</th><td>" + esc(d.zone) + "</td><td>" + d.min + "–" + d.max +
          '</td><td class="col-range" aria-hidden="true"><div class="lvlbar"><i style="left:' + left + "%;width:" + w + '%"></i></div></td><td class="' + st[1] + '"><span class="dot" aria-hidden="true"></span>' + st[0] + "</td></tr>";
      }).join("") || '<tr><td colspan="5" class="empty">No dungeons match.</td></tr>';
      return plain;
    }
    // announce the result once the user pauses, not on every slider step
    var at;
    function redraw() { var msg = draw(); clearTimeout(at); at = setTimeout(function () { announce(msg); }, 700); }
    lvl.addEventListener("input", function () { range.value = lvl.value; redraw(); });
    range.addEventListener("input", function () { lvl.value = range.value; redraw(); });
    q.addEventListener("input", redraw);
    onlyNew.addEventListener("change", redraw);
    draw();

    var spot = $("#spotlight-cards");
    if (spot) spot.innerHTML = D.newDungeons.map(function (d) {
      return '<article class="panel"><h3>' + esc(d.name) + ' <span class="tag tag-new">new</span></h3>' +
        '<div class="faint">' + esc(d.where) + " · Levels " + esc(d.levels) + "</div>" +
        '<p style="margin:8px 0">' + esc(d.about) + "</p>" +
        '<h4 class="mini-head">Bosses</h4>' + bossList(d.bosses) +
        '<div class="source">Source: ' + ext(d.url, "Warcraft Wiki") + "</div></article>";
    }).join("");
  };

  PAGES.systems = function () {
    $("#systems-toc").innerHTML = D.systems.map(function (s) {
      return '<a class="chip" href="#' + s.id + '">' + esc(s.title.split(":")[0]) + "</a>";
    }).join("");
    // points contain trusted inline markup (<b>, <i>) written in data.js
    $("#systems-list").innerHTML = D.systems.map(function (s) {
      return '<section class="panel system" id="' + s.id + '"><h2><span class="sys-icon" aria-hidden="true">' + s.icon + "</span>" + esc(s.title) + '</h2><ul class="gems">' +
        s.points.map(function (p) { return "<li>" + p + "</li>"; }).join("") + '</ul><div class="source">Sources: ' +
        s.sources.map(function (x) { return ext(x[1], esc(x[0])); }).join(" · ") + "</div></section>";
    }).join("");
  };

  PAGES.faq = function () {
    $("#faq-list").innerHTML = D.faq.map(function (f, i) {
      return '<details class="panel faq"' + (i === 0 ? " open" : "") + "><summary>" + esc(f.q) + "</summary><p>" + esc(f.a) + '</p><a class="more" href="' + esc(f.src) + '">More on this &rarr;</a></details>';
    }).join("");
    $("#glossary").innerHTML = D.glossary.map(function (g) {
      return "<div><dt>" + esc(g[0]) + "</dt><dd>" + esc(g[1]) + "</dd></div>";
    }).join("");
    // FAQ structured data for search engines
    var ld = document.createElement("script");
    ld.type = "application/ld+json";
    ld.textContent = JSON.stringify({
      "@context": "https://schema.org", "@type": "FAQPage",
      mainEntity: D.faq.map(function (f) { return { "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } }; })
    });
    document.head.appendChild(ld);
  };

  PAGES.roadmap = function () {
    var now = Date.now(), nextFound = false;
    $("#timeline").innerHTML = D.roadmap.map(function (r) {
      var t = (r.date.length > 10 ? new Date(r.date) : parseDay(r.date)).getTime();
      var cls = "upcoming";
      if (t <= now) cls = "done";
      else if (!nextFound) { cls = "next"; nextFound = true; }
      return '<li class="tl-item ' + cls + '"' + (cls === "next" ? ' aria-current="step"' : "") + '><div class="tl-when">' + esc(r.when) + (cls === "done" ? ' <span class="tag tag-official">done</span>' : cls === "next" ? ' <span class="tag tag-hotfix">next up</span>' : "") + "</div><h3>" + esc(r.title) + "</h3><ul>" +
        r.items.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></li>";
    }).join("");
    startCountdown($("#countdown"));
  };

  PAGES.checklist = function () {
    var KEY = "codex-checklist";
    var state = store(KEY) || {};
    var root = $("#checklist"), bar = $("#progress-bar"), label = $("#progress-label");
    root.innerHTML = D.checklist.map(function (g, gi) {
      return '<fieldset class="panel check-group"><legend class="sr-only">' + esc(g.group) + '</legend><h3 aria-hidden="true">' + esc(g.group) + ' <small data-count="' + gi + '"></small></h3>' +
        g.items.map(function (it) {
          var hid = it.hint ? ' aria-describedby="hint-' + esc(it.id) + '"' : "";
          return '<label class="check"><input type="checkbox" data-id="' + esc(it.id) + '"' + hid + "><span>" + esc(it.text) + (it.hint ? '<small id="hint-' + esc(it.id) + '">' + esc(it.hint) + "</small>" : "") + "</span></label>";
        }).join("") + "</fieldset>";
    }).join("");
    var track = bar.parentNode;
    track.setAttribute("role", "progressbar");
    track.setAttribute("aria-valuemin", "0");
    track.setAttribute("aria-valuemax", "100");
    track.setAttribute("aria-labelledby", "progress-label");
    function sync() {
      var total = 0, done = 0;
      D.checklist.forEach(function (g, gi) {
        var gd = 0;
        g.items.forEach(function (it) { total++; if (state[it.id]) { done++; gd++; } });
        var c = root.querySelector('[data-count="' + gi + '"]'); if (c) c.textContent = gd + " / " + g.items.length;
      });
      $all("input[data-id]", root).forEach(function (i) {
        i.checked = !!state[i.getAttribute("data-id")];
        i.closest(".check").classList.toggle("done", i.checked);
      });
      var pct = total ? Math.round(done / total * 100) : 0;
      bar.style.width = pct + "%";
      track.setAttribute("aria-valuenow", pct);
      label.textContent = done + " of " + total + " complete (" + pct + "%)";
      return label.textContent;
    }
    root.addEventListener("change", function (e) {
      var id = e.target.getAttribute("data-id"); if (!id) return;
      if (e.target.checked) state[id] = true; else delete state[id];
      store(KEY, state); announce(sync());
    });
    $("#reset-checklist").addEventListener("click", function () {
      if (!confirm("Clear all checked items?")) return;
      state = {}; store(KEY, state); announce("Checklist cleared. " + sync());
    });
    sync();
  };

  /* ---------- reusable saved checklist (one localStorage key per list) ---------- */
  function savedChecklist(root, key, items, onChange) {
    var state = store(key) || {};
    root.innerHTML = items.map(function (it) {
      var id = key + "-" + it.id;
      return '<li><label class="check"><input type="checkbox" data-id="' + esc(it.id) + '"' + (it.hint ? ' aria-describedby="' + id + '-h"' : "") + "><span>" +
        it.html + (it.hint ? '<small id="' + id + '-h">' + esc(it.hint) + "</small>" : "") + "</span></label></li>";
    }).join("");
    function sync() {
      var done = 0;
      $all("input[data-id]", root).forEach(function (i) {
        i.checked = !!state[i.getAttribute("data-id")];
        if (i.checked) done++;
        i.closest(".check").classList.toggle("done", i.checked);
      });
      // highlight the first unfinished step
      $all("li", root).forEach(function (li) { li.classList.remove("next-step"); });
      var first = root.querySelector("input:not(:checked)");
      if (first) first.closest("li").classList.add("next-step");
      if (onChange) onChange(done, items.length);
      return done;
    }
    // property (not addEventListener) so re-rendering the same list replaces the old handler
    root.onchange = function (e) {
      var id = e.target.getAttribute("data-id"); if (!id) return;
      if (e.target.checked) state[id] = true; else delete state[id];
      store(key, state);
      var d = sync();
      announce(d + " of " + items.length + " done");
    };
    sync();
    return { reset: function () { state = {}; store(key, state); sync(); } };
  }

  function progressHTML(id) {
    return '<div class="mini-progress"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-labelledby="' + id + '-label"><i id="' + id + '-bar"></i></div><span id="' + id + '-label" class="faint"></span></div>';
  }
  function setProgress(id, done, total, noun) {
    var pct = total ? Math.round(done / total * 100) : 0;
    var bar = $("#" + id + "-bar"); if (bar) { bar.style.width = pct + "%"; bar.parentNode.setAttribute("aria-valuenow", pct); }
    var lab = $("#" + id + "-label"); if (lab) lab.textContent = done + " of " + total + " " + (noun || "done");
  }

  PAGES.raids = function () {
    startCountdown($("#countdown"));

    $("#raid-cards").innerHTML = D.raids.map(function (r) {
      return '<article class="panel raid-card" id="raid-' + r.name.toLowerCase().replace(/[^a-z]+/g, "-") + '">' +
        "<h3>" + esc(r.name) + (r.isNew ? ' <span class="tag tag-new">new</span>' : "") + "</h3>" +
        '<div class="raid-meta"><span><b>' + r.size + "</b> players</span><span>Opens <b>" + esc(r.opens) + "</b></span><span><b>" + r.bosses.length + "</b> boss" + (r.bosses.length > 1 ? "es" : "") + "</span></div>" +
        '<p class="muted">' + esc(r.note) + "</p>" +
        '<h4 class="mini-head">Boss order</h4>' + bossList(r.bosses) +
        '<div class="loot-tba"><b>Loot:</b> Blizzard hasn\'t revealed loot tables yet. We\'ll add them when the raids open.</div>' +
        '<div class="source">Source: ' + ext(r.url, "Warcraft Wiki") + "</div></article>";
    }).join("");

    // raid-readiness checklist
    $("#prep-progress").innerHTML = progressHTML("prep");
    savedChecklist($("#prep-list"), "codex-raidprep",
      D.raidPrep.map(function (p) { return { id: p.id, html: esc(p.text), hint: p.hint }; }),
      function (d, t) { setProgress("prep", d, t, "ready"); });

    // attunement tracker with faction switch
    var A = D.attunement, faction = store("codex-faction") || "alliance";
    $("#attune-intro").textContent = A.intro;
    $("#attune-sources").innerHTML = "Cross-checked against " + A.sources.map(function (s) { return ext(s[1], esc(s[0])); }).join(", ") + ".";
    $("#attune-progress").innerHTML = progressHTML("att");
    function drawFaction() {
      var f = A[faction];
      $all("#faction-switch button").forEach(function (b) {
        var on = b.getAttribute("data-f") === faction;
        b.setAttribute("aria-pressed", on); b.classList.toggle("active", on);
      });
      $("#attune-start").textContent = f.start;
      savedChecklist($("#attune-list"), "codex-attune-" + faction,
        f.steps.map(function (s) {
          return { id: s[0], html: "<b>" + esc(s[1]) + '</b><span class="giver">' + esc(s[2]) + "</span>" + esc(s[3]) };
        }),
        function (d, t) { setProgress("att", d, t, "steps"); });
      $("#attune-notes").innerHTML = f.notes.map(function (n) { return "<li>" + esc(n) + "</li>"; }).join("");
    }
    $("#faction-switch").addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b) return;
      faction = b.getAttribute("data-f"); store("codex-faction", faction);
      drawFaction();
      announce((faction === "alliance" ? "Alliance" : "Horde") + " attunement shown");
    });
    drawFaction();
  };

  /* ---------- weekly reset + lockouts ---------- */
  function resetTimes(prefs) {
    // returns { next, last } timestamps (ms) for the chosen region or custom schedule
    var now = new Date(), next;
    if (prefs.region === "custom") {
      var hm = (prefs.time || "09:00").split(":");
      next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), +hm[0], +hm[1], 0, 0);
      var add = (prefs.day - next.getDay() + 7) % 7;
      next.setDate(next.getDate() + add);
      if (next <= now) next.setDate(next.getDate() + 7);
    } else {
      var r = D.resetRegions.filter(function (x) { return x.id === prefs.region; })[0] || D.resetRegions[0];
      next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), r.hourUTC, 0, 0));
      next.setUTCDate(next.getUTCDate() + (r.day - next.getUTCDay() + 7) % 7);
      if (next <= now) next.setUTCDate(next.getUTCDate() + 7);
    }
    return { next: next.getTime(), last: next.getTime() - 7 * 86400000 };
  }

  PAGES.resets = function () {
    var PK = "codex-reset-prefs", CK = "codex-lockouts";
    // first visit: guess the region from the browser's time zone
    var tz = "";
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ""; } catch (e) { /* ignore */ }
    var guess = /^(America|Pacific|Australia)\//.test(tz) ? "us" : "eu";
    var prefs = store(PK) || { region: guess, day: 3, time: "05:00" };
    var data = store(CK) || { chars: [], done: {}, week: 0 };
    var regionSel = $("#reset-region"), customBox = $("#custom-reset"), daySel = $("#reset-day"), timeIn = $("#reset-time");

    regionSel.innerHTML = D.resetRegions.map(function (r) { return '<option value="' + r.id + '">' + esc(r.name) + " — " + esc(r.label) + "</option>"; }).join("") +
      '<option value="custom">Custom day and time…</option>';
    regionSel.value = prefs.region;
    daySel.value = String(prefs.day);
    timeIn.value = prefs.time;

    var timer = null;
    function weekStart() { return resetTimes(prefs).last; }
    function clearIfNewWeek() {
      var ws = weekStart();
      if (data.week && data.week < ws) {
        data.done = {};
        announce("New week: all lockouts have been cleared.");
        $("#week-note").textContent = "A new week started — your lockouts were cleared automatically.";
      }
      data.week = ws;
      store(CK, data);
    }
    function drawClock() {
      var t = resetTimes(prefs);
      customBox.hidden = prefs.region !== "custom";
      var when = new Date(t.next);
      $("#reset-when").textContent = when.toLocaleString(undefined, { weekday: "long", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" });
      $("#reset-sr").textContent = "Next reset " + $("#reset-when").textContent + ".";
      clearInterval(timer);
      function tick() {
        var diff = Math.max(0, t.next - Date.now()), s = Math.floor(diff / 1000);
        var parts = { d: Math.floor(s / 86400), h: Math.floor(s % 86400 / 3600), m: Math.floor(s % 3600 / 60), s: s % 60 };
        Object.keys(parts).forEach(function (k) { var b = $('#reset-countdown [data-u="' + k + '"]'); if (b) b.textContent = parts[k]; });
        if (diff <= 0) { clearIfNewWeek(); drawBoard(); drawClock(); }
      }
      tick(); timer = setInterval(tick, 1000);
    }
    function savePrefs() { store(PK, prefs); clearIfNewWeek(); drawClock(); drawBoard(); }
    regionSel.addEventListener("change", function () { prefs.region = regionSel.value; savePrefs(); });
    daySel.addEventListener("change", function () { prefs.day = +daySel.value; savePrefs(); });
    timeIn.addEventListener("change", function () { prefs.time = timeIn.value || "09:00"; savePrefs(); });

    // character board
    var classOpts = D.classes.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + "</option>"; }).join("");
    $("#char-class").innerHTML = classOpts;
    function drawBoard() {
      var tasks = D.lockoutTasks, wrap = $("#lockout-board");
      if (!data.chars.length) {
        wrap.innerHTML = '<div class="empty">Add your characters above to start tracking this week\'s lockouts.</div>';
        return;
      }
      var total = data.chars.length * tasks.length, done = 0;
      var rows = data.chars.map(function (ch) {
        var cls = D.classes.filter(function (c) { return c.id === ch.cls; })[0] || { name: "" };
        return '<tr><th scope="row"><span class="cdot" style="background:var(--c-' + esc(ch.cls) + ')" aria-hidden="true"></span>' + esc(ch.name) +
          ' <span class="faint">' + esc(cls.name) + "</span></th>" +
          tasks.map(function (t) {
            var on = !!(data.done[ch.id] && data.done[ch.id][t.id]); if (on) done++;
            return '<td class="lock-cell"><label class="lock' + (on ? " on" : "") + '"><input type="checkbox" data-c="' + esc(ch.id) + '" data-t="' + t.id + '"' + (on ? " checked" : "") + '><span aria-hidden="true">' + (on ? "Done" : "—") + '</span><span class="sr-only">' + esc(t.name) + " done for " + esc(ch.name) + "</span></label></td>";
          }).join("") +
          '<td><button type="button" class="icon-btn remove-char" data-c="' + esc(ch.id) + '" title="Remove ' + esc(ch.name) + '"><span aria-hidden="true">×</span><span class="sr-only">Remove ' + esc(ch.name) + "</span></button></td></tr>";
      }).join("");
      wrap.innerHTML = '<div class="table-wrap"><table class="lockouts"><caption class="sr-only">Lockouts this week by character</caption><thead><tr><th scope="col">Character</th>' +
        tasks.map(function (t) { return '<th scope="col"><abbr title="' + esc(t.name) + '">' + esc(t.short) + "</abbr></th>"; }).join("") +
        '<th scope="col"><span class="sr-only">Remove</span></th></tr></thead><tbody>' + rows + "</tbody></table></div>" +
        '<p class="faint">' + done + " of " + total + " lockouts used this week.</p>";
    }
    $("#lockout-board").addEventListener("change", function (e) {
      var c = e.target.getAttribute("data-c"), t = e.target.getAttribute("data-t"); if (!c || !t) return;
      data.done[c] = data.done[c] || {};
      if (e.target.checked) data.done[c][t] = true; else delete data.done[c][t];
      store(CK, data); drawBoard();
      var cell = $('#lockout-board input[data-c="' + c + '"][data-t="' + t + '"]'); if (cell) cell.focus();
    });
    $("#lockout-board").addEventListener("click", function (e) {
      var b = e.target.closest(".remove-char"); if (!b) return;
      var id = b.getAttribute("data-c");
      var ch = data.chars.filter(function (x) { return x.id === id; })[0];
      if (!ch || !confirm("Remove " + ch.name + " from the tracker?")) return;
      data.chars = data.chars.filter(function (x) { return x.id !== id; });
      delete data.done[id];
      store(CK, data); drawBoard(); announce(ch.name + " removed");
      $("#char-name").focus();
    });
    $("#add-char").addEventListener("submit", function (e) {
      e.preventDefault();
      var name = $("#char-name").value.trim();
      if (!name) { $("#char-name").focus(); return; }
      if (data.chars.length >= 12) { announce("You can track up to 12 characters."); return; }
      var ch = { id: "c" + Date.now().toString(36), name: name.slice(0, 40), cls: $("#char-class").value };
      data.chars.push(ch); store(CK, data);
      $("#char-name").value = "";
      drawBoard(); announce(ch.name + " added");
      $("#char-name").focus();
    });
    $("#clear-week").addEventListener("click", function () {
      if (!confirm("Untick every lockout for this week?")) return;
      data.done = {}; store(CK, data); drawBoard(); announce("All lockouts cleared");
    });

    clearIfNewWeek();
    drawClock();
    drawBoard();
  };

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

    function itemLink(r) {
      var label = r.name ? esc(r.name) : "Item #" + r.id;
      return '<a class="wh item-link" href="https://www.wowhead.com/forever/item=' + r.id + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="' + (r.name ? "false" : "true") + '">' + label + "</a>";
    }

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
      status.textContent = (term ? list.length.toLocaleString() + " matching items" : "Showing " + Math.min(state.shown, list.length) + " of " + list.length.toLocaleString() + " items");
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

    loadRegion();
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
    function itemOrRecipe(r) {
      if (!r.item) return esc(r.name) + ' <span class="tag">enchant</span>';
      var it = items[r.item] || [];
      return '<a class="wh item-link" href="https://www.wowhead.com/forever/item=' + r.item + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="false">' + esc(r.itemName || it[0] || r.name) + "</a>" + (r.q > 1 ? ' <span class="faint">×' + r.q + "</span>" : "");
    }
    function detailRow(r) {
      var res = r.res;
      return '<tr class="cr-detail"><td colspan="6"><ul class="mats">' + r.reagents.map(function (x, i) {
        var p = res.parts[i];
        var src = p.source === "ah" ? "Auction House" : p.source === "vendor" ? "vendor price (estimate — check a vendor sells it)" : "no price found";
        return '<li><b>' + x[1] + "×</b> " + '<a class="wh item-link" href="https://www.wowhead.com/forever/item=' + x[0] + '" target="_blank" rel="noopener nofollow" data-wh-rename-link="false">' + esc(x[2]) + "</a> — " +
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
        return !term || r.name.toLowerCase().indexOf(term) >= 0 || r.reagents.some(function (x) { return (x[2] || "").toLowerCase().indexOf(term) >= 0; });
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
          '<td><button type="button" class="btn btn-ghost btn-sm cr-toggle" data-id="' + r.id + '" aria-expanded="' + isOpen + '">Materials<span class="sr-only"> for ' + esc(r.name) + "</span></button></td></tr>" +
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

  /* ---------- character lookup ---------- */
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
      var c = d.character, cls = (D.classes || []).filter(function (x) { return x.name === c.class; })[0];
      var full = esc([c.name, c.surname].filter(Boolean).join(" ") || c.slug);
      var share = location.origin + location.pathname + "?r=" + encodeURIComponent(d.region) + "&n=" + encodeURIComponent(c.slug);
      out.innerHTML =
        '<article class="panel ch-card"' + (cls ? ' style="--cc: var(--c-' + cls.id + ')"' : "") + ">" +
        '<div class="ch-head">' + (c.avatar ? '<img class="ch-avatar" src="' + esc(c.avatar) + '" alt="" width="84" height="84">' : '<span class="class-icon ch-avatar" aria-hidden="true">' + esc((c.class || "?").charAt(0)) + "</span>") +
        "<div><h2>" + full + "</h2>" +
        '<p class="ch-sub">Level ' + esc(c.level) + " " + esc(c.race || "") + ' <b style="color:var(--cc, var(--gold))">' + esc(c.class || "") + "</b>" +
        (c.guild ? ' · &lt;' + esc(c.guild) + "&gt;" : "") + "</p>" +
        '<p class="faint">' + [c.faction, c.ruleset ? c.ruleset + " ruleset" : null, d.region.toUpperCase(), c.lastLogin ? "last seen " + c.lastLogin : null].filter(Boolean).map(esc).join(" · ") + "</p></div>" +
        '<button type="button" class="btn btn-ghost btn-sm" id="ch-share">Copy link</button></div>' +
        (d.partial ? '<p class="note">Some sections aren\'t available yet — Blizzard updates them a little while after the character logs out.</p>' : "") +
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

  /* ---------- site search ---------- */
  function buildIndex() {
    var idx = [];
    function add(type, title, text, url, external) { idx.push({ type: type, title: title, text: text || "", url: url, ext: !!external, hay: (title + " " + (text || "")).toLowerCase() }); }
    (D.classes || []).forEach(function (c) { add("Class", c.name, c.specs + " " + c.blurb + " " + (c.changes || []).join(" "), "classes.html#" + c.id); });
    (D.newDungeons || []).forEach(function (d) { add("Dungeon", d.name, d.where + " · levels " + d.levels + ". " + d.bosses.join(", "), "dungeons.html#spotlight"); });
    (D.dungeons || []).forEach(function (d) { if (!d.isNew) add("Dungeon", d.name, d.zone + " · levels " + d.min + "–" + d.max, "dungeons.html"); });
    (D.raids || []).forEach(function (r) { add("Raid", r.name, r.size + " players · " + r.note + " " + r.bosses.join(", "), "raids.html"); });
    add("Tool", "Onyxia attunement tracker", "Drakefire Amulet quest chain, Alliance and Horde, step by step", "raids.html#attunement");
    add("Tool", "Weekly reset & lockout tracker", "Countdown to weekly reset and per-character raid lockouts", "resets.html");
    if (D.attunement) ["alliance", "horde"].forEach(function (f) {
      D.attunement[f].steps.forEach(function (s) { add("Quest", s[1], (f === "alliance" ? "Alliance" : "Horde") + " Onyxia attunement · " + s[3], "raids.html#attunement"); });
    });
    (D.systems || []).forEach(function (s) { add("Guide", s.title, s.points.join(" ").replace(/<[^>]+>/g, ""), "systems.html#" + s.id); });
    (D.faq || []).forEach(function (f) { add("FAQ", f.q, f.a, "faq.html"); });
    (D.glossary || []).forEach(function (g) { add("Glossary", g[0], g[1], "faq.html#glossary-section"); });
    (D.news || []).forEach(function (n) { add("News", n.title, n.summary, n.url, true); });
    (D.guides || []).forEach(function (g) { add("Link", g.title + " (" + g.site + ")", g.desc, g.url, true); });
    (D.races || []).forEach(function (r) { add("Race", r.name, r.faction + " · " + r.racials.join(", "), "classes.html#race-section"); });
    return idx;
  }
  function setupSearch() {
    var btn = $("#open-search");
    if (!btn || typeof HTMLDialogElement === "undefined") { if (btn) btn.hidden = true; return; }
    var index = null;
    var dlg = document.createElement("dialog");
    dlg.className = "search-dialog";
    dlg.setAttribute("aria-labelledby", "search-title");
    dlg.innerHTML =
      '<form method="dialog" class="search-head" role="search">' +
      '<h2 id="search-title" class="sr-only">Search Forever Tome</h2>' +
      ICON.search +
      '<label for="site-search" class="sr-only">Search classes, dungeons, guides, news and FAQ</label>' +
      '<input id="site-search" type="search" autocomplete="off" placeholder="Search classes, dungeons, guides, FAQ…" aria-describedby="search-count" aria-controls="search-results">' +
      '<button class="icon-btn" value="close" aria-label="Close search">Esc</button></form>' +
      '<p id="search-count" class="search-count" aria-live="polite"></p>' +
      '<ul id="search-results" class="search-results"></ul>' +
      '<p class="search-hint">Tip: press <kbd>/</kbd> anywhere to search.</p>';
    document.body.appendChild(dlg);
    var input = $("#site-search", dlg), list = $("#search-results", dlg), count = $("#search-count", dlg);

    function render() {
      var q = input.value.toLowerCase().trim();
      if (!q) { list.innerHTML = ""; count.textContent = ""; return; }
      var words = q.split(/\s+/);
      var hits = index.filter(function (it) { return words.every(function (w) { return it.hay.indexOf(w) >= 0; }); })
        .sort(function (a, b) { return (b.title.toLowerCase().indexOf(q) === 0) - (a.title.toLowerCase().indexOf(q) === 0); })
        .slice(0, 12);
      count.textContent = hits.length ? hits.length + (hits.length === 12 ? "+" : "") + " result" + (hits.length === 1 ? "" : "s") : "No results for “" + input.value + "”";
      list.innerHTML = hits.map(function (h) {
        var snippet = h.text.length > 120 ? h.text.slice(0, 117) + "…" : h.text;
        return '<li><a href="' + esc(h.url) + '"' + (h.ext ? ' target="_blank" rel="noopener nofollow"' : "") + '><span class="r-type">' + esc(h.type) + "</span><b>" + esc(h.title) + "</b><span class=\"r-text\">" + esc(snippet) + "</span>" +
          (h.ext ? '<span class="sr-only"> (opens in a new tab)</span>' : "") + "</a></li>";
      }).join("");
    }
    function openSearch() {
      if (!index) index = buildIndex();
      dlg.showModal();
      input.focus();
      input.select();
    }
    btn.addEventListener("click", openSearch);
    input.addEventListener("input", render);
    // arrow keys move between results
    dlg.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var links = $all("a", list);
      if (!links.length) return;
      var i = links.indexOf(document.activeElement);
      e.preventDefault();
      if (e.key === "ArrowDown") (links[i + 1] || links[0]).focus();
      else if (i <= 0) input.focus();
      else links[i - 1].focus();
    });
    list.addEventListener("click", function (e) { if (e.target.closest("a") && !e.target.closest("a").target) dlg.close(); });
    dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    document.addEventListener("keydown", function (e) {
      var tag = (e.target.tagName || "").toLowerCase();
      if ((e.key === "/" && tag !== "input" && tag !== "textarea" && !e.target.isContentEditable) || (e.key === "k" && (e.ctrlKey || e.metaKey))) {
        if (!dlg.open) { e.preventDefault(); openSearch(); }
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
  setupSearch();
  setupBackToTop();
  if (PAGES[page]) PAGES[page]();
  setupDonateBoxes();
  setupAds();
  setupWowhead();
  // sections are rendered by script, so re-apply #anchor jumps once they exist
  if (location.hash) {
    var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target) setTimeout(function () { target.scrollIntoView({ behavior: "instant", block: "start" }); }, 0);
  }
})();
