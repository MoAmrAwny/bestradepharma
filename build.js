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
  return { code, bytes: Buffer.byteLength(html), canonical };
}

function buildIndex(built) {
  const rows = built
    .map(
      (b) =>
        `    <li><a href="p/${b.code}/">${esc(b.code)}</a> <code>/p/${esc(
          b.code
        )}/</code></li>`
    )
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(site.siteName)} — product leaflets</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:40rem;margin:3rem auto;padding:0 1rem}
code{background:#f2f2ef;padding:.1em .4em;border-radius:4px}li{margin:.4rem 0}</style>
</head><body>
  <h1>${esc(site.siteName)} — product leaflets</h1>
  <p>Each product is served at its own permanent path. QR codes encode these URLs.</p>
  <ul>
${rows}
  </ul>
</body></html>`;
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
