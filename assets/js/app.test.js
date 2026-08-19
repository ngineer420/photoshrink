// Pure-helper tests for app.js. Run with: node assets/js/app.test.js
// No framework/deps — uses Node's built-in test runner + assert.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clamp,
  formatBytes,
  TARGET_PRESETS,
  budgetFromPreset,
  parseBudget,
  targetQualitySearch,
  downscaleFactorForBudget,
  targetFormatFor,
  describeTargetResult,
  buildBatchSummaryText,
  percentSaved,
  mimeForFormat,
  extensionForFormat,
  formatFromMimeType,
  stripExtension,
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
  crc32,
  toDosDateTime,
  uniqueFilenames,
  buildZip,
  batchOutputName,
  parseExif,
  exifOrientationLabel,
  gpsToDecimal,
  stripJpegMetadata,
  stripPngMetadata,
  stripMetadata,
} = require("./app.js");

test("clamp", () => {
  assert.equal(clamp(5, 0, 10), 5);
  assert.equal(clamp(-5, 0, 10), 0);
  assert.equal(clamp(15, 0, 10), 10);
});

test("formatBytes", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(500), "500 B");
  assert.equal(formatBytes(1024), "1.00 KB");
  assert.equal(formatBytes(1536), "1.50 KB");
  assert.equal(formatBytes(1024 * 1024), "1.00 MB");
  assert.equal(formatBytes(5 * 1024 * 1024), "5.00 MB");
  assert.equal(formatBytes(-5), "0 B");
  assert.equal(formatBytes(NaN), "0 B");
});

test("percentSaved", () => {
  assert.equal(percentSaved(1000, 500), 50);
  assert.equal(percentSaved(1000, 1000), 0);
  assert.equal(percentSaved(1000, 1200), -20);
  assert.equal(percentSaved(0, 500), 0); // guards divide-by-zero / not-yet-loaded state
});

test("mimeForFormat / extensionForFormat / formatFromMimeType", () => {
  assert.equal(mimeForFormat("png"), "image/png");
  assert.equal(mimeForFormat("jpeg"), "image/jpeg");
  assert.equal(mimeForFormat("webp"), "image/webp");
  assert.equal(mimeForFormat("bogus"), "image/png");

  assert.equal(extensionForFormat("png"), "png");
  assert.equal(extensionForFormat("jpeg"), "jpg");
  assert.equal(extensionForFormat("webp"), "webp");

  assert.equal(formatFromMimeType("image/jpeg"), "jpeg");
  assert.equal(formatFromMimeType("image/webp"), "webp");
  assert.equal(formatFromMimeType("image/png"), "png");
  assert.equal(formatFromMimeType("image/gif"), "png"); // unsupported -> safe fallback
});

test("stripExtension", () => {
  assert.equal(stripExtension("photo.jpg"), "photo");
  assert.equal(stripExtension("my.photo.final.png"), "my.photo.final");
  assert.equal(stripExtension("noext"), "noext");
  assert.equal(stripExtension(".hidden"), ".hidden"); // leading dot isn't an extension
});

test("resizeByPercent", () => {
  assert.deepEqual(resizeByPercent(1000, 500, 50), { width: 500, height: 250 });
  assert.deepEqual(resizeByPercent(1000, 500, 200), { width: 2000, height: 1000 });
  // guards against 0/garbage percent producing a 0x0 output
  assert.deepEqual(resizeByPercent(1000, 500, 0), { width: 10, height: 5 });
});

test("resizeByDimension: lock aspect follows the field the user actually edited", () => {
  const origW = 1600, origH = 900; // 16:9
  const byWidth = resizeByDimension(origW, origH, 800, 900, true, "width");
  assert.deepEqual(byWidth, { width: 800, height: 450 });

  const byHeight = resizeByDimension(origW, origH, 800, 300, true, "height");
  assert.deepEqual(byHeight, { width: 533, height: 300 });

  const unlocked = resizeByDimension(origW, origH, 400, 400, false, "width");
  assert.deepEqual(unlocked, { width: 400, height: 400 });
});

test("normalizeAngle / rotateDimensions", () => {
  assert.equal(normalizeAngle(-90), 270);
  assert.equal(normalizeAngle(450), 90);
  assert.equal(normalizeAngle(360), 0);

  assert.deepEqual(rotateDimensions(800, 600, 0), { width: 800, height: 600 });
  assert.deepEqual(rotateDimensions(800, 600, 90), { width: 600, height: 800 });
  assert.deepEqual(rotateDimensions(800, 600, 180), { width: 800, height: 600 });
  assert.deepEqual(rotateDimensions(800, 600, 270), { width: 600, height: 800 });
});

test("clampCropBox keeps the box fully inside bounds and above the minimum size", () => {
  const bounds = { width: 400, height: 300 };
  assert.deepEqual(clampCropBox({ x: -50, y: -50, w: 100, h: 100 }, bounds), { x: 0, y: 0, w: 100, h: 100 });
  assert.deepEqual(clampCropBox({ x: 350, y: 250, w: 100, h: 100 }, bounds), { x: 300, y: 200, w: 100, h: 100 });
  assert.deepEqual(clampCropBox({ x: 0, y: 0, w: 5, h: 5 }, bounds, 20), { x: 0, y: 0, w: 20, h: 20 });
  assert.deepEqual(clampCropBox({ x: 0, y: 0, w: 5000, h: 5000 }, bounds), { x: 0, y: 0, w: 400, h: 300 });
});

test("scaleRectToNatural maps a downscaled preview rect back to source pixels", () => {
  // preview is a 2x downscale of the natural image
  const rect = { x: 50, y: 25, w: 100, h: 60 };
  const natural = scaleRectToNatural(rect, 400, 300, 800, 600);
  assert.deepEqual(natural, { x: 100, y: 50, w: 200, h: 120 });
});

test("applyAspectRatio re-fits a box to a ratio around its center and clamps to bounds", () => {
  const bounds = { width: 400, height: 300 };
  const square = applyAspectRatio({ x: 100, y: 100, w: 100, h: 60 }, 1, bounds);
  assert.equal(square.w, square.h);
  // center should stay close to the original center
  assert.ok(Math.abs(square.x + square.w / 2 - 150) < 1);

  // free (falsy ratio) leaves the box untouched (aside from clamping)
  const free = applyAspectRatio({ x: 10, y: 10, w: 50, h: 40 }, 0, bounds);
  assert.deepEqual(free, { x: 10, y: 10, w: 50, h: 40 });

  // an overly wide ratio must not overflow bounds
  const wide = applyAspectRatio({ x: 150, y: 100, w: 100, h: 100 }, 10, bounds);
  assert.ok(wide.w <= bounds.width && wide.h <= bounds.height);
});

test("centerSquareCrop finds the largest centered square", () => {
  assert.deepEqual(centerSquareCrop(1000, 600), { sx: 200, sy: 0, side: 600 });
  assert.deepEqual(centerSquareCrop(600, 1000), { sx: 0, sy: 200, side: 600 });
  assert.deepEqual(centerSquareCrop(500, 500), { sx: 0, sy: 0, side: 500 });
});

test("FAVICON_SIZES matches the sizes shipped in the tool", () => {
  assert.deepEqual(FAVICON_SIZES, [16, 32, 48, 180, 192, 512]);
});

test("faviconFilename maps well-known sizes to their conventional filenames", () => {
  assert.equal(faviconFilename(16), "favicon-16x16.png");
  assert.equal(faviconFilename(32), "favicon-32x32.png");
  assert.equal(faviconFilename(48), "favicon-48x48.png");
  assert.equal(faviconFilename(180), "apple-touch-icon.png");
  assert.equal(faviconFilename(192), "android-chrome-192x192.png");
  assert.equal(faviconFilename(512), "android-chrome-512x512.png");
});

test("buildFaviconLinkSnippet emits one <link> per favicon size", () => {
  const snippet = buildFaviconLinkSnippet();
  const lines = snippet.split("\n");
  assert.equal(lines.length, FAVICON_SIZES.length);
  assert.ok(snippet.includes("apple-touch-icon.png"));
  assert.ok(snippet.includes("android-chrome-512x512.png"));
});

test("buildHtmlSnippet / buildCssSnippet", () => {
  const uri = "data:image/png;base64,AAA";
  assert.equal(buildHtmlSnippet(uri, "logo"), '<img src="data:image/png;base64,AAA" alt="logo">');
  assert.equal(buildHtmlSnippet(uri), '<img src="data:image/png;base64,AAA" alt="">');

  assert.equal(buildCssSnippet(uri, ".logo"), '.logo {\n  background-image: url("data:image/png;base64,AAA");\n}');
  assert.equal(buildCssSnippet(uri, ""), '.element {\n  background-image: url("data:image/png;base64,AAA");\n}');
});

/* ============================= batch + ZIP ============================= */

const bytes = (s) => new Uint8Array(Buffer.from(s, "binary"));

test("crc32 matches the standard check vector", () => {
  // The value every CRC-32 implementation is checked against.
  assert.equal(crc32(bytes("123456789")).toString(16), "cbf43926");
  assert.equal(crc32(new Uint8Array(0)), 0);
  assert.equal(crc32(bytes("a")).toString(16), "e8b7be43");
});

test("toDosDateTime packs the MS-DOS date/time fields", () => {
  const stamp = toDosDateTime(new Date(2026, 7, 10, 21, 30, 44));
  assert.equal((stamp.date >> 9) + 1980, 2026);
  assert.equal((stamp.date >> 5) & 0x0f, 8);
  assert.equal(stamp.date & 0x1f, 10);
  assert.equal(stamp.time >> 11, 21);
  assert.equal((stamp.time >> 5) & 0x3f, 30);
  assert.equal((stamp.time & 0x1f) * 2, 44);
  // Pre-1980 is clamped, not wrapped into a negative year field.
  assert.equal((toDosDateTime(new Date(1970, 0, 1)).date >> 9) + 1980, 1980);
});

test("uniqueFilenames only renames actual collisions", () => {
  assert.deepEqual(uniqueFilenames(["a.jpg", "b.jpg"]), ["a.jpg", "b.jpg"]);
  assert.deepEqual(uniqueFilenames(["a.jpg", "a.jpg", "a.jpg"]), ["a.jpg", "a (2).jpg", "a (3).jpg"]);
  assert.deepEqual(uniqueFilenames(["noext", "noext"]), ["noext", "noext (2)"]);
  // A name that already looks like a rename must not be clobbered.
  assert.deepEqual(uniqueFilenames(["a.jpg", "a (2).jpg", "a.jpg"]), ["a.jpg", "a (2).jpg", "a (3).jpg"]);
});

test("buildZip emits a structurally valid stored-entry archive", () => {
  const one = bytes("hello world");
  const two = bytes("second entry");
  const zip = buildZip([{ name: "a.txt", data: one }, { name: "dir/b.txt", data: two }], new Date(2026, 7, 10, 12, 0, 0));
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

  assert.equal(view.getUint32(0, true), 0x04034b50, "starts with a local file header");
  assert.equal(view.getUint16(8, true), 0, "entries are stored, not deflated");
  assert.equal(view.getUint16(6, true), 0x0800, "UTF-8 filename flag is set");
  assert.equal(view.getUint32(14, true), crc32(one), "local header carries the entry CRC");
  assert.equal(view.getUint32(18, true), one.length);
  assert.equal(view.getUint32(22, true), one.length);

  // End of central directory: last 22 bytes, since no archive comment.
  const eocd = zip.length - 22;
  assert.equal(view.getUint32(eocd, true), 0x06054b50);
  assert.equal(view.getUint16(eocd + 8, true), 2, "two entries on this disk");
  assert.equal(view.getUint16(eocd + 10, true), 2, "two entries total");

  const centralAt = view.getUint32(eocd + 16, true);
  assert.equal(view.getUint32(centralAt, true), 0x02014b50, "central directory offset points at the directory");
  assert.equal(view.getUint32(centralAt + 42, true), 0, "first entry's local header is at offset 0");

  // The payloads survive verbatim.
  assert.equal(Buffer.from(zip.slice(30 + 5, 30 + 5 + one.length)).toString(), "hello world");
  assert.equal(buildZip([]).length, 22, "an empty archive is just the EOCD record");
});

test("batchOutputName", () => {
  assert.equal(batchOutputName("holiday.HEIC", "compressed", "jpg"), "holiday-compressed.jpg");
  assert.equal(batchOutputName("holiday.png", "", "webp"), "holiday.webp");
  assert.equal(batchOutputName("no-extension", "1024x768", "jpg"), "no-extension-1024x768.jpg");
  assert.equal(batchOutputName(undefined, "clean", "jpg"), "image-clean.jpg");
});

/* ================================ EXIF ================================ */

// Builds a real (if tiny) JPEG carrying an Exif APP1 segment, so the parser
// is exercised against bytes laid out exactly as a camera writes them rather
// than against a hand-fed object.
function makeExifJpeg({ make, model, orientation, lat, latRef, lon, lonRef }) {
  const IFD0_AT = 8;
  const IFD0_SIZE = 2 + 4 * 12 + 4;
  const GPS_AT = IFD0_AT + IFD0_SIZE;
  const GPS_SIZE = 2 + 4 * 12 + 4;
  const DATA_AT = GPS_AT + GPS_SIZE;

  const makeBytes = Buffer.from(make + "\0", "ascii");
  const modelBytes = Buffer.from(model + "\0", "ascii");
  const makeAt = DATA_AT;
  const modelAt = makeAt + makeBytes.length;
  const latAt = modelAt + modelBytes.length;
  const lonAt = latAt + 24;
  const tiff = Buffer.alloc(lonAt + 24);

  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(0x002a, 2);
  tiff.writeUInt32LE(IFD0_AT, 4);

  function entry(at, tag, type, count, writeValue) {
    tiff.writeUInt16LE(tag, at);
    tiff.writeUInt16LE(type, at + 2);
    tiff.writeUInt32LE(count, at + 4);
    writeValue(at + 8);
  }

  tiff.writeUInt16LE(4, IFD0_AT);
  let at = IFD0_AT + 2;
  entry(at, 0x010f, 2, makeBytes.length, (p) => tiff.writeUInt32LE(makeAt, p)); at += 12;
  entry(at, 0x0110, 2, modelBytes.length, (p) => tiff.writeUInt32LE(modelAt, p)); at += 12;
  entry(at, 0x0112, 3, 1, (p) => tiff.writeUInt16LE(orientation, p)); at += 12;
  entry(at, 0x8825, 4, 1, (p) => tiff.writeUInt32LE(GPS_AT, p)); at += 12;
  tiff.writeUInt32LE(0, at); // no IFD1

  tiff.writeUInt16LE(4, GPS_AT);
  at = GPS_AT + 2;
  entry(at, 0x0001, 2, 2, (p) => tiff.write(latRef + "\0", p, "ascii")); at += 12;
  entry(at, 0x0002, 5, 3, (p) => tiff.writeUInt32LE(latAt, p)); at += 12;
  entry(at, 0x0003, 2, 2, (p) => tiff.write(lonRef + "\0", p, "ascii")); at += 12;
  entry(at, 0x0004, 5, 3, (p) => tiff.writeUInt32LE(lonAt, p)); at += 12;
  tiff.writeUInt32LE(0, at);

  makeBytes.copy(tiff, makeAt);
  modelBytes.copy(tiff, modelAt);
  [[latAt, lat], [lonAt, lon]].forEach(([base, dms]) => {
    dms.forEach(([n, d], i) => {
      tiff.writeUInt32LE(n, base + i * 8);
      tiff.writeUInt32LE(d, base + i * 8 + 4);
    });
  });

  const exifPayload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const jfif = Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const app1 = Buffer.concat([
    Buffer.from([0xff, 0xe1, (exifPayload.length + 2) >> 8, (exifPayload.length + 2) & 0xff]),
    exifPayload,
  ]);
  const comment = Buffer.from([0xff, 0xfe, 0x00, 0x08, 0x68, 0x69, 0x64, 0x65, 0x6d, 0x65]);
  const icc = Buffer.from([0xff, 0xe2, 0x00, 0x08, 0x49, 0x43, 0x43, 0x5f, 0x00, 0x01]);
  const adobe = Buffer.from([0xff, 0xee, 0x00, 0x08, 0x41, 0x64, 0x6f, 0x62, 0x65, 0x00]);
  const scan = Buffer.from([0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x11, 0x22, 0x33, 0xff, 0xd9]);

  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), jfif, app1, icc, adobe, comment, scan]));
}

const SAMPLE = {
  make: "Canon",
  model: "EOS R6",
  orientation: 6,
  lat: [[51, 1], [30, 1], [26, 1]],
  latRef: "N",
  lon: [[0, 1], [7, 1], [39, 1]],
  lonRef: "W",
};

test("parseExif reads IFD0 and the GPS sub-IFD out of a real JPEG", () => {
  const tags = parseExif(makeExifJpeg(SAMPLE));
  assert.equal(tags.Make, "Canon");
  assert.equal(tags.Model, "EOS R6");
  assert.equal(tags.Orientation, 6);
  assert.equal(tags.GPSLatitudeRef, "N");
  assert.deepEqual(tags.GPSLatitude, [51, 30, 26]);
  assert.equal(tags.GPSLongitudeRef, "W");
});

test("parseExif returns null for anything without an Exif segment", () => {
  assert.equal(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xd9])), null, "bare JPEG");
  assert.equal(parseExif(new Uint8Array([137, 80, 78, 71])), null, "PNG");
  assert.equal(parseExif(new Uint8Array(0)), null, "empty");
  assert.equal(parseExif(null), null);
});

test("gpsToDecimal converts a DMS triple to a signed decimal degree", () => {
  assert.equal(gpsToDecimal([51, 30, 26], "N"), 51.507222);
  assert.equal(gpsToDecimal([51, 30, 26], "S"), -51.507222);
  assert.equal(gpsToDecimal([0, 7, 39], "W"), -0.1275);
  assert.equal(gpsToDecimal([0, 7, 39], "E"), 0.1275);
  assert.equal(gpsToDecimal(null, "N"), null);
  assert.equal(gpsToDecimal([1, 2], "N"), null);
});

test("exifOrientationLabel", () => {
  assert.equal(exifOrientationLabel(1), "Normal");
  assert.equal(exifOrientationLabel(6), "Rotated 90° clockwise");
  assert.equal(exifOrientationLabel(99), "Unknown (99)");
});

test("stripJpegMetadata removes Exif and comments without touching the scan", () => {
  const jpeg = makeExifJpeg(SAMPLE);
  const result = stripJpegMetadata(jpeg);

  assert.equal(parseExif(result.bytes), null, "no Exif survives the strip");
  assert.ok(result.bytes.length < jpeg.length, "the file got smaller");
  assert.equal(result.removed.length, 2, "APP1 and COM were both dropped");
  assert.deepEqual(result.removed.map((r) => r.marker), [0xe1, 0xfe]);

  // JFIF (APP0) is structural, the ICC profile (APP2) is colour management,
  // and the Adobe marker (APP14) carries the colour-transform flag. Dropping
  // any of those would change how the file decodes — a lossy strip wearing a
  // lossless label.
  const kept = Buffer.from(result.bytes).toString("binary");
  assert.equal(result.bytes[2], 0xff);
  assert.equal(result.bytes[3], 0xe0, "JFIF APP0 survives");
  assert.ok(kept.includes("ICC_"), "the ICC colour profile survives");
  assert.ok(kept.includes("Adobe"), "the Adobe colour-transform marker survives");

  // Every byte from the start of scan onward is preserved verbatim — this is
  // what makes the strip lossless rather than a silent re-encode.
  const scan = [0xff, 0xda, 0x00, 0x08, 1, 1, 0, 0, 0x3f, 0, 0x11, 0x22, 0x33, 0xff, 0xd9];
  assert.deepEqual(Array.from(result.bytes.slice(result.bytes.length - scan.length)), scan);
});

test("stripJpegMetadata rejects non-JPEG input", () => {
  assert.equal(stripJpegMetadata(new Uint8Array([137, 80, 78, 71])), null);
  assert.equal(stripJpegMetadata(new Uint8Array(0)), null);
});

function makePng() {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  function chunk(type, data) {
    const body = Buffer.from(data);
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, "ascii");
    return Buffer.concat([head, body, Buffer.alloc(4)]);
  }
  return new Uint8Array(
    Buffer.concat([
      sig,
      chunk("IHDR", Buffer.alloc(13)),
      chunk("tEXt", Buffer.from("Author\0Jane", "ascii")),
      chunk("tIME", Buffer.alloc(7)),
      chunk("IDAT", Buffer.from([1, 2, 3, 4])),
      chunk("IEND", Buffer.alloc(0)),
    ])
  );
}

test("stripPngMetadata drops text/time chunks and keeps the critical ones", () => {
  const png = makePng();
  const result = stripPngMetadata(png);
  const text = Buffer.from(result.bytes).toString("binary");

  assert.equal(result.removed.length, 2);
  assert.deepEqual(result.removed.map((r) => r.marker), ["tEXt", "tIME"]);
  assert.ok(!text.includes("Jane"), "the embedded author name is gone");
  assert.ok(text.includes("IHDR") && text.includes("IDAT") && text.includes("IEND"), "critical chunks survive");
  assert.deepEqual(Array.from(result.bytes.slice(0, 8)), [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(stripPngMetadata(new Uint8Array([1, 2, 3])), null);
});

test("stripMetadata dispatches on the mime type, then on the magic bytes", () => {
  const jpeg = makeExifJpeg(SAMPLE);
  assert.ok(stripMetadata(jpeg, "image/jpeg"));
  assert.ok(stripMetadata(makePng(), "image/png"));
  // Wrong or missing type, right bytes — the user's intent is unambiguous.
  assert.ok(stripMetadata(jpeg, ""));
  assert.ok(stripMetadata(makePng(), "application/octet-stream"));
  assert.equal(stripMetadata(new Uint8Array([0x47, 0x49, 0x46, 0x38]), "image/gif"), null, "GIF is not supported");
});

/* ===================== target file size mode ===================== */

const KB_ = 1024;
const MB_ = 1024 * 1024;

/* A stand-in encoder with the shape a real one has: size falls monotonically as
   quality falls, and never below a floor (the pixels themselves cost something).
   `calls` records every quality asked for, so the search's behaviour — not just
   its answer — can be asserted on. */
function fakeEncoder({ atFull = 4 * MB_, floor = 0.05, calls = [] } = {}) {
  const encode = async (q) => {
    calls.push(q);
    return Math.round(atFull * (floor + (1 - floor) * Math.pow(q, 2)));
  };
  encode.calls = calls;
  return encode;
}

test("budgetFromPreset resolves the named budgets and refuses anything else", () => {
  assert.equal(budgetFromPreset("web"), 200 * KB_);
  assert.equal(budgetFromPreset("email"), 5 * MB_);
  assert.equal(budgetFromPreset("discord"), 8 * MB_);
  assert.equal(budgetFromPreset("nope"), null);
  assert.equal(budgetFromPreset(""), null);
  assert.equal(budgetFromPreset(undefined), null);
  // A landing page's slug reaches this from the DOM, so inherited keys must not
  // resolve to a budget.
  assert.equal(budgetFromPreset("constructor"), null);
  assert.equal(budgetFromPreset("__proto__"), null);
});

test("every preset is a positive byte count with a label", () => {
  Object.keys(TARGET_PRESETS).forEach((k) => {
    assert.ok(TARGET_PRESETS[k].bytes > 0, `${k} has no budget`);
    assert.equal(typeof TARGET_PRESETS[k].label, "string");
  });
});

test("parseBudget converts a typed number and its unit", () => {
  assert.equal(parseBudget(100, "kb"), 100 * KB_);
  assert.equal(parseBudget("100", "kb"), 100 * KB_);
  assert.equal(parseBudget(1, "mb"), MB_);
  assert.equal(parseBudget(0.5, "mb"), MB_ / 2);
  assert.equal(parseBudget(2048, "b"), 2048);
  assert.equal(parseBudget(100), 100 * KB_, "kilobytes is the default unit");
});

test("parseBudget rejects anything that is not a positive number", () => {
  assert.equal(parseBudget("", "kb"), null);
  assert.equal(parseBudget("abc", "kb"), null);
  assert.equal(parseBudget(0, "kb"), null);
  assert.equal(parseBudget(-5, "mb"), null);
  assert.equal(parseBudget(NaN, "kb"), null);
  assert.equal(parseBudget(Infinity, "kb"), null);
  assert.equal(parseBudget(null, "kb"), null);
});

test("a budget the top quality already meets costs exactly one encode", async () => {
  const encode = fakeEncoder({ atFull: 300 * KB_ });
  const r = await targetQualitySearch(encode, 1 * MB_);
  assert.equal(r.passes, 1, "no bisection is needed when the ceiling already fits");
  assert.equal(r.quality, 0.95);
  assert.equal(r.fits, true);
  assert.equal(r.cancelled, false);
});

test("the search returns the highest quality that fits, and it really fits", async () => {
  const calls = [];
  const encode = fakeEncoder({ atFull: 4 * MB_, calls });
  const target = 500 * KB_;
  const r = await targetQualitySearch(encode, target);
  assert.equal(r.fits, true);
  assert.ok(r.size <= target, `settled on ${r.size} bytes, over the ${target} budget`);
  // Nudging the quality up must break the budget — otherwise it was not the
  // highest quality that fits.
  assert.ok((await encode(Math.min(0.95, r.quality + 0.05))) > target);
});

test("the pass cap is a hard cap, because these are full-size encodes", async () => {
  for (const maxPasses of [2, 3, 5, 8]) {
    const calls = [];
    const encode = fakeEncoder({ atFull: 4 * MB_, calls });
    const r = await targetQualitySearch(encode, 400 * KB_, { maxPasses });
    assert.ok(r.passes <= maxPasses, `${r.passes} passes with a cap of ${maxPasses}`);
    assert.equal(calls.length, r.passes, "reported passes must match encodes actually run");
  }
});

test("the default search never runs more than eight encodes", async () => {
  const calls = [];
  // A pathological encoder whose size barely moves with quality: the worst case
  // for bisection, and exactly where an uncapped loop would spin.
  const encode = async (q) => { calls.push(q); return Math.round(900 * KB_ - q * 1024); };
  const r = await targetQualitySearch(encode, 899 * KB_);
  assert.ok(calls.length <= 8, `ran ${calls.length} encodes`);
  assert.equal(r.passes, calls.length);
});

test("a budget nothing can reach is reported, not bisected towards forever", async () => {
  const calls = [];
  const encode = fakeEncoder({ atFull: 8 * MB_, floor: 0.5, calls });
  const r = await targetQualitySearch(encode, 100 * KB_);
  assert.equal(r.fits, false, "quality alone cannot get there");
  assert.equal(calls.length, 2, "the ceiling and the floor answer this in two encodes");
  assert.ok(r.size > 100 * KB_);
  assert.ok(r.quality >= 0.05, "reports the quality of the smallest it managed");
});

test("a cancelled run stops encoding and says it was cancelled", async () => {
  const calls = [];
  let cancel = false;
  const encode = fakeEncoder({ atFull: 4 * MB_, calls });
  const r = await targetQualitySearch(encode, 400 * KB_, {
    // Let the ceiling and floor probes through, then pull the plug.
    shouldCancel: () => { const c = cancel; cancel = calls.length >= 2; return c; },
  });
  assert.equal(r.cancelled, true);
  assert.ok(calls.length <= 3, `kept encoding after cancellation: ${calls.length} encodes`);
});

test("cancelling before the first encode runs no encodes at all", async () => {
  const calls = [];
  const encode = fakeEncoder({ calls });
  const r = await targetQualitySearch(encode, 400 * KB_, { shouldCancel: () => true });
  assert.equal(calls.length, 0);
  assert.equal(r.cancelled, true);
});

test("the search stays inside the quality bounds it was given", async () => {
  const calls = [];
  const encode = fakeEncoder({ atFull: 4 * MB_, calls });
  await targetQualitySearch(encode, 400 * KB_, { minQuality: 0.2, maxQuality: 0.8 });
  calls.forEach((q) => {
    assert.ok(q >= 0.2 && q <= 0.8, `asked for quality ${q}, outside 0.2-0.8`);
  });
});

test("a nonsense budget is refused rather than searched", async () => {
  await assert.rejects(() => targetQualitySearch(fakeEncoder(), 0), /positive number of bytes/);
  await assert.rejects(() => targetQualitySearch(fakeEncoder(), -1), /positive number of bytes/);
  await assert.rejects(() => targetQualitySearch(fakeEncoder(), NaN), /positive number of bytes/);
  await assert.rejects(() => targetQualitySearch(null, 1000), /encode function/);
});

test("downscaleFactorForBudget shrinks by area, not by length", () => {
  // Quartering the bytes should roughly halve each dimension.
  const f = downscaleFactorForBudget(4 * MB_, MB_, 1);
  assert.ok(Math.abs(f - 0.5) < 1e-9, `got ${f}`);
  assert.equal(downscaleFactorForBudget(MB_, 4 * MB_), 1, "never upscales");
  assert.equal(downscaleFactorForBudget(MB_, MB_), 1, "already fits");
  assert.equal(downscaleFactorForBudget(0, MB_), 1);
  assert.equal(downscaleFactorForBudget(MB_, 0), 1);
});

test("downscaleFactorForBudget aims under the budget and never collapses the image", () => {
  assert.ok(downscaleFactorForBudget(4 * MB_, MB_) < 0.5, "the safety margin aims a little under");
  assert.equal(downscaleFactorForBudget(100 * MB_, 1, 1), 0.1, "clamped to a tenth, not to zero");
});

test("PNG in target mode is switched to a lossy format, and says so", () => {
  assert.deepEqual(targetFormatFor("png"), { format: "webp", switched: true });
  assert.deepEqual(targetFormatFor("jpeg"), { format: "jpeg", switched: false });
  assert.deepEqual(targetFormatFor("webp"), { format: "webp", switched: false });
});

test("describeTargetResult explains the answer rather than just stating it", () => {
  assert.match(describeTargetResult({ quality: 0.72, size: 96 * KB_, passes: 5, fits: true }, 100 * KB_),
    /96\.0 KB at quality 72% — found in 5 passes\./);
  assert.match(describeTargetResult({ quality: 0.95, size: 40 * KB_, passes: 1, fits: true }, 100 * KB_),
    /found in 1 pass\.$/, "singular for one pass");
  assert.match(describeTargetResult({ quality: 0.05, size: 300 * KB_, passes: 2, fits: false }, 100 * KB_),
    /Could not reach 100 KB by quality alone/);
  assert.equal(describeTargetResult({ cancelled: true }, 100 * KB_), "Cancelled.");
  assert.equal(describeTargetResult(null, 100 * KB_), "");
});

test("buildBatchSummaryText lists every file and totals them", () => {
  const text = buildBatchSummaryText([
    { name: "a.jpg", before: 2 * MB_, after: 500 * KB_ },
    { name: "b.jpg", before: 1 * MB_, after: 250 * KB_ },
  ]);
  const lines = text.split("\n");
  assert.equal(lines.length, 3);
  assert.equal(lines[0], "a.jpg: 2.00 MB → 500 KB (76% smaller)");
  assert.equal(lines[1], "b.jpg: 1.00 MB → 250 KB (76% smaller)");
  assert.equal(lines[2], "Total: 2 images, 3.00 MB → 750 KB (76% smaller, 2.27 MB saved)");
});

test("buildBatchSummaryText ignores files that failed and handles an empty queue", () => {
  assert.equal(buildBatchSummaryText([]), "");
  assert.equal(buildBatchSummaryText(null), "");
  assert.equal(buildBatchSummaryText([{ name: "x.jpg", before: 100, after: null }]), "");
  const text = buildBatchSummaryText([
    { name: "ok.jpg", before: 1000, after: 500 },
    { name: "bad.jpg", before: 1000, after: undefined },
  ]);
  assert.equal(text.split("\n").length, 2, "one row plus the total");
  assert.match(text, /Total: 1 image,/);
});

/* ------------------------- platform size presets -------------------------- */

test("every preset has a slug, a label, positive dimensions and a note", () => {
  assert.ok(PRESETS.length >= 20, "the family should carry ~20 presets");
  const slugs = new Set();
  for (const p of PRESETS) {
    assert.match(p.slug, /^[a-z0-9-]+-size$/, p.slug);
    assert.ok(!slugs.has(p.slug), "duplicate slug: " + p.slug);
    slugs.add(p.slug);
    assert.ok(p.label && p.note, p.slug + " needs a label and a note");
    assert.ok(Number.isInteger(p.width) && p.width > 0, p.slug + " width");
    assert.ok(Number.isInteger(p.height) && p.height > 0, p.slug + " height");
  }
});

test("presetBySlug finds a preset and refuses anything else", () => {
  const yt = presetBySlug("youtube-thumbnail-size");
  assert.equal(yt.width, 1280);
  assert.equal(yt.height, 720);
  assert.equal(presetBySlug("not-a-preset"), null);
  // Not fooled by inherited object properties.
  assert.equal(presetBySlug("toString"), null);
  assert.equal(presetBySlug(undefined), null);
});

test("parseDimensionSeed reads the seeding string both tools use", () => {
  assert.deepEqual(parseDimensionSeed("1280x720"), { width: 1280, height: 720 });
  assert.deepEqual(parseDimensionSeed(" 1080 × 1920 "), { width: 1080, height: 1920 });
  assert.deepEqual(parseDimensionSeed("1080X1080"), { width: 1080, height: 1080 });
});

test("parseDimensionSeed returns null rather than half a size", () => {
  // The "Custom" chip carries empty attributes, which must clear the preset
  // rather than seed a zero-pixel canvas.
  assert.equal(parseDimensionSeed("x"), null);
  assert.equal(parseDimensionSeed(""), null);
  assert.equal(parseDimensionSeed("1280"), null);
  assert.equal(parseDimensionSeed("0x720"), null);
  assert.equal(parseDimensionSeed("-100x200"), null);
  assert.equal(parseDimensionSeed("12.5x20"), null);
  assert.equal(parseDimensionSeed("1280x720x2"), null);
  assert.equal(parseDimensionSeed(null), null);
  assert.equal(parseDimensionSeed(1280), null);
});

test("ratioLabel writes the ratio the way people say it", () => {
  assert.equal(ratioLabel(1280, 720), "16:9");
  assert.equal(ratioLabel(1080, 1080), "1:1");
  assert.equal(ratioLabel(1080, 1920), "9:16");
  assert.equal(ratioLabel(1000, 1500), "2:3");
  assert.equal(ratioLabel(1584, 396), "4:1");
  assert.equal(ratioLabel(1200, 480), "5:2");
});

test("ratioLabel falls back to a decimal when the reduction is useless", () => {
  // 851:315 reduces to itself, which is true and tells nobody anything.
  assert.equal(ratioLabel(851, 315), "2.7:1");
  assert.equal(ratioLabel(1200, 627), "1.91:1");
  assert.equal(ratioLabel(0, 100), "");
  assert.equal(ratioLabel(100, 0), "");
});

test("greatestCommonDivisor", () => {
  assert.equal(greatestCommonDivisor(1280, 720), 80);
  assert.equal(greatestCommonDivisor(7, 13), 1);
  assert.equal(greatestCommonDivisor(0, 5), 5);
});

test("a preset seeds the resizer to exactly its own numbers", () => {
  // The resizer applies a preset with the aspect lock off, which is what makes
  // both numbers survive: with the lock on, resizeByDimension recomputes the
  // height from the source and the preset silently becomes a different size.
  const p = presetBySlug("youtube-thumbnail-size");
  const source = { w: 4032, h: 3024 }; // a 4:3 phone photo
  const locked = resizeByDimension(source.w, source.h, p.width, p.height, true, "width");
  assert.notEqual(locked.height, p.height);
  const unlocked = resizeByDimension(source.w, source.h, p.width, p.height, false, "width");
  assert.deepEqual(unlocked, { width: 1280, height: 720 });
});
