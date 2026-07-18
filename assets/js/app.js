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

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    clamp,
    formatBytes,
    percentSaved,
    mimeForFormat,
    extensionForFormat,
    formatFromMimeType,
    stripExtension,
    debounce,
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

    function wireDropzone(prefix, onFile) {
      const dz = $(prefix + "-drop");
      const input = $(prefix + "-file");
      if (!dz || !input) return;

      dropzoneRegistry[prefix] = onFile;

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
        const file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (file) onFile(file);
      });

      input.addEventListener("change", () => {
        const file = input.files && input.files[0];
        if (file) onFile(file);
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

    /* ---- tool menu / homepage instant-switch tabs ---- */
    (function initTabs() {
      const tabIds = [
        "tab-resize", "tab-compress", "tab-crop", "tab-convert",
        "tab-rotate", "tab-base64", "tab-favicon",
      ];
      const tabs = tabIds.map((id) => $(id)).filter(Boolean);
      if (!tabs.length) return;

      const panels = {};
      let allPanels = true;
      tabs.forEach((t) => {
        const p = $(t.getAttribute("aria-controls"));
        panels[t.id] = p;
        if (!p) allPanels = false;
      });
      // Standalone tool pages only mount one panel — their nav links are
      // plain navigation, so leave them alone.
      if (!allPanels) return;

      const pathToId = {
        "/resize-image": "tab-resize",
        "/compress-image": "tab-compress",
        "/crop-image": "tab-crop",
        "/convert-image": "tab-convert",
        "/rotate-image": "tab-rotate",
        "/image-to-base64": "tab-base64",
        "/favicon-generator": "tab-favicon",
      };
      function tabIdForPath(pathname) {
        const clean = pathname.replace(/\.html$/, "").replace(/\/+$/, "") || "/";
        return pathToId[clean] || "tab-resize";
      }

      function activate(tab, opts) {
        const options = opts || {};
        tabs.forEach((t) => {
          const active = t === tab;
          t.setAttribute("aria-selected", String(active));
          t.tabIndex = active ? 0 : -1;
          t.classList.toggle("active", active);
          if (active) t.setAttribute("aria-current", "page");
          else t.removeAttribute("aria-current");
          panels[t.id].hidden = !active;
          panels[t.id].classList.toggle("active", active);
        });
        if (options.focus) tab.focus();
        if (options.push) history.pushState({ tool: tab.id }, "", tab.getAttribute("href"));
      }

      tabs.forEach((tab, i) => {
        tab.addEventListener("click", (e) => {
          if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          activate(tab, { push: true, focus: true });
        });
        tab.addEventListener("keydown", (e) => {
          let target;
          if (e.key === "ArrowRight") target = tabs[(i + 1) % tabs.length];
          else if (e.key === "ArrowLeft") target = tabs[(i - 1 + tabs.length) % tabs.length];
          else if (e.key === "Home") target = tabs[0];
          else if (e.key === "End") target = tabs[tabs.length - 1];
          if (target) {
            e.preventDefault();
            activate(target, { push: true, focus: true });
          }
        });
      });

      window.addEventListener("popstate", (e) => {
        const id = (e.state && e.state.tool) || tabIdForPath(location.pathname);
        const tab = $(id);
        if (tab) activate(tab, { push: false, focus: false });
      });

      const initial = $(tabIdForPath(location.pathname)) || tabs[0];
      activate(initial, { push: false, focus: false });
    })();

    const yearEl = $("year");
    if (yearEl) yearEl.textContent = new Date().getFullYear();

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

      let current = null; // { img, width, height, size, type, name }
      let lastChanged = "width";

      function unit() {
        return unitPercent && unitPercent.getAttribute("aria-pressed") === "true" ? "percent" : "px";
      }

      function targetDimensions() {
        if (!current) return { width: 1, height: 1 };
        if (unit() === "percent") return resizeByPercent(current.width, current.height, percentInput.value);
        return resizeByDimension(current.width, current.height, widthInput.value, heightInput.value, lockCheckbox.checked, lastChanged);
      }

      function outputFormat() {
        const f = formatSelect.value;
        return f === "keep" ? formatFromMimeType(current.type) : f;
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

      wireDropzone("resize", async (file) => {
        try {
          hideError(errorEl);
          const loaded = await loadImageFromFile(file);
          current = loaded;
          fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px · ${formatBytes(loaded.size)}`;
          widthInput.value = loaded.width;
          heightInput.value = loaded.height;
          percentInput.value = 100;
          lastChanged = "width";
          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
          render();
        } catch (err) {
          showError(errorEl, err.message);
        }
      });

      $("resize-change").addEventListener("click", () => $("resize-file").click());

      function setUnit(next) {
        unitPx.setAttribute("aria-pressed", String(next === "px"));
        unitPercent.setAttribute("aria-pressed", String(next === "percent"));
        percentField.hidden = next !== "percent";
        dimensionField.hidden = next === "percent";
        render();
      }
      unitPx.addEventListener("click", () => setUnit("px"));
      unitPercent.addEventListener("click", () => setUnit("percent"));

      widthInput.addEventListener("input", () => { lastChanged = "width"; render(); });
      heightInput.addEventListener("input", () => { lastChanged = "height"; render(); });
      percentInput.addEventListener("input", render);
      lockCheckbox.addEventListener("change", render);
      formatSelect.addEventListener("change", render);
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        render();
      });

      downloadBtn.addEventListener("click", () => {
        if (downloadBtn._blob) downloadBlob(downloadBtn._blob, downloadBtn._name);
      });
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

      let current = null;

      const render = debounce(async () => {
        if (!current) return;
        canvas.width = current.width;
        canvas.height = current.height;
        ctx.clearRect(0, 0, current.width, current.height);
        const fmt = formatSelect.value;
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
        const saved = percentSaved(current.size, blob.size);
        setMeta(meta, [
          ["Before", formatBytes(current.size)],
          ["After", formatBytes(blob.size)],
          ["Savings", `${saved}%`, saved >= 0 ? "save-tag" : ""],
        ]);
        downloadBtn.disabled = false;
        downloadBtn._blob = blob;
        downloadBtn._name = `${stripExtension(current.name)}-compressed.${extensionForFormat(fmt)}`;
      }, 120);

      wireDropzone("compress", async (file) => {
        try {
          hideError(errorEl);
          const loaded = await loadImageFromFile(file);
          current = loaded;
          fname.textContent = `${loaded.name} · ${loaded.width}×${loaded.height}px`;
          formatSelect.value = loaded.type === "image/png" ? "webp" : "jpeg";
          workspace.hidden = false;
          workspace.closest(".tool-panel").classList.add("has-image");
          render();
        } catch (err) {
          showError(errorEl, err.message);
        }
      });

      $("compress-change").addEventListener("click", () => $("compress-file").click());
      formatSelect.addEventListener("change", render);
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        render();
      });
      downloadBtn.addEventListener("click", () => {
        if (downloadBtn._blob) downloadBlob(downloadBtn._blob, downloadBtn._name);
      });
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

      wireDropzone("convert", async (file) => {
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
      });

      $("convert-change").addEventListener("click", () => $("convert-file").click());
      formatSelect.addEventListener("change", render);
      qualityInput.addEventListener("input", () => {
        qualityValue.textContent = qualityInput.value + "%";
        render();
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
  })();
}
