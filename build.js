#!/usr/bin/env node
/**
 * Builds the static leaflet site.
 *
 *   products/<code>.json  +  src/ui.json  +  src/assets/leaflet.js
 *        -> dist/p/<code>/index.html   (fully prerendered, readable with JS off)
 *
 * The renderers in src/assets/leaflet.js are the single source of truth for
 * markup. We run them here under jsdom to produce the static HTML, and ship
 * the same file to the browser for language switching and interactions.
 * There is no second, hand-maintained copy of the leaflet to drift out of date.
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const site = JSON.parse(read(path.join(ROOT, "site.config.json")));
const ui = JSON.parse(read(path.join(SRC, "ui.json")));
const template = read(path.join(SRC, "template.html"));
const shellTpl = read(path.join(SRC, "shell.html"));
const rendererJs = read(path.join(SRC, "assets", "leaflet.js"));

function read(p) {
  return fs.readFileSync(p, "utf8");
}

function fill(str, vars) {
  return str.replace(/\{\{(\w+)\}\}/g, (m, k) => (k in vars ? vars[k] : m));
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(a, b);
    else fs.copyFileSync(a, b);
  }
}

/**
 * Runs the real renderers against a blank shell and returns the finished body.
 * `lang` forces the language, bypassing the localStorage lookup the browser uses.
 */
function prerender(payload, lang, shellHtml, pathId) {
  const url = site.baseUrl.replace(/\/$/, "") + "/" + (pathId ? "#" + pathId : "");
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${shellHtml}</body></html>`,
    { url, pretendToBeVisual: true, runScripts: "outside-only" }
  );
  const win = dom.window;
  win.scrollTo = () => {}; // jsdom has no layout; the renderer calls this on navigation
  win.__PRERENDER_LANG = lang;
  win.PAYLOAD = payload;
  // localStorage is unavailable under some jsdom configs; the renderer guards it.
  try {
    win.eval(rendererJs);
  } catch (err) {
    throw new Error(`renderer failed for lang=${lang}: ${err.message}`);
  }
  return {
    body: win.document.body.innerHTML,
    lang: win.document.documentElement.lang,
    dir: win.document.documentElement.dir,
    title: win.document.title,
  };
}

/**
 * Picks the path whose sectionOrder covers the most sections, so one render
 * carries the whole leaflet. Paths differ in section ORDER, not content; if a
 * future product adds a path with sections no other path has, this warns.
 */
function pathCoveringAllSections(paths) {
  if (!paths.length) return null;
  const all = new Set();
  paths.forEach((p) => (p.sectionOrder || []).forEach((s) => all.add(s)));
  const best = paths
    .slice()
    .sort((a, b) => (b.sectionOrder || []).length - (a.sectionOrder || []).length)[0];
  const covered = new Set(best.sectionOrder || []);
  const missing = [...all].filter((s) => !covered.has(s));
  if (missing.length) {
    console.warn(
      `  ! no single path covers every section; missing from fallback: ${missing.join(", ")}`
    );
  }
  return best.id;
}

/** Pulls just the rendered <main> out of a prerendered body. */
function sliceMain(body) {
  const m = body.match(/<main[^>]*id="main"[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1].trim() : "";
}

function buildProduct(file) {
  const code = path.basename(file, ".json");
  const product = JSON.parse(read(file));
  const payload = {
    code,
    data: product.data,
    plates: product.plates,
    flags: product.flags || {},
    ui,
  };

  const assets = site.assetsPath;
  const shellHtml = fill(shellTpl, { ASSETS: assets, SITE_NAME: esc(site.siteName) });

  const primary = site.defaultLang;
  const secondary = primary === "ar" ? "en" : "ar";
  const rendered = prerender(payload, primary, shellHtml);

  /* The landing view is only the path chooser, and its buttons need JS. So a
     reader with scripting off would otherwise get no leaflet at all — not
     acceptable for safety information. We render every path in every language
     from the same renderers and put them in <noscript>. Generated, never
     hand-maintained, so it cannot drift from the data. */
  const paths = product.data.paths || [];
  const fallbackPath = pathCoveringAllSections(paths);
  const fallback = [];
  for (const lang of [primary, secondary]) {
    const r = prerender(payload, lang, shellHtml, fallbackPath);
    const main = sliceMain(r.body);
    if (main) {
      fallback.push(
        `<section class="ns" lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">${main}</section>`
      );
    }
  }

  const canonical = `${site.baseUrl.replace(/\/$/, "")}/p/${code}/`;
  const pick = (o) => (o && o[primary] !== undefined ? o[primary] : "");

  const html = fill(template, {
    LANG: rendered.lang || primary,
    DIR: rendered.dir || (primary === "ar" ? "rtl" : "ltr"),
    THEME_COLOR: site.themeColor,
    TITLE: esc(rendered.title || pick(ui.pageTitle)),
    DESCRIPTION: esc(pick(ui.metaDesc)),
    AUTHOR: esc(site.author),
    SITE_NAME: esc(site.siteName),
    CANONICAL: canonical,
    OG_IMAGE: `${site.baseUrl.replace(/\/$/, "")}${assets.replace(/^\.\.\/\.\./, "")}/logo.webp`,
    OG_LOCALE: primary === "ar" ? "ar_EG" : "en_US",
    OG_LOCALE_ALT: secondary === "ar" ? "ar_EG" : "en_US",
    ASSETS: assets,
    BODY: rendered.body + `\n<noscript>\n${fallback.join("\n")}\n</noscript>`,
    PAYLOAD: JSON.stringify(payload).replace(/</g, "\\u003c"),
  });

  const outDir = path.join(DIST, "p", code);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "index.html"), html);
  return { code, bytes: Buffer.byteLength(html), canonical, product: product.data.product || {} };
}

/* Text for the product directory at the site root. Kept here rather than in
   ui.json because ui.json is the leaflet's vocabulary, not the site's. */
const DIR_TEXT = {
  title: { ar: "نشرات منتجاتنا", en: "Product leaflets" },
  intro: {
    ar: "اختر المنتج لقراءة نشرته كاملة: الجرعة، والمكوّنات، والتحذيرات.",
    en: "Choose a product to read its full leaflet: dose, ingredients and warnings.",
  },
  open: { ar: "افتح النشرة", en: "Open leaflet" },
  search: { ar: "ابحث عن منتج", en: "Search products" },
  none: { ar: "لا توجد منتجات مطابقة.", en: "No matching products." },
  foot: {
    ar: "تحمل كل علبة رمز QR يفتح نشرة المنتج نفسه مباشرة.",
    en: "Every pack carries a QR code that opens its own leaflet directly.",
  },
};

/* Only show a search box once the list is long enough to need one. */
const SEARCH_THRESHOLD = 6;

function buildIndex(built) {
  const primary = site.defaultLang;
  const t = (o, lang) => (o && o[lang] !== undefined ? o[lang] : "");
  // Every visible string carries both languages; the inline script swaps them.
  const bi = (o, tag = "span", attrs = "") =>
    `<${tag}${attrs} data-ar="${esc(t(o, "ar"))}" data-en="${esc(t(o, "en"))}">${esc(
      t(o, primary)
    )}</${tag}>`;

  const items = built
    .slice()
    .sort((a, b) => t(a.product.name, "en").localeCompare(t(b.product.name, "en")))
    .map((b) => {
      const p = b.product;
      const name = p.name || { ar: b.code, en: b.code };
      const initial = esc((t(name, "en") || b.code).charAt(0).toUpperCase());
      const media = p.cardImage
        ? `<img src="assets/${esc(p.cardImage)}" alt="" loading="lazy">`
        : `<span class="pmono" aria-hidden="true">${initial}</span>`;
      const reg = p.registration && p.registration.number
        ? `<span class="preg" dir="ltr">${esc(p.registration.number)}</span>`
        : "";
      const search = esc(
        [t(name, "ar"), t(name, "en"), t(p.category, "ar"), t(p.category, "en")].join(" ").toLowerCase()
      );
      return `    <li><a class="pcard" href="p/${esc(b.code)}/" data-search="${search}">
      <span class="pmedia">${media}</span>
      <span class="pbody">
        ${bi(name, "span", ' class="pname"')}
        ${p.category ? bi(p.category, "span", ' class="pcat"') : ""}
        ${reg}
      </span>
      <span class="pgo">${bi(DIR_TEXT.open)}<span class="arw" aria-hidden="true"></span></span>
    </a></li>`;
    })
    .join("\n");

  const searchBox =
    built.length > SEARCH_THRESHOLD
      ? `<label class="psearch"><span class="vh">${bi(DIR_TEXT.search)}</span>
    <input type="search" id="q" autocomplete="off" data-ph-ar="${esc(DIR_TEXT.search.ar)}" data-ph-en="${esc(
          DIR_TEXT.search.en
        )}" placeholder="${esc(t(DIR_TEXT.search, primary))}"></label>
  ${bi(DIR_TEXT.none, "p", ' class="sub pnone" id="none" hidden')}`
      : "";

  const base = site.baseUrl.replace(/\/$/, "");
  const html = `<!DOCTYPE html>
<html lang="${primary}" dir="${primary === "ar" ? "rtl" : "ltr"}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${esc(site.themeColor)}">
<title>${esc(site.siteName)} — ${esc(t(DIR_TEXT.title, primary))}</title>
<meta name="description" content="${esc(t(DIR_TEXT.intro, primary))}">
<link rel="canonical" href="${esc(base)}/">
<link rel="icon" href="assets/logo.webp" type="image/webp">
<link rel="stylesheet" href="assets/leaflet.css">
</head>
<body class="directory">
<div class="wrap">
  <div class="masthead">
    <img src="assets/logo.webp" alt="${esc(site.siteName)}" width="27" height="28">
    <span class="mark">${esc(site.siteName)}</span>
  </div>
  <div class="bar">
    <span></span>
    <span class="lang">
      <button type="button" data-lang="ar" aria-pressed="${primary === "ar"}">العربية</button>
      <button type="button" data-lang="en" aria-pressed="${primary === "en"}">English</button>
    </span>
  </div>
  <header class="hero">
    ${bi(DIR_TEXT.title, "h1")}
    ${bi(DIR_TEXT.intro, "p")}
  </header>
  ${searchBox}
  <ul class="plist" id="plist">
${items}
  </ul>
  ${bi(DIR_TEXT.foot, "p", ' class="foot"')}
</div>
<script>
(function () {
  var KEY = "site.lang", root = document.documentElement;
  function set(l) {
    root.lang = l; root.dir = l === "ar" ? "rtl" : "ltr";
    document.querySelectorAll("[data-" + l + "]").forEach(function (e) { e.textContent = e.getAttribute("data-" + l); });
    document.querySelectorAll("[data-ph-" + l + "]").forEach(function (e) { e.placeholder = e.getAttribute("data-ph-" + l); });
    document.querySelectorAll(".lang button").forEach(function (b) { b.setAttribute("aria-pressed", b.getAttribute("data-lang") === l); });
    document.title = ${JSON.stringify(site.siteName)} + " — " + document.querySelector("h1").textContent;
    try { localStorage.setItem(KEY, l); } catch (e) {}
  }
  var saved = null; try { saved = localStorage.getItem(KEY); } catch (e) {}
  if (saved === "ar" || saved === "en") set(saved);
  document.querySelectorAll(".lang button").forEach(function (b) {
    b.addEventListener("click", function () { set(b.getAttribute("data-lang")); });
  });
  var q = document.getElementById("q");
  if (q) q.addEventListener("input", function () {
    var v = q.value.trim().toLowerCase(), shown = 0;
    document.querySelectorAll("#plist li").forEach(function (li) {
      var hit = !v || li.firstElementChild.getAttribute("data-search").indexOf(v) !== -1;
      li.hidden = !hit; if (hit) shown++;
    });
    document.getElementById("none").hidden = shown > 0;
  });
})();
</script>
</body>
</html>`;
  fs.writeFileSync(path.join(DIST, "index.html"), html);
}

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });

  copyDir(path.join(SRC, "assets"), path.join(DIST, "assets"));

  const files = fs
    .readdirSync(path.join(ROOT, "products"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(ROOT, "products", f));

  if (!files.length) {
    console.error("No products found in products/");
    process.exit(1);
  }

  const built = files.map(buildProduct);
  buildIndex(built);

  // Tells GitHub Pages not to run the output through Jekyll.
  fs.writeFileSync(path.join(DIST, ".nojekyll"), "");
  if (site.customDomain) {
    fs.writeFileSync(path.join(DIST, "CNAME"), site.customDomain + "\n");
  }

  const sharedBytes = dirSize(path.join(DIST, "assets"));
  console.log(`Built ${built.length} product page(s) -> dist/`);
  for (const b of built) {
    console.log(`  /p/${b.code}/  ${(b.bytes / 1024).toFixed(0)} KB`);
  }
  console.log(`  shared assets (cached across all products): ${(sharedBytes / 1024).toFixed(0)} KB`);
}

function dirSize(dir) {
  let n = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    n += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
  }
  return n;
}

main();
