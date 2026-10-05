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

# Noun used in the menu trigger: "All 10 tools".
NOUN = "tools"

# The rail cap for this site. The default is 8, and photoshrink raises it to 10.
# The first version of this site held the last two tools out of the rail on the
# argument that a new page has no impressions to have earned a slot with. That
# left /redact-screenshot and /blur-image reachable only inside a collapsed
# sheet, and the rest of the page still said "eight tools" (photoshrink#18). The
# rail scrolls horizontally with an edge fade, so ten chips cost no layout.
RAIL_CAP = 10

# Tier-1 tools, in rail order. Crossing 8 switches the sheet from one flat list
# to named groups — the renderer's rule, not a per-site choice — which is why
# GROUPS below stops being decorative.
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
    {"href": "/redact-screenshot", "label": "Redact",   "long": "Redact a Screenshot",    "group": "inspect", "tier": 1},
    {"href": "/blur-image",        "label": "Blur",     "long": "Blur an Image",          "group": "inspect", "tier": 1},
]

# Sheet groups, in order. These went live the day this site gained a ninth tool:
# at 9+ destinations the renderer swaps the flat list for named groups, and the
# arrangement below is the one that was already decided for exactly that day.
GROUPS = [
    ("size",    "Resize & compress"),
    ("convert", "Convert & export"),
    ("inspect", "Inspect & redact"),
]

# ---------------------------------------------------------------------------
# Tier-2 family two: the platform size pages.
#
# THIS IS THE ONLY PLACE THESE NUMBERS LIVE. `tools/build_size_pages.py` reads
# them to write each page's <h1>, its facts list, its seeded <body> attribute
# and the PRESETS table inside assets/js/app.js, so a platform that changes its
# spec is a one-line edit here followed by one command.
#
# Every figure is the size the platform's own help or creator documentation
# publishes as the recommended upload, not a number inferred from a rendered
# page. They drift — Facebook's cover and X's header have both moved more than
# once — so re-check the source before treating any of these as current. Where
# a platform publishes an upload size and a *displayed* size that differ, the
# upload size is the one here and the difference is spelled out in the page's
# own copy, because that gap is the thing people actually get wrong.
#
#   slug   -> flat clean path, matching the query ("youtube thumbnail size")
#   label  -> the full name, used in the sheet-free contexts and page titles
#   chip   -> the chip's own text, kept short enough for a wrapped row
#   note   -> the one-line "what it is for" the resizer shows next to the chip
SIZE_PRESETS = [
    {"slug": "instagram-post-size",            "label": "Instagram post",            "chip": "IG post",        "width": 1080, "height": 1080, "note": "The square feed post — Instagram's safest default."},
    {"slug": "instagram-story-size",           "label": "Instagram story",           "chip": "IG story",       "width": 1080, "height": 1920, "note": "Full-screen vertical, with UI over the top and bottom."},
    {"slug": "instagram-reel-size",            "label": "Instagram reel",            "chip": "IG reel",        "width": 1080, "height": 1920, "note": "Vertical video cover; the grid crops it to a 4:5 centre."},
    {"slug": "instagram-profile-picture-size", "label": "Instagram profile picture", "chip": "IG profile",     "width": 320,  "height": 320,  "note": "Stored at 320px square, displayed far smaller and circular."},
    {"slug": "youtube-thumbnail-size",         "label": "YouTube thumbnail",         "chip": "YT thumbnail",   "width": 1280, "height": 720,  "note": "16:9 custom thumbnail, under YouTube's 2 MB cap."},
    {"slug": "youtube-banner-size",            "label": "YouTube channel banner",    "chip": "YT banner",      "width": 2560, "height": 1440, "note": "Channel art, with a 1546×423 area safe on every device."},
    {"slug": "twitter-header-size",            "label": "X (Twitter) header",        "chip": "X header",       "width": 1500, "height": 500,  "note": "The 3:1 profile banner, part-covered by the avatar."},
    {"slug": "twitter-post-image-size",        "label": "X (Twitter) post image",    "chip": "X post",         "width": 1600, "height": 900,  "note": "16:9 in-timeline image, cropped to ~2:1 in the feed."},
    {"slug": "facebook-cover-photo-size",      "label": "Facebook cover photo",      "chip": "FB cover",       "width": 851,  "height": 315,  "note": "Desktop cover; mobile crops the sides off this."},
    {"slug": "facebook-post-image-size",       "label": "Facebook post image",       "chip": "FB post",        "width": 1200, "height": 630,  "note": "The 1.91:1 link and post image, same as an OG image."},
    {"slug": "linkedin-banner-size",           "label": "LinkedIn banner",           "chip": "LI banner",      "width": 1584, "height": 396,  "note": "The 4:1 profile cover, with the avatar over the left."},
    {"slug": "linkedin-post-image-size",       "label": "LinkedIn post image",       "chip": "LI post",        "width": 1200, "height": 627,  "note": "Feed image at 1.91:1 — the shape LinkedIn shares with OG."},
    {"slug": "tiktok-video-size",              "label": "TikTok video",              "chip": "TikTok",         "width": 1080, "height": 1920, "note": "9:16 full screen; captions and buttons cover the edges."},
    {"slug": "pinterest-pin-size",             "label": "Pinterest pin",             "chip": "Pin",            "width": 1000, "height": 1500, "note": "The 2:3 standard pin — taller pins get truncated."},
    {"slug": "discord-banner-size",            "label": "Discord banner",            "chip": "Discord banner", "width": 960,  "height": 540,  "note": "16:9 profile banner, shown behind the avatar."},
    {"slug": "discord-server-icon-size",       "label": "Discord server icon",       "chip": "Discord icon",   "width": 512,  "height": 512,  "note": "Square server icon, masked to a circle in the list."},
    {"slug": "twitch-offline-banner-size",     "label": "Twitch offline banner",     "chip": "Twitch offline", "width": 1920, "height": 1080, "note": "What sits in the player when the channel is not live."},
    {"slug": "twitch-profile-banner-size",     "label": "Twitch profile banner",     "chip": "Twitch banner",  "width": 1200, "height": 480,  "note": "The 5:2 strip across the top of the channel page."},
    {"slug": "zoom-virtual-background-size",   "label": "Zoom virtual background",   "chip": "Zoom background","width": 1920, "height": 1080, "note": "16:9 at 1080p — Zoom's own recommended background size."},
    {"slug": "spotify-playlist-cover-size",    "label": "Spotify playlist cover",    "chip": "Spotify cover",  "width": 640,  "height": 640,  "note": "Square JPEG, 640px, under Spotify's 4 MB upload cap."},
]

# ---------------------------------------------------------------------------
# Tier-2 family three: the format-pair conversion pages.
#
# THIS IS THE ONLY PLACE THE PAIRS LIVE. `tools/build_convert_pages.py` reads
# them to write each page's <h1>, its seeded <body> attributes and the sitemap
# rows, and sync_nav reads them for the chip row inside the converter's own
# panel — so adding a pair is a line here plus an entry in
# tools/convert_pages_copy.py, and nothing else.
#
#   slug      -> flat clean path, matching the query ("png to jpg")
#   src / dst -> the *format select's own vocabulary* ("png", "jpeg", "webp"),
#                because these values are written straight into the seeded
#                data-convert-from / data-convert-to attributes and compared
#                against `formatSelect.value` and `mimeForFormat()` in app.js.
#                Spelling the target "jpg" here would silently seed a value
#                the select does not have.
#   *_label   -> how the format is written in prose and headings, which is not
#                the same string: the value is "jpeg", the label is "JPG".
#   chip      -> the chip's own text
#
# These six are every ordered pair of PNG, JPEG and WebP. There is no seventh
# permutation, and the formats a seventh would need are not encodable here:
# `canvasToBlob` cannot emit image/x-icon and this repo has no ICO encoder, so
# /png-to-ico would be a page that lies about what the button does.
CONVERT_PAIRS = [
    {"slug": "png-to-jpg",  "src": "png",  "dst": "jpeg", "src_label": "PNG",  "dst_label": "JPG",  "chip": "PNG \u2192 JPG",  "note": "Shrink a screenshot or export for anywhere that will not take a PNG."},
    {"slug": "jpg-to-png",  "src": "jpeg", "dst": "png",  "src_label": "JPG",  "dst_label": "PNG",  "chip": "JPG \u2192 PNG",  "note": "Get a lossless copy to edit, or a format that accepts transparency."},
    {"slug": "webp-to-jpg", "src": "webp", "dst": "jpeg", "src_label": "WebP", "dst_label": "JPG",  "chip": "WebP \u2192 JPG", "note": "Open a downloaded WebP in software that has never heard of it."},
    {"slug": "webp-to-png", "src": "webp", "dst": "png",  "src_label": "WebP", "dst_label": "PNG",  "chip": "WebP \u2192 PNG", "note": "Keep the transparency a WebP carries, in a format everything reads."},
    {"slug": "png-to-webp", "src": "png",  "dst": "webp", "src_label": "PNG",  "dst_label": "WebP", "chip": "PNG \u2192 WebP", "note": "Cut the weight of a PNG for the web without losing the alpha channel."},
    {"slug": "jpg-to-webp", "src": "jpeg", "dst": "webp", "src_label": "JPG",  "dst_label": "WebP", "chip": "JPG \u2192 WebP", "note": "Smaller photographs for a page, at the same visible quality."},
]

# Spelling aliases. "jpeg to png" is searched separately from "jpg to png" but
# it is the same question with the same answer, so the alias is a real page
# that carries rel=canonical to the jpg spelling and is deliberately kept out
# of the sitemap and out of the chip row. A synonym duplicate that competes
# with its own canonical is what drags a thin new family down.
CONVERT_ALIASES = [
    {"slug": "jpeg-to-png", "canonical": "jpg-to-png"},
]

# One hub link at the bottom of the sheet per tier-2 family.
HUBS = [
    ("/compress-image", "All 7 target sizes"),
    ("/resize-image", "All %d platform sizes" % len(SIZE_PRESETS)),
    ("/convert-image", "All %d format pairs" % len(CONVERT_PAIRS)),
]

# Tier-2 families. Each is one tool with a parameter baked in, so they live in
# that tool's own control panel as sibling chips and are deliberately absent
# from the rail and the sheet body. `region` names the marker pair the family
# renders into, so a page opts into exactly the family it belongs to; `data`
# is written out as data-* attributes on each chip, which is how one renderer
# serves a family measured in bytes and a family measured in pixels.
VARIANTS = [
    # The compressor's target sizes. `bytes` is the older per-item spelling and
    # still renders `data-target`, so these pages' markup is unchanged.
    {
        "region": "sizechips",
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
    },
    # The resizer's platform sizes, built from the one table above so a chip
    # can never disagree with the page it points at.
    {
        "region": "dimensionchips",
        "parent": "/resize-image",
        "label": "Platform size",
        "aria": "Platform image size presets",
        "items": [{"href": "/resize-image", "label": "Custom", "data": {"width": "", "height": ""}}] + [
            {
                "href": "/" + p["slug"],
                "label": p["chip"],
                "data": {"width": p["width"], "height": p["height"]},
            }
            for p in SIZE_PRESETS
        ],
    },
    # The converter's format pairs. data-from is what the page expects to be
    # given and data-to is what it produces; the empty pair on "Any format"
    # clears the seed, which is what re-enables the dropzone's own guess.
    {
        "region": "formatchips",
        "parent": "/convert-image",
        "label": "Format pair",
        "aria": "Image format pairs",
        # The spelling aliases belong to this family but are deliberately not
        # chips: they carry rel=canonical to one of the pairs, so they light
        # the Convert chip in the rail without competing for a slot of their own.
        "owns": ["/" + a["slug"] for a in CONVERT_ALIASES],
        "items": [{"href": "/convert-image", "label": "Any format", "data": {"from": "", "to": ""}}] + [
            {
                "href": "/" + p["slug"],
                "label": p["chip"],
                "data": {"from": p["src"], "to": p["dst"]},
            }
            for p in CONVERT_PAIRS
        ],
    },
]

# ---------------------------------------------------------------------------
# Related tools: the sibling sites in the portfolio this one links to.
#
# One, not nineteen. A footer that lists every domain the owner has reads as a
# link farm and is worth nothing to a reader. A visitor to an image tool
# plausibly wants colour next, so the one peer is the colour site.
#
#   href, what the site does, the domain
PEERS = [
    ("https://gamutlens.com/", "Color pickers, palettes and contrast", "gamutlens.com"),
]

# The portfolio contact address, written with the `@` as an HTML entity in both
# the href and the visible text. A browser decodes an entity in an attribute
# value, so the link works for a mouse, a keyboard and a screen reader, while a
# scraper reading the raw HTML for a plain address finds nothing. Nothing here
# depends on JavaScript: a contact link that needs a script to work is worse
# than an address in plain sight.
CONTACT_ADDRESS = "hello@goodbotbad.bot"
CONTACT_LEAD = "Questions, or a tool doing the wrong thing?"

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
    # The related-tools block goes inside the footer, above the legal line.
    {"op": "insert_after", "region": "peers", "indent": "  ",
     "pattern": r'<footer class="site-footer">'},
]
