# photoshrink.net

Free image tools that run in the browser. Nothing is uploaded. The site is
static HTML on GitHub Pages, with one shared stylesheet at
`assets/css/styles.css` and one shared script at `assets/js/app.js`.

## Generators

The scripts under `tools/` write committed files. Run them in this order after
a change, then commit the result:

1. `python3 tools/build_size_pages.py`
2. `python3 tools/build_convert_pages.py`
3. `python3 tools/sync_nav.py`
4. `python3 tools/build_sw.py`

## Pre-deploy checklist

Run each check. If one exits 1, run the matching generator and commit.

1. `python3 tools/build_size_pages.py --check`
2. `python3 tools/build_convert_pages.py --check`
3. `python3 tools/sync_nav.py --check`
4. `python3 tools/build_sw.py --check`
5. `node assets/js/app.test.js`

## Offline

`sw.js` is a service worker. `assets/js/app.js` registers it on every page.
On the first visit the worker stores the homepage, every tool page,
`assets/css/styles.css` and `assets/js/app.js` in one cache. After that, a
tool page opens with no network.

The precache list comes from `sitemap.xml` and from `CONVERT_ALIASES` in
`tools/nav_data.py`. The pages under `/articles/`, `privacy.html` and
`terms.html` are content, not tools. The worker does not cache them.

The cache name is `photoshrink-` plus a hash of every precached file. Run
`python3 tools/build_sw.py` before each deploy. If a page, the stylesheet or
`app.js` changed, the command writes a new hash into `sw.js`. The worker then
replaces the old cache on the next visit.

The worker handles same-origin GET requests only. It never intercepts and
never caches the AdSense script or any other third-party request.
