#!/usr/bin/env node
/**
 * Builds bestradepharma.com into dist/.
 *
 *   Company pages, one file per language:
 *     /            /ar/              home
 *     /products/   /ar/products/
 *     /about/      /ar/about/
 *     /contact/    /ar/contact/
 *
 *   Product pages, ONE URL per product (printed on the box as a QR code):
 *     /p/<code>/   both languages, switched on the page; Arabic by default.
 *                  ?lang=en|ar picks the language (used by links from the
 *                  company pages); a plain scan behaves as it always has.
 *
 *   products/<code>.json decides the product page type:
 *     "type": "leaflet" (default)  the full interactive leaflet. The renderers in
 *                                  src/assets/leaflet.js run here under jsdom to
 *                                  prerender it, and again in the browser.
 *     "type": "profile"            a short profile: facts, use, how to use.
 *
 * Everything is static HTML. No framework; src/assets/site.js adds the motion.
 */

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const ROOT = __dirname;
const SRC = path.join(ROOT, "src");
const DIST = path.join(ROOT, "dist");

const site = JSON.parse(read(path.join(ROOT, "site.config.json")));
const ui = JSON.parse(read(path.join(SRC, "ui.json")));
const S = JSON.parse(read(path.join(SRC, "site.json")));
const template = read(path.join(SRC, "template.html"));
const shellTpl = read(path.join(SRC, "shell.html"));
const rendererJs = read(path.join(SRC, "assets", "leaflet.js"));

const BASE = site.baseUrl.replace(/\/$/, "");
/* Folder the site is served from. Empty on bestradepharma.com and Cloudflare
   Pages; "/bestradepharma" on the GitHub Pages project address. Set by the
   BASE_PATH environment variable (the GitHub Pages workflow does this). */
const BASE_PATH = (process.env.BASE_PATH || "").replace(/\/+$/, "");
const YEAR = new Date().getFullYear();
const LANGS = ["en", "ar"];
const PAGES = ["home", "products", "about", "contact"];
const PAGE_PATH = { home: "", products: "products/", about: "about/", contact: "contact/" };
const WHATSAPP = "https://wa.me/" + String(site.whatsapp || "").replace(/\D/g, "");
const TEL1 = "tel:+201116016972";
const TEL2 = "tel:+20222668630";

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

/* ---------- language helpers ---------- */

const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
/** Arabic-Indic digits for numbers that stand alone (not D3, MK-7, CYP3A4). */
function toAr(s) {
  return String(s)
    .replace(/(^|[^A-Za-z\-])(\d+(?:\.\d+)?)(?![A-Za-z\d])/g, (m, pre, num) =>
      pre + num.replace(/\d/g, (d) => AR_DIGITS[d]).replace(".", "٫")
    )
    .replace(/ mg\b/g, " مجم");
}
const tx = (lang, s) => (lang === "ar" ? toAr(s) : String(s == null ? "" : s));
/** Escaped, localised text from a {ar, en} object. */
const L = (lang, o) => esc(tx(lang, o && o[lang] !== undefined ? o[lang] : ""));
/** Escaped, localised text from src/site.json. */
const T = (lang, key) => esc(tx(lang, S[lang][key]));
const dirOf = (lang) => (lang === "ar" ? "rtl" : "ltr");
const other = (lang) => (lang === "ar" ? "en" : "ar");

function fmtInt(n, lang) {
  const s = Math.round(n).toLocaleString("en-US");
  return lang === "ar" ? toAr(s).replace(/,/g, "٬") : s;
}
const plus = (n, lang) => "+" + fmtInt(n, lang);

const pageUrl = (lang, key) => (lang === "ar" ? "/ar/" : "/") + PAGE_PATH[key];
const productUrl = (code, lang) => `/p/${code}/` + (lang ? `?lang=${lang}` : "");

/* ---------- products ---------- */

function imageFor(code) {
  for (const ext of ["png", "webp", "jpg"]) {
    if (fs.existsSync(path.join(SRC, "assets", "img", `${code}.${ext}`))) return `/assets/img/${code}.${ext}`;
  }
  return null;
}

function loadProducts() {
  const files = fs
    .readdirSync(path.join(ROOT, "products"))
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(ROOT, "products", f));
  return files
    .map((file) => {
      const code = path.basename(file, ".json");
      const json = JSON.parse(read(file));
      const p = json.data.product;
      return {
        code,
        file,
        json,
        type: json.type || "leaflet",
        name: p.name,
        category: p.cardCategory || p.category || { ar: "", en: "" },
        summary: p.summary || { ar: "", en: "" },
        group: p.group || "supplement",
        order: p.order || 99,
        color: p.color || "#083F88",
        patients: p.patients || 0,
        image: imageFor(code),
      };
    })
    .sort((a, b) => a.order - b.order || a.code.localeCompare(b.code));
}

/* ---------- shared page parts ---------- */

/** On product pages every piece of chrome is rendered once per language and
    the one not in use is hidden by CSS (html[lang] decides). */
const lvAttr = (lv, lang) => (lv ? ` data-lv="${lang}" lang="${lang}" dir="${dirOf(lang)}"` : "");

function header(lang, current, opts) {
  const links = PAGES.map((k) => {
    const on = k === current || (current === "product" && k === "products");
    const cur = k === current ? ' aria-current="page"' : "";
    return `<a href="${pageUrl(lang, k)}"${on ? ' class="on"' : ""}${cur}>${T(lang, k)}</a>`;
  }).join("");
  const to = other(lang);
  const langCtl = opts.toggle
    ? `<button type="button" class="lang-switch" data-to="${to}" lang="${to}">${esc(S[lang].langBtn)}</button>`
    : `<a class="lang-switch" href="${opts.altHref}" hreflang="${to}" lang="${to}">${esc(S[lang].langBtn)}</a>`;
  return `<header class="site-header"${lvAttr(opts.lv, lang)}>
  <a class="skip" href="#content">${T(lang, "skip")}</a>
  <div class="container hdr">
    <div class="hdr-start">
      <a class="brand" href="${pageUrl(lang, "home")}">
        <img src="/assets/logo.webp" alt="" width="44" height="46">
        <span class="brand-txt"><span class="brand-name">${T(lang, "heroTitle")}</span><span class="brand-sub" lang="en">BTP PHARMA</span></span>
      </a>
      <nav class="main-nav" aria-label="${T(lang, "navLabel")}">${links}</nav>
    </div>
    <div class="hdr-end">
      ${langCtl}
      <button type="button" class="menu-btn" aria-expanded="false" aria-controls="mnav-${lang}" aria-label="${T(lang, "menu")}"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button>
      <a class="btn btn-solid hide-sm" href="${pageUrl(lang, "contact")}">${T(lang, "contact")}</a>
    </div>
  </div>
  <nav class="mobile-panel" id="mnav-${lang}" aria-label="${T(lang, "menu")}">${links}</nav>
</header>`;
}

function contactBand(lang, lv) {
  return `<section class="cband"${lvAttr(lv, lang)}>
  <div class="container cband-in reveal">
    <div class="cband-txt">
      <h2>${T(lang, "contactTitle")}</h2>
      <p>${T(lang, "address")}</p>
    </div>
    <div class="btn-row">
      <a class="btn btn-white" href="${TEL1}" dir="ltr">${T(lang, "ph1")}</a>
      <a class="btn btn-ghost" href="${TEL2}" dir="ltr">${T(lang, "ph2")}</a>
    </div>
  </div>
</section>`;
}

function footer(lang, products, lv) {
  const list = (g) =>
    products
      .filter((p) => p.group === g)
      .map((p) => `<a href="${productUrl(p.code, lang)}" lang="en">${esc(p.name.en)}</a>`)
      .join("");
  return `<footer class="site-footer"${lvAttr(lv, lang)}>
  <div class="container foot-grid">
    <div class="foot-col">
      <span class="foot-brand"><span class="foot-logo"><img src="/assets/logo.webp" alt="" width="40" height="41" loading="lazy"></span><span class="foot-name">${T(lang, "heroTitle")}</span></span>
      <span>${T(lang, "footerAddr")}</span>
    </div>
    <div class="foot-col"><span class="foot-h">${T(lang, "devicesLbl")}</span>${list("device")}</div>
    <div class="foot-col"><span class="foot-h">${T(lang, "supplementsLbl")}</span>${list("supplement")}</div>
  </div>
  <div class="foot-bottom"><div class="container">© ${tx(lang, String(YEAR))} ${T(lang, "heroTitle")}</div></div>
</footer>`;
}

function whatsappButton() {
  return `<a class="wa" href="${WHATSAPP}" target="_blank" rel="noopener" aria-label="WhatsApp">
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.4 8.4 0 0 1-12.6 7.3L3 21l2.3-5.2A8.4 8.4 0 1 1 21 11.5z"/></svg>
</a>`;
}

/** Light band at the top of every page except home. */
function band(lang, eyebrow, title, back) {
  return `<section class="band">
  <div class="container band-in">
    ${back ? `<a class="back-link arrow-link up" href="${pageUrl(lang, "products")}">${T(lang, "back")}</a>` : ""}
    <span class="kicker up">${eyebrow}</span>
    <h1 class="band-title up d1">${title}</h1>
  </div>
</section>`;
}

function media(lang, p, size) {
  if (p.image) {
    return `<img class="pimg" src="${p.image}" alt="${esc(p.name.en)}"${size === "lg" ? "" : ' loading="lazy"'}>`;
  }
  return `<div class="ph-pack ${size}" style="--c:${esc(p.color)}"><span lang="en">${esc(p.name.en)}</span></div><span class="ph-note">${T(lang, "photoNote")}</span>`;
}

function productCard(lang, p) {
  return `<a class="pcard lift zoom reveal" href="${productUrl(p.code, lang)}">
  <div class="pc-media">${media(lang, p, "sm")}</div>
  <div class="pc-body">
    <span class="pc-cat">${L(lang, p.category)}</span>
    <span class="pc-name" lang="en">${esc(p.name.en)}</span>
    <p class="pc-sum">${L(lang, p.summary)}</p>
    <span class="arrow-link">${T(lang, "details")}</span>
  </div>
</a>`;
}

/* ---------- company page sections ---------- */

function hero(lang, products) {
  const photo = fs.existsSync(path.join(SRC, "assets", "img", "hero-cairo.jpg"));
  const bg = photo
    ? `<div class="hero-bg" style="background-image:url(/assets/img/hero-cairo.jpg)"></div>`
    : `<div class="hero-bg hero-ph"><span>${T(lang, "heroPhotoNote")}</span></div>`;
  const fact = (num, label, delay) =>
    `<div class="hfact pop" style="animation-delay:${delay}s"><span class="hfact-num">${num}</span><span class="hfact-lbl">${label}</span></div>`;
  return `<section class="hero">
  <div class="hero-media">${bg}<div class="hero-shade"></div></div>
  <div class="container hero-card-wrap">
    <div class="hero-card up">
      <span class="kicker line up d1">${T(lang, "chip")}</span>
      <h1 class="hero-title up d2">${T(lang, "heroTitle")}</h1>
      <p class="hero-sub up d3">${T(lang, "heroSub")}</p>
      <div class="btn-row up d4">
        <a class="btn btn-solid btn-lg" href="${pageUrl(lang, "products")}">${T(lang, "ctaProducts")}</a>
        <a class="btn btn-line btn-lg" href="${pageUrl(lang, "about")}">${T(lang, "ctaStory")}</a>
      </div>
    </div>
  </div>
  <div class="container">
    <div class="hfacts">
      ${fact(tx(lang, "2012"), T(lang, "stat1"), 0.7)}
      ${fact(tx(lang, String(products.length)), T(lang, "stat2"), 0.85)}
      ${fact("MDT", T(lang, "stat3"), 1)}
    </div>
  </div>
</section>`;
}

function impact(lang, products) {
  const withP = products.filter((p) => p.patients > 0);
  const total = withP.reduce((a, p) => a + p.patients, 0);
  const max = Math.max(...withP.map((p) => p.patients));
  const stats = withP
    .map((p) => {
      const w = ((p.patients / max) * 100).toFixed(1);
      return `<a class="stat reveal" href="${productUrl(p.code, lang)}">
      <span class="stat-name" lang="en">${esc(p.name.en)}</span>
      <span class="stat-num" dir="ltr" data-count="${p.patients}">${plus(p.patients, lang)}</span>
      <span class="stat-bar" aria-hidden="true"><span class="stat-fill" data-w="${w}" style="width:${w}%"></span></span>
      <span class="stat-lbl">${T(lang, "patients")}</span>
      <span class="arrow-link">${T(lang, "details")}</span>
    </a>`;
    })
    .join("\n");
  return `<section class="container sec" data-countup>
  <div class="sec-head reveal">
    <span class="kicker line">${T(lang, "impactEyebrow")}</span>
    <span class="big-num" dir="ltr" data-count="${total}">${plus(total, lang)}</span>
    <h2 class="h2">${T(lang, "impactTitle")}</h2>
  </div>
  <div class="stats">
${stats}
  </div>
</section>`;
}

function grids(lang, products, withIntro) {
  const cards = (g) => products.filter((p) => p.group === g).map((p) => productCard(lang, p)).join("\n");
  return `<section class="container grid-sec">
  ${withIntro ? `<p class="intro reveal">${T(lang, "productsIntro")}</p>` : ""}
  <div class="sec-head reveal">
    <span class="kicker line">${T(lang, "devEyebrow")}</span>
    <h2 class="h2">${T(lang, "devTitle")}</h2>
  </div>
  <div class="pgrid">
${cards("device")}
  </div>
</section>
<section class="container grid-sec grid-sec-2">
  <div class="sec-head reveal">
    <span class="kicker line">${T(lang, "supEyebrow")}</span>
    <h2 class="h2">${T(lang, "supTitle")}</h2>
  </div>
  <div class="pgrid">
${cards("supplement")}
  </div>
</section>`;
}

function story(lang) {
  const items = S[lang].timeline
    .map(
      (m) => `<div class="tl-item reveal"><span class="tl-dot" aria-hidden="true"></span><span class="tl-year">${esc(
        tx(lang, m.y)
      )}</span><span class="tl-text">${esc(tx(lang, m.t))}</span></div>`
    )
    .join("\n");
  return `<section class="story">
  <div class="container story-in">
    <div class="story-top reveal">
      <div class="story-txt">
        <span class="kicker line">${T(lang, "storyEyebrow")}</span>
        <h2 class="story-title">${T(lang, "storyTitle")}</h2>
        <p class="story-p">${T(lang, "storyText")}</p>
      </div>
      <div class="mdt"><b lang="en">MDT Int’l</b><span>${T(lang, "mdtText")}</span></div>
    </div>
    <div class="tl reveal">
      <span class="tl-line" aria-hidden="true"></span>
${items}
    </div>
  </div>
</section>`;
}

function qrSteps(lang) {
  const steps = S[lang].steps
    .map(
      (s, i) => `<div class="step reveal"><span class="step-n" aria-hidden="true">${tx(lang, String(i + 1))}</span><h3 class="step-t">${esc(
        tx(lang, s.t)
      )}</h3><p class="step-d">${esc(tx(lang, s.d))}</p></div>`
    )
    .join("\n");
  return `<section class="steps-band">
  <div class="container steps-in">
    <h2 class="h2 reveal">${T(lang, "qrTitle")}</h2>
    <div class="steps">
${steps}
    </div>
  </div>
</section>`;
}

function contactSection(lang) {
  const endpoint = site.contactFormEndpoint;
  const form = endpoint
    ? `<form class="c-form reveal" action="${esc(endpoint)}" method="POST">
    <h2 class="c-h">${T(lang, "formTitle")}</h2>
    <div class="f2">
      <div class="field"><label for="c-name">${T(lang, "fName")}</label><input id="c-name" name="name" type="text" autocomplete="name" required></div>
      <div class="field"><label for="c-phone">${T(lang, "fPhone")}</label><input id="c-phone" name="phone" type="tel" dir="ltr" autocomplete="tel"></div>
    </div>
    <div class="field"><label for="c-email">${T(lang, "fEmail")}</label><input id="c-email" name="email" type="email" dir="ltr" autocomplete="email"></div>
    <div class="field"><label for="c-msg">${T(lang, "fMsg")}</label><textarea id="c-msg" name="message" rows="5" required></textarea></div>
    <input type="hidden" name="language" value="${lang}">
    <button type="submit" class="btn btn-solid btn-lg">${T(lang, "fSend")}</button>
  </form>`
    : `<div class="c-form reveal">
    <h2 class="c-h">${T(lang, "formTitle")}</h2>
    <p class="c-pending">${T(lang, "formPending")}</p>
    <a class="btn btn-solid btn-lg" href="${WHATSAPP}" target="_blank" rel="noopener">${T(lang, "whatsappCta")}</a>
  </div>`;
  return `<section class="container contact">
  <div class="c-side">
    <p class="c-intro reveal">${T(lang, "contactPageSub")}</p>
    <div class="c-card reveal"><span class="c-lbl">${T(lang, "phoneLbl")}</span><a class="c-val" href="${TEL1}" dir="ltr">${T(
    lang,
    "ph1"
  )}</a><a class="c-val2" href="${TEL2}" dir="ltr">${T(lang, "ph2")}</a></div>
    <a class="c-card lift reveal" href="${WHATSAPP}" target="_blank" rel="noopener"><span class="c-lbl">${T(
    lang,
    "whatsapp"
  )}</span><span class="c-val" dir="ltr">${T(lang, "ph1")}</span></a>
    <div class="c-card reveal"><span class="c-lbl">${T(lang, "addressLbl")}</span><span class="c-addr">${T(lang, "address")}</span></div>
  </div>
  ${form}
</section>`;
}

/* ---------- page assembly ---------- */

const GTM = (site.gtmId || "").trim();
const gtmHead = GTM
  ? `<script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${esc(
      GTM
    )}');</script>`
  : "";
const gtmBody = GTM
  ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${esc(
      GTM
    )}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>`
  : "";

/** Prefixes every site-root link (href="/...", src="/...", url(/...)) with BASE_PATH. */
function withBasePath(html) {
  if (!BASE_PATH) return html;
  return html
    .replace(/(\s(?:href|src)=")\/(?!\/)/g, `$1${BASE_PATH}/`)
    .replace(/url\(\/(?!\/)/g, `url(${BASE_PATH}/`);
}

function writePage(rel, html) {
  html = withBasePath(html);
  const out = path.join(DIST, rel);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, html);
  return Buffer.byteLength(html);
}

function page(o) {
  return fill(template, {
    LANG: o.lang,
    DIR: dirOf(o.lang),
    HEAD_SCRIPT: o.headScript || `<script>document.documentElement.className+=" js"</script>`,
    THEME_COLOR: site.themeColor,
    TITLE: o.title,
    DESCRIPTION: o.description,
    AUTHOR: esc(site.author),
    CANONICAL: o.canonical,
    ALTERNATES: o.alternates || "",
    SITE_NAME: esc(site.siteName),
    OG_IMAGE: `${BASE}/assets/logo.webp`,
    OG_LOCALE: o.lang === "ar" ? "ar_EG" : "en_US",
    OG_LOCALE_ALT: o.lang === "ar" ? "en_US" : "ar_EG",
    GTM_HEAD: gtmHead,
    GTM_BODY: gtmBody,
    STYLES: (o.styles || ["site.css"]).map((s) => `<link rel="stylesheet" href="/assets/${s}">`).join("\n"),
    BODY_ATTRS: o.bodyAttrs || "",
    BODY: o.body,
    SCRIPTS: (o.scripts || "") + `\n<script src="/assets/site.js" defer></script>`,
  });
}

function companyPage(lang, key, products) {
  const sections = {
    home: () => [hero(lang, products), impact(lang, products), grids(lang, products, false), story(lang), qrSteps(lang), contactBand(lang)],
    products: () => [band(lang, T(lang, "devEyebrow"), T(lang, "allProducts")), grids(lang, products, true), contactBand(lang)],
    about: () => [band(lang, T(lang, "storyEyebrow"), T(lang, "aboutTitle")), impact(lang, products), story(lang)],
    contact: () => [band(lang, T(lang, "contactPageSub"), T(lang, "contactPageTitle")), contactSection(lang)],
  }[key]();
  const name = T(lang, "heroTitle");
  const titles = {
    home: `${name} · ${T(lang, "chip")}`,
    products: `${T(lang, "allProducts")} — ${name}`,
    about: `${T(lang, "aboutTitle")}`,
    contact: `${T(lang, "contactPageTitle")} — ${name}`,
  };
  const desc = { home: "heroSub", products: "productsIntro", about: "storyText", contact: "contactPageSub" }[key];
  const alt = (l) => `${BASE}${pageUrl(l, key)}`;
  const alternates = [
    `<link rel="alternate" hreflang="en" href="${alt("en")}">`,
    `<link rel="alternate" hreflang="ar" href="${alt("ar")}">`,
    `<link rel="alternate" hreflang="x-default" href="${alt("en")}">`,
  ].join("\n");
  const body = [
    header(lang, key, { altHref: pageUrl(other(lang), key) }),
    `<main id="content" tabindex="-1">\n${sections.join("\n")}\n</main>`,
    footer(lang, products),
    whatsappButton(),
  ].join("\n");
  const html = page({
    lang,
    title: titles[key],
    description: T(lang, desc),
    canonical: alt(lang),
    alternates,
    body,
  });
  return writePage(path.join(pageUrl(lang, key).slice(1), "index.html"), html);
}

/** Inline, before the stylesheets: sets the language the reader asked for so
    the page does not flash the other one first. */
function productHeadScript(code) {
  return `<script>(function(d,c){d.className+=" js";var l;try{var m=/[?&]lang=(ar|en)(?:&|$)/.exec(location.search);l=m?m[1]:localStorage.getItem(c+".lang")}catch(e){}if(l==="ar"||l==="en"){d.lang=l;d.dir=l==="ar"?"rtl":"ltr"}})(document.documentElement,${JSON.stringify(
    code
  )})</script>`;
}

/** Header (×2) + content + "on the box" + contact band (×2) + footer (×2). */
function productChrome(p, products, content) {
  const qr = (lang) => `<section class="container qr-sec"${lvAttr(true, lang)}>
  <div class="qr-card reveal">
    <span class="qr-icon" aria-hidden="true"><svg width="72" height="72" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 17h3v4h-3z"/></svg></span>
    <div class="qr-txt">
      <h2 class="c-h">${T(lang, "qrHead")}</h2>
      <p>${T(lang, "qrText")}</p>
      <span class="qr-url" dir="ltr" lang="en">${esc(BASE.replace(/^https?:\/\//, ""))}/p/${esc(p.code)}/</span>
    </div>
  </div>
</section>`;
  return [
    ...LANGS.map((l) => header(l, "product", { toggle: true, lv: true })),
    content,
    ...LANGS.map(qr),
    ...LANGS.map((l) => contactBand(l, true)),
    ...LANGS.map((l) => footer(l, products, true)),
    whatsappButton(),
  ].join("\n");
}

/* ----- leaflet product (the full interactive leaflet) ----- */

/**
 * Runs the real renderers against a blank shell and returns the finished body.
 * `lang` forces the language, bypassing the lookup the browser uses.
 */
function prerender(payload, lang, shellHtml, pathId) {
  const url = BASE + "/" + (pathId ? "#" + pathId : "");
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${shellHtml}</body></html>`, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only",
  });
  const win = dom.window;
  win.scrollTo = () => {}; // jsdom has no layout; the renderer calls this on navigation
  win.__PRERENDER_LANG = lang;
  win.PAYLOAD = payload;
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
 * carries the whole leaflet. Paths differ in section ORDER, not content.
 */
function pathCoveringAllSections(paths) {
  if (!paths.length) return null;
  const all = new Set();
  paths.forEach((p) => (p.sectionOrder || []).forEach((s) => all.add(s)));
  const best = paths.slice().sort((a, b) => (b.sectionOrder || []).length - (a.sectionOrder || []).length)[0];
  const covered = new Set(best.sectionOrder || []);
  const missing = [...all].filter((s) => !covered.has(s));
  if (missing.length) {
    console.warn(`  ! no single path covers every section; missing from fallback: ${missing.join(", ")}`);
  }
  return best.id;
}

/** Pulls just the rendered <main> out of a prerendered body. */
function sliceMain(body) {
  const m = body.match(/<main[^>]*id="main"[^>]*>([\s\S]*?)<\/main>/i);
  return m ? m[1].trim() : "";
}

function buildLeaflet(p, products) {
  const product = p.json;
  const payload = { code: p.code, data: product.data, plates: product.plates, flags: product.flags || {}, ui };
  const shellHtml = fill(shellTpl, {
    ASSETS: site.assetsPath,
    SITE_NAME: esc(site.siteName),
    BACK_AR: T("ar", "back"),
    BACK_EN: T("en", "back"),
    BACK_AR_HREF: pageUrl("ar", "products"),
    BACK_EN_HREF: pageUrl("en", "products"),
  });

  const primary = site.defaultLang;
  const secondary = other(primary);
  const rendered = prerender(payload, primary, shellHtml);

  /* The landing view is only the path chooser, and its buttons need JS. So a
     reader with scripting off would otherwise get no leaflet at all — not
     acceptable for safety information. Every path in every language goes into
     <noscript>, generated from the same renderers so it cannot drift. */
  const fallbackPath = pathCoveringAllSections(product.data.paths || []);
  const fallback = [];
  for (const lang of [primary, secondary]) {
    const main = sliceMain(prerender(payload, lang, shellHtml, fallbackPath).body);
    if (main) fallback.push(`<section class="ns" lang="${lang}" dir="${dirOf(lang)}">${main}</section>`);
  }

  const content = `<div class="leaflet" id="content" tabindex="-1">
${rendered.body}
<noscript><div class="container leaflet-body">
${fallback.join("\n")}
</div></noscript>
</div>`;

  const html = page({
    lang: rendered.lang || primary,
    headScript: productHeadScript(p.code),
    title: esc(rendered.title || ui.pageTitle[primary]),
    description: esc(ui.metaDesc ? ui.metaDesc[primary] : ""),
    canonical: `${BASE}/p/${p.code}/`,
    styles: ["leaflet.css", "site.css"],
    bodyAttrs: ` data-code="${esc(p.code)}"`,
    body: productChrome(p, products, content),
    scripts: `<script type="application/json" id="payload">${JSON.stringify(payload).replace(/</g, "\\u003c")}</script>
<script src="${site.assetsPath}/leaflet.js" defer></script>`,
  });
  return writePage(path.join("p", p.code, "index.html"), html);
}

/* ----- profile product (facts, use, how to use) ----- */

function profileContent(lang, p) {
  const d = p.json.data;
  const facts = (d.facts || [])
    .map((f) => `<div class="frow"><dt>${L(lang, f.label)}</dt><dd>${L(lang, f.value)}</dd></div>`)
    .join("");
  const uses = (d.uses || []).map((u) => `<div class="use reveal lift" style="--c:${esc(p.color)}">${L(lang, u)}</div>`).join("\n");
  const steps = (d.steps || [])
    .map(
      (s, i) => `<li class="hstep reveal"><span class="hstep-n" aria-hidden="true">${tx(lang, String(i + 1))}</span><span>${L(lang, s)}</span></li>`
    )
    .join("\n");
  return `<div class="lv-content" data-lv="${lang}" lang="${lang}" dir="${dirOf(lang)}">
${band(lang, L(lang, p.category), `<span lang="en">${esc(p.name.en)}</span>`, true)}
<section class="container prod">
  <div class="prod-media reveal">${media(lang, p, "lg")}</div>
  <div class="prod-info reveal">
    <p class="prod-sum">${L(lang, p.summary)}</p>
    ${p.patients > 0 ? `<div class="pill"><b dir="ltr">${plus(p.patients, lang)}</b><span>${T(lang, "impactTitle")}</span></div>` : ""}
    ${facts ? `<div class="fcard"><h2>${T(lang, "factsTitle")}</h2><dl>${facts}</dl></div>` : ""}
    <div class="btn-row"><a class="btn btn-line btn-lg" href="${pageUrl(lang, "contact")}">${T(lang, "contact")}</a></div>
  </div>
</section>
${d.product.sourceNote ? `<div class="container"><p class="note">${T(lang, "sourceNote")}</p></div>` : ""}
${uses ? `<section class="container sub-sec"><h2 class="h3x reveal">${T(lang, "usesTitle")}</h2><div class="uses">\n${uses}\n</div></section>` : ""}
${steps ? `<section class="container sub-sec"><h2 class="h3x reveal">${T(lang, "stepsTitle")}</h2><ol class="hsteps">\n${steps}\n</ol></section>` : ""}
</div>`;
}

function buildProfile(p, products) {
  const primary = site.defaultLang;
  const title = (l) => `${p.name.en} — ${tx(l, S[l].heroTitle)}`;
  const content = `<main id="content" tabindex="-1">
${LANGS.map((l) => profileContent(l, p)).join("\n")}
</main>`;
  const html = page({
    lang: primary,
    headScript: productHeadScript(p.code),
    title: esc(title(primary)),
    description: L(primary, p.summary),
    canonical: `${BASE}/p/${p.code}/`,
    bodyAttrs: ` data-code="${esc(p.code)}" data-title-ar="${esc(title("ar"))}" data-title-en="${esc(title("en"))}"`,
    body: productChrome(p, products, content),
  });
  return writePage(path.join("p", p.code, "index.html"), html);
}

/* ----- 404 ----- */

function notFound(products) {
  const lang = "en";
  const body = [
    header(lang, "", { altHref: pageUrl("ar", "home") }),
    `<main id="content" tabindex="-1">
${band(lang, `<span lang="ar">${T("ar", "notFoundTitle")}</span>`, T(lang, "notFoundTitle"))}
<section class="container nf">
  <p class="intro">${T(lang, "notFoundText")}</p>
  <div class="btn-row"><a class="btn btn-solid btn-lg" href="/">${T(lang, "home")}</a><a class="btn btn-line btn-lg" href="/products/">${T(lang, "allProducts")}</a><a class="btn btn-line btn-lg" href="/ar/" lang="ar">${T("ar", "home")}</a></div>
</section>
</main>`,
    footer(lang, products),
  ].join("\n");
  return writePage(
    "404.html",
    page({ lang, title: `${T(lang, "notFoundTitle")} — ${T(lang, "heroTitle")}`, description: "", canonical: `${BASE}/`, body })
  );
}

/* ---------- main ---------- */

function main() {
  fs.rmSync(DIST, { recursive: true, force: true });
  fs.mkdirSync(DIST, { recursive: true });
  copyDir(path.join(SRC, "assets"), path.join(DIST, "assets"));

  const products = loadProducts();
  if (!products.length) {
    console.error("No products found in products/");
    process.exit(1);
  }

  const report = [];
  for (const p of products) {
    const bytes = p.type === "profile" ? buildProfile(p, products) : buildLeaflet(p, products);
    report.push(`  /p/${p.code}/  ${p.type.padEnd(7)} ${(bytes / 1024).toFixed(0)} KB${p.image ? "" : "  (no pack photo yet)"}`);
  }
  let pages = 0;
  for (const lang of LANGS) for (const key of PAGES) {
    companyPage(lang, key, products);
    pages++;
  }
  notFound(products);

  console.log(`Built ${pages} company page(s) and ${products.length} product page(s) -> dist/`);
  report.forEach((r) => console.log(r));
  console.log(`  shared assets: ${(dirSize(path.join(DIST, "assets")) / 1024).toFixed(0)} KB`);
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
