#!/usr/bin/env python3
"""Write the format-pair family: 6 pair pages, 1 spelling alias, and the rows
they own in the converter's hub list and in sitemap.xml.

    python3 tools/build_convert_pages.py           # write everything
    python3 tools/build_convert_pages.py --check   # exit 1 if anything is stale
    python3 tools/sync_nav.py                      # then fill the chip regions

Stdlib only, no build step at deploy time. This is `tools/build_size_pages.py`
with a different parameter: the same lift-the-chrome-from-the-tool's-own-page
approach, the same `<slug>.html` plus `<slug>/index.html` pair, the same
hands-back-the-synced-regions dance so the two generators compose instead of
overwriting each other.

The split is the same too, for the same reason. The pairs live in
`nav_data.CONVERT_PAIRS`; the prose lives in `tools/convert_pages_copy.py` and
is written by hand, because six pages of interpolated boilerplate is scaled
content and reads like it.

The seed is two body attributes, `data-convert-from` and `data-convert-to`,
read by `convertTool()` in assets/js/app.js. `data-convert-to` does double
duty: it sets the initial target format AND gates the dropzone's auto-guess,
which otherwise rewrote the format select on every drop and would have made
/png-to-webp flip itself to JPEG in the one interaction the page exists for.
"""

import argparse
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import nav_data as D  # noqa: E402
import sync_sitemap  # noqa: E402 — one function works out a page date
from convert_pages_copy import ALIAS_COPY, COPY  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://photoshrink.net"
TEMPLATE = ROOT / "convert-image.html"


def esc(text):
    return (
        str(text).replace("&", "&amp;").replace("<", "&lt;")
        .replace(">", "&gt;").replace('"', "&quot;")
    )


def strip_tags(text):
    """Prose -> the plain sentence a JSON-LD field wants.

    The copy carries real markup, because an answer that cannot contain a link
    is a worse answer. Schema.org wants the same sentence without it.
    """
    return re.sub(r"<[^>]+>", "", str(text))


def chrome():
    """The shared slabs, lifted from convert-image.html so they cannot drift."""
    src = TEMPLATE.read_text(encoding="utf-8")
    header = src.split("<body", 1)[1].split(">", 1)[1].split("<!-- nav:start -->", 1)[0]
    panel = re.search(r'  <section id="panel-convert".*?\n  </section>\n', src, re.S).group(0)
    # The chip row is rendered by sync_nav, so it is emitted as a bare marker
    # pair and filled by that pass rather than copied in whatever state this
    # file happened to be checked out in.
    panel = re.sub(r"<!-- formatchips:start -->.*?<!-- formatchips:end -->",
                   "<!-- formatchips:start --><!-- formatchips:end -->", panel, flags=re.S)
    footer = src.split("</main>", 1)[1]
    return header, panel, footer


HEADER, PANEL, FOOTER = chrome()

BY_SLUG = {p["slug"]: p for p in D.CONVERT_PAIRS}


def head_block(title, description, url, canonical, ld_blocks, body_attrs):
    scripts = "\n".join(
        '<script type="application/ld+json">\n%s\n</script>' % b for b in ld_blocks
    )
    return """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="manifest" href="/manifest.webmanifest">
<script>(function(){try{var t=localStorage.getItem("psk-theme");if(t)document.documentElement.setAttribute("data-theme",t);}catch(e){}})();</script>
<title>%(title)s</title>
<meta name="description" content="%(description)s">
<link rel="canonical" href="%(canonical)s">
<meta name="theme-color" content="#fbf6ee">

<meta property="og:type" content="website">
<meta property="og:title" content="%(ogtitle)s">
<meta property="og:description" content="%(description)s">
<meta property="og:url" content="%(url)s">
<meta property="og:image" content="%(site)s/assets/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="%(ogtitle)s">
<meta name="twitter:description" content="%(description)s">

<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/css/styles.css">

%(ld)s

<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7560786263587509" crossorigin="anonymous"></script>
<!-- schema:start --><!-- schema:end -->
</head>
<body %(attrs)s>
""" % {
        "title": esc(title),
        "description": esc(description),
        "url": url,
        "canonical": canonical,
        "site": SITE,
        "ogtitle": esc(title.split(" | ")[0]),
        "ld": scripts,
        "attrs": body_attrs,
    }


def app_ld(name, url, description):
    return """{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "%s",
  "url": "%s",
  "applicationCategory": "MultimediaApplication",
  "operatingSystem": "Any",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "description": "%s"
}""" % (esc(name), url, esc(description))


def faq_ld(faq):
    rows = ",\n    ".join(
        '{"@type": "Question", "name": "%s", "acceptedAnswer": {"@type": "Answer", "text": "%s"}}'
        % (esc(strip_tags(q)), esc(strip_tags(a))) for q, a in faq
    )
    return """{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    %s
  ]
}""" % rows


def facts_rows(pair, copy):
    rows = [
        ("Converts", "%s to %s" % (pair["src_label"], pair["dst_label"])),
    ]
    rows.extend(copy.get("facts", []))
    rows.append(("Where it runs", "Entirely in your browser — the file is never uploaded"))
    return rows


def related_links(copy):
    out = []
    for slug in copy.get("related", []):
        other = BY_SLUG[slug]
        out.append('      <li><a href="/%s">%s to %s</a> — %s</li>'
                   % (slug, esc(other["src_label"]), esc(other["dst_label"]), esc(other["note"])))
    return "\n".join(out)


def pair_page(pair):
    slug = pair["slug"]
    copy = COPY[slug]
    src, dst = pair["src_label"], pair["dst_label"]
    url = "%s/%s" % (SITE, slug)
    title = "%s to %s Converter — Free, No Upload | PhotoShrink" % (src, dst)
    description = ("Convert %s to %s in your browser. The converter below opens with %s already "
                   "selected, nothing is uploaded, and batches of files work too."
                   % (src, dst, dst))
    heading, paragraphs = copy["why"]

    facts = "\n".join("      <li><strong>%s:</strong> %s</li>" % (esc(k), esc(v))
                      for k, v in facts_rows(pair, copy))
    prose = "\n".join("    <p>%s</p>" % para for para in paragraphs)
    faqs = "\n".join(
        '    <div class="faq-item">\n      <h3>%s</h3>\n      <p>%s</p>\n    </div>' % (esc(q), a)
        for q, a in copy["faq"]
    )

    head = head_block(
        title, description, url, url,
        [app_ld("%s to %s Converter" % (src, dst), url, description), faq_ld(copy["faq"])],
        'data-convert-from="%s" data-convert-to="%s"' % (pair["src"], pair["dst"]),
    )

    return """%(head)s%(header)s<!-- nav:start --><!-- nav:end -->

<main id="main">
  <div class="hero">
    <span class="eyebrow">100%% client-side &middot; nothing uploaded</span>
    <h1>Convert <span class="hl">%(src)s to %(dst)s</span></h1>
    <p class="sub">%(lede)s</p>
    <div class="trust-banner">
      <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      Your images never leave your browser
    </div>
  </div>

%(panel)s
  <section class="container-narrow" style="padding-top:44px;">
    <h2 style="margin-top:0;">%(src)s to %(dst)s at a glance</h2>
    <ul>
%(facts)s
    </ul>

    <h2>%(heading)s</h2>
%(prose)s

    <h2>How to convert %(src)s to %(dst)s</h2>
    <ol>
      <li>Drop your %(src)s on the panel above &mdash; or paste it, or drop several at once to do a batch.</li>
      <li>The output format is already set to %(dst)s, and it stays set: dropping a file does not change it back.</li>
      <li>%(quality)s</li>
      <li>Download the %(dst)s, or run the batch and take a ZIP of the lot.</li>
      <li>Nothing was uploaded at any point &mdash; the conversion ran on your own machine, in this tab.</li>
    </ol>

    <h2>Questions</h2>
%(faqs)s

    <h2>Other conversions</h2>
    <ul>
%(related)s
      <li><a href="/convert-image">Convert to any format</a> &mdash; the full converter, with every pair.</li>
      <li><a href="/articles/jpeg-vs-png-vs-webp.html">JPEG vs PNG vs WebP</a> &mdash; which format to reach for, and why.</li>
    </ul>
  </section>
  </main>
%(footer)s""" % {
        "head": head, "header": HEADER, "panel": PANEL, "src": esc(src), "dst": esc(dst),
        "lede": copy["lede"], "facts": facts, "heading": esc(heading), "prose": prose,
        "faqs": faqs, "related": related_links(copy), "footer": FOOTER,
        "quality": ("Set the quality slider &mdash; 85 to 90 keeps the result visually identical."
                    if pair["dst"] in ("jpeg", "webp")
                    else "There is no quality setting: PNG is lossless, so there is nothing to trade."),
    }


def alias_page(alias):
    slug = alias["slug"]
    target = BY_SLUG[alias["canonical"]]
    copy = ALIAS_COPY[slug]
    url = "%s/%s" % (SITE, slug)
    canonical = "%s/%s" % (SITE, alias["canonical"])
    src, dst = target["src_label"], target["dst_label"]
    title = "JPEG to PNG Converter — Free, No Upload | PhotoShrink"
    description = ("Convert JPEG to PNG in your browser. JPEG and JPG are the same format, so "
                   "this is the same conversion as %s to %s — lossless from here on, "
                   "and a larger file." % (src, dst))

    head = head_block(
        title, description, url, canonical,
        [app_ld("JPEG to PNG Converter", canonical, description)],
        'data-convert-from="%s" data-convert-to="%s"' % (target["src"], target["dst"]),
    )
    prose = "\n".join("    <p>%s</p>" % para for para in copy["body"])

    return """%(head)s%(header)s<!-- nav:start --><!-- nav:end -->

<main id="main">
  <div class="hero">
    <span class="eyebrow">100%% client-side &middot; nothing uploaded</span>
    <h1>Convert <span class="hl">JPEG to PNG</span></h1>
    <p class="sub">%(lede)s</p>
    <div class="trust-banner">
      <svg class="lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
      Your images never leave your browser
    </div>
  </div>

%(panel)s
  <section class="container-narrow" style="padding-top:44px;">
    <h2 style="margin-top:0;">JPEG and JPG are the same format</h2>
%(prose)s

    <h2>Other conversions</h2>
    <ul>
      <li><a href="/jpg-to-png">JPG to PNG</a> &mdash; the full version of this page.</li>
      <li><a href="/png-to-jpg">PNG to JPG</a> &mdash; the other direction, and the white-background question.</li>
      <li><a href="/convert-image">Convert to any format</a> &mdash; the full converter, with every pair.</li>
    </ul>
  </section>
  </main>
%(footer)s""" % {
        "head": head, "header": HEADER, "panel": PANEL,
        "lede": copy["lede"], "prose": prose, "footer": FOOTER,
    }


def convert_list_rows():
    """The hub list on /convert-image, so the sheet's "All 6 format pairs"
    link lands on a page that really does name all six."""
    rows = ["    <ul>"]
    for p in D.CONVERT_PAIRS:
        rows.append('      <li><a href="/%s">%s to %s</a> — %s</li>'
                    % (p["slug"], esc(p["src_label"]), esc(p["dst_label"]), esc(p["note"])))
    rows.append("    </ul>")
    return "\n".join(rows)


def sitemap_rows():
    """Pairs only. The spelling aliases carry rel=canonical to a pair, and a
    canonicalised duplicate has no business asking to be crawled as a page in
    its own right."""
    rows = []
    for p in D.CONVERT_PAIRS:
        rows.append("  <url>\n    <loc>%s/%s</loc>\n    <changefreq>monthly</changefreq>\n"
                    "    <lastmod>%s</lastmod>\n    <priority>0.7</priority>\n  </url>"
                    % (SITE, p["slug"], sync_sitemap.last_changed(ROOT / (p["slug"] + ".html"))))
    return "\n".join(rows)


def region_sub(text, name, body, opener, closer):
    pattern = re.compile(re.escape(opener) + r".*?" + re.escape(closer), re.S)
    if not pattern.search(text):
        raise SystemExit("missing %s region" % name)
    return pattern.sub(lambda m: opener + "\n" + body + "\n" + closer, text, count=1)


# Regions inside a page that sync_nav.py owns. Emitted as bare marker pairs and
# handed straight back to whatever is already on disk, so the two generators
# compose and --check stays quiet after a sync_nav pass.
SYNC_REGIONS = ("nav", "formatchips", "peers", "schema")


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
    files = {}
    pages = [(p["slug"], pair_page(p)) for p in D.CONVERT_PAIRS]
    pages += [(a["slug"], alias_page(a)) for a in D.CONVERT_ALIASES]
    for slug, html in pages:
        for path in (ROOT / (slug + ".html"), ROOT / slug / "index.html"):
            files[path] = (keep_synced_regions(html, path.read_text(encoding="utf-8"))
                           if path.exists() else html)

    convert = ROOT / "convert-image.html"
    files[convert] = region_sub(convert.read_text(encoding="utf-8"), "convertlist",
                                convert_list_rows(),
                                "<!-- convertlist:start -->", "<!-- convertlist:end -->")

    sm = ROOT / "sitemap.xml"
    files[sm] = region_sub(sm.read_text(encoding="utf-8"), "convertpages",
                           sitemap_rows(),
                           "<!-- convertpages:start -->", "<!-- convertpages:end -->")
    return files


def main():
    ap = argparse.ArgumentParser(description="Write the format-pair pages.")
    ap.add_argument("--check", action="store_true", help="exit 1 if any output is stale")
    args = ap.parse_args()

    missing = [p["slug"] for p in D.CONVERT_PAIRS if p["slug"] not in COPY]
    if missing:
        raise SystemExit("tools/convert_pages_copy.py has no entry for: " + ", ".join(missing))
    for a in D.CONVERT_ALIASES:
        if a["canonical"] not in BY_SLUG:
            raise SystemExit("alias %s points at a slug that is not a pair" % a["slug"])
        if a["slug"] not in ALIAS_COPY:
            raise SystemExit("no ALIAS_COPY entry for " + a["slug"])

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
        print("convert pages are current")
        return 0

    print("wrote %d file(s)" % len(written))
    for name in written:
        print("  " + name)
    print("now run: python3 tools/sync_nav.py")
    return 0


if __name__ == "__main__":
    sys.exit(main())
