// Pure-helper tests for app.js. Run with: node assets/js/app.test.js
// No framework/deps — uses Node's built-in test runner + assert.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  clamp,
  formatBytes,
  percentSaved,
  mimeForFormat,
  extensionForFormat,
  formatFromMimeType,
  stripExtension,
  resizeByPercent,
  resizeByDimension,
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
