# The redirect layer

This is the part that makes printed QR codes re-pointable. Read it before
printing anything.

## What is actually permanent

A QR code is a frozen ISO/IEC 18004 symbol. Once printed, the text it encodes
can never change. What *can* change is what that text resolves to.

```
  PRINTED, FOREVER         →  https://your-domain.com/p/yucebii
  Changeable, any time     →  DNS record      (which host serves it)
  Changeable, any time     →  redirect rule   (send it somewhere else entirely)
  Changeable, any time     →  the page itself (content, design, language)
```

So the only irreversible decision is the domain. Everything below it is a
configuration change you can make in minutes, for the next fifteen years.

## Use 302, never 301

A `301 Moved Permanently` is cached aggressively by browsers — on some mobile
browsers effectively forever, surviving a cache clear. Redirect a printed code
with a 301 and you may never be able to redirect it again for anyone who
already scanned it. You will have bricked that code without knowing.

Every redirect on a printed code is **temporary, forever**: use `302`.

## Cloudflare (recommended)

Put the domain's DNS on Cloudflare (free). Redirect rules live at the edge, so
they work even when the origin host is down — which is one of the situations
you would want to redirect out of in the first place.

Rules → Redirect Rules → Create rule:

| Field | Value |
|---|---|
| When incoming requests match | `URI Path equals /p/yucebii` |
| Then | Dynamic redirect |
| Type | **302 (Temporary)** |
| Target | `https://wherever-it-lives-now.com/products/4471` |
| Preserve query string | on |

Delete the rule and the code falls back to serving the page from this repo.
Nothing is lost either way.

## Netlify / Cloudflare Pages `_redirects`

If you prefer the redirect in the repo rather than the dashboard, drop a
`_redirects` file into `dist/` at build time. Format:

```
/p/yucebii   https://wherever-it-lives-now.com/products/4471   302
```

Note this only works while that host is the one serving the domain. The
Cloudflare rule above survives a host change; this file does not.

## GitHub Pages

GitHub Pages cannot send real HTTP redirects. The only option is a
`<meta http-equiv="refresh">` page, which costs an extra page load and fails
when Pages itself is down. If you expect to re-point codes, put Cloudflare in
front of the domain and keep GitHub Pages purely as an origin.

## The rule for new products

Each product gets an opaque code that means nothing: `/p/4471`, not
`/p/panadol-extra-500mg`. Brand names change, strengths change, products get
relicensed to other companies. The printed code should name a *slot*, and the
redirect layer decides what currently fills it.

`products/<code>.json` is the slot. Keep the filename forever, even if the
product is renamed.
