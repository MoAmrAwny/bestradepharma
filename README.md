# bestradepharma.com

The company website for Bestrade Pharma, in English and Arabic, and the product
pages that the QR codes on the boxes open. Plain static HTML built by one Node
script; no framework, no server.

A printed QR code cannot be changed. The product pages are arranged around that
fact: each code encodes `https://bestradepharma.com/p/<code>/`, and every other
layer (host, redirect, page content) stays swappable without reprinting. See
[`redirects/README.md`](redirects/README.md) for how that works in practice.

## Pages

| Page | English | Arabic |
|---|---|---|
| Home | `/` | `/ar/` |
| Products | `/products/` | `/ar/products/` |
| About | `/about/` | `/ar/about/` |
| Contact | `/contact/` | `/ar/contact/` |
| Product | `/p/<code>/` | same URL |

Company pages are separate files per language; the header link switches to the
same page in the other language.

Product pages keep **one URL** with a language switch in the header. They open
in Arabic (`defaultLang` in `site.config.json`) unless the reader picked
English before or the link carries `?lang=en`. The company pages link to
products with `?lang=` so an English visitor stays in English. A scanned QR
code carries no `?lang` and behaves as it always has.

**Never rename a file in `products/`.** Its name is the `<code>` in a printed URL.
Current codes: `renehavis`, `sportvis`, `trud`, `ricogenex`, `cuidado`, `yucebii`.

## Layout

```
site.config.json        domain, contact form, Tag Manager, WhatsApp number
products/<code>.json    ONE file per product
src/site.json           text of the company pages, header and footer (ar/en)
src/ui.json             labels of the interactive leaflet (ar/en)
src/template.html       page skeleton shared by every page
src/shell.html          the DOM the leaflet renderers fill
src/assets/site.css     site styles (header, footer, company pages, profiles)
src/assets/site.js      motion and the product-page language switch
src/assets/leaflet.js   leaflet renderers: single source of truth for leaflet markup
src/assets/leaflet.css  leaflet styles
src/assets/img/         photos: hero-cairo.jpg, <code>.png pack cut-outs
src/assets/fonts/       Amiri + IBM Plex Sans Arabic, split by unicode-range
src/assets/plates/      leaflet ingredient images (WebP)
build.js                builds everything into dist/
tools/make_qr.py        print-ready QR codes
dist/                   build output. Deploy this. Not committed.
```

## Build and preview

```bash
npm install
node build.js
npx serve dist
```

The build lists every product page it wrote and flags the ones still missing a
pack photo.

## Editing text

- Company pages, header, footer, phone numbers, address, timeline: `src/site.json`.
  Write digits as 0–9; Arabic pages get Arabic-Indic digits automatically.
- A product's text: its `products/<code>.json`. Product and medical text comes
  only from the approved leaflet. Never write new medical claims here.

## Adding or editing a product

There are two kinds of product page, chosen by `"type"` in the file.

**`"type": "profile"`**: a short page with facts, use and how to use. Copy
`products/ricogenex.json` and fill in:

| Field | Notes |
|---|---|
| `data.product.name` | `{ "ar": ..., "en": ... }`. Cards show the English name. |
| `data.product.category` | One short line, e.g. "Food supplement · sachets" |
| `data.product.summary` | One or two sentences for the card and the page |
| `data.product.group` | `device` or `supplement`: which list it appears in |
| `data.product.order` | Position in the lists, 1 first |
| `data.product.color` | Accent for the placeholder pack until a photo exists |
| `data.product.patients` | Patients treated in Egypt. 0 hides the number. |
| `data.product.sourceNote` | `true` shows "to be replaced by the approved leaflet" |
| `data.facts[]` | `{ "label": {ar,en}, "value": {ar,en} }` |
| `data.uses[]` | `{ar,en}` per indication. Optional. |
| `data.steps[]` | `{ar,en}` per step. Optional. |

**No `type` (or `"type": "leaflet"`)**: the full interactive leaflet with reader
paths, ingredient cards, evidence and safety checks, as for `yucebii`. Fields
are described in [`products/SCHEMA.md`](products/SCHEMA.md). For the product
lists it also uses `cardCategory`, `summary`, `group`, `order` and `color`.

When a product's approved leaflet arrives, replace the profile text with the
approved text and set `sourceNote` to `false` (or move it to the full leaflet
type).

Then:

1. Pack photo: save a transparent cut-out as `src/assets/img/<code>.png`
   (or `.webp`/`.jpg`). The build picks it up; until then a labelled placeholder
   shows. Use a real photo of the actual pack, never a generated mock-up.
2. `node build.js`
3. New product only: `python3 tools/make_qr.py` for its QR code.

The hero photo is `src/assets/img/hero-cairo.jpg` (wide, at least 2400 px).

## Contact form, WhatsApp and tracking

In `site.config.json`:

- `contactFormEndpoint`: a Formspree (or similar) form URL. While empty, the
  contact page shows a WhatsApp button in place of the form.
- `whatsapp`: international number without `+`, used for every WhatsApp link.
- `gtmId`: Google Tag Manager container (`GTM-XXXXXXX`). While empty, no
  tracking code is added. GA4 and the Meta Pixel are configured inside Tag
  Manager, not here.

## Deploying (Cloudflare Pages)

1. Cloudflare dashboard → Workers & Pages → Create → Pages → Connect to Git →
   pick this repository.
2. Build command `node build.js`, build output directory `dist`, production
   branch `main`. Node version comes from `.node-version`.
3. Every push to `main` deploys; every other branch gets a preview at
   `<branch>.<project>.pages.dev`. Test there first.
4. Going live: in the Pages project → Custom domains, add `bestradepharma.com`
   and `www.bestradepharma.com` (DNS must already be on Cloudflare). To undo,
   remove the custom domains.

`dist/404.html` is served for unknown URLs.

## How the leaflet prerendering works

The renderers in `src/assets/leaflet.js` run twice: once at build time under
jsdom, producing finished HTML, and again in the browser for language switching
and the interactive sections. There is no second hand-written copy of the
leaflet, so the static version cannot drift from the data.

With JavaScript disabled the landing view would only show the path chooser,
whose buttons need JS, which is not acceptable for safety information. So the
build also renders the full leaflet, in both languages, into a `<noscript>`
block generated from the same data. Profile pages show both languages one after
the other when JavaScript is off.

## Motion

`src/assets/site.js` adds the fade-up on scroll, the patient count-up and the
header shadow. All motion is off under `prefers-reduced-motion`, and the HTML
always holds the final numbers, so nothing depends on the script.

## Before the first print run

- [ ] Confirm the company controls the `bestradepharma.com` registration.
      Enable auto-renew and registrar lock.
- [ ] Generate codes, print one at final size on real carton stock, and scan it
      with a cheap phone: creased, scuffed, under pharmacy lighting.
- [ ] Have regulatory affairs confirm the leaflet content and the QR placement
      against EDA requirements before anything goes to press.
