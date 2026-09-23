#!/usr/bin/env python3
"""Write the platform size family: 20 pages, the JS table and the sitemap rows.

    python3 tools/build_size_pages.py     # write everything
    python3 tools/build_size_pages.py --check   # exit 1 if anything is stale
    python3 tools/sync_nav.py             # then fill the nav and chip regions

Stdlib only, no build step at deploy time — this writes the same static files
the repo already ships, in the same style, and the result is committed.

Why a generator here when the rest of the site is hand-written: twenty pages
that differ only in their numbers and their prose are exactly the case where a
hand-kept family drifts. The numbers live once, in nav_data.SIZE_PRESETS, and
are read from there by the chip row, by each page's heading and facts list, by
the seeded body attribute and by the PRESETS table in assets/js/app.js — so a
platform changing its spec is one edit and one command.

The prose is *not* generated. tools/size_pages_copy.py carries per-platform
copy written by hand, because twenty pages of interpolated boilerplate is
scaled content and reads like it.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nav_data as D  # noqa: E402
import sync_sitemap  # noqa: E402 — one function works out a page date
from size_pages_copy import COPY  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://photoshrink.net"
TEMPLATE = ROOT / "resize-image.html"


def esc(text):
    return (
        str(text).replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace('"', "&quot;")
    )


def ratio_label(w, h):
    """1280×720 -> "16:9". Anything that will not reduce to small whole terms
    is written as a decimal, because "851:315" is true and useless."""
    a, b = w, h
    while b:
        a, b = b, a % b
    g = a or 1
    rw, rh = w // g, h // g
    if rw <= 40 and rh <= 40:
        return "%d:%d" % (rw, rh)
    return ("%.2f" % (w / h)).rstrip("0").rstrip(".") + ":1"


def chrome():
    """The shared slabs, lifted from resize-image.html so they cannot drift."""
    src = TEMPLATE.read_text(encoding="utf-8")
    header = src.split("<body", 1)[1].split(">", 1)[1].split("<!-- nav:start -->", 1)[0]
    panel = re.search(r'  <section id="panel-resize".*?\n  </section>\n', src, re.S).group(0)
    # The chip row is rendered by sync_nav, so it is emitted as bare markers
    # and filled by that pass rather than copied in whatever state this file
    # happened to be checked out in.
    panel = re.sub(r"<!-- dimensionchips:start -->.*?<!-- dimensionchips:end -->",
                   "<!-- dimensionchips:start --><!-- dimensionchips:end -->", panel, flags=re.S)
    footer = src.split("</main>", 1)[1]
    return header, panel, footer


HEADER, PANEL, FOOTER = chrome()


def facts_rows(preset, copy):
    rows = [
        ("Pixel size", "%d × %d px" % (preset["width"], preset["height"])),
        ("Aspect ratio", ratio_label(preset["width"], preset["height"])),
    ]
    rows.extend(copy.get("facts", []))
    return rows


def related_links(slug, copy, by_slug):
    out = []
    for other in copy.get("related", []):
        p = by_slug[other]
        out.append('      <li><a href="/%s">%s — %d × %d px</a></li>'
                   % (other, esc(p["label"]), p["width"], p["height"]))
    return "\n".join(out)


def page_html(preset, by_slug):
    slug = preset["slug"]
    copy = COPY[slug]
    label = preset["label"]
    w, h = preset["width"], preset["height"]
    url = "%s/%s" % (SITE, slug)
    ratio = ratio_label(w, h)
    title = "%s Size: %d × %d px — Resize It Free, No Upload | PhotoShrink" % (label, w, h)
    description = ("%s size is %d × %d pixels (%s). Resize any image to it in your browser — "
                   "the tool below opens with the dimensions already set, and nothing is uploaded."
                   % (label, w, h, ratio))
    heading, paragraphs = copy["why"]

    faq_json = ",\n    ".join(
        '{"@type": "Question", "name": "%s", "acceptedAnswer": {"@type": "Answer", "text": "%s"}}'
        % (esc(q), esc(a)) for q, a in copy["faq"]
    )
    facts = "\n".join('      <li><strong>%s:</strong> %s</li>' % (esc(k), esc(v))
                      for k, v in facts_rows(preset, copy))
    prose = "\n".join("    <p>%s</p>" % para for para in paragraphs)
    faqs = "\n".join(
        '    <div class="faq-item">\n      <h3>%s</h3>\n      <p>%s</p>\n    </div>' % (esc(q), a)
        for q, a in copy["faq"]
    )

    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest">
<script>(function(){{try{{var t=localStorage.getItem("psk-theme");if(t)document.documentElement.setAttribute("data-theme",t);}}catch(e){{}}}})();</script>
<title>{title}</title>
<meta name="description" content="{description}">
<link rel="canonical" href="{url}">
<meta name="theme-color" content="#fbf6ee">

<meta property="og:type" content="website">
<meta property="og:title" content="{label} Size: {w} × {h} px">
<meta property="og:description" content="{description}">
<meta property="og:url" content="{url}">
<meta property="og:image" content="{site}/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{label} Size: {w} × {h} px">
<meta name="twitter:description" content="{description}">

<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css">

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "{label} Size — Resize to {w} × {h}",
  "url": "{url}",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any",
  "offers": {{ "@type": "Offer", "price": "0", "priceCurrency": "USD" }},
  "description": "{description}"
}}
</script>
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {faq_json}
  ]
}}
</script>

<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7560786263587509" crossorigin="anonymous"></script>
<!-- schema:start --><!-- schema:end -->
</head>
<body data-resize-size="{w}x{h}">
{header}<!-- nav:start --><!-- nav:end -->

<main id="main">
  <div class="hero">
    <span class="eyebrow">100% client-side · nothing uploaded</span>
    <h1>{label} size: <span class="hl">{w} × {h} px</span></h1>
    <p class="sub">{lede}</p>
    <div class="trust-banner">
      <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      Your images never leave your browser
    </div>
  </div>

{panel}
  <section class="container-narrow" style="padding-top:44px;">
    <h2 style="margin-top:0;">{label} size at a glance</h2>
    <ul>
{facts}
    </ul>

    <h2>{heading}</h2>
{prose}

    <h2>How to resize an image to {w} × {h}</h2>
    <ol>
      <li>Drop your image on the panel above — or paste it, or drop several at once to do a batch.</li>
      <li>The width and height are already set to {w} × {h}, and the aspect lock is off so both numbers are honoured exactly.</li>
      <li>If your source is a different shape, <a href="/crop-image">crop it to {ratio} first</a> — resizing a different ratio straight to these numbers stretches it.</li>
      <li>Pick an output format. JPEG for photographs, PNG for flat colour, text and anything needing transparency.</li>
      <li>Download. Nothing was uploaded at any point — the resize ran on your own machine, in this tab.</li>
    </ol>

    <h2>Questions</h2>
{faqs}

    <h2>Related sizes</h2>
    <ul>
{related}
      <li><a href="/resize-image">Resize to any size</a> — the full resizer, with every platform preset.</li>
      <li><a href="/compress-image">Compress an image</a> — when the file is too big rather than the wrong shape.</li>
    </ul>
  </section>
  </main>
{footer}""".format(
        title=esc(title), description=esc(description), url=url, label=esc(label),
        w=w, h=h, ratio=ratio, lede=copy["lede"], faq_json=faq_json, header=HEADER,
        panel=PANEL, facts=facts, heading=esc(heading), prose=prose, faqs=faqs,
        related=related_links(slug, copy, by_slug), footer=FOOTER, site=SITE,
    )


def js_table():
    """The PRESETS literal that assets/js/app.js carries between markers."""
    lines = ["const PRESETS = ["]
    for p in D.SIZE_PRESETS:
        lines.append('  { slug: "%s", label: "%s", width: %d, height: %d, note: "%s" },'
                     % (p["slug"], p["label"].replace('"', '\\"'), p["width"], p["height"],
                        p["note"].replace('"', '\\"')))
    lines.append("];")
    return "\n".join(lines)


def size_list_rows():
    """The hub list on /resize-image, so the sheet's "All 20 platform sizes"
    link lands on a page that really does name all twenty."""
    rows = ["    <ul>"]
    for p in D.SIZE_PRESETS:
        rows.append('      <li><a href="/%s">%s size</a> — %d × %d px. %s</li>'
                    % (p["slug"], esc(p["label"]), p["width"], p["height"], esc(p["note"])))
    rows.append("    </ul>")
    return "\n".join(rows)


def sitemap_rows():
    rows = []
    for p in D.SIZE_PRESETS:
        rows.append("  <url>\n    <loc>%s/%s</loc>\n    <changefreq>monthly</changefreq>\n"
                    "    <lastmod>%s</lastmod>\n    <priority>0.7</priority>\n  </url>"
                    % (SITE, p["slug"], sync_sitemap.last_changed(ROOT / (p["slug"] + ".html"))))
    return "\n".join(rows)


def region_sub(text, name, body, opener, closer):
    pattern = re.compile(re.escape(opener) + r".*?" + re.escape(closer), re.S)
    if not pattern.search(text):
        raise SystemExit("missing %s region" % name)
    return pattern.sub(lambda m: opener + "\n" + body + "\n" + closer, text, count=1)


# Regions inside a page that sync_nav.py owns. This script emits them as bare
# marker pairs and hands them straight back to whatever is already on disk, so
# the two generators compose instead of overwriting each other's work — and so
# --check stays quiet after a sync_nav pass.
SYNC_REGIONS = ("nav", "dimensionchips", "peers", "schema")


def keep_synced_regions(new_html, old_html):
    for name in SYNC_REGIONS:
        pattern = re.compile(r"<!-- %s:start -->.*?<!-- %s:end -->" % (name, name), re.S)
        found = pattern.search(old_html)
        if not found:
            continue
        new_html = pattern.sub(lambda m, body=found.group(0): body, new_html, count=1)
    return new_html


def outputs():
    """Every path this script owns, mapped to the bytes it should hold."""
    by_slug = {p["slug"]: p for p in D.SIZE_PRESETS}
    files = {}
    for preset in D.SIZE_PRESETS:
        html = page_html(preset, by_slug)
        for path in (ROOT / (preset["slug"] + ".html"), ROOT / preset["slug"] / "index.html"):
            files[path] = (keep_synced_regions(html, path.read_text(encoding="utf-8"))
                           if path.exists() else html)

    resize = ROOT / "resize-image.html"
    files[resize] = region_sub(resize.read_text(encoding="utf-8"), "sizelist",
                               size_list_rows(), "<!-- sizelist:start -->", "<!-- sizelist:end -->")

    app = ROOT / "assets/js/app.js"
    files[app] = region_sub(app.read_text(encoding="utf-8"), "presets",
                            js_table(), "/* presets:start */", "/* presets:end */")

    sm = ROOT / "sitemap.xml"
    files[sm] = region_sub(sm.read_text(encoding="utf-8"), "sizepages",
                           sitemap_rows(), "<!-- sizepages:start -->", "<!-- sizepages:end -->")
    return files


def main():
    ap = argparse.ArgumentParser(description="Write the platform size pages.")
    ap.add_argument("--check", action="store_true", help="exit 1 if any output is stale")
    args = ap.parse_args()

    stale, written = [], []
    for path, content in outputs().items():
        current = path.read_text(encoding="utf-8") if path.exists() else None
        if current == content:
            continue
        rel = path.relative_to(ROOT).as_posix()
        if args.check:
            stale.append(rel)
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
            written.append(rel)

    if args.check:
        if stale:
            print("stale in %d file(s):" % len(stale))
            for name in stale:
                print("  " + name)
            return 1
        print("size pages are current")
        return 0

    print("wrote %d file(s)" % len(written))
    for name in written:
        print("  " + name)
    print("now run: python3 tools/sync_nav.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
