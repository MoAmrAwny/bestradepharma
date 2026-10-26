#!/usr/bin/env python3
"""
Generates print-ready QR codes for every product in products/.

Two things worth understanding before you run this:

1. QR encoding is a frozen ISO standard (ISO/IEC 18004). This script has no
   account, no server, no expiry. Any correct generator given the same URL
   produces the same code. Nothing here needs to stay alive for the code to
   keep scanning in 2046.

2. The code encodes a STABLE IDENTIFIER, not a destination:
       https://<your-domain>/p/<code>
   Where that URL sends a reader is decided by DNS and by your redirect rules,
   both of which you can change at any time without reprinting a single box.
   Never encode a hosting provider's domain (github.io, a QR service's short
   link). That is the one mistake that cannot be undone after printing.

Output per product:
    qr/<code>.svg        vector, for the printer. Use this one.
    qr/<code>.png        1000px raster, for proofs and digital use.
    qr/manifest.json     what was generated, from which URL, with a checksum.

Usage:
    python3 tools/make_qr.py                 # uses baseUrl from site.config.json
    python3 tools/make_qr.py --base https://example.com
"""

import argparse
import hashlib
import json
import pathlib
import sys

try:
    import segno
except ImportError:
    sys.exit("Missing dependency. Run: pip install segno")

ROOT = pathlib.Path(__file__).resolve().parent.parent

# Error correction H recovers ~30% of the symbol. Boxes get scuffed, printed on
# curved surfaces, and handled in pharmacies; M is the common default and is not
# enough for something you cannot reissue.
ERROR_CORRECTION = "h"

# Quiet zone in modules. The spec requires 4; printers routinely crop. 4 is the
# minimum, and the border must stay white, not the box's background colour.
QUIET_ZONE = 4


def load_config():
    cfg_path = ROOT / "site.config.json"
    if not cfg_path.exists():
        sys.exit("site.config.json not found")
    return json.loads(cfg_path.read_text(encoding="utf-8"))


def product_codes():
    d = ROOT / "products"
    codes = sorted(p.stem for p in d.glob("*.json"))
    if not codes:
        sys.exit("No products found in products/")
    return codes


def main():
    cfg = load_config()
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--base", default=cfg.get("baseUrl", ""),
                    help="Base URL. Must be the domain you own.")
    ap.add_argument("--out", default=str(ROOT / "qr"), help="Output directory")
    args = ap.parse_args()

    base = args.base.rstrip("/")
    if not base:
        sys.exit("No base URL. Set baseUrl in site.config.json or pass --base.")

    if "github.io" in base or "pages.dev" in base or "netlify.app" in base:
        sys.exit(
            f"\nRefusing to generate.\n\n"
            f"  {base}\n\n"
            f"That is a hosting provider's domain, not yours. A QR code printed\n"
            f"against it dies the day you change host or they change policy, and\n"
            f"printed boxes cannot be recalled. Buy a domain first, then run this\n"
            f"again with --base https://your-domain.com\n"
        )

    if not base.startswith("https://"):
        sys.exit(f"Base URL must be https:// — got {base}")

    out = pathlib.Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    manifest = []
    print(f"Base URL: {base}\n")

    for code in product_codes():
        url = f"{base}/p/{code}"
        qr = segno.make(url, error=ERROR_CORRECTION)

        svg = out / f"{code}.svg"
        png = out / f"{code}.png"
        qr.save(str(svg), kind="svg", border=QUIET_ZONE, scale=10,
                dark="#000000", light="#ffffff")
        qr.save(str(png), kind="png", border=QUIET_ZONE, scale=20,
                dark="#000000", light="#ffffff")

        entry = {
            "code": code,
            "url": url,
            "version": qr.version,
            "error_correction": ERROR_CORRECTION.upper(),
            "modules": qr.symbol_size(border=0)[0],
            "url_sha256": hashlib.sha256(url.encode()).hexdigest(),
        }
        manifest.append(entry)

        # Minimum printed size: each module should be at least 0.4 mm for a
        # reliable phone scan on a matte carton. Below that, scan rates fall off
        # fast under pharmacy lighting.
        modules = entry["modules"] + 2 * QUIET_ZONE
        min_mm = round(modules * 0.4, 1)
        print(f"  {code:20s} v{qr.version:<3d} {modules}x{modules} modules  "
              f"min print size ~{min_mm}mm square")
        print(f"  {'':20s} {url}")

    (out / "manifest.json").write_text(
        json.dumps({"base": base, "codes": manifest}, indent=2) + "\n",
        encoding="utf-8")

    print(f"\nWrote {len(manifest)} code(s) to {out}/")
    print("\nBefore sending to the printer:")
    print("  1. Print one at final size on the actual carton stock.")
    print("  2. Scan it with a cheap Android phone, in a pharmacy, not at a desk.")
    print("  3. Scan it again after creasing and scuffing the box.")
    print("  4. Confirm the URL opens the right leaflet, not a redirect chain.")


if __name__ == "__main__":
    main()
