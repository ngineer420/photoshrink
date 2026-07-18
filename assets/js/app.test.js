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
