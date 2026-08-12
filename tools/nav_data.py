"""photoshrink.net navigation data — the single source of truth for the toolbar.

This is the ONLY file that differs between sites. `sync_nav.py` is generic and
copies verbatim. Nothing here is computed at runtime by the browser: sync_nav
renders it into the static HTML of every page.

Tier rule (portfolio spec, ngineer420.github.io#13): a page is tier 1 only if it
answers a *different question*. The same tool with a parameter baked in is
tier 2 — it never appears in the rail or the sheet body. It gets one hub link at
the bottom of the sheet plus real <a href> sibling chips inside the tool's own
control panel, where it is a parameter and not a peer.
"""

# Noun used in the menu trigger: "All 8 tools".
NOUN = "tools"

# Tier-1 tools, in rail order (rail is capped at 8 — this site has exactly 8).
#   label -> rail chip text, <= 18 chars
#   long  -> anchor text in the sheet and in any footer/in-body list
#   group -> sheet grouping key, only used once a site passes 8 destinations
TOOLS = [
    {"href": "/resize-image",      "label": "Resize",   "long": "Resize Image",           "group": "size",    "tier": 1},
    {"href": "/compress-image",    "label": "Compress", "long": "Compress Image",         "group": "size",    "tier": 1},
    {"href": "/crop-image",        "label": "Crop",     "long": "Crop Image",             "group": "size",    "tier": 1},
    {"href": "/convert-image",     "label": "Convert",  "long": "Convert Image Format",   "group": "convert", "tier": 1},
    {"href": "/rotate-image",      "label": "Rotate",   "long": "Rotate & Flip Image",    "group": "size",    "tier": 1},
    {"href": "/image-to-base64",   "label": "Base64",   "long": "Image to Base64",        "group": "convert", "tier": 1},
    {"href": "/favicon-generator", "label": "Favicon",  "long": "Favicon Generator",      "group": "convert", "tier": 1},
    {"href": "/exif-viewer",       "label": "Metadata", "long": "EXIF & Metadata Viewer", "group": "inspect", "tier": 1},
]

# Sheet groups, in order. Unused at <= 8 destinations (the sheet renders flat,
# because group headings are noise at that size) — kept so the arrangement is
# already decided the day this site gains a ninth tool.
GROUPS = [
    ("size",    "Resize & compress"),
    ("convert", "Convert & export"),
    ("inspect", "Inspect"),
]

# One hub link at the bottom of the sheet per tier-2 family.
HUBS = [("/compress-image", "All 7 target sizes")]

# Tier-2: the target-size landing pages. These are one tool with the budget
# baked in, so they live in the compressor's own control panel as sibling chips
# and are deliberately absent from the rail and the sheet body.
#   bytes -> pre-seeded budget; None means "no cap" (the plain compressor)
VARIANTS = {
    "parent": "/compress-image",  # the tier-1 tool these are a parameter of
    "label": "Target size",
    "aria": "Target file size",
    "items": [
        {"href": "/compress-image",              "label": "Any size",     "bytes": None},
        {"href": "/compress-image-to-100kb",     "label": "100 KB",       "bytes": 102400},
        {"href": "/compress-image-to-200kb",     "label": "200 KB",       "bytes": 204800},
        {"href": "/compress-image-to-500kb",     "label": "500 KB",       "bytes": 512000},
        {"href": "/compress-image-to-1mb",       "label": "1 MB",         "bytes": 1048576},
        {"href": "/compress-image-for-email",    "label": "Email 5 MB",   "bytes": 5242880},
        {"href": "/compress-image-for-discord",  "label": "Discord 8 MB", "bytes": 8388608},
    ],
}

# Long anchor text for a footer crawl list, if the site has one. photoshrink
# deliberately does not: the rail is always visible and carries every tier-1
# destination, and the always-visible size chips carry every tier-2 one, so a
# footer duplicate would add boilerplate links without adding a crawl surface.
FOOTER = []

# One-time --migrate: what the legacy markup looked like and where the marker
# pairs go. Per-site, because the legacy markup is per-site. Ops run in order.
MIGRATE = [
    # The old primary tab bar and the tier-2 second row, both inside <main>.
    {"op": "strip", "pattern": r'\n  <div role="tablist" class="tabbar".*?\n  </div>\n'},
    {"op": "strip", "pattern": r'\n  <nav class="subnav".*?\n  </nav>\n'},
    # The four JS-only budget buttons the real sibling links replace.
    {"op": "strip", "pattern": r'\n            <div class="target-presets".*?\n            </div>'},
    # The toolbar is a direct child of <body>, immediately after </header>.
    {"op": "insert_after", "region": "nav", "pattern": r"</header>", "indent": ""},
    # The size chips go straight under the dropzone, NOT inside the budget
    # field: that field lives in #compress-workspace, which ships `hidden`
    # until an image is loaded, so chips placed there would be display:none on
    # arrival — invisible to a visitor and a breakpoint-free way to hide links.
    {"op": "insert_before", "region": "sizechips", "indent": " " * 4,
     "pattern": r'    <div class="workspace" id="compress-workspace"'},
]
