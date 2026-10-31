# Product leaflets

Static leaflet pages for pharmaceutical and supplement products, reached by a
QR code printed on the box.

A printed QR code cannot be changed. Everything in this repo is arranged around
that single fact: the code encodes a stable URL on a domain you own, and every
other layer — host, redirect, page content — stays swappable without
reprinting. See [`redirects/README.md`](redirects/README.md) for how that works
in practice.

## Layout

```
site.config.json        domain, site name, default language
products/<code>.json    ONE file per product. The only thing you write per product.
src/ui.json             interface labels (ar/en). Shared by every product.
src/template.html       page skeleton
src/shell.html          the DOM the renderers fill
src/assets/leaflet.js   the section renderers — single source of truth for markup
src/assets/leaflet.css  styles
src/assets/fonts/       Amiri + IBM Plex Sans Arabic, split by unicode-range
src/assets/plates/      ingredient images (WebP)
build.js                prerenders every product to dist/
tools/make_qr.py        print-ready QR codes
dist/                   build output. Deploy this. Not committed.
qr/                     generated QR codes. Not committed.
```

## Build

```bash
npm install
node build.js
```

Output lands in `dist/`, with each product at `dist/p/<code>/index.html`.
Serve it locally with any static server:

```bash
npx serve dist
```

## Adding a product

1. Copy `products/yucebii.json` to `products/<new-code>.json`.
2. Replace the contents of `data`. Everything else — labels, fonts, renderers,
   styles — is shared and needs no change.
3. Add any new ingredient images to `src/assets/plates/` and point `plates` at
   them.
4. `node build.js`
5. `python3 tools/make_qr.py`

Pick `<new-code>` once and never change it. It becomes part of a printed URL.

See [`products/SCHEMA.md`](products/SCHEMA.md) for the fields.

## How the prerendering works

The renderers in `src/assets/leaflet.js` run twice: once here at build time
under jsdom, producing finished HTML, and again in the browser for language
switching and the interactive sections. There is no second hand-written copy of
the leaflet, so the static version cannot drift from the data.

With JavaScript disabled the landing view would only show the path chooser,
whose buttons need JS — not acceptable for safety information. So the build
also renders the full leaflet, in both languages, into a `<noscript>` block.
That block is generated from the same data as everything else.

## Weight

Measured on the Yucebii page:

| | uncompressed | over the wire (gzip) |
|---|---|---|
| Product page | 82 KB | ~20 KB |
| CSS | 17 KB | ~3 KB |
| JS | 17 KB | ~4 KB |
| Fonts (8 files, unicode-range split) | 169 KB | already compressed |
| Ingredient images (6 WebP) | 187 KB | already compressed |

Fonts, CSS and JS are shared across every product and cached after the first
scan. A second product costs roughly 20 KB over the wire plus its own images.

The original single-file version was 719 KB for one product, with nothing
cacheable between products.

## Deploying

The repo builds and deploys to GitHub Pages via
`.github/workflows/deploy.yml` on every push to `main`.

Cloudflare Pages works from the same repo with no changes — build command
`node build.js`, output directory `dist`. Moving between the two is a DNS
change; the printed codes do not know or care which one is serving.

Note that GitHub's own documentation says Pages is not intended for commercial
business hosting. In practice nothing happens to a site this small, but it is a
term you would be operating against, and Cloudflare Pages has no equivalent
restriction. Either way the domain is what keeps the codes alive.

## Before the first print run

- [ ] Confirm the company (not an agency or former contractor) controls the
      `bestradepharma.com` registration. Enable auto-renew and registrar lock.
- [ ] Point a subdomain (e.g. `qr.bestradepharma.com`) at GitHub Pages with a
      CNAME record, and set it in repo Settings → Pages → Custom domain.
- [ ] Set `baseUrl` in `site.config.json` to that subdomain.
- [ ] Generate codes, print one at final size on real carton stock, and scan it
      with a cheap phone — creased, scuffed, under pharmacy lighting.
- [ ] Have regulatory affairs confirm the leaflet content and the QR placement
      against EDA requirements before anything goes to press.
