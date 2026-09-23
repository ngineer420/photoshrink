#!/usr/bin/env python3
"""Put a `<lastmod>` on every `<url>` in sitemap.xml.

Stdlib only.

    python3 tools/sync_sitemap.py          # write the dates
    python3 tools/sync_sitemap.py --check  # exit 1 if a date is stale

`sitemap.xml` is hand-maintained apart from two regions that
`tools/build_size_pages.py` and `tools/build_convert_pages.py` splice into it.
This script touches neither the `<loc>` set nor `<changefreq>` nor
`<priority>`. It only adds or refreshes the `<lastmod>` of each entry, so it is
safe to run after those two generators.

The date is the day of the last commit that touched the file the URL serves,
not the file's mtime. A fresh clone gives every file the same mtime, and a
generator run touches every file it writes whether the content changed or not.
Neither number is the day the page last changed. The commit date is. Where git
is unavailable, the mtime is used instead, which is the only thing left.
"""

import argparse
import re
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITEMAP = ROOT / "sitemap.xml"
SITE = "https://photoshrink.net"


def file_for(url):
    """The file the static server sends for a sitemap URL."""
    path = url[len(SITE):] if url.startswith(SITE) else url
    path = path.split("#")[0].split("?")[0]
    if path in ("", "/"):
        return ROOT / "index.html"
    bare = path.lstrip("/")
    for candidate in (ROOT / bare, ROOT / (bare + ".html"),
                      ROOT / bare / "index.html", ROOT / bare.rstrip("/") / "index.html"):
        if candidate.is_file():
            return candidate
    return None


def _dirty_paths():
    """Every path git reports as changed or untracked, as absolute strings.

    One call for the whole repo, not one per file. A file in this set has not
    been committed in its current state, so its last commit date describes
    bytes that are no longer on disk.
    """
    out = set()
    try:
        result = subprocess.run(["git", "status", "--porcelain", "-z"],
                                cwd=ROOT, capture_output=True, text=True, timeout=20)
        if result.returncode != 0:
            return out
        fields = result.stdout.split("\0")
        i = 0
        while i < len(fields):
            entry = fields[i]
            i += 1
            if len(entry) < 4:
                continue
            status, name = entry[:2], entry[3:]
            # A rename entry is "R  old" followed by the new path in the next
            # field. The new path is the one on disk.
            if "R" in status and i < len(fields):
                name = fields[i]
                i += 1
            out.add(str((ROOT / name).resolve()))
    except Exception:
        pass
    return out


DIRTY = _dirty_paths()
TODAY = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d")


def last_changed(path):
    """The day the file last changed, as YYYY-MM-DD.

    A file that is dirty or untracked changed today, whatever git history
    says. That case is not an edge: the sitemap is written BEFORE the commit
    that carries it, so without this the file's date would be the PREVIOUS
    commit's, and `--check` on a clean `main` would fail the moment the commit
    landed, with every URL moved forward and nothing actually changed.

    Otherwise the date is the day of the last commit that touched the file.
    The mtime is the last resort, and only where git cannot answer at all: a
    `git pull` resets mtimes, so an mtime-based date is stale by design.
    """
    if str(Path(path).resolve()) in DIRTY:
        return TODAY
    try:
        out = subprocess.run(
            ["git", "log", "-1", "--format=%ad", "--date=short", "--", str(path)],
            cwd=ROOT, capture_output=True, text=True, timeout=20)
        date = out.stdout.strip()
        if out.returncode == 0 and re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            return date
    except Exception:
        pass
    stamp = datetime.fromtimestamp(path.stat().st_mtime, tz=timezone.utc)
    return stamp.strftime("%Y-%m-%d")


def rewrite(text):
    missing = []

    def one(match):
        block = match.group(0)
        loc = re.search(r"<loc>\s*([^<\s]+)\s*</loc>", block)
        if not loc:
            return block
        path = file_for(loc.group(1))
        if path is None:
            missing.append(loc.group(1))
            return block
        date = last_changed(path)
        tag = "<lastmod>%s</lastmod>" % date
        if "<lastmod>" in block:
            return re.sub(r"<lastmod>[^<]*</lastmod>", tag, block)
        # Straight after the <loc>, with the same indent that line carries.
        indent = re.search(r"(?m)^([ \t]*)<loc>", block)
        pad = indent.group(1) if indent else "    "
        return re.sub(r"(</loc>)", r"\1\n" + pad + tag, block, count=1)

    updated = re.sub(r"(?s)<url>.*?</url>", one, text)
    return updated, missing


def main():
    ap = argparse.ArgumentParser(description="Date every sitemap entry.")
    ap.add_argument("--check", action="store_true",
                    help="exit 1 if sitemap.xml does not carry current dates")
    args = ap.parse_args()

    text = SITEMAP.read_text(encoding="utf-8")
    updated, missing = rewrite(text)
    if missing:
        raise SystemExit("sitemap URL with no file: %s" % ", ".join(missing))
    count = updated.count("<lastmod>")
    if args.check:
        if updated != text:
            print("sitemap.xml dates are stale: run python3 tools/sync_sitemap.py")
            return 1
        print("sitemap.xml is current (%d dated entries)" % count)
        return 0
    if updated != text:
        SITEMAP.write_text(updated, encoding="utf-8")
    print("wrote sitemap.xml (%d dated entries)" % count)
    return 0


if __name__ == "__main__":
    sys.exit(main())
