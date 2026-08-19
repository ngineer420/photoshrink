/* photoshrink.net — app logic.
   Everything below runs 100% client-side against the Canvas API. No image
   bytes are ever sent anywhere — every tool loads a File, draws it to a
   <canvas>, and hands the result back as a downloadable Blob.

   Pure, DOM-independent helpers live at the top (exported for Node via
   `module.exports` so `assets/js/app.test.js` can exercise them without a
   browser). DOM wiring lives below, inside per-tool IIFEs that no-op when
   their markup isn't present on the page — this lets the exact same script
   power both the homepage (all seven tools mounted at once) and every
   standalone tool page (one tool mounted). */

/* ============================= shared helpers ============================= */

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / Math.pow(1024, i);
  const decimals = i === 0 ? 0 : value < 10 ? 2 : value < 100 ? 1 : 0;
  return `${value.toFixed(decimals)} ${units[i]}`;
}

// Positive = shrank by that %, negative = grew (0 if `before` is falsy so a
// not-yet-loaded state never shows a misleading "100% saved").
function percentSaved(before, after) {
  if (!before) return 0;
  return Math.round((1 - after / before) * 100);
}

function mimeForFormat(format) {
  switch (format) {
    case "png": return "image/png";
    case "jpeg": case "jpg": return "image/jpeg";
    case "webp": return "image/webp";
    default: return "image/png";
  }
}

function extensionForFormat(format) {
  switch (format) {
    case "png": return "png";
    case "jpeg": case "jpg": return "jpg";
    case "webp": return "webp";
    default: return "png";
  }
}

// Best-effort "keep the source format" resolver — falls back to PNG for
// formats we can't re-encode with canvas (e.g. GIF, SVG, AVIF).
function formatFromMimeType(mimeType) {
  if (mimeType === "image/jpeg") return "jpeg";
  if (mimeType === "image/webp") return "webp";
  if (mimeType === "image/png") return "png";
  return "png";
}

function stripExtension(filename) {
  const i = filename.lastIndexOf(".");
  return i > 0 ? filename.slice(0, i) : filename;
}

function debounce(fn, ms) {
  let t;
  return function debounced(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), ms);
  };
}

/* ========================= target file size mode =========================

   "Compress to under 100 KB" is the actual job, and a raw quality slider makes
   the visitor do the binary search by hand. So the tool does it instead.

   Everything in this block is pure. `targetQualitySearch` never touches a
   canvas — it takes an `encode(quality) -> byte count` function, which is what
   lets the test file drive it against a synthetic encoder and what lets the
   caller decide whether an encode happens on the main thread, off it, or at a
   reduced size. */

const KB = 1024;
const MB = 1024 * 1024;

// The budgets people actually arrive with. `bytes` is the hard cap, not a
// target to hit — landing a little under is a success, landing over is not.
const TARGET_PRESETS = {
  web: { bytes: 200 * KB, label: "Web upload — 200 KB" },
  "100kb": { bytes: 100 * KB, label: "Upload form limit — 100 KB" },
  "500kb": { bytes: 500 * KB, label: "Forum or CMS — 500 KB" },
  "1mb": { bytes: 1 * MB, label: "General purpose — 1 MB" },
  email: { bytes: 5 * MB, label: "Email attachment — 5 MB" },
  discord: { bytes: 8 * MB, label: "Discord free tier — 8 MB" },
};

function budgetFromPreset(preset) {
  if (typeof preset !== "string") return null;
  if (!Object.prototype.hasOwnProperty.call(TARGET_PRESETS, preset)) return null;
  return TARGET_PRESETS[preset].bytes;
}

// A typed budget: a number plus a unit. Anything that isn't a positive finite
// number is rejected outright rather than silently becoming NaN bytes.
function parseBudget(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const multiplier = unit === "mb" ? MB : unit === "b" ? 1 : KB;
  const bytes = Math.round(n * multiplier);
  return bytes > 0 ? bytes : null;
}

/* Highest quality that fits the budget, found by bisection.

   `encode(quality)` returns (or resolves to) the byte count at that quality.
   Options: minQuality/maxQuality bound the search, maxPasses caps how many
   encodes are allowed — these are full-size encodes of the visitor's photo, so
   the cap is a hard promise about how long the tab is busy, not a tuning knob —
   `tolerance` stops bisecting once the bracket is narrower than a difference
   anyone could see, and `shouldCancel()` is polled before every encode so a
   run in flight can be abandoned.

   Returns { quality, size, passes, fits, cancelled }. `fits` false means even
   the lowest quality missed the budget, and the caller should downscale. */
async function targetQualitySearch(encode, targetBytes, options) {
  const opts = Object.assign(
    { minQuality: 0.05, maxQuality: 0.95, maxPasses: 8, tolerance: 0.01 },
    options || {}
  );
  const shouldCancel = typeof opts.shouldCancel === "function" ? opts.shouldCancel : () => false;
  if (!(targetBytes > 0)) throw new Error("A target size has to be a positive number of bytes.");
  if (typeof encode !== "function") throw new Error("targetQualitySearch needs an encode function.");

  let passes = 0;
  let lo = opts.minQuality;
  let hi = opts.maxQuality;
  let best = null; // the highest quality seen that fit
  let smallest = null; // fallback for when nothing fits

  // Returns the byte count, or null if the run was cancelled.
  async function measure(quality) {
    if (shouldCancel()) return null;
    const size = await encode(quality);
    passes += 1;
    if (!smallest || size < smallest.size) smallest = { quality, size };
    if (size <= targetBytes && (!best || quality > best.quality)) best = { quality, size };
    return size;
  }

  // The ceiling first. A generous budget is satisfied in a single encode, and
  // on a 12 megapixel photo one encode versus eight is the whole difference
  // between a tool that feels instant and one that locks the tab.
  const topSize = await measure(hi);
  if (topSize === null) return { quality: hi, size: 0, passes, fits: false, cancelled: true };
  if (topSize <= targetBytes) {
    return { quality: hi, size: topSize, passes, fits: true, cancelled: false };
  }

  // Then the floor. If the worst quality still misses, no amount of bisecting
  // between them will find a fit — say so immediately rather than burning six
  // more full-size encodes proving it.
  const bottomSize = await measure(lo);
  if (bottomSize === null) return { quality: lo, size: 0, passes, fits: false, cancelled: true };
  if (bottomSize > targetBytes) {
    return { quality: smallest.quality, size: smallest.size, passes, fits: false, cancelled: false };
  }

  best = { quality: lo, size: bottomSize };
  while (passes < opts.maxPasses && hi - lo > opts.tolerance) {
    const mid = (lo + hi) / 2;
    const size = await measure(mid);
    if (size === null) return { quality: best.quality, size: best.size, passes, fits: true, cancelled: true };
    if (size <= targetBytes) lo = mid;
    else hi = mid;
  }

  return { quality: best.quality, size: best.size, passes, fits: true, cancelled: false };
}

/* When quality alone cannot reach the budget, the pixels have to go.

   File size tracks pixel count closely enough for a first guess, so the linear
   dimensions scale with the square root of the size ratio. `safety` aims a
   little under the budget, because the estimate is a guess and coming back for
   a second downscale costs another round of full encodes. Never upscales. */
function downscaleFactorForBudget(currentBytes, targetBytes, safety) {
  const margin = typeof safety === "number" ? safety : 0.9;
  if (!(currentBytes > 0) || !(targetBytes > 0)) return 1;
  if (currentBytes <= targetBytes) return 1;
  return clamp(Math.sqrt((targetBytes / currentBytes) * margin), 0.1, 1);
}

/* PNG has no quality parameter, so there is nothing for the search to bisect.
   Rather than silently doing nothing or silently changing the file type, the
   tool names the substitute it intends to make and the UI says so. */
function targetFormatFor(format) {
  if (format === "png") return { format: "webp", switched: true };
  return { format, switched: false };
}

// The line under a finished search: what it settled on and what it cost.
function describeTargetResult(result, targetBytes) {
  if (!result) return "";
  if (result.cancelled) return "Cancelled.";
  const passes = `${result.passes} ${result.passes === 1 ? "pass" : "passes"}`;
  if (!result.fits) {
    return `Could not reach ${formatBytes(targetBytes)} by quality alone — smallest was ${formatBytes(result.size)} at quality ${Math.round(result.quality * 100)}% after ${passes}.`;
  }
  return `${formatBytes(result.size)} at quality ${Math.round(result.quality * 100)}% — found in ${passes}.`;
}

/* The batch's copyable summary. Built here rather than in the DOM so the exact
   text is testable and so it cannot drift from what the rows show. */
function buildBatchSummaryText(rows) {
  const done = (rows || []).filter((r) => r && Number.isFinite(r.after));
  if (!done.length) return "";
  const before = done.reduce((sum, r) => sum + r.before, 0);
  const after = done.reduce((sum, r) => sum + r.after, 0);
  const lines = done.map(
    (r) => `${r.name}: ${formatBytes(r.before)} → ${formatBytes(r.after)} (${percentSaved(r.before, r.after)}% smaller)`
  );
  lines.push(
    `Total: ${done.length} ${done.length === 1 ? "image" : "images"}, ${formatBytes(before)} → ${formatBytes(after)} (${percentSaved(before, after)}% smaller, ${formatBytes(Math.max(0, before - after))} saved)`
  );
  return lines.join("\n");
}

/* ============================= resize tool ============================= */

function resizeByPercent(origW, origH, percent) {
  const p = Math.max(1, Number(percent) || 0);
  return {
    width: Math.max(1, Math.round((origW * p) / 100)),
    height: Math.max(1, Math.round((origH * p) / 100)),
  };
}

function resizeByDimension(origW, origH, width, height, lockAspect, changed) {
  let w = Math.max(1, Math.round(Number(width) || 1));
  let h = Math.max(1, Math.round(Number(height) || 1));
  if (lockAspect && origW > 0 && origH > 0) {
    const ratio = origW / origH;
    if (changed === "height") w = Math.max(1, Math.round(h * ratio));
    else h = Math.max(1, Math.round(w / ratio));
  }
  return { width: w, height: h };
}

/* ========================== platform size presets ==========================

   The dimensions people actually search for: "youtube thumbnail size", not
   "resize image". Each preset seeds the resizer's width and height, and each
   one has a page of its own at /<slug>.

   THIS TABLE IS GENERATED. The numbers live in tools/nav_data.py, which is
   also what writes the pages and the chip row, so a chip, a page heading and
   the seeded input can never disagree. Edit them there and run
   `python3 tools/build_size_pages.py`. */

/* presets:start */
const PRESETS = [
  { slug: "instagram-post-size", label: "Instagram post", width: 1080, height: 1080, note: "The square feed post — Instagram's safest default." },
  { slug: "instagram-story-size", label: "Instagram story", width: 1080, height: 1920, note: "Full-screen vertical, with UI over the top and bottom." },
  { slug: "instagram-reel-size", label: "Instagram reel", width: 1080, height: 1920, note: "Vertical video cover; the grid crops it to a 4:5 centre." },
  { slug: "instagram-profile-picture-size", label: "Instagram profile picture", width: 320, height: 320, note: "Stored at 320px square, displayed far smaller and circular." },
  { slug: "youtube-thumbnail-size", label: "YouTube thumbnail", width: 1280, height: 720, note: "16:9 custom thumbnail, under YouTube's 2 MB cap." },
  { slug: "youtube-banner-size", label: "YouTube channel banner", width: 2560, height: 1440, note: "Channel art, with a 1546×423 area safe on every device." },
  { slug: "twitter-header-size", label: "X (Twitter) header", width: 1500, height: 500, note: "The 3:1 profile banner, part-covered by the avatar." },
  { slug: "twitter-post-image-size", label: "X (Twitter) post image", width: 1600, height: 900, note: "16:9 in-timeline image, cropped to ~2:1 in the feed." },
  { slug: "facebook-cover-photo-size", label: "Facebook cover photo", width: 851, height: 315, note: "Desktop cover; mobile crops the sides off this." },
  { slug: "facebook-post-image-size", label: "Facebook post image", width: 1200, height: 630, note: "The 1.91:1 link and post image, same as an OG image." },
  { slug: "linkedin-banner-size", label: "LinkedIn banner", width: 1584, height: 396, note: "The 4:1 profile cover, with the avatar over the left." },
  { slug: "linkedin-post-image-size", label: "LinkedIn post image", width: 1200, height: 627, note: "Feed image at 1.91:1 — the shape LinkedIn shares with OG." },
  { slug: "tiktok-video-size", label: "TikTok video", width: 1080, height: 1920, note: "9:16 full screen; captions and buttons cover the edges." },
  { slug: "pinterest-pin-size", label: "Pinterest pin", width: 1000, height: 1500, note: "The 2:3 standard pin — taller pins get truncated." },
  { slug: "discord-banner-size", label: "Discord banner", width: 960, height: 540, note: "16:9 profile banner, shown behind the avatar." },
  { slug: "discord-server-icon-size", label: "Discord server icon", width: 512, height: 512, note: "Square server icon, masked to a circle in the list." },
  { slug: "twitch-offline-banner-size", label: "Twitch offline banner", width: 1920, height: 1080, note: "What sits in the player when the channel is not live." },
  { slug: "twitch-profile-banner-size", label: "Twitch profile banner", width: 1200, height: 480, note: "The 5:2 strip across the top of the channel page." },
  { slug: "zoom-virtual-background-size", label: "Zoom virtual background", width: 1920, height: 1080, note: "16:9 at 1080p — Zoom's own recommended background size." },
  { slug: "spotify-playlist-cover-size", label: "Spotify playlist cover", width: 640, height: 640, note: "Square JPEG, 640px, under Spotify's 4 MB upload cap." },
];
/* presets:end */

const PRESETS_BY_SLUG = PRESETS.reduce((map, p) => {
  map[p.slug] = p;
  return map;
}, {});

function presetBySlug(slug) {
  if (typeof slug !== "string") return null;
  return Object.prototype.hasOwnProperty.call(PRESETS_BY_SLUG, slug) ? PRESETS_BY_SLUG[slug] : null;
}

/* "1280x720" -> { width: 1280, height: 720 }.

   The seeding path a preset page uses, and the one the chips use, are the same
   string: two positive integers with an "x" between them. Anything else — a
   percentage, a zero, a negative, a decimal — returns null rather than a
   half-parsed size, because a silently wrong dimension is worse than none. */
function parseDimensionSeed(value) {
  if (typeof value !== "string") return null;
  const m = /^\s*(\d+)\s*[x×]\s*(\d+)\s*$/i.exec(value);
  if (!m) return null;
  const width = Number(m[1]);
  const height = Number(m[2]);
  if (!width || !height) return null;
  return { width, height };
}

// Greatest common divisor, for turning 1080×1920 into "9:16".
function greatestCommonDivisor(a, b) {
  let x = Math.abs(Math.round(a));
  let y = Math.abs(Math.round(b));
  while (y) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x;
}

/* The aspect ratio as people write it. 1280×720 is "16:9"; 851×315 reduces to
   851:315, which is true and useless, so anything that will not reduce to
   sensible two-digit-ish terms comes back as a decimal ratio instead. */
function ratioLabel(width, height) {
  const w = Math.round(Number(width) || 0);
  const h = Math.round(Number(height) || 0);
  if (w <= 0 || h <= 0) return "";
  const g = greatestCommonDivisor(w, h) || 1;
  const rw = w / g;
  const rh = h / g;
  if (rw <= 40 && rh <= 40) return rw + ":" + rh;
  return (w / h).toFixed(2).replace(/\.?0+$/, "") + ":1";
}

/* ============================= rotate tool ============================= */

function normalizeAngle(angle) {
  return ((angle % 360) + 360) % 360;
}

function rotateDimensions(w, h, angle) {
  const a = normalizeAngle(angle);
  return a === 90 || a === 270 ? { width: h, height: w } : { width: w, height: h };
}

/* ============================= crop tool ============================= */

function clampCropBox(box, bounds, minSize) {
  const min = minSize || 20;
  let w = clamp(box.w, min, bounds.width);
  let h = clamp(box.h, min, bounds.height);
  let x = clamp(box.x, 0, Math.max(0, bounds.width - w));
  let y = clamp(box.y, 0, Math.max(0, bounds.height - h));
  return { x, y, w, h };
}

// Maps a crop rect drawn on a (possibly downscaled) preview canvas back to
// the source image's true pixel coordinates.
function scaleRectToNatural(rect, displayW, displayH, naturalW, naturalH) {
  const sx = naturalW / displayW;
  const sy = naturalH / displayH;
  return {
    x: Math.round(rect.x * sx),
    y: Math.round(rect.y * sy),
    w: Math.max(1, Math.round(rect.w * sx)),
    h: Math.max(1, Math.round(rect.h * sy)),
  };
}

// Re-fits a box to a target aspect ratio (w/h) around its own center, then
// clamps back inside bounds. `ratio` of 0/null means "free" — box unchanged.
function applyAspectRatio(box, ratio, bounds) {
  if (!ratio) return clampCropBox(box, bounds);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  let w = box.w;
  let h = w / ratio;
  if (h > bounds.height) { h = bounds.height; w = h * ratio; }
  if (w > bounds.width) { w = bounds.width; h = w / ratio; }
  return clampCropBox({ x: cx - w / 2, y: cy - h / 2, w, h }, bounds);
}

/* ============================= favicon tool ============================= */

const FAVICON_SIZES = [16, 32, 48, 180, 192, 512];

// Crops the largest possible centered square out of a w×h image, so
// non-square source photos still produce clean square favicons.
function centerSquareCrop(w, h) {
  const side = Math.min(w, h);
  return { sx: Math.round((w - side) / 2), sy: Math.round((h - side) / 2), side };
}

function faviconFilename(size) {
  if (size === 180) return "apple-touch-icon.png";
  if (size === 192) return "android-chrome-192x192.png";
  if (size === 512) return "android-chrome-512x512.png";
  return `favicon-${size}x${size}.png`;
}

function buildFaviconLinkSnippet() {
  return [
    '<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">',
    '<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">',
    '<link rel="icon" type="image/png" sizes="48x48" href="/favicon-48x48.png">',
    '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">',
    '<link rel="icon" type="image/png" sizes="192x192" href="/android-chrome-192x192.png">',
    '<link rel="icon" type="image/png" sizes="512x512" href="/android-chrome-512x512.png">',
  ].join("\n");
}

/* ============================= base64 tool ============================= */

function buildHtmlSnippet(dataUri, alt) {
  return `<img src="${dataUri}" alt="${alt || ""}">`;
}

function buildCssSnippet(dataUri, selector) {
  const sel = selector && selector.trim() ? selector.trim() : ".element";
  return `${sel} {\n  background-image: url("${dataUri}");\n}`;
}

/* ============================= batch + ZIP =============================
   A ZIP writer in ~90 lines, because pulling in JSZip would mean a bundler
   and a dependency for a site whose whole pitch is that it is a handful of
   static files. Entries are STORED, not deflated: the payloads are already
   JPEG/PNG/WebP, so deflate would burn CPU on every file to save roughly
   nothing, and storing keeps this small enough to read in one sitting. */

const CRC32_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let c = -1;
  for (let i = 0; i < bytes.length; i++) c = CRC32_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ZIP stores timestamps in the MS-DOS packed format, which starts at 1980
// and has two-second resolution. Anything earlier is clamped rather than
// wrapped, since a negative year field makes some extractors refuse the file.
function toDosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

// Two files dropped from different folders can share a name, and a ZIP with
// duplicate entries extracts unpredictably — so collisions get a suffix.
function uniqueFilenames(names) {
  const used = new Set();
  return names.map((name) => {
    if (!used.has(name)) {
      used.add(name);
      return name;
    }
    const dot = name.lastIndexOf(".");
    const stem = dot > 0 ? name.slice(0, dot) : name;
    const ext = dot > 0 ? name.slice(dot) : "";
    let n = 2;
    while (used.has(`${stem} (${n})${ext}`)) n++;
    const candidate = `${stem} (${n})${ext}`;
    used.add(candidate);
    return candidate;
  });
}

/* Returns the ZIP as an array of byte chunks rather than one buffer: a batch
   of 50 photos is easily 100MB, and Blob can stitch chunks without ever
   needing that much contiguous memory. */
function buildZipParts(entries, now) {
  const stamp = toDosDateTime(now || new Date());
  const encoder = new TextEncoder();
  const parts = [];
  const central = [];
  let offset = 0;

  entries.forEach((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const data = entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); // local file header signature
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: bit 11 = filename is UTF-8
    lv.setUint16(8, 0, true); // method 0 = stored
    lv.setUint16(10, stamp.time, true);
    lv.setUint16(12, stamp.date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true); // compressed size
    lv.setUint32(22, data.length, true); // uncompressed size
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra field length
    local.set(nameBytes, 30);

    parts.push(local, data);

    const dir = new Uint8Array(46 + nameBytes.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory signature
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, stamp.time, true);
    dv.setUint16(14, stamp.date, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, data.length, true);
    dv.setUint32(24, data.length, true);
    dv.setUint16(28, nameBytes.length, true);
    dv.setUint32(42, offset, true); // offset of local header
    dir.set(nameBytes, 46);
    central.push(dir);

    offset += local.length + data.length;
  });

  const centralSize = central.reduce((sum, c) => sum + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  return parts.concat(central, [end]);
}

function buildZip(entries, now) {
  const parts = buildZipParts(entries, now);
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  parts.forEach((p) => {
    out.set(p, at);
    at += p.length;
  });
  return out;
}

function batchOutputName(sourceName, suffix, ext) {
  const stem = stripExtension(sourceName || "image");
  return suffix ? `${stem}-${suffix}.${ext}` : `${stem}.${ext}`;
}

/* ============================ EXIF ============================
   A JPEG is a chain of segments; the camera's metadata lives in an APP1
   segment holding a TIFF structure. Parsing it by hand is a few hundred
   bytes of pointer-chasing, and it means the EXIF tool ships with the same
   "no dependencies, nothing uploaded" guarantee as everything else. */

const EXIF_TAGS = {
  0x010f: "Make",
  0x0110: "Model",
  0x0112: "Orientation",
  0x011a: "XResolution",
  0x0131: "Software",
  0x0132: "DateTime",
  0x013b: "Artist",
  0x8298: "Copyright",
  0x829a: "ExposureTime",
  0x829d: "FNumber",
  0x8827: "ISO",
  0x9003: "DateTimeOriginal",
  0x9004: "DateTimeDigitized",
  0x9209: "Flash",
  0x920a: "FocalLength",
  0xa002: "PixelXDimension",
  0xa003: "PixelYDimension",
  0xa405: "FocalLengthIn35mm",
  0xa434: "LensModel",
  0xa433: "LensMake",
};

const GPS_TAGS = {
  0x0001: "GPSLatitudeRef",
  0x0002: "GPSLatitude",
  0x0003: "GPSLongitudeRef",
  0x0004: "GPSLongitude",
  0x0005: "GPSAltitudeRef",
  0x0006: "GPSAltitude",
  0x001d: "GPSDateStamp",
};

const EXIF_ORIENTATIONS = {
  1: "Normal",
  2: "Mirrored horizontally",
  3: "Rotated 180°",
  4: "Mirrored vertically",
  5: "Mirrored horizontally, rotated 270°",
  6: "Rotated 90° clockwise",
  7: "Mirrored horizontally, rotated 90°",
  8: "Rotated 270° clockwise",
};

function exifOrientationLabel(value) {
  return EXIF_ORIENTATIONS[value] || `Unknown (${value})`;
}

// Degrees/minutes/seconds triple + N/S/E/W reference -> signed decimal.
function gpsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [d, m, s] = dms.map(Number);
  if (![d, m, s].every(Number.isFinite)) return null;
  const decimal = d + m / 60 + s / 3600;
  const negative = ref === "S" || ref === "W";
  return Math.round((negative ? -decimal : decimal) * 1e6) / 1e6;
}

function readIfd(view, tiffStart, ifdOffset, littleEndian, dictionary, out) {
  if (ifdOffset <= 0 || tiffStart + ifdOffset + 2 > view.byteLength) return;
  const count = view.getUint16(tiffStart + ifdOffset, littleEndian);
  const SIZES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };

  for (let i = 0; i < count; i++) {
    const entry = tiffStart + ifdOffset + 2 + i * 12;
    if (entry + 12 > view.byteLength) return;
    const tag = view.getUint16(entry, littleEndian);
    const type = view.getUint16(entry + 2, littleEndian);
    const num = view.getUint32(entry + 4, littleEndian);
    const unit = SIZES[type];
    if (!unit) continue;

    const total = unit * num;
    const at = total > 4 ? tiffStart + view.getUint32(entry + 8, littleEndian) : entry + 8;
    if (at < 0 || at + total > view.byteLength) continue;

    // Pointers into the sub-IFDs, which is where almost everything
    // interesting (and all of the GPS data) actually lives.
    if (tag === 0x8769) {
      readIfd(view, tiffStart, view.getUint32(entry + 8, littleEndian), littleEndian, EXIF_TAGS, out);
      continue;
    }
    if (tag === 0x8825) {
      readIfd(view, tiffStart, view.getUint32(entry + 8, littleEndian), littleEndian, GPS_TAGS, out);
      continue;
    }

    const name = dictionary[tag];
    if (!name) continue;

    let value;
    if (type === 2) {
      let s = "";
      for (let k = 0; k < num; k++) {
        const c = view.getUint8(at + k);
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      value = s.trim();
      if (!value) continue;
    } else {
      const values = [];
      for (let k = 0; k < num; k++) {
        const p = at + k * unit;
        if (type === 1 || type === 7) values.push(view.getUint8(p));
        else if (type === 3) values.push(view.getUint16(p, littleEndian));
        else if (type === 4) values.push(view.getUint32(p, littleEndian));
        else if (type === 9) values.push(view.getInt32(p, littleEndian));
        else if (type === 5 || type === 10) {
          const numerator = type === 5 ? view.getUint32(p, littleEndian) : view.getInt32(p, littleEndian);
          const denominator = type === 5 ? view.getUint32(p + 4, littleEndian) : view.getInt32(p + 4, littleEndian);
          values.push(denominator === 0 ? 0 : numerator / denominator);
        }
      }
      value = values.length === 1 ? values[0] : values;
    }
    out[name] = value;
  }
}

/* Finds the Exif APP1 segment in a JPEG and reads IFD0, the Exif sub-IFD
   and the GPS sub-IFD out of it. Returns null when there is nothing there,
   which is the common and entirely healthy case for a web-sourced image. */
function parseExif(bytes) {
  if (!bytes || bytes.length < 4) return null;
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null; // not a JPEG

  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = bytes[i + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2) break;

    if (marker === 0xe1 && i + 4 + 6 <= bytes.length) {
      const header = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
      if (header === "Exif") {
        const tiffStart = i + 10;
        if (tiffStart + 8 > bytes.length) return null;
        const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        const byteOrder = view.getUint16(tiffStart, false);
        if (byteOrder !== 0x4949 && byteOrder !== 0x4d4d) return null;
        const littleEndian = byteOrder === 0x4949;
        if (view.getUint16(tiffStart + 2, littleEndian) !== 0x002a) return null;
        const out = {};
        readIfd(view, tiffStart, view.getUint32(tiffStart + 4, littleEndian), littleEndian, EXIF_TAGS, out);
        return Object.keys(out).length ? out : null;
      }
    }
    i += 2 + length;
  }
  return null;
}

/* Strips metadata by removing whole segments/chunks from the byte stream,
   NOT by re-encoding through a canvas. Re-encoding a JPEG to drop its GPS
   tag would also re-compress the photo and lose real detail — a stripper
   that silently degrades the image is worse than no stripper. */
function stripJpegMetadata(bytes) {
  if (!bytes || bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  /* Which APP segments go, and — more importantly — which stay:
       APP0  (0xE0) JFIF          keep, it is structural
       APP1  (0xE1) Exif / XMP    DROP, this is the whole point
       APP2  (0xE2) ICC profile   keep — colour management, not metadata.
                                  Dropping it visibly shifts the colours,
                                  which would make this a lossy operation
                                  wearing a lossless label.
       APP13 (0xED) Photoshop IRB DROP, carries IPTC captions and credits
       APP14 (0xEE) Adobe         keep, holds the colour-transform flag that
                                  CMYK/YCCK JPEGs need to decode correctly
       COM   (0xFE) comment       DROP
     Everything else in APP3..APP15 is rare vendor metadata and goes. */
  const KEEP_APP = { 0xe0: true, 0xe2: true, 0xee: true };
  const DROP = (m) => ((m >= 0xe1 && m <= 0xef) && !KEEP_APP[m]) || m === 0xfe;
  const keep = [bytes.subarray(0, 2)];
  const removed = [];
  let i = 2;

  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) break;
    const marker = bytes[i + 1];
    if (marker === 0xda) {
      // Start of scan: everything from here to the end is entropy-coded
      // image data. Copy it verbatim and stop looking.
      keep.push(bytes.subarray(i));
      i = bytes.length;
      break;
    }
    if (marker === 0xd9) {
      keep.push(bytes.subarray(i, i + 2));
      i += 2;
      break;
    }
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (length < 2 || i + 2 + length > bytes.length) break;
    if (DROP(marker)) removed.push({ marker, bytes: length + 2 });
    else keep.push(bytes.subarray(i, i + 2 + length));
    i += 2 + length;
  }
  if (i < bytes.length) keep.push(bytes.subarray(i));

  const total = keep.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  keep.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return { bytes: out, removed };
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
// Ancillary chunks that carry text, timestamps or embedded Exif. The
// critical chunks (IHDR/PLTE/IDAT/IEND) and colour-management ones are kept.
const PNG_DROP_CHUNKS = ["tEXt", "iTXt", "zTXt", "tIME", "eXIf"];

function stripPngMetadata(bytes) {
  if (!bytes || bytes.length < 8) return null;
  for (let i = 0; i < 8; i++) if (bytes[i] !== PNG_SIGNATURE[i]) return null;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keep = [bytes.subarray(0, 8)];
  const removed = [];
  let i = 8;

  while (i + 8 <= bytes.length) {
    const length = view.getUint32(i, false);
    const type = String.fromCharCode(bytes[i + 4], bytes[i + 5], bytes[i + 6], bytes[i + 7]);
    const end = i + 12 + length; // length + type + data + crc
    if (end > bytes.length) break;
    if (PNG_DROP_CHUNKS.indexOf(type) !== -1) removed.push({ marker: type, bytes: end - i });
    else keep.push(bytes.subarray(i, end));
    i = end;
    if (type === "IEND") break;
  }

  const total = keep.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  keep.forEach((part) => {
    out.set(part, at);
    at += part.length;
  });
  return { bytes: out, removed };
}

function stripMetadata(bytes, mimeType) {
  if (mimeType === "image/png") return stripPngMetadata(bytes);
  if (mimeType === "image/jpeg") return stripJpegMetadata(bytes);
  // Sniff, because a file dragged in with the wrong extension still has the
  // right magic bytes and the user's intent is obvious.
  if (bytes && bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpegMetadata(bytes);
  if (bytes && bytes[0] === 137 && bytes[1] === 80) return stripPngMetadata(bytes);
  return null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    crc32,
    toDosDateTime,
    uniqueFilenames,
    buildZipParts,
    buildZip,
    batchOutputName,
    parseExif,
    exifOrientationLabel,
    gpsToDecimal,
    stripJpegMetadata,
    stripPngMetadata,
    stripMetadata,
    clamp,
    formatBytes,
    percentSaved,
    mimeForFormat,
    extensionForFormat,
    formatFromMimeType,
    stripExtension,
    debounce,
    TARGET_PRESETS,
    budgetFromPreset,
    parseBudget,
    targetQualitySearch,
    downscaleFactorForBudget,
    targetFormatFor,
    describeTargetResult,
    buildBatchSummaryText,
    resizeByPercent,
    resizeByDimension,
    PRESETS,
    presetBySlug,
    parseDimensionSeed,
    greatestCommonDivisor,
    ratioLabel,
    normalizeAngle,
    rotateDimensions,
    clampCropBox,
    scaleRectToNatural,
    applyAspectRatio,
    FAVICON_SIZES,
    centerSquareCrop,
    faviconFilename,
    buildFaviconLinkSnippet,
    buildHtmlSnippet,
    buildCssSnippet,
  };
}

/* ============================= DOM wiring ============================= */

if (typeof document !== "undefined") {
  (() => {
    "use strict";

    const $ = (id) => document.getElementById(id);

    function flash(el) {
      if (!el) return;
      el.classList.add("show");
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.remove("show"), 1100);
    }

    async function copyText(text, flashEl) {
      try {
        await navigator.clipboard.writeText(text);
        flash(flashEl);
      } catch {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        flash(flashEl);
      }
    }

    function showError(el, message) {
      if (!el) return;
      el.textContent = message;
      el.classList.add("show");
    }
    function hideError(el) {
      if (!el) return;
      el.textContent = "";
      el.classList.remove("show");
    }

    function setMeta(el, items) {
      if (!el) return;
      el.innerHTML = items
        .map(([label, value, cls]) => `<span>${label}: <strong${cls ? ` class="${cls}"` : ""}>${value}</strong></span>`)
        .join("");
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    }

    function canvasToBlob(canvas, mime, quality) {
      return new Promise((resolve) => canvas.toBlob(resolve, mime, quality));
    }

    function loadImageFromFile(file) {
      return new Promise((resolve, reject) => {
        if (!file || !file.type || file.type.indexOf("image/") !== 0) {
          reject(new Error("That doesn't look like an image file."));
          return;
        }
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
          resolve({
            img,
            url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            size: file.size,
            type: file.type,
            name: file.name || "image",
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Couldn't read that image. Try a different file."));
        };
        img.src = url;
      });
    }

    const dropzoneRegistry = {};

    // onFiles is optional: batch-capable tools get the whole drop, while
    // the single-image tools carry on receiving just the first file.
    function wireDropzone(prefix, onFile, onFiles) {
      const dz = $(prefix + "-drop");
      const input = $(prefix + "-file");
      if (!dz || !input) return;

      dropzoneRegistry[prefix] = onFile;

      function deliver(fileList) {
        const files = Array.prototype.slice.call(fileList || []);
        if (!files.length) return;
        if (files[0]) onFile(files[0]);
        if (onFiles) onFiles(files);
      }

      ["dragenter", "dragover"].forEach((evt) =>
        dz.addEventListener(evt, (e) => {
          e.preventDefault();
          dz.classList.add("drag-over");
        })
      );
      ["dragleave", "dragend"].forEach((evt) => dz.addEventListener(evt, () => dz.classList.remove("drag-over")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        dz.classList.remove("drag-over");
        deliver(e.dataTransfer && e.dataTransfer.files);
      });

      input.addEventListener("change", () => {
        deliver(input.files);
        input.value = "";
      });
      input.addEventListener("paste", (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const item of items) {
          if (item.type && item.type.indexOf("image/") === 0) {
            const file = item.getAsFile();
            if (file) { onFile(file); break; }
          }
        }
      });
    }

    /* ---- batch queue ----
       One engine, mounted by whichever tools have a single set of settings
       that can sensibly be applied to a whole folder. Files are processed
       one at a time, awaiting a macrotask between each, so the queue you are
       watching actually repaints instead of freezing until the last file. */
    function createBatch(prefix, options) {
      const root = $(prefix + "-batch");
      if (!root) return null;

      const list = $(prefix + "-batch-list");
      const countEl = $(prefix + "-batch-count");
      const runBtn = $(prefix + "-batch-run");
      const zipBtn = $(prefix + "-batch-zip");
      const clearBtn = $(prefix + "-batch-clear");
      const summary = $(prefix + "-batch-summary");
      const overall = $(prefix + "-batch-bar");
      // Optional: only the compress panel mounts one, and createBatch stays
      // generic by looking for it rather than being told about it.
      const copyBtn = $(prefix + "-batch-copy");
      const copiedFlag = $(prefix + "-batch-copied");

      let items = [];
      let running = false;

      const STATE_LABEL = {
        queued: "Queued",
        working: "Processing…",
        done: "Done",
        error: "Failed",
      };

      function paintOverall() {
        const total = items.length || 1;
        const complete = items.filter((it) => it.state === "done" || it.state === "error").length;
        const partial = items.reduce((sum, it) => sum + (it.state === "working" ? it.progress : 0), 0);
        overall.style.width = `${Math.round(((complete + partial) / total) * 100)}%`;
      }

      function paintItem(item) {
        const row = item.row;
        row.dataset.state = item.state;
        row.querySelector(".bi-state").textContent = item.error || STATE_LABEL[item.state];
        const pct = item.state === "done" ? 100 : item.state === "error" ? 100 : Math.round(item.progress * 100);
        row.querySelector(".bi-bar span").style.width = `${pct}%`;
        const sizes = row.querySelector(".bi-sizes");
        if (item.result) {
          const saved = percentSaved(item.file.size, item.result.blob.size);
          sizes.innerHTML = `${formatBytes(item.file.size)} → <strong>${formatBytes(item.result.blob.size)}</strong> <span class="${saved >= 0 ? "save-tag" : ""}">${saved >= 0 ? "−" : "+"}${Math.abs(saved)}%</span>`;
        } else {
          sizes.textContent = formatBytes(item.file.size);
        }
      }

      function paintAll() {
        countEl.textContent = items.length ? `${items.length} file${items.length === 1 ? "" : "s"}` : "";
        runBtn.disabled = running || !items.some((it) => it.state === "queued" || it.state === "error");
        runBtn.textContent = running ? "Processing…" : `Process ${items.length} image${items.length === 1 ? "" : "s"}`;
        zipBtn.disabled = running || !items.some((it) => it.result);
        clearBtn.disabled = running;
        items.forEach(paintItem);
        paintOverall();
      }

      function add(files) {
        const images = files.filter((f) => f && f.type && f.type.indexOf("image/") === 0);
        if (images.length < 2 && !items.length) return; // one file stays a single-image edit
        images.forEach((file) => {
          const row = document.createElement("li");
          row.className = "batch-item";
          row.innerHTML =
            '<div class="bi-top"><span class="bi-name"></span><span class="bi-state"></span></div>' +
            '<div class="bi-bar"><span></span></div>' +
            '<div class="bi-sizes"></div>';
          row.querySelector(".bi-name").textContent = file.name || "image";
          list.appendChild(row);
          items.push({ file, row, state: "queued", progress: 0, result: null, error: "" });
        });
        root.hidden = items.length === 0;
        summary.textContent = items.length
          ? `${items.length} images queued. The settings above apply to all of them.`
          : "";
        paintAll();
      }

      async function run() {
        if (running) return;
        running = true;
        paintAll();

        for (const item of items) {
          if (item.state === "done") continue;
          item.state = "working";
          item.progress = 0;
          item.error = "";
          paintItem(item);
          paintOverall();
          // Let the browser paint the "Processing…" state before the encode
          // blocks the main thread.
          await new Promise((resolve) => setTimeout(resolve, 0));
          try {
            item.result = await options.process(item.file, (p) => {
              item.progress = clamp(p, 0, 1);
              paintItem(item);
              paintOverall();
            });
            item.state = "done";
            item.progress = 1;
          } catch (err) {
            item.state = "error";
            item.error = err && err.message ? err.message : "Failed";
            item.result = null;
          }
          paintItem(item);
          paintOverall();
        }

        running = false;
        const done = items.filter((it) => it.result);
        const failed = items.filter((it) => it.state === "error");
        const before = done.reduce((sum, it) => sum + it.file.size, 0);
        const after = done.reduce((sum, it) => sum + it.result.blob.size, 0);
        summary.textContent = done.length
          ? `${done.length} of ${items.length} processed · ${formatBytes(before)} → ${formatBytes(after)} (${percentSaved(before, after)}% smaller)` +
            (failed.length ? ` · ${failed.length} failed` : "")
          : "Nothing was processed.";
        if (copyBtn) copyBtn.disabled = !done.length;
        paintAll();
      }

      async function downloadZip() {
        const done = items.filter((it) => it.result);
        if (!done.length) return;
        zipBtn.disabled = true;
        const label = zipBtn.textContent;
        zipBtn.textContent = "Zipping…";
        try {
          const names = uniqueFilenames(done.map((it) => it.result.name));
          const entries = [];
          for (let i = 0; i < done.length; i++) {
            const buffer = await done[i].result.blob.arrayBuffer();
            entries.push({ name: names[i], data: new Uint8Array(buffer) });
          }
          const blob = new Blob(buildZipParts(entries), { type: "application/zip" });
          downloadBlob(blob, `photoshrink-${options.zipName || prefix}.zip`);
        } finally {
          zipBtn.textContent = label;
          zipBtn.disabled = false;
        }
      }

      function clear() {
        items = [];
        list.innerHTML = "";
        root.hidden = true;
        summary.textContent = "";
        if (copyBtn) copyBtn.disabled = true;
        overall.style.width = "0%";
        paintAll();
      }

      // Changing a setting invalidates every result: the queue goes back to
      // "queued" rather than silently offering a ZIP built at the old quality.
      function invalidate() {
        if (running || !items.length) return;
        let changed = false;
        items.forEach((item) => {
          if (item.state === "done") {
            item.state = "queued";
            item.progress = 0;
            item.result = null;
            changed = true;
          }
        });
        if (changed) {
          summary.textContent = "Settings changed — run the batch again.";
          if (copyBtn) copyBtn.disabled = true;
          paintAll();
        }
      }

      // The per-file before/after/savings lines plus a total, as text someone
      // can paste into the thread they are about to send the images to.
      function summaryRows() {
        return items
          .filter((it) => it.result)
          .map((it) => ({ name: it.result.name, before: it.file.size, after: it.result.blob.size }));
      }

      runBtn.addEventListener("click", run);
      zipBtn.addEventListener("click", downloadZip);
      if (copyBtn) {
        copyBtn.addEventListener("click", () => {
          const text = buildBatchSummaryText(summaryRows());
          if (text) copyText(text, copiedFlag);
        });
      }
      clearBtn.addEventListener("click", clear);

      return { add, invalidate, clear };
    }

    /* ---- before/after compare slider ----

       "Did it wreck my photo" is the unspoken question behind every compression
       tool, and a byte count cannot answer it. Two images stacked, the top one
       clipped by a draggable divider, plus a 1:1 zoom so the artifacts can be
       judged at real pixel scale rather than at whatever size the panel happens
       to be. Returns no-ops when the markup is absent, like everything else
       here, so the same script still runs on pages without it. */
    function createCompare(prefix) {
      const root = $(prefix + "-compare");
      if (!root) return { setBefore() {}, setAfter() {}, reset() {} };

      const frame = $(prefix + "-frame");
      const before = $(prefix + "-before");
      const after = $(prefix + "-after");
      const handle = $(prefix + "-handle");
      const divider = $(prefix + "-divider");
      const zoomBtn = $(prefix + "-zoom");

      let pos = 50;
      let dragging = false;

      function paint() {
        // The compressed layer is clipped away on the LEFT of the divider, so
        // the original shows on the left and the result on the right, matching
        // the two labels.
        after.style.clipPath = `inset(0 0 0 ${pos}%)`;
        handle.style.left = pos + "%";
        if (divider) divider.style.left = pos + "%";
        const n = Math.round(pos);
        handle.setAttribute("aria-valuenow", String(n));
        handle.setAttribute("aria-valuetext", `${n}% original, ${100 - n}% compressed`);
      }

      function posFromEvent(e) {
        const r = frame.getBoundingClientRect();
        if (!r.width) return pos;
        return clamp(((e.clientX - r.left) / r.width) * 100, 0, 100);
      }

      function move(e) {
        pos = posFromEvent(e);
        paint();
      }

      // Pointer events cover mouse, pen and touch in one path; the capture is
      // what keeps a drag alive when the finger leaves the image.
      handle.addEventListener("pointerdown", (e) => {
        dragging = true;
        if (handle.setPointerCapture) handle.setPointerCapture(e.pointerId);
        e.preventDefault();
      });
      handle.addEventListener("pointermove", (e) => { if (dragging) move(e); });
      const stop = () => { dragging = false; };
      handle.addEventListener("pointerup", stop);
      handle.addEventListener("pointercancel", stop);
      // Clicking anywhere on the image jumps the divider there, which is
      // quicker than dragging it across on a phone.
      frame.addEventListener("pointerdown", (e) => {
        if (e.target === handle) return;
        move(e);
      });

      handle.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 10 : 2;
        let next = pos;
        if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = pos - step;
        else if (e.key === "ArrowRight" || e.key === "ArrowUp") next = pos + step;
        else if (e.key === "Home") next = 0;
        else if (e.key === "End") next = 100;
        else return;
        e.preventDefault();
        pos = clamp(next, 0, 100);
        paint();
      });

      function applyZoom() {
        const actual = root.dataset.zoom === "actual";
        if (actual && before.naturalWidth) {
          // One image pixel per CSS pixel — the only scale at which a
          // compression artifact is the size it will actually be.
          frame.style.width = before.naturalWidth + "px";
          frame.style.height = before.naturalHeight + "px";
        } else {
          frame.style.width = "";
          frame.style.height = "";
        }
        if (zoomBtn) {
          zoomBtn.setAttribute("aria-pressed", String(actual));
          zoomBtn.textContent = actual ? "Fit to panel" : "Zoom to 1:1";
        }
      }

      if (zoomBtn) {
        zoomBtn.addEventListener("click", () => {
          root.dataset.zoom = root.dataset.zoom === "actual" ? "fit" : "actual";
          applyZoom();
          if (root.dataset.zoom === "actual") {
            // Land in the middle of the picture rather than the top-left
            // corner, which is usually sky.
            root.scrollLeft = (frame.offsetWidth - root.clientWidth) / 2;
            root.scrollTop = (frame.offsetHeight - root.clientHeight) / 2;
          }
        });
      }

      return {
        setBefore(url) {
          before.src = url;
          before.onload = applyZoom;
          paint();
        },
        setAfter(url) {
          after.src = url;
          paint();
        },
        reset() {
          pos = 50;
          root.dataset.zoom = "fit";
          applyZoom();
          paint();
        },
      };
    }

    // Fallback: paste anywhere on a tool page routes to whichever tool panel
    // is currently visible, so users don't have to click the dropzone first.
    document.addEventListener("paste", (e) => {
      const active = document.activeElement;
      const isTextField = active && (active.tagName === "TEXTAREA" || (active.tagName === "INPUT" && active.type !== "file"));
      if (isTextField) return;
      const items = e.clipboardData && e.clipboardData.items;
      if (!items) return;
      let file = null;
      for (const item of items) {
        if (item.type && item.type.indexOf("image/") === 0) {
          file = item.getAsFile();
          break;
        }
      }
      if (!file) return;
      const panels = document.querySelectorAll(".tool-panel[data-prefix]");
      let prefix = null;
      panels.forEach((p) => {
        if (!prefix && p.offsetParent !== null) prefix = p.dataset.prefix;
      });
      if (!prefix) prefix = Object.keys(dropzoneRegistry)[0];
      if (prefix && dropzoneRegistry[prefix]) dropzoneRegistry[prefix](file);
    });

    /* ---- theme toggle ---- */
    (function initTheme() {
      const stored = localStorage.getItem("psk-theme");
      if (stored) document.documentElement.setAttribute("data-theme", stored);
      const toggle = $("theme-toggle");
      if (!toggle) return;
      toggle.addEventListener("click", () => {
        const current =
          document.documentElement.getAttribute("data-theme") ||
          (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
        const next = current === "dark" ? "light" : "dark";
        document.documentElement.setAttribute("data-theme", next);
        localStorage.setItem("psk-theme", next);
      });
    })();

    /* ================================================================== *
     * toolbar v1 — the portfolio navigation pattern.                      *
     * Spec: github.com/ngineer420/ngineer420.github.io/issues/13          *
     *                                                                     *
     * Copy this block verbatim into any site in the portfolio. It is pure *
     * enhancement: with JS off, <details>/<summary> still discloses the   *
     * sheet, the rail is still a native scroll container of real links,   *
     * the edge fades are still CSS and the scrim is still CSS. Only the   *
     * active-chip centring, Escape and click-outside are lost.            *
     * ================================================================== */
    (function toolbar() {
      const bar = document.querySelector(".toolbar");
      if (!bar) return;
      const rail = bar.querySelector(".tb-rail");
      const menu = bar.querySelector("details.tb-menu");

      if (rail) {
        // js-on hands the right-hand fade over to measurement. Until then the
        // CSS keeps it on, so a JS-disabled visitor never gets a chip clipped
        // mid-word with nothing to say there is more of the row.
        rail.classList.add("js-on");
        const fades = () => {
          const max = rail.scrollWidth - rail.clientWidth;
          rail.classList.toggle("can-l", rail.scrollLeft > 1);
          rail.classList.toggle("can-r", rail.scrollLeft < max - 1);
        };
        // Assigning scrollLeft, never scrollIntoView: that also scrolls every
        // ancestor and the document, which on a phone drops the visitor below
        // the header on arrival.
        const current = rail.querySelector("[aria-current]");
        if (current) {
          rail.scrollLeft = Math.max(
            0,
            current.offsetLeft - (rail.clientWidth - current.offsetWidth) / 2
          );
        }
        rail.addEventListener("scroll", fades, { passive: true });
        window.addEventListener("resize", fades);
        fades();
      }

      if (menu) {
        // A disclosure, not a modal: focus is deliberately not trapped, Tab
        // walks the links and straight out the other side.
        window.addEventListener("keydown", (e) => {
          if (e.key !== "Escape" || !menu.open) return;
          menu.open = false;
          const summary = menu.querySelector("summary");
          if (summary) summary.focus();
        });
        document.addEventListener("click", (e) => {
          if (menu.open && !menu.contains(e.target)) menu.open = false;
        });
      }
    })();

    /* ---- homepage instant tool switch ----
       The toolbar's links are real navigation on every page. The homepage is
       the one page that mounts all eight panels, so there a plain left-click
       swaps the panel in place and pushes the tool's clean URL instead. Both
       the rail and the sheet are wired, so the two routes to a tool behave
       identically. This is no longer a tablist: the roving tabindex that came
       with that pattern was shipping seven of the eight links with
       tabindex="-1", i.e. out of tab order entirely. */
    (function initToolPanels() {
      const bar = document.querySelector(".toolbar");
      if (!bar) return;

      const PANEL_FOR = {
        "/resize-image": "panel-resize",
        "/compress-image": "panel-compress",
        "/crop-image": "panel-crop",
        "/convert-image": "panel-convert",
        "/rotate-image": "panel-rotate",
        "/image-to-base64": "panel-base64",
        "/favicon-generator": "panel-favicon",
        "/exif-viewer": "panel-exif",
      };
      const DEFAULT_HREF = "/resize-image";

      const panels = {};
      let complete = true;
      Object.keys(PANEL_FOR).forEach((href) => {
        const el = $(PANEL_FOR[href]);
        panels[PANEL_FOR[href]] = el;
        if (!el) complete = false;
      });
      // A standalone tool page mounts one panel — its links are plain
      // navigation and there is nothing here to do.
      if (!complete) return;

      function cleanPath(pathname) {
        const p = pathname.replace(/\/index\.html$/, "/").replace(/\.html$/, "").replace(/\/+$/, "");
        return p || "/";
      }
      function panelForPath(pathname) {
        const clean = cleanPath(pathname);
        if (PANEL_FOR[clean]) return PANEL_FOR[clean];
        // A target-size page is the compressor with a budget baked in, so a
        // history entry for one of them is still the compress panel.
        if (clean.indexOf("/compress-image") === 0) return "panel-compress";
        return null;
      }

      const links = Array.from(bar.querySelectorAll(".tb-rail a[href], .tb-sheet a[href]"));

      function activate(href, push) {
        const id = panelForPath(href) || panelForPath(DEFAULT_HREF);
        Object.keys(panels).forEach((pid) => {
          const on = pid === id;
          panels[pid].hidden = !on;
          panels[pid].classList.toggle("active", on);
        });
        // "page" only for a link that really points here; the tool that owns a
        // target-size variant gets "true" — the current item, not the page.
        const here = cleanPath(href);
        links.forEach((a) => {
          const to = a.getAttribute("href");
          if (cleanPath(to) === here) a.setAttribute("aria-current", "page");
          else if (panelForPath(to) === id) a.setAttribute("aria-current", "true");
          else a.removeAttribute("aria-current");
        });
        if (push) history.pushState({ panel: id }, "", href);
      }

      bar.addEventListener("click", (e) => {
        const link = e.target.closest("a[href]");
        if (!link || !bar.contains(link) || e.defaultPrevented) return;
        if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        const href = link.getAttribute("href");
        if (!panelForPath(href)) return;
        e.preventDefault();
        activate(href, true);
        const menu = bar.querySelector("details.tb-menu");
        if (menu) menu.open = false;
      });

      window.addEventListener("popstate", () => activate(location.pathname, false));
      activate(location.pathname, false);
    })();

    const yearEl = $("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

    /* The cropper fills this in when it is mounted. A platform preset is an
       exact pixel size, and the honest way to reach one without stretching is
       to crop to its ratio first — so on a page carrying both tools, picking a
       preset in the resizer sets the cropper to the matching shape. On a page
       carrying only one of them it stays null and nothing happens. */
    let applyCropRatio = null;

    /* ---- Resize tool ---- */
    (function resizeTool() {
      const workspace = $("resize-workspace");
      if (!workspace) return;

      const canvas = $("resize-canvas");
      const ctx = canvas.getContext("2d");
      const fname = $("resize-fname");
      const meta = $("resize-meta");
      const errorEl = $("resize-error");
      const unitPx = $("resize-unit-px");
      const unitPercent = $("resize-unit-percent");
      const widthInput = $("resize-width");
      const heightInput = $("resize-height");
      const percentInput = $("resize-percent");
      const percentField = $("resize-percent-field");
      const dimensionField = $("resize-dimension-field");
      const lockCheckbox = $("resize-lock");
      const formatSelect = $("resize-format");
      const qualityField = $("resize-quality-field");
      const qualityInput = $("resize-quality");
      const qualityValue = $("resize-quality-value");
      const downloadBtn = $("resize-download");
      const panel = workspace.closest(".tool-panel");
      // Scoped to this panel: the homepage mounts the compressor's target-size
      // chips too, and a document-wide lookup would find whichever came first.
      const presetChips = panel ? panel.querySelector(".size-chips") : null;

      let current = null; // { img, width, height, size, type, name }
      let lastChanged = "width";
      let preset = null;  // { width, height } while a platform size is picked

      function unit() {
        return unitPercent && unitPercent.getAttribute("aria-pressed") === "true" ? "percent" : "px";
      }

      /* Pick a platform size — from a chip, or from the page's own seed.

         Both numbers are the point of a preset, so the aspect lock comes off:
         left on, the height is recomputed from the source image and the
         preset quietly becomes "the right width, some other height". The page
         copy says the same thing in words — crop to the ratio first, then
         resize to the exact pixels, or accept the stretch. */
      function applyPreset(dims) {
        preset = dims || null;
        if (preset) {
          setUnit("px");
          widthInput.value = preset.width;
          heightInput.value = preset.height;
          lockCheckbox.checked = false;
          if (applyCropRatio) {
            applyCropRatio(preset.width / preset.height, ratioLabel(preset.width, preset.height));
          }
        } else if (current) {
          widthInput.value = current.width;
          heightInput.value = current.height;
          lockCheckbox.checked = true;
        }
        lastChanged = "width";
        rerender();
      }

      // Split out so the batch can apply the same rule to each image's own
      // dimensions: "50%" means half of each source, not half of the one in
      // the preview.
      function targetFor(sourceW, sourceH) {
        if (unit() === "percent") return resizeByPercent(sourceW, sourceH, percentInput.value);
        return resizeByDimension(sourceW, sourceH, widthInput.value, heightInput.value, lockCheckbox.checked, lastChanged);
      }

      function targetDimensions() {
        if (!current) return { width: 1, height: 1 };
        return targetFor(current.width, current.height);
      }

      function outputFormat(type) {
        const f = formatSelect.value;
        return f === "keep" ? formatFromMimeType(type !== undefined ? type : current.type) : f;
      }

      const render = debounce(async () => {
        if (!current) return;
        const { width, height } = targetDimensions();
        canvas.width = width;
        canvas.height = height;
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(current.img, 0, 0, width, height);

        const fmt = outputFormat();
        const lossy = fmt === "jpeg" || fmt === "webp";
        qualityField.hidden = !lossy;
        const quality = lossy ? Number(qualityInput.value) / 100 : undefined;
        const blob = await canvasToBlob(canvas, mimeForFormat(fmt), quality);
        if (!blob) return;
        setMeta(meta, [
          ["New size", `${width}×${height}px`],
          ["File size", formatBytes(blob.size)],
          ["Change", `${percentSaved(current.size, blob.size)}%`, percentSaved(current.size, blob.size) >= 0 ? "save-tag" : ""],
        ]);
        downloadBtn.disabled = false;
        downloadBtn._blob = blob;
        downloadBtn._name = `${stripExtension(current.name)}-${width}x${height}.${extensionForFormat(fmt)}`;
      }, 120);

      const batch = createBatch("resize", {
        zipName: "resized",
        process: async (file, onProgress) => {
          const loaded = await loadImageFromFile(file);
          onProgress(0.25);
          try {
            const { width, height } = targetFor(loaded.width, loaded.height);
            const off = document.createElement("canvas");
            off.width = width;
            off.height = height;
            off.getContext("2d").drawImage(loaded.img, 0, 0, width, height);
            onProgress(0.6);
            const fmt = outputFormat(loaded.type);
            const lossy = fmt === "jpeg" || fmt === "webp";
            const blob = await canvasToBlob(off, mimeForFormat(fmt), lossy ? Number(qualityInput.value) / 100 : undefined);
            if (!blob) throw new Error("This browser can't encode that format");
            onProgress(1);
            return { blob, name: batchOutputName(loaded.name, `${width}x${height}`, extensionForFormat(fmt)) };
          } finally {
            URL.revokeObjectURL(loaded.url);
          }
        },
      });

      function rerender() {
        render();
        if (batch) batch.invalidate();
      }

      wireDropzone(
        "resize",
        async (file) => {
          try {
            hideError(errorEl);
            const loaded = await loadImageFromFile(file);
            current = loaded;
            fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px · ${formatBytes(loaded.size)}`;
            // A preset page has already said what size the visitor wants, so
            // the image's own dimensions must not overwrite it on load.
            widthInput.value = preset ? preset.width : loaded.width;
            heightInput.value = preset ? preset.height : loaded.height;
            percentInput.value = 100;
            lastChanged = "width";
            workspace.hidden = false;
            workspace.closest(".tool-panel").classList.add("has-image");
            render();
          } catch (err) {
            showError(errorEl, err.message);
          }
        },
        (files) => batch && batch.add(files)
      );

      $("resize-change").addEventListener("click", () => $("resize-file").click());

      function setUnit(next) {
        unitPx.setAttribute("aria-pressed", String(next === "px"));
        unitPercent.setAttribute("aria-pressed", String(next === "percent"));
        percentField.hidden = next !== "percent";
        dimensionField.hidden = next === "percent";
        rerender();
      }
      unitPx.addEventListener("click", () => setUnit("px"));
      unitPercent.addEventListener("click", () => setUnit("percent"));

      widthInput.addEventListener("input", () => { lastChanged = "width"; rerender(); });
      heightInput.addEventListener("input", () => { lastChanged = "height"; rerender(); });
      percentInput.addEventListener("input", rerender);
      lockCheckbox.addEventListener("change", rerender);
      formatSelect.addEventListener("change", rerender);
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        rerender();
      });

      downloadBtn.addEventListener("click", () => {
        if (downloadBtn._blob) downloadBlob(downloadBtn._blob, downloadBtn._name);
      });

      /* The platform size pages are siblings of this control, not peers of the
         eight tools, so they live here as real links. A plain click swaps the
         dimensions in place — reloading would throw away the image already
         loaded — and replaceState keeps the URL and the announced identity in
         step without stacking a history entry per chip. With JS off the link
         simply navigates and the destination seeds itself from its own
         data-resize-size. */
      if (presetChips) {
        presetChips.addEventListener("click", (e) => {
          const link = e.target.closest("a[data-width]");
          if (!link || e.defaultPrevented) return;
          if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          applyPreset(parseDimensionSeed(
            link.getAttribute("data-width") + "x" + link.getAttribute("data-height")
          ));
          Array.from(presetChips.querySelectorAll("a[data-width]")).forEach((el) => {
            if (el === link) el.setAttribute("aria-current", "page");
            else el.removeAttribute("aria-current");
          });
          history.replaceState(history.state, "", link.getAttribute("href"));
        });
      }

      /* A platform size page pre-seeds the dimensions from the body tag — one
         attribute rather than a query string, so /youtube-thumbnail-size opens
         ready to go and the canonical URL stays clean. */
      const seeded = parseDimensionSeed(document.body.getAttribute("data-resize-size") || "");
      if (seeded) applyPreset(seeded);
    })();

    /* ---- Compress tool ---- */
    (function compressTool() {
      const workspace = $("compress-workspace");
      if (!workspace) return;

      const canvas = $("compress-canvas");
      const ctx = canvas.getContext("2d");
      const fname = $("compress-fname");
      const meta = $("compress-meta");
      const errorEl = $("compress-error");
      const formatSelect = $("compress-format");
      const qualityField = $("compress-quality-field");
      const qualityInput = $("compress-quality");
      const qualityValue = $("compress-quality-value");
      const downloadBtn = $("compress-download");

      const targetOn = $("compress-target-on");
      const targetBody = $("compress-target-body");
      const targetAmount = $("compress-target-amount");
      const targetUnit = $("compress-target-unit");
      const targetScale = $("compress-target-scale");
      const targetStatus = $("compress-target-status");
      const targetCancel = $("compress-target-cancel");
      // Scoped to this panel for the same reason the resizer's is: the
      // homepage now mounts two chip rows, and a document-wide lookup takes
      // whichever is first in the DOM.
      const sizeChips = (workspace.closest(".tool-panel") || document).querySelector(".size-chips");

      const compare = createCompare("compress");

      let current = null;
      let outUrl = null; // object URL of the compressed preview; revoked on replace

      /* One token guards every async render. Bumping it makes any run already
         in flight abandon itself at its next checkpoint, which is what makes
         both the Cancel button and "the visitor typed another digit" safe —
         without it two overlapping searches can finish out of order and the
         slower, staler one wins. */
      let runToken = 0;

      function setPreviewBlob(blob) {
        if (outUrl) URL.revokeObjectURL(outUrl);
        outUrl = URL.createObjectURL(blob);
        compare.setAfter(outUrl);
      }

      function targetBudget() {
        return parseBudget(targetAmount.value, targetUnit.value);
      }

      function setBusy(busy) {
        if (targetCancel) targetCancel.hidden = !busy;
        workspace.classList.toggle("is-working", busy);
      }

      /* Draw `current` into the canvas at `scale`, ready to encode. Kept
         separate from the encode so the binary search can re-encode the same
         pixels eight times without redrawing them eight times. */
      function drawAt(scale, fmt) {
        const w = Math.max(1, Math.round(current.width * scale));
        const h = Math.max(1, Math.round(current.height * scale));
        canvas.width = w;
        canvas.height = h;
        ctx.clearRect(0, 0, w, h);
        if (fmt === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, w, h);
        }
        ctx.drawImage(current.img, 0, 0, w, h);
        return { width: w, height: h };
      }

      function applyResult(blob, fmt, extra) {
        const saved = percentSaved(current.size, blob.size);
        const rows = [
          ["Before", formatBytes(current.size)],
          ["After", formatBytes(blob.size)],
          ["Savings", `${saved}%`, saved >= 0 ? "save-tag" : ""],
        ];
        if (extra) rows.push(extra);
        setMeta(meta, rows);
        setPreviewBlob(blob);
        downloadBtn.disabled = false;
        downloadBtn._blob = blob;
        downloadBtn._name = `${stripExtension(current.name)}-compressed.${extensionForFormat(fmt)}`;
      }

      /* The plain quality-slider path, unchanged in behaviour. */
      async function renderByQuality(token) {
        const fmt = formatSelect.value;
        const lossy = fmt === "jpeg" || fmt === "webp";
        qualityField.hidden = !lossy;
        drawAt(1, fmt);
        const blob = await canvasToBlob(canvas, mimeForFormat(fmt), lossy ? Number(qualityInput.value) / 100 : undefined);
        if (token !== runToken || !blob) return;
        applyResult(blob, fmt);
      }

      /* The target-size path: bisect quality, and only then reach for the
         pixels. Every encode is a full-size canvas.toBlob on the main thread,
         so the loop yields to the browser before each one — that is what keeps
         the tab responsive on a 12 megapixel photo AND what lets the Cancel
         click actually be delivered mid-run. */
      async function renderByTarget(token) {
        const budget = targetBudget();
        if (!budget) {
          targetStatus.textContent = "Type a target size to search for.";
          return;
        }
        // PNG has no quality knob for the search to bisect, so target mode
        // needs a lossy format. Say which one it picked rather than silently
        // changing the visitor's file type.
        const chosen = targetFormatFor(formatSelect.value);
        if (chosen.switched) formatSelect.value = chosen.format;
        const fmt = chosen.format;
        qualityField.hidden = true;

        setBusy(true);
        targetStatus.textContent = "Searching…";

        try {
          let scale = 1;
          let dims = drawAt(scale, fmt);
          let lastBlob = null;
          const encode = async (quality) => {
            // Hand the frame back to the browser between encodes.
            await new Promise((resolve) => setTimeout(resolve, 0));
            const blob = await canvasToBlob(canvas, mimeForFormat(fmt), quality);
            if (!blob) throw new Error("This browser can't encode that format");
            lastBlob = blob;
            return blob.size;
          };

          let result = await targetQualitySearch(encode, budget, {
            shouldCancel: () => token !== runToken,
          });
          if (token !== runToken) return;

          let note = "";
          // Quality alone missed. Shrink the pixels once, using the measured
          // shortfall rather than a guess, and search again at the new size.
          if (!result.fits && targetScale.checked && result.size > 0) {
            scale = downscaleFactorForBudget(result.size, budget);
            dims = drawAt(scale, fmt);
            targetStatus.textContent = `Quality alone was not enough — trying ${dims.width}×${dims.height}…`;
            result = await targetQualitySearch(encode, budget, {
              shouldCancel: () => token !== runToken,
            });
            if (token !== runToken) return;
            note = ` Resized to ${dims.width}×${dims.height}.`;
          }

          if (!lastBlob) return;
          // The search's last encode is not necessarily the winning one, so
          // re-encode at the quality it settled on before handing it over.
          await new Promise((resolve) => setTimeout(resolve, 0));
          const finalBlob = await canvasToBlob(canvas, mimeForFormat(fmt), result.quality);
          if (token !== runToken || !finalBlob) return;

          applyResult(finalBlob, fmt, ["Quality", `${Math.round(result.quality * 100)}%`]);
          qualityInput.value = String(Math.round(result.quality * 100));
          qualityValue.textContent = qualityInput.value + "%";
          targetStatus.textContent =
            describeTargetResult(result, budget) + note +
            (chosen.switched ? " PNG has no quality setting, so this was encoded as WebP." : "");
          targetStatus.classList.toggle("is-miss", !result.fits);
        } catch (err) {
          targetStatus.textContent = err && err.message ? err.message : "That target could not be reached.";
        } finally {
          if (token === runToken) setBusy(false);
        }
      }

      const render = debounce(async () => {
        if (!current) return;
        const token = ++runToken;
        if (targetOn && targetOn.checked) await renderByTarget(token);
        else await renderByQuality(token);
      }, 250);

      // The batch reuses whatever the sliders above are set to — the first
      // dropped image stays in the preview precisely so those settings can be
      // judged on a real photo before being applied to the whole folder.
      const batch = createBatch("compress", {
        zipName: "compressed",
        process: async (file, onProgress) => {
          const loaded = await loadImageFromFile(file);
          onProgress(0.2);
          try {
            const targeting = targetOn && targetOn.checked;
            const budget = targeting ? targetBudget() : null;
            // Target mode needs a lossy encoder, and the batch has to make the
            // same substitution the single-image path does or the two would
            // disagree about what a PNG becomes.
            const fmt = budget ? targetFormatFor(formatSelect.value).format : formatSelect.value;
            const off = document.createElement("canvas");
            const octx = off.getContext("2d");
            function draw(scale) {
              off.width = Math.max(1, Math.round(loaded.width * scale));
              off.height = Math.max(1, Math.round(loaded.height * scale));
              octx.clearRect(0, 0, off.width, off.height);
              if (fmt === "jpeg") {
                octx.fillStyle = "#ffffff";
                octx.fillRect(0, 0, off.width, off.height);
              }
              octx.drawImage(loaded.img, 0, 0, off.width, off.height);
            }
            draw(1);
            onProgress(0.4);

            let blob;
            if (budget) {
              /* Per file, not per batch: a 12 MP photo and a screenshot need
                 completely different quality to land under the same budget, so
                 the search runs again for each one. The pass cap is what keeps
                 that affordable across a folder. */
              const encode = async (q) => {
                await new Promise((resolve) => setTimeout(resolve, 0));
                const b = await canvasToBlob(off, mimeForFormat(fmt), q);
                if (!b) throw new Error("This browser can't encode that format");
                return b.size;
              };
              let result = await targetQualitySearch(encode, budget);
              if (!result.fits && targetScale.checked && result.size > 0) {
                draw(downscaleFactorForBudget(result.size, budget));
                result = await targetQualitySearch(encode, budget);
              }
              onProgress(0.85);
              blob = await canvasToBlob(off, mimeForFormat(fmt), result.quality);
            } else {
              const lossy = fmt === "jpeg" || fmt === "webp";
              onProgress(0.6);
              blob = await canvasToBlob(off, mimeForFormat(fmt), lossy ? Number(qualityInput.value) / 100 : undefined);
            }
            if (!blob) throw new Error("This browser can't encode that format");
            onProgress(1);
            return { blob, name: batchOutputName(loaded.name, "compressed", extensionForFormat(fmt)) };
          } finally {
            URL.revokeObjectURL(loaded.url);
          }
        },
      });

      wireDropzone(
        "compress",
        async (file) => {
          try {
            hideError(errorEl);
            const loaded = await loadImageFromFile(file);
            // The previous source URL is dead the moment a new image lands;
            // without this every dropped file leaks one.
            if (current && current.url) URL.revokeObjectURL(current.url);
            current = loaded;
            fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px`;
            formatSelect.value = loaded.type === "image/png" ? "webp" : "jpeg";
            compare.reset();
            compare.setBefore(loaded.url);
            workspace.hidden = false;
            workspace.closest(".tool-panel").classList.add("has-image");
            render();
          } catch (err) {
            showError(errorEl, err.message);
          }
        },
        (files) => batch && batch.add(files)
      );

      $("compress-change").addEventListener("click", () => $("compress-file").click());
      formatSelect.addEventListener("change", () => {
        render();
        if (batch) batch.invalidate();
      });
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        render();
        if (batch) batch.invalidate();
      });
      downloadBtn.addEventListener("click", () => {
        if (downloadBtn._blob) downloadBlob(downloadBtn._blob, downloadBtn._name);
      });

      /* ---- target size wiring ---- */
      if (targetOn) {
        function syncTargetUI() {
          const on = targetOn.checked;
          targetBody.hidden = !on;
          // The quality slider is the search's output in target mode, not its
          // input, so it stops being a control and becomes a readout.
          qualityField.hidden = on;
          if (!on) targetStatus.textContent = "";
        }

        targetOn.addEventListener("change", () => {
          syncTargetUI();
          render();
          if (batch) batch.invalidate();
        });
        [targetAmount, targetUnit, targetScale].forEach((el) => {
          el.addEventListener("input", () => {
            targetStatus.classList.remove("is-miss");
            render();
            if (batch) batch.invalidate();
          });
          el.addEventListener("change", () => {
            render();
            if (batch) batch.invalidate();
          });
        });
        // A budget in bytes back into the two fields that express it.
        function showBudget(bytes) {
          if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
            targetUnit.value = "mb";
            targetAmount.value = String(bytes / (1024 * 1024));
          } else {
            targetUnit.value = "kb";
            targetAmount.value = String(Math.round(bytes / 1024));
          }
        }

        /* The target-size landing pages are siblings of this control, not peers
           of the eight tools, so they live here as real links. A plain click
           switches the budget in place — reloading would throw away the image
           already loaded — and replaceState keeps the URL and the announced
           identity in step without stacking a history entry per chip. With JS
           off the link simply navigates and the destination seeds itself from
           its own data-compress-target. */
        if (sizeChips) {
          sizeChips.addEventListener("click", (e) => {
            const link = e.target.closest("a[data-target]");
            if (!link || e.defaultPrevented) return;
            if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            const bytes = parseBudget(link.getAttribute("data-target"), "b");
            targetOn.checked = Boolean(bytes);
            if (bytes) showBudget(bytes);
            Array.from(sizeChips.querySelectorAll("a[data-target]")).forEach((el) => {
              if (el === link) el.setAttribute("aria-current", "page");
              else el.removeAttribute("aria-current");
            });
            history.replaceState(history.state, "", link.getAttribute("href"));
            targetStatus.classList.remove("is-miss");
            syncTargetUI();
            render();
            if (batch) batch.invalidate();
          });
        }
        // Bumping the token is the whole cancellation mechanism: the run in
        // flight checks it before every encode and abandons itself.
        targetCancel.addEventListener("click", () => {
          runToken += 1;
          setBusy(false);
          targetStatus.textContent = "Cancelled.";
        });

        /* A landing page pre-seeds the budget from the body tag — one attribute
           rather than a query string, so /compress-image-to-100kb opens ready
           to go and the canonical URL stays clean. */
        const seeded = document.body.getAttribute("data-compress-target");
        if (seeded) {
          const bytes = budgetFromPreset(seeded) || parseBudget(seeded, "b");
          if (bytes) {
            targetOn.checked = true;
            showBudget(bytes);
          }
        }
        syncTargetUI();
      }
    })();

    /* ---- Crop tool ---- */
    (function cropTool() {
      const workspace = $("crop-workspace");
      if (!workspace) return;

      const stageWrap = $("crop-stage-wrap");
      const canvas = $("crop-canvas");
      const ctx = canvas.getContext("2d");
      const boxEl = $("crop-box");
      const fname = $("crop-fname");
      const meta = $("crop-meta");
      const errorEl = $("crop-error");
      const formatSelect = $("crop-format");
      const downloadBtn = $("crop-download");
      const aspectGroup = $("crop-aspect-group");
      const aspectBtns = Array.from(document.querySelectorAll("#crop-aspect-group [data-ratio]"));

      let current = null;
      let box = { x: 0, y: 0, w: 100, h: 100 };
      let ratio = 0; // 0 = free
      let drag = null; // { mode: 'move'|'resize', corner, startX, startY, startBox }

      function bounds() {
        return { width: canvas.width, height: canvas.height };
      }

      function paintBox() {
        boxEl.style.left = box.x + "px";
        boxEl.style.top = box.y + "px";
        boxEl.style.width = box.w + "px";
        boxEl.style.height = box.h + "px";
        const natural = current ? scaleRectToNatural(box, canvas.width, canvas.height, current.width, current.height) : { w: 0, h: 0 };
        setMeta(meta, [["Selection", `${natural.w}×${natural.h}px`]]);
      }

      function setRatio(r, btn) {
        ratio = r;
        aspectBtns.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        box = applyAspectRatio(box, ratio, bounds());
        paintBox();
      }

      aspectBtns.forEach((btn) => {
        btn.addEventListener("click", () => setRatio(Number(btn.dataset.ratio) || 0, btn));
      });

      /* Called by the resizer when a platform preset is picked on a page that
         mounts both tools. Most presets have no button here — 9:16, 2:3, 4:1 —
         so rather than applying a ratio with nothing on screen showing it, an
         extra button appears in the group carrying the ratio's own label. */
      applyCropRatio = function (value, label) {
        const r = Number(value) || 0;
        if (!r || !aspectGroup) return;
        const match = aspectBtns.find((b) => Math.abs((Number(b.dataset.ratio) || 0) - r) < 0.005);
        if (match) {
          setRatio(Number(match.dataset.ratio) || 0, match);
          return;
        }
        let custom = $("crop-aspect-preset");
        if (!custom) {
          custom = document.createElement("button");
          custom.type = "button";
          custom.id = "crop-aspect-preset";
          custom.addEventListener("click", () => setRatio(Number(custom.dataset.ratio) || 0, custom));
          aspectGroup.appendChild(custom);
          aspectBtns.push(custom);
        }
        custom.dataset.ratio = String(r);
        custom.textContent = label || ratioLabel(Math.round(r * 1000), 1000);
        setRatio(r, custom);
      };

      function pointerPos(e) {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      }

      boxEl.addEventListener("pointerdown", (e) => {
        if (e.target.classList.contains("crop-handle")) return;
        e.preventDefault();
        boxEl.setPointerCapture(e.pointerId);
        drag = { mode: "move", startPointer: pointerPos(e), startBox: { ...box } };
      });

      Array.from(boxEl.querySelectorAll(".crop-handle")).forEach((handle) => {
        handle.addEventListener("pointerdown", (e) => {
          e.preventDefault();
          e.stopPropagation();
          handle.setPointerCapture(e.pointerId);
          drag = { mode: "resize", corner: handle.dataset.corner, startPointer: pointerPos(e), startBox: { ...box } };
        });
      });

      window.addEventListener("pointermove", (e) => {
        if (!drag || !current) return;
        const p = pointerPos(e);
        const dx = p.x - drag.startPointer.x;
        const dy = p.y - drag.startPointer.y;
        const b = bounds();

        if (drag.mode === "move") {
          box = clampCropBox({ ...drag.startBox, x: drag.startBox.x + dx, y: drag.startBox.y + dy }, b);
        } else {
          const sb = drag.startBox;
          let nx = sb.x, ny = sb.y, nw = sb.w, nh = sb.h;
          if (drag.corner.includes("e")) nw = sb.w + dx;
          if (drag.corner.includes("s")) nh = sb.h + dy;
          if (drag.corner.includes("w")) { nx = sb.x + dx; nw = sb.w - dx; }
          if (drag.corner.includes("n")) { ny = sb.y + dy; nh = sb.h - dy; }
          if (ratio) {
            nh = nw / ratio;
            if (drag.corner.includes("n")) ny = sb.y + sb.h - nh;
          }
          box = clampCropBox({ x: nx, y: ny, w: nw, h: nh }, b);
        }
        paintBox();
      });

      window.addEventListener("pointerup", () => { drag = null; });

      wireDropzone("crop", async (file) => {
        try {
          hideError(errorEl);
          const loaded = await loadImageFromFile(file);
          current = loaded;
          fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px`;

          const maxDisplay = 640;
          const scale = Math.min(1, maxDisplay / loaded.width);
          canvas.width = Math.round(loaded.width * scale);
          canvas.height = Math.round(loaded.height * scale);
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(loaded.img, 0, 0, canvas.width, canvas.height);

          stageWrap.style.width = canvas.width + "px";
          box = { x: canvas.width * 0.1, y: canvas.height * 0.1, w: canvas.width * 0.8, h: canvas.height * 0.8 };
          ratio = 0;
          aspectBtns.forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ratio === "0")));
          paintBox();

          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
        } catch (err) {
          showError(errorEl, err.message);
        }
      });

      $("crop-change").addEventListener("click", () => $("crop-file").click());

      downloadBtn.addEventListener("click", async () => {
        if (!current) return;
        const natural = scaleRectToNatural(box, canvas.width, canvas.height, current.width, current.height);
        const out = document.createElement("canvas");
        out.width = natural.w;
        out.height = natural.h;
        const octx = out.getContext("2d");
        const fmt = formatSelect.value === "keep" ? formatFromMimeType(current.type) : formatSelect.value;
        if (fmt === "jpeg") {
          octx.fillStyle = "#ffffff";
          octx.fillRect(0, 0, natural.w, natural.h);
        }
        octx.drawImage(current.img, natural.x, natural.y, natural.w, natural.h, 0, 0, natural.w, natural.h);
        const blob = await canvasToBlob(out, mimeForFormat(fmt), fmt === "jpeg" ? 0.92 : undefined);
        if (blob) downloadBlob(blob, `${stripExtension(current.name)}-cropped.${extensionForFormat(fmt)}`);
      });
    })();

    /* ---- Convert tool ---- */
    (function convertTool() {
      const workspace = $("convert-workspace");
      if (!workspace) return;

      const canvas = $("convert-canvas");
      const ctx = canvas.getContext("2d");
      const fname = $("convert-fname");
      const meta = $("convert-meta");
      const errorEl = $("convert-error");
      const bgNote = $("convert-bg-note");
      const formatSelect = $("convert-format");
      const qualityField = $("convert-quality-field");
      const qualityInput = $("convert-quality");
      const qualityValue = $("convert-quality-value");
      const downloadBtn = $("convert-download");

      let current = null;

      const render = debounce(async () => {
        if (!current) return;
        canvas.width = current.width;
        canvas.height = current.height;
        ctx.clearRect(0, 0, current.width, current.height);
        const fmt = formatSelect.value;
        bgNote.hidden = fmt !== "jpeg";
        if (fmt === "jpeg") {
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, current.width, current.height);
        }
        ctx.drawImage(current.img, 0, 0);

        const lossy = fmt === "jpeg" || fmt === "webp";
        qualityField.hidden = !lossy;
        const quality = lossy ? Number(qualityInput.value) / 100 : undefined;
        const blob = await canvasToBlob(canvas, mimeForFormat(fmt), quality);
        if (!blob) return;
        setMeta(meta, [
          ["From", current.type.replace("image/", "").toUpperCase()],
          ["To", fmt.toUpperCase()],
          ["New size", formatBytes(blob.size)],
        ]);
        downloadBtn.disabled = false;
        downloadBtn._blob = blob;
        downloadBtn._name = `${stripExtension(current.name)}.${extensionForFormat(fmt)}`;
      }, 120);

      const batch = createBatch("convert", {
        zipName: "converted",
        process: async (file, onProgress) => {
          const loaded = await loadImageFromFile(file);
          onProgress(0.25);
          try {
            const fmt = formatSelect.value;
            const off = document.createElement("canvas");
            off.width = loaded.width;
            off.height = loaded.height;
            const octx = off.getContext("2d");
            if (fmt === "jpeg") {
              octx.fillStyle = "#ffffff";
              octx.fillRect(0, 0, off.width, off.height);
            }
            octx.drawImage(loaded.img, 0, 0);
            onProgress(0.6);
            const lossy = fmt === "jpeg" || fmt === "webp";
            const blob = await canvasToBlob(off, mimeForFormat(fmt), lossy ? Number(qualityInput.value) / 100 : undefined);
            if (!blob) throw new Error("This browser can't encode that format");
            onProgress(1);
            return { blob, name: batchOutputName(loaded.name, "", extensionForFormat(fmt)) };
          } finally {
            URL.revokeObjectURL(loaded.url);
          }
        },
      });

      wireDropzone(
        "convert",
        async (file) => {
          try {
            hideError(errorEl);
            const loaded = await loadImageFromFile(file);
            current = loaded;
            fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px · ${formatBytes(loaded.size)}`;
            formatSelect.value = current.type === "image/jpeg" ? "png" : "jpeg";
            workspace.hidden = false;
            workspace.closest(".tool-panel").classList.add("has-image");
            render();
          } catch (err) {
            showError(errorEl, err.message);
          }
        },
        (files) => batch && batch.add(files)
      );

      $("convert-change").addEventListener("click", () => $("convert-file").click());
      formatSelect.addEventListener("change", () => {
        render();
        if (batch) batch.invalidate();
      });
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        render();
        if (batch) batch.invalidate();
      });
      downloadBtn.addEventListener("click", () => {
        if (downloadBtn._blob) downloadBlob(downloadBtn._blob, downloadBtn._name);
      });
    })();

    /* ---- Rotate & flip tool ---- */
    (function rotateTool() {
      const workspace = $("rotate-workspace");
      if (!workspace) return;

      const canvas = $("rotate-canvas");
      const ctx = canvas.getContext("2d");
      const fname = $("rotate-fname");
      const meta = $("rotate-meta");
      const errorEl = $("rotate-error");
      const downloadBtn = $("rotate-download");

      let current = null;
      let angle = 0;
      let flipH = false;
      let flipV = false;

      function render() {
        if (!current) return;
        const { width, height } = rotateDimensions(current.width, current.height, angle);
        canvas.width = width;
        canvas.height = height;
        ctx.save();
        ctx.clearRect(0, 0, width, height);
        ctx.translate(width / 2, height / 2);
        ctx.rotate((angle * Math.PI) / 180);
        ctx.scale(flipH ? -1 : 1, flipV ? -1 : 1);
        ctx.drawImage(current.img, -current.width / 2, -current.height / 2);
        ctx.restore();
        setMeta(meta, [
          ["Size", `${width}×${height}px`],
          ["Rotation", `${angle}°`],
          ["Flip", `${flipH ? "H " : ""}${flipV ? "V" : ""}` || "none"],
        ]);
      }

      wireDropzone("rotate", async (file) => {
        try {
          hideError(errorEl);
          const loaded = await loadImageFromFile(file);
          current = loaded;
          angle = 0; flipH = false; flipV = false;
          fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px`;
          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
          render();
        } catch (err) {
          showError(errorEl, err.message);
        }
      });

      $("rotate-change").addEventListener("click", () => $("rotate-file").click());
      $("rotate-left").addEventListener("click", () => { angle = normalizeAngle(angle - 90); render(); });
      $("rotate-right").addEventListener("click", () => { angle = normalizeAngle(angle + 90); render(); });
      $("flip-h").addEventListener("click", () => { flipH = !flipH; render(); });
      $("flip-v").addEventListener("click", () => { flipV = !flipV; render(); });
      $("rotate-reset").addEventListener("click", () => { angle = 0; flipH = false; flipV = false; render(); });

      downloadBtn.addEventListener("click", async () => {
        if (!current) return;
        const fmt = formatFromMimeType(current.type);
        const blob = await canvasToBlob(canvas, mimeForFormat(fmt), fmt === "jpeg" ? 0.92 : undefined);
        if (blob) downloadBlob(blob, `${stripExtension(current.name)}-rotated.${extensionForFormat(fmt)}`);
      });
    })();

    /* ---- Image to Base64 tool ---- */
    (function base64Tool() {
      const workspace = $("base64-workspace");
      if (!workspace) return;

      const preview = $("base64-preview");
      const fname = $("base64-fname");
      const meta = $("base64-meta");
      const errorEl = $("base64-error");
      const dataUriArea = $("base64-datauri");
      const htmlArea = $("base64-html-snippet");
      const cssArea = $("base64-css-snippet");
      const altInput = $("base64-alt");
      const selectorInput = $("base64-selector");
      const copyDataUri = $("base64-copy-datauri");
      const copyHtml = $("base64-copy-html");
      const copyCss = $("base64-copy-css");
      const flashDataUri = $("base64-copy-datauri-flash");
      const flashHtml = $("base64-copy-html-flash");
      const flashCss = $("base64-copy-css-flash");

      let dataUri = "";

      function renderSnippets() {
        htmlArea.value = buildHtmlSnippet(dataUri, altInput.value);
        cssArea.value = buildCssSnippet(dataUri, selectorInput.value);
      }

      wireDropzone("base64", (file) => {
        hideError(errorEl);
        if (!file.type || file.type.indexOf("image/") !== 0) {
          showError(errorEl, "That doesn't look like an image file.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          dataUri = String(reader.result);
          preview.src = dataUri;
          fname.textContent = `${file.name} · ${formatBytes(file.size)}`;
          dataUriArea.value = dataUri;
          setMeta(meta, [
            ["Original", formatBytes(file.size)],
            ["Base64 text", formatBytes(dataUri.length)],
          ]);
          renderSnippets();
          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
        };
        reader.onerror = () => showError(errorEl, "Couldn't read that image. Try a different file.");
        reader.readAsDataURL(file);
      });

      $("base64-change").addEventListener("click", () => $("base64-file").click());
      altInput.addEventListener("input", renderSnippets);
      selectorInput.addEventListener("input", renderSnippets);
      copyDataUri.addEventListener("click", () => copyText(dataUri, flashDataUri));
      copyHtml.addEventListener("click", () => copyText(htmlArea.value, flashHtml));
      copyCss.addEventListener("click", () => copyText(cssArea.value, flashCss));
    })();

    /* ---- Favicon generator ---- */
    (function faviconTool() {
      const workspace = $("favicon-workspace");
      if (!workspace) return;

      const fname = $("favicon-fname");
      const grid = $("favicon-grid");
      const errorEl = $("favicon-error");
      const snippetArea = $("favicon-snippet");
      const copySnippet = $("favicon-copy-snippet");
      const flashSnippet = $("favicon-copy-snippet-flash");

      snippetArea.value = buildFaviconLinkSnippet();
      copySnippet.addEventListener("click", () => copyText(snippetArea.value, flashSnippet));

      wireDropzone("favicon", async (file) => {
        try {
          hideError(errorEl);
          const loaded = await loadImageFromFile(file);
          fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px`;
          const crop = centerSquareCrop(loaded.width, loaded.height);

          grid.innerHTML = "";
          for (const size of FAVICON_SIZES) {
            const c = document.createElement("canvas");
            c.width = size;
            c.height = size;
            const cctx = c.getContext("2d");
            cctx.drawImage(loaded.img, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size);
            const dataUrl = c.toDataURL("image/png");

            const tile = document.createElement("div");
            tile.className = "favicon-tile";
            const img = document.createElement("img");
            img.src = dataUrl;
            img.width = Math.min(size, 64);
            img.height = Math.min(size, 64);
            img.alt = `${size}×${size} favicon preview`;
            const label = document.createElement("div");
            label.className = "fv-size";
            label.textContent = `${size}×${size}`;
            const link = document.createElement("a");
            link.href = dataUrl;
            link.download = faviconFilename(size);
            link.textContent = "Download";
            tile.appendChild(img);
            tile.appendChild(label);
            tile.appendChild(link);
            grid.appendChild(tile);
          }

          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
        } catch (err) {
          showError(errorEl, err.message);
        }
      });

      $("favicon-change").addEventListener("click", () => $("favicon-file").click());
    })();

    /* ---- EXIF viewer & stripper ---- */
    (function exifTool() {
      const workspace = $("exif-workspace");
      if (!workspace) return;

      const fname = $("exif-fname");
      const errorEl = $("exif-error");
      const tableBody = $("exif-table-body");
      const emptyEl = $("exif-empty");
      const gpsCard = $("exif-gps");
      const gpsText = $("exif-gps-text");
      const gpsLink = $("exif-gps-link");
      const downloadBtn = $("exif-download");
      const meta = $("exif-meta");
      const preview = $("exif-preview");

      let current = null; // { file, bytes, stripped }

      // Presentation only — the parser keeps raw numbers so the pure helpers
      // stay testable without a locale or a unit convention baked in.
      function pretty(key, value) {
        if (key === "Orientation") return exifOrientationLabel(value);
        if (key === "ExposureTime" && value > 0) {
          return value >= 1 ? `${value}s` : `1/${Math.round(1 / value)}s`;
        }
        if (key === "FNumber") return `f/${Number(value).toFixed(1)}`;
        if (key === "FocalLength") return `${Math.round(Number(value))}mm`;
        if (key === "FocalLengthIn35mm") return `${value}mm (35mm equivalent)`;
        if (key === "GPSAltitude") return `${Math.round(Number(value))}m`;
        if (Array.isArray(value)) return value.join(", ");
        return String(value);
      }

      const LABELS = {
        Make: "Camera make",
        Model: "Camera model",
        LensMake: "Lens make",
        LensModel: "Lens",
        DateTimeOriginal: "Date taken",
        DateTime: "Date modified",
        DateTimeDigitized: "Date digitised",
        Software: "Software",
        Artist: "Artist",
        Copyright: "Copyright",
        ExposureTime: "Shutter speed",
        FNumber: "Aperture",
        ISO: "ISO",
        FocalLength: "Focal length",
        FocalLengthIn35mm: "Focal length (35mm)",
        Flash: "Flash",
        Orientation: "Orientation",
        PixelXDimension: "Width",
        PixelYDimension: "Height",
      };

      function renderTags(tags) {
        tableBody.innerHTML = "";
        const keys = tags ? Object.keys(tags).filter((k) => k.indexOf("GPS") !== 0) : [];
        keys.forEach((key) => {
          const tr = document.createElement("tr");
          const th = document.createElement("th");
          th.scope = "row";
          th.textContent = LABELS[key] || key;
          const td = document.createElement("td");
          td.textContent = pretty(key, tags[key]);
          tr.appendChild(th);
          tr.appendChild(td);
          tableBody.appendChild(tr);
        });

        const lat = tags && gpsToDecimal(tags.GPSLatitude, tags.GPSLatitudeRef);
        const lon = tags && gpsToDecimal(tags.GPSLongitude, tags.GPSLongitudeRef);
        const hasGps = lat !== null && lat !== undefined && lon !== null && lon !== undefined;
        gpsCard.hidden = !hasGps;
        if (hasGps) {
          gpsText.textContent = `${lat}, ${lon}`;
          gpsLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
        }
        emptyEl.hidden = keys.length > 0 || hasGps;
      }

      async function load(file) {
        hideError(errorEl);
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        const result = stripMetadata(bytes, file.type);
        if (!result) {
          throw new Error("Only JPEG and PNG files can be read and stripped losslessly here.");
        }
        if (current && current.previewUrl) URL.revokeObjectURL(current.previewUrl);
        const previewUrl = URL.createObjectURL(file);
        current = { file, bytes, stripped: result, previewUrl };

        fname.textContent = `${file.name} · ${formatBytes(file.size)}`;
        preview.src = previewUrl;
        renderTags(parseExif(bytes));

        const dropped = result.bytes.length !== bytes.length;
        setMeta(meta, [
          ["Metadata blocks", String(result.removed.length)],
          ["Metadata size", formatBytes(bytes.length - result.bytes.length)],
          ["Clean file", formatBytes(result.bytes.length), dropped ? "save-tag" : ""],
        ]);
        downloadBtn.disabled = false;
        workspace.hidden = false;
        workspace.closest(".tool-panel").classList.add("has-image");
      }

      const batch = createBatch("exif", {
        zipName: "stripped",
        process: async (file, onProgress) => {
          const buffer = await file.arrayBuffer();
          onProgress(0.4);
          const bytes = new Uint8Array(buffer);
          const result = stripMetadata(bytes, file.type);
          if (!result) throw new Error("Not a JPEG or PNG");
          onProgress(1);
          return {
            blob: new Blob([result.bytes], { type: file.type || "application/octet-stream" }),
            name: file.name || "image",
          };
        },
      });

      wireDropzone(
        "exif",
        async (file) => {
          try {
            await load(file);
          } catch (err) {
            showError(errorEl, err.message);
          }
        },
        (files) => batch && batch.add(files)
      );

      $("exif-change").addEventListener("click", () => $("exif-file").click());
      downloadBtn.addEventListener("click", () => {
        if (!current) return;
        const blob = new Blob([current.stripped.bytes], { type: current.file.type || "image/jpeg" });
        downloadBlob(blob, batchOutputName(current.file.name, "clean", extensionForFormat(formatFromMimeType(current.file.type))));
      });
    })();
  })();
}
