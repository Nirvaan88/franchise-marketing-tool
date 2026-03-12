// Download both primary and secondary template PDFs at once
// Download both primary and secondary template previews as PNG images
// Export only primary and secondary templates as separate PDFs
/* ---------- Shared variables ---------- */
const templateBox = document.getElementById("templateBox");
const templateSlider = document.getElementById("templateSlider");
let excelData = [];              // legacy single-sheet path
let excelDataBySheet = {};       // multi-sheet path
let currentSheetName = "";
let TEMPLATE_BG_DATA_URL = null; 

/* ---------- Small helpers ---------- */
function escapeHtml(unsafe) {
  return String(unsafe || "").replace(/[&<>"'`]/g, function (m) {
    return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','`':'&#96;'}[m]);
  });
}
const FONT_CLASS_MAP = { en:"lang-en", hi:"lang-hi", mr:"lang-mr", gu:"lang-gu", ta:"lang-ta", bn:"lang-bn", kn:"lang-kn", te:"lang-te" };
const LANG_FONT_MAP = {
  en: "NotoSans",
  hi: "NotoSansDeva",
  mr: "NotoSansDeva",
  gu: "NotoSansGuj",
  ta: "NotoSansTamil",
  bn: "NotoSansBeng",
  kn: "NotoSansKannada",
  te: "NotoSansTelugu"
};
const EXPORT_SCALE = 4;
const LANG_CODE_ALIASES = {
  tm: "ta",
  tamil: "ta",
  tam: "ta",
  tn: "ta",
  telugu: "te",
  telegu: "te",
  tel: "te",
  kannada: "kn",
  kann: "kn",
  knn: "kn",
  malayalam: "ml",
  mal: "ml",
  ml: "ml",
  marathi: "mr",
  mara: "mr",
  mh: "mr",
  hindi: "hi",
  hin: "hi",
  bangla: "bn",
  bengali: "bn",
  ben: "bn",
  gujarati: "gu",
  guj: "gu",
  gj: "gu",
  gu: "gu"
};

const SKIP_LANG_SUFFIXES = new Set([
  "",
  "line",
  "line1",
  "line2",
  "line3",
  "line4",
  "city",
  "state",
  "pincode",
  "pin",
  "zip",
  "landmark",
  "phone",
  "mobile",
  "contact",
  "email",
  "website",
  "short",
  "code",
  "english",
  "eng",
  "en",
  "addr",
  "address",
  "local"
]);
// === Make any uploaded image into crisp A4 background ===
async function renderFileToA4DataUrl(file) {
  // Read file as DataURL
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = e => reject(e);
    reader.readAsDataURL(file);
  });

  // Load into Image
  const img = new Image();
  img.crossOrigin = "anonymous";
  img.src = dataUrl;

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load template image"));
  });

  // A4 at high resolution
  const A4_W = 2480;
  const A4_H = 3508;

  // const canvas = document.createElement("canvas");
  // canvas.width = A4_W;
  // canvas.height = A4_H;

  // const ctx = canvas.getContext("2d");
  // ctx.fillStyle = "#ffffff";
  // ctx.fillRect(0, 0, A4_W, A4_H);

  // const ratio = Math.min(A4_W / img.width, A4_H / img.height);
  // const drawW = img.width * ratio;
  // const drawH = img.height * ratio;
  // const dx = (A4_W - drawW) / 2;
  // const dy = (A4_H - drawH) / 2;

  // ctx.imageSmoothingEnabled = true;
  // ctx.imageSmoothingQuality = "high";
  // ctx.drawImage(img, dx, dy, drawW, drawH);

  // HD PNG data URL
  return canvas.toDataURL("image/png", 1.0);
}
async function loadCustomTemplate(file) {
  const reader = new FileReader();
  reader.onload = async (e) => {

    const imgUrl = e.target.result;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = imgUrl;

    await new Promise(r => img.onload = r);

    // FORCE A4 HIGH RES
    const A4_W = 2480;
    const A4_H = 3508;

    const canvas = document.createElement("canvas");
    canvas.width = A4_W;
    canvas.height = A4_H;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4_W, A4_H);

    const ratio = Math.min(A4_W / img.width, A4_H / img.height);
    const w = img.width * ratio;
    const h = img.height * ratio;

    const x = (A4_W - w) / 2;
    const y = (A4_H - h) / 2;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, x, y, w, h);

    TEMPLATE_BG_DATA_URL = canvas.toDataURL("image/png", 1.0);
  };
  reader.readAsDataURL(file);
}

/**
 * Create an A4-sized canvas with the live rendering of `box` placed over
 * the chosen background (if provided). Returns an HTMLCanvasElement sized
 * to A4 (2480x3508 px).
 */
async function createA4CanvasFromBox(box, bgImage /* optional Image */) {
  const A4_W = 2480, A4_H = 3508;
  // Capture the live DOM of the box at a reasonable scale
  let snapCanvas;
  // Prepare a clone for export so we can strip text-strokes/shadows which
  // html2canvas tends to rasterize fuzzily. We render the clone offscreen
  // and ask html2canvas to scale using devicePixelRatio for crisper text.
  const computeScale = () => {
    const boxWidth = (box.getBoundingClientRect && box.getBoundingClientRect().width) || box.offsetWidth || 794;
    const base = Math.max(1, Math.floor(A4_W / (boxWidth || 1)));
    const dpr = (window.devicePixelRatio || 1);
    return Math.min(6, Math.max(1, Math.round(base * dpr)));
  };

  async function createExportClone(orig) {
    const clone = orig.cloneNode(true);
    // Create a uniquely-identifiable id for the clone so we can
    // inject temporary stylesheet copies of rules that target
    // `#templateBox` without touching the live editor or duplicating
    // global ids.
    const exportId = 'export_clone_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
    if (clone.id) {
      // remove original id to avoid duplicate-id JavaScript lookups
      clone.removeAttribute('id');
    }
    clone.id = exportId;

    // Inject temporary stylesheet rules that mirror any rules targeting
    // #templateBox so the clone renders identically. We attempt to
    // read available stylesheets and copy rules that reference
    // `#templateBox`, replacing that token with the clone id.
    let injectedStyle = null;
    try {
      let cssText = '';
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const r of Array.from(rules)) {
            try {
              const text = r.cssText || '';
              if (text.indexOf('#templateBox') !== -1) {
                cssText += text.replace(/#templateBox/g, `#${exportId}`) + '\n';
              }
            } catch (e) { /* ignore rule read errors */ }
          }
        } catch (e) { /* ignore cross-origin sheets */ }
      }
      if (cssText) {
        injectedStyle = document.createElement('style');
        injectedStyle.setAttribute('data-export-style', exportId);
        injectedStyle.textContent = cssText;
        document.head.appendChild(injectedStyle);
      }
    } catch (e) {
      console.warn('Failed to inject templateBox styles for export clone', e);
      injectedStyle = null;
    }
    // remove any copied footer elements from the cloned DOM so we don't
    // end up with both the original footer content (copied by cloneNode)
    // and a programmatically-inserted final footer (created later by
    // syncFinalLayerFor). This prevents double-rendering of the address.
    clone.querySelectorAll('#storeFooterName, #storeFooterNameFinal').forEach(el => el.remove());
    // size the clone to match the original box so html2canvas computes layout
    const rect = orig.getBoundingClientRect();
    clone.style.width = rect.width + 'px';
    clone.style.height = rect.height + 'px';
    clone.style.boxSizing = 'border-box';
    clone.style.position = 'fixed';
    clone.style.left = '-9999px';
    clone.style.top = '-9999px';
    clone.style.zIndex = '999999';
    clone.style.background = window.getComputedStyle(orig).background || 'transparent';

    // neutralize heavy strokes/shadows and make text wrap-friendly for export
    clone.querySelectorAll('.store-address, .separator, .store-mobile').forEach(el => {
      el.style.setProperty('text-shadow', 'none', 'important');
      el.style.setProperty('-webkit-text-stroke', '0px', 'important');
      el.style.setProperty('text-stroke', '0px', 'important');
      el.style.setProperty('filter', 'none', 'important');
      el.style.setProperty('white-space', 'normal', 'important');
      el.style.setProperty('overflow-wrap', 'break-word', 'important');
      el.style.setProperty('word-break', 'break-word', 'important');
      el.style.setProperty('font-weight', '700', 'important');
    });

    document.body.appendChild(clone);

    // Prepare images inside the clone for reliable html2canvas capture:
    // - Inline SVG images as data URLs
    // - Convert any remaining SVG <img> to PNG
    // - Ensure <img> elements use crossOrigin where possible
    try {
      const footerColor = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || '#000000';
      try {
        if (typeof inlineSvgAsDataUrl === 'function') {
          await inlineSvgAsDataUrl(`#${exportId} .contact-icon img`, { preferDataUrl: true, color: footerColor });
        }
      } catch(e) { console.warn('inlineSvgAsDataUrl failed for export clone', e); }

      try {
        if (typeof convertAnySvgImagesToPng === 'function') {
          await convertAnySvgImagesToPng(`#${exportId} .contact-icon img`, 28);
        }
      } catch(e) { console.warn('convertAnySvgImagesToPng failed for export clone', e); }

      try {
        const imgs = Array.from(clone.querySelectorAll('img'));
        imgs.forEach(img => {
          try { img.crossOrigin = 'anonymous'; } catch(e){}
        });
      } catch(e) { /* ignore */ }

      // small pause to allow browser to render data-URL replacements
      await new Promise(r => setTimeout(r, 80));
    } catch(e) {
      console.warn('Failed preparing images inside export clone', e);
    }

      // diagnostic: log how many footer ids exist in the document after append
      try { console.log('Footer count after clone append:', document.querySelectorAll('#storeFooterName, #storeFooterNameFinal').length); } catch(e){/*ignore*/}

      // Ensure the clone has a proper final footer identical to the original
      // This copies the live footer content into the cloned export node so
      // exported PDFs match the generated templates' footer placement.
      try {
        // create final overlay/footer inside the clone
        if (typeof syncFinalLayerFor === 'function') syncFinalLayerFor(clone);
        // copy footer content & styles from original into clone's final footer
        if (typeof cloneExactFooter === 'function') cloneExactFooter(orig, clone);
      } catch (e) { console.warn('Failed to sync footer into export clone', e); }
    // attach cleanup meta so caller can remove injected style later
    try { if (injectedStyle) clone._exportInjectedStyle = injectedStyle; } catch(e){}
    return clone;
  }

  try {
    const exportClone = await createExportClone(box);


    // ---- Ensure footer address exists in export clone ----
    const origFooter = box.querySelector("#storeFooterName");
    const cloneFooter = exportClone.querySelector("#storeFooterNameFinal") || exportClone.querySelector("#storeFooterName");

    if (origFooter && cloneFooter) {
      const addr = origFooter.querySelector(".store-address");
      const mob  = origFooter.querySelector(".store-mobile");

      cloneFooter.innerHTML =
        `<span class="store-address">${addr ? addr.textContent : ""}</span>` +
        (mob ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${mob.textContent}</span>` : "");
    }
        
      // Sanity: ensure only one visible store-address exists in the clone.
      // Keep the first occurrence (if any) and hide/remove others so the
      // final exported canvas shows the address only once.
      try {
        const addrs = Array.from(exportClone.querySelectorAll('.store-address'));
        if (addrs.length > 1) {
          // keep the first, hide the rest
          addrs.slice(1).forEach(a => {
            a.style.setProperty('display', 'none', 'important');
          });
        }
        // also ensure separators / mobile numbers aren't duplicated
        const seps = Array.from(exportClone.querySelectorAll('.separator'));
        if (seps.length > 1) seps.slice(1).forEach(s => s.style.setProperty('display','none','important'));
        const phones = Array.from(exportClone.querySelectorAll('.store-mobile'));
        if (phones.length > 1) phones.slice(1).forEach(p => p.style.setProperty('display','none','important'));
      } catch(e) { /* ignore sanity errors */ }

    try {
      await new Promise(r => setTimeout(r, 60));

      snapCanvas = await html2canvas(exportClone, { backgroundColor: null, scale: computeScale(), useCORS: true });
    } catch (err) {
      console.warn('createA4CanvasFromBox: html2canvas on clone failed, falling back to original box', err);
        try {
        snapCanvas = await html2canvas(box, { backgroundColor: null, scale: Math.min(6, Math.max(1, Math.floor(A4_W / (box.getBoundingClientRect().width || 1)))) });
      } catch (err2) {
        console.warn('createA4CanvasFromBox: html2canvas failed, falling back to scale 2', err2);
        snapCanvas = await html2canvas(box, { backgroundColor: null, scale: 2 });
      }
    }
    // remove clone once capture is complete and also clean up any
    // injected temporary stylesheet we added for the export clone.
    try {
      if (exportClone._exportInjectedStyle && exportClone._exportInjectedStyle.parentNode) {
        exportClone._exportInjectedStyle.parentNode.removeChild(exportClone._exportInjectedStyle);
      }
    } catch (e) { /* ignore cleanup errors */ }
    try { exportClone.parentNode && exportClone.parentNode.removeChild(exportClone); } catch(e){/*ignore*/}
  } catch (err) {
    console.warn('createA4CanvasFromBox: export clone creation failed, using fallback capture', err);
    snapCanvas = await html2canvas(box, { backgroundColor: null, scale: 2 });
  }

  const snapImg = new Image();
  snapImg.crossOrigin = 'anonymous';
  snapImg.src = snapCanvas.toDataURL('image/png');
  await new Promise(r => { snapImg.onload = r; snapImg.onerror = r; });

  const canvas = document.createElement('canvas');
  canvas.width = A4_W; canvas.height = A4_H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,A4_W,A4_H);

  // draw background if provided
  if (bgImage && bgImage.width) {
    const ratio = Math.min(A4_W / bgImage.width, A4_H / bgImage.height);
    const drawW = Math.round(bgImage.width * ratio);
    const drawH = Math.round(bgImage.height * ratio);
    const dx = Math.round((A4_W - drawW) / 2);
    const dy = Math.round((A4_H - drawH) / 2);
    ctx.drawImage(bgImage, dx, dy, drawW, drawH);
  }

  // place snapshot centered, scaled to fit A4
  const snapRatio = Math.min(A4_W / snapImg.width, A4_H / snapImg.height);
  const snapW = Math.round(snapImg.width * snapRatio);
  const snapH = Math.round(snapImg.height * snapRatio);
  const snapX = Math.round((A4_W - snapW) / 2);
  const snapY = Math.round((A4_H - snapH) / 2);

  try { ctx.drawImage(snapImg, snapX, snapY, snapW, snapH); } catch(e) { console.warn('Failed draw snapshot', e); }

  // If the live DOM contains a contact-icon element, draw a guaranteed
  // badge on top of the snapshot so the contact logo appears even when
  // html2canvas misses/blank-images it. Map the contact icon bounding box
  // from the box DOM to the A4 canvas coordinates.
  try {
    const iconEl = box.querySelector('.contact-icon img');
    if (iconEl) {
      const boxRect = box.getBoundingClientRect();
      const iconRect = iconEl.getBoundingClientRect();
      console.debug('createA4CanvasFromBox: contact icon bounds', { boxRect, iconRect, snapImg: { width: snapImg.width, height: snapImg.height }, snapRatio });
      const scaleFromBoxToSnap = (snapImg.width / (boxRect.width || 1));
      const iconX_onSnap = (iconRect.left - boxRect.left) * scaleFromBoxToSnap;
      const iconY_onSnap = (iconRect.top - boxRect.top) * scaleFromBoxToSnap;
      const iconW_onSnap = iconRect.width * scaleFromBoxToSnap;
      const iconH_onSnap = iconRect.height * scaleFromBoxToSnap;

      // After snap is drawn onto A4 with snapRatio, map to A4 coords
      const iconX_onA4 = Math.round(snapX + iconX_onSnap * snapRatio);
      const iconY_onA4 = Math.round(snapY + iconY_onSnap * snapRatio);
      const iconW_onA4 = Math.round(iconW_onSnap * snapRatio);
      const iconH_onA4 = Math.round(iconH_onSnap * snapRatio);

      // Draw circular badge
      ctx.save();
      const cx = iconX_onA4 + Math.round(iconW_onA4 / 2);
      const cy = iconY_onA4 + Math.round(iconH_onA4 / 2);
      const r = Math.round(Math.max(iconW_onA4, iconH_onA4) / 2);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = '#000000';
      ctx.fill();
      ctx.restore();

      // Draw simple handset stroke in white (fallback)
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, Math.round(r * 0.26));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(cx, cy, Math.round(r * 0.56), Math.PI * 0.75, Math.PI * 1.25, false);
      ctx.stroke();
      ctx.restore();

      // Try to draw the actual contact image from the DOM over the badge
      try {
        const iconSrc = iconEl.getAttribute('src') || iconEl.src;
        if (iconSrc) {
          const iconImg = new Image();
          try { iconImg.crossOrigin = 'anonymous'; } catch(e){}
          await new Promise((res) => {
            iconImg.onload = () => res(true);
            iconImg.onerror = () => res(false);
            // If the src is a data URL this will succeed immediately
            iconImg.src = iconSrc;
          }).then((ok) => {
            try {
              if (iconImg && iconImg.width) {
                ctx.drawImage(iconImg, iconX_onA4, iconY_onA4, iconW_onA4, iconH_onA4);
              }
            } catch (drawErr) {
              console.warn('createA4CanvasFromBox: drawing icon image failed', drawErr);
            }
          });
        }
      } catch (e) {
        console.warn('createA4CanvasFromBox: could not overlay icon image', e);
      }
    }
  } catch (e) {
    console.warn('createA4CanvasFromBox: overlay contact badge failed', e);
  }

  return canvas;
}

function normalizeLangCode(code) {
  if (code == null) return "";
  const raw = String(code).trim().toLowerCase();
  if (!raw) return "";
  if (LANG_CODE_ALIASES[raw]) {
    const mapped = LANG_CODE_ALIASES[raw];
    return mapped === "en" ? "en" : "en"; // force all mapped languages to English
  }
  const cleaned = raw.replace(/[^a-z]/g, "");
  if (LANG_CODE_ALIASES[cleaned]) {
    const mappedClean = LANG_CODE_ALIASES[cleaned];
    return mappedClean === "en" ? "en" : "en"; // force cleaned aliases to English
  }
  if (!cleaned) return "";
  const base = cleaned.length <= 3 ? cleaned : cleaned.slice(0, 3);
  // If anything other than explicit 'en' is requested, fall back to English
  return base === "en" ? "en" : "en";
}

function detectLangCodeFromText(text) {
  const sample = String(text || "");
  if (/[\u0B80-\u0BFF]/.test(sample)) return "ta";
  if (/[\u0C00-\u0C7F]/.test(sample)) return "te";
  if (/[\u0C80-\u0CFF]/.test(sample)) return "kn";
  if (/[\u0D00-\u0D7F]/.test(sample)) return "ml";
  if (/[\u0A80-\u0AFF]/.test(sample)) return "gu";
  if (/[\u0980-\u09FF]/.test(sample)) return "bn";
  if (/[\u0900-\u097F]/.test(sample)) return "mr";
  return "";
}

function resolveLangCode(preferredCode, sampleText) {
  const normalized = normalizeLangCode(preferredCode);
  if (normalized) return normalized;
  const detected = normalizeLangCode(detectLangCodeFromText(sampleText));
  if (detected) return detected;
  return "en";
}

function extractLangCodeFromColumnName(columnName) {
  const lower = String(columnName || "").toLowerCase();
  if (!lower.includes("address")) return "";

  // replace separators with spaces and remove the literal word "address"
  let remainder = lower.replace(/address/g, " ");
  remainder = remainder.replace(/[^a-z]+/g, " ").trim();
  if (!remainder) return "";

  const parts = remainder.split(/\s+/);
  for (const part of parts) {
    if (!part || SKIP_LANG_SUFFIXES.has(part)) continue;
    const norm = normalizeLangCode(part);
    if (norm && norm !== "en") return norm;
  }
  return "";
}

/* ---------- Utility UI functions ---------- */
function makeDraggable(el) {
  el.onmousedown = function(e) {
    e.preventDefault();
    let rect = el.getBoundingClientRect();
    let shiftX = e.clientX - rect.left;
    let shiftY = e.clientY - rect.top;
    function moveAt(pageX, pageY) {
      el.style.left = (pageX - shiftX - templateBox.getBoundingClientRect().left) + "px";
      el.style.top  = (pageY - shiftY - templateBox.getBoundingClientRect().top) + "px";
    }
    function onMouseMove(e) { moveAt(e.pageX, e.pageY); }
    document.addEventListener("mousemove", onMouseMove);
    document.onmouseup = function() {
      document.removeEventListener("mousemove", onMouseMove);
      document.onmouseup = null;
    };
  };
  el.ondragstart = () => false;
}

/* ---------- Contact SVG inlining helper ---------- */

// Embedded base64 SVG fallback: if the app static path is unreachable
// (404 during export) this in-memory data URL will ensure the icon
// is always available for canvas/pdf generation without network fetches.
// We default to the same gold badge used in the static SVG.
const CONTACT_ICON_BASE64 = createColoredContactSvg('#d8a23f');

// In-memory inline SVG (when fetched successfully). Populated asynchronously.
let CONTACT_ICON_SVG = null;

// Try to fetch the SVG source and inline it into existing `.contact-icon` elements.
// Candidate filenames for contact SVG (tries these in order)
const CONTACT_SVG_CANDIDATES = [
  '/static/images/contact-logo.svg',
  '/static/images/Contact icon.svg',
  '/static/images/Contact%20icon.svg',
  '/static/images/Contact_icon.svg',
  '/static/images/Contact-icon.svg'
];

async function tryFetchFirstSvg(origin) {
  origin = origin || ((typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '');
  for (const path of CONTACT_SVG_CANDIDATES) {
    try {
      const resp = await fetch(origin + path);
      if (resp && resp.ok) {
        const txt = await resp.text();
        return { path: path, text: txt };
      }
    } catch (e) { /* try next */ }
  }
  return null;
}

(async function loadContactSvgInline() {
  try {
    const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
    const fetched = await tryFetchFirstSvg(origin);
    if (!fetched) return;
    let svgText = fetched.text;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(svgText, 'image/svg+xml');
      const svgEl = doc.querySelector('svg');
      if (svgEl) {
        // If no viewBox is present but width/height exist, synthesize a viewBox
        if (!svgEl.hasAttribute('viewBox')) {
          const w = svgEl.getAttribute('width');
          const h = svgEl.getAttribute('height');
          if (w && h) {
            // strip non-digits (like px) and fallback to numbers
            const wnum = parseFloat(String(w).replace(/[^0-9.]/g, '')) || null;
            const hnum = parseFloat(String(h).replace(/[^0-9.]/g, '')) || null;
            if (wnum && hnum) {
              svgEl.setAttribute('viewBox', `0 0 ${wnum} ${hnum}`);
            }
          }
        }
        // Remove fixed width/height so CSS can size it responsively
        if (svgEl.hasAttribute('width')) svgEl.removeAttribute('width');
        if (svgEl.hasAttribute('height')) svgEl.removeAttribute('height');
        // Ensure a sensible preserveAspectRatio
        if (!svgEl.hasAttribute('preserveAspectRatio')) svgEl.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        const serializer = new XMLSerializer();
        svgText = serializer.serializeToString(svgEl);
      }
    } catch (e) {
      console.warn('Failed to normalize fetched SVG', e);
    }
    CONTACT_ICON_SVG = svgText;
    // Replace any existing .contact-icon content (img) with inline svg for crisp scaling
    document.querySelectorAll('.contact-icon').forEach(el => {
      try {
        el.innerHTML = CONTACT_ICON_SVG;
        const svg = el.querySelector('svg');
        if (svg) {
          svg.setAttribute('height', '18');
          svg.setAttribute('width', 'auto');
          svg.style.height = '18px';
          svg.style.width = 'auto';
          svg.style.maxHeight = '18px';
          svg.style.display = 'block';
        }
      } catch (e) { console.warn('Failed to inline contact SVG into element', e); }
    });
  } catch (e) {
    console.warn('Failed to fetch contact SVG inline', e);
  }
})();

function getContactIconHtml() {
  // Build the static contact SVG path from the current origin so
  // the script works whether the app is served as http://127.0.0.1:8000
  // or another host/port.
  const origin = (typeof window !== 'undefined' && window.location && window.location.origin) ? window.location.origin : '';
  const src = origin + CONTACT_SVG_CANDIDATES[0];

  // If we already loaded the SVG text, return it inline for crisp rendering.
  if (CONTACT_ICON_SVG) {
    return `<span class="contact-icon">${CONTACT_ICON_SVG}</span>`;
  }

  // Fallback to an <img> tag which will later be replaced when inline SVG is available.
  // Use a small colored circular badge (data URL) so it appears like the screenshot
  const badge = createColoredContactSvg('#1d2d62'); // dark navy
  return `<span class="contact-icon"><img src="${badge}" alt="phone" aria-hidden="true"></span>`;
}

function buildContactSegment(phoneText) {
  if (!phoneText) return "";
  return `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(String(phoneText))}</span>`;
}

// Global helper: create colored contact SVG with colored ring + white phone
function createColoredContactSvg(bgColor = "#000000") {
  // Return a compact 24x24 SVG: colored circular badge with a white handset
  const safeColor = String(bgColor || '#000000').replace(/"/g, '');
  const svgContent = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="10" fill="${safeColor}" stroke="#6b4b0a" stroke-width="1.2"/>\n  <path fill="#111111" stroke="#ffffff" stroke-width="0.4" d="M6.62 10.79a15.466 15.466 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.24c.96.39 2.06.76 3.06.76a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h2.5a1 1 0 011 1c.01.24.09.47.22.68.18.3.47.56.85.78.47.27 1.08.56 1.86.66.5.07.88.38 1.02.86.12.41.04.84-.25 1.18l-2.2 2.2z"/>\n</svg>`;

  const base64 = btoa(unescape(encodeURIComponent(svgContent)));
  return 'data:image/svg+xml;base64,' + base64;
}


// Robust inliner: tries app static path, falls back to embedded base64, supports recolor via createColoredContactSvg
async function inlineSvgAsDataUrl(imgSelector, options = {}) {
  // options: { preferDataUrl: false, color: null }
  const preferDataUrl = !!options.preferDataUrl;
  const forcedColor = options.color || null;
  const nodes = Array.from(document.querySelectorAll(imgSelector));
  if (!nodes.length) {
    console.warn('inlineSvgAsDataUrl: no elements matched', imgSelector);
    return false;
  }

  // helper to apply common styles & src
  function applyImg(imgEl, src) {
    try {
      if (!src) return;
      imgEl.setAttribute('src', src);
      imgEl.style.width = imgEl.style.width || '18px';
      imgEl.style.height = imgEl.style.height || '18px';
      imgEl.style.display = 'inline-block';
      imgEl.style.verticalAlign = 'middle';
      imgEl.style.objectFit = 'contain';
      imgEl.style.pointerEvents = 'none';
    } catch (e) {
      console.warn('inlineSvgAsDataUrl.applyImg error', e);
    }
  }

  // try to load an image to test path; returns Promise<boolean>
  function testLoad(src) {
    return new Promise(resolve => {
      if (!src) return resolve(false);
      const i = new Image();
      i.onload = () => resolve(true);
      i.onerror = () => resolve(false);
      // try to avoid CORS issues for cross origin — still just a test
      try { i.crossOrigin = 'anonymous'; } catch(e){}
      i.src = src;
    });
  }

  // preferred candidate paths (application static SVG)
  const appSvgPathCandidates = CONTACT_SVG_CANDIDATES.slice();

  // If a forced color is provided, prefer createColoredContactSvg to recolor ring
  const coloredDataUrl = forcedColor ? createColoredContactSvg(forcedColor) : null;

  // Resolve final src once. Prefer forced color, then embedded base64/data-url
  let finalSrc = null;

  if (preferDataUrl) {
    if (CONTACT_ICON_BASE64) finalSrc = CONTACT_ICON_BASE64;
    else if (coloredDataUrl) finalSrc = coloredDataUrl;
  }

  // If forced color requested, use colored data URL immediately
  if (!finalSrc && forcedColor) {
    finalSrc = createColoredContactSvg(forcedColor);
  }

  // If we already have an embedded base64, use it to avoid network fetches (prevents 404 noise)
  if (!finalSrc && CONTACT_ICON_BASE64) {
    finalSrc = CONTACT_ICON_BASE64;
  }

  // If still no finalSrc, test the app static path candidates (last resort)
  if (!finalSrc) {
    try {
      for (const p of appSvgPathCandidates) {
        const ok = await testLoad(p);
        if (ok) { finalSrc = p; break; }
      }
    } catch(e) { /* ignore */ }
  }

  // Fall back to coloredDataUrl as a last option
  if (!finalSrc && coloredDataUrl) finalSrc = coloredDataUrl;

  // As last fall back, create a very small inline SVG white phone (guaranteed to render)
  if (!finalSrc) {
    const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#000"/><path d="M7 10c1.5 3 3 4 6 6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
    finalSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(tinySvg)));
  }

  // apply finalSrc to all matched img elements
  nodes.forEach(img => {
    try {
      // If we already have the full SVG text loaded, replace the <img> with inline SVG
      if (CONTACT_ICON_SVG) {
        try {
          const wrapper = img.closest('.contact-icon') || img.parentNode;
          if (wrapper) {
            wrapper.innerHTML = CONTACT_ICON_SVG;
            const svg = wrapper.querySelector('svg');
            if (svg) {
              svg.style.height = img.style.height || '18px';
              svg.style.width = img.style.width || 'auto';
              svg.style.maxHeight = img.style.maxHeight || '18px';
              svg.setAttribute('role','img');
              svg.setAttribute('aria-hidden','true');
            }
          }
          return; // done for this element
        } catch(e) { console.warn('inlineSvgAsDataUrl: failed to replace img with inline svg', e); }
      }
      // If we have a color and we want to recolor per element, regenerate data URL
      if (forcedColor) {
        applyImg(img, createColoredContactSvg(forcedColor));
      } else {
        applyImg(img, finalSrc);
      }

      // attach error handler that will replace broken src with embedded base64
      img.onerror = function () {
        console.warn('contact img failed to load, falling back to embedded base64', img.getAttribute('src'));
        if (CONTACT_ICON_BASE64) {
          applyImg(img, CONTACT_ICON_BASE64);
        } else if (coloredDataUrl) {
          applyImg(img, coloredDataUrl);
        }
      };
    } catch (e) {
      console.warn('inlineSvgAsDataUrl: apply failed', e);
    }
  });

  console.log('inlineSvgAsDataUrl: applied src to', nodes.length, 'elements; finalSrc:', finalSrc && finalSrc.slice(0,80));
  return true;
}

// Convert matched <img> elements (typically SVG data URLs) into PNG data URLs for html2canvas compatibility
async function convertSvgImagesToPng(imgSelector, size = 24) {
  const imgs = Array.from(document.querySelectorAll(imgSelector));
  if (!imgs.length) return;

  await Promise.all(imgs.map(img => new Promise(resolve => {
    try {
      const src = img.getAttribute('src');
      if (!src || !/^data:image\/svg/.test(src)) return resolve();

      const loader = new Image();
      loader.crossOrigin = 'anonymous';
      loader.onload = function () {
        try {
          const dim = Math.max(size, parseInt(window.getComputedStyle(img).width, 10) || size);
          const canvas = document.createElement('canvas');
          canvas.width = dim;
          canvas.height = dim;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, dim, dim);
          ctx.drawImage(loader, 0, 0, dim, dim);
          const pngData = canvas.toDataURL('image/png');
          if (pngData) img.setAttribute('src', pngData);
        } catch (err) {
          console.warn('convertSvgImagesToPng draw error', err);
        }
        resolve();
      };
      loader.onerror = function () { resolve(); };
      loader.src = src;
    } catch (error) {
      console.warn('convertSvgImagesToPng error', error);
      resolve();
    }
  })));
}

// Convert matched <img> elements that reference SVGs (data URLs or remote
// SVG files) into PNG data URLs for reliable canvas rendering. This will
// attempt to fetch remote SVGs as needed and always replace the `src`
// with a PNG data URL when possible.
async function convertAnySvgImagesToPng(imgSelector, size = 24) {
  const imgs = Array.from(document.querySelectorAll(imgSelector));
  if (!imgs.length) return;

  await Promise.all(imgs.map(img => new Promise(async (resolve) => {
    try {
      const src = img.getAttribute('src') || img.src || '';
      if (!src) return resolve();

      // If it's already a PNG, skip
      if (/^data:image\/png/.test(src) || /\.png($|\?)/i.test(src)) return resolve();

      let svgDataUrl = null;

      if (/^data:image\/svg\+xml/.test(src)) {
        svgDataUrl = src;
      } else if (/\.svg($|\?)/i.test(src) || src.trim().endsWith('.svg')) {
        // fetch remote svg text and convert to data URL
        try {
          const res = await fetch(src, { cache: 'no-store' });
          if (res && res.ok) {
            const text = await res.text();
            svgDataUrl = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(text)));
          }
        } catch (e) {
          // ignore fetch errors
          console.warn('convertAnySvgImagesToPng: failed to fetch remote svg', src, e);
        }
      }

      if (!svgDataUrl) return resolve();

      const loader = new Image();
      loader.crossOrigin = 'anonymous';
      loader.onload = function () {
        try {
          const dim = Math.max(size, parseInt(window.getComputedStyle(img).width, 10) || size);
          const canvas = document.createElement('canvas');
          canvas.width = dim;
          canvas.height = dim;
          const ctx = canvas.getContext('2d');
          ctx.clearRect(0, 0, dim, dim);
          ctx.drawImage(loader, 0, 0, dim, dim);
          const pngData = canvas.toDataURL('image/png');
          if (pngData) img.setAttribute('src', pngData);
        } catch (err) {
          console.warn('convertAnySvgImagesToPng draw error', err);
        }
        resolve();
      };
      loader.onerror = function () { resolve(); };
      loader.src = svgDataUrl;
    } catch (error) {
      console.warn('convertAnySvgImagesToPng error', error);
      resolve();
    }
  })));
}


/* ---------- Footer and color functions ---------- */
function updateFooterInfo() {
  const storeNameVal = document.getElementById("footerName").value.trim() || "Store Name";
  const whatsappVal = document.getElementById("footerWhatsApp").value.trim();

  // Ensure there is exactly one live footer in the editor: keep or create
  // the `#storeFooterName` inside `#templateBox` and remove any other
  // `#storeFooterName` / `#storeFooterNameFinal` elements elsewhere.
  try {
    let primary = document.querySelector('#templateBox #storeFooterName');
    if (!primary) {
      // if none exists inside templateBox, try to reuse any existing
      primary = document.getElementById('storeFooterName');
      if (primary && primary.closest && primary.closest('#templateBox')) {
        // already fine
      } else {
        // create a fresh footer inside templateBox
        const tpl = document.getElementById('templateBox');
        if (tpl) {
          const created = document.createElement('div');
          created.id = 'storeFooterName';
          tpl.insertBefore(created, tpl.firstChild || null);
          primary = created;
        }
      }
    }
    // remove any other footer elements in the document
    document.querySelectorAll('#storeFooterName, #storeFooterNameFinal').forEach(el => {
      if (el === primary) return;
      try { el.remove(); } catch(e) { try { el.parentNode && el.parentNode.removeChild(el);} catch(e2){} }
    });
  } catch(e) { /* ignore */ }

  let footerHTML = `<span class="store-address">${escapeHtml(storeNameVal)}</span>`;
  footerHTML += buildContactSegment(whatsappVal);

  const footerEl = document.getElementById("storeFooterName");
  if (footerEl) {
    footerEl.innerHTML = footerHTML;
    footerEl.style.display = "inline-flex";
    footerEl.style.alignItems = "center";
    footerEl.style.justifyContent = "center";
    footerEl.style.whiteSpace = "normal";
    footerEl.style.pointerEvents = "none";
  }

  setTimeout(() => {
    adjustFooterFontSize();
    adjustFooterPosition();
  }, 40);

  inlineSvgAsDataUrl('.contact-icon img');
}

/* ---------- Single robust footer font-size function (replaces duplicates) ---------- */
async function adjustFooterFontSize() {
  if (document.fonts && document.fonts.ready) {
    try { await document.fonts.ready; } catch(e){ /* ignore */ }
  }
  const footers = document.querySelectorAll("#storeFooterName, #storeFooterNameFinal");
  footers.forEach(footer => {
    const addr = footer.querySelector(".store-address");
    if (!addr) return;

    addr.style.setProperty('white-space', 'normal', 'important');
    addr.style.setProperty('display', 'inline-block', 'important');
    addr.style.setProperty('overflow-wrap', 'break-word', 'important');
    addr.style.setProperty('word-break', 'break-word', 'important');

    const text = (addr.textContent || "").trim();
    const length = text.length;
    const hasDevanagari = /[\u0900-\u097F]/.test(text);

    let fontSize;

    if (length <= 20) fontSize = 17;
    else if (length <= 30) fontSize = 16;
    else if (length <= 40) fontSize = 15;
    else if (length <= 55) fontSize = 14;
    else if (length <= 70) fontSize = 13;
    else if (length <= 90)  fontSize = hasDevanagari ? 14 : 13;
    else if (length <= 120) fontSize = hasDevanagari ? 13 : 12;
    else if (length <= 150) fontSize = hasDevanagari ? 12 : 11;
    else if (length <= 190) fontSize = hasDevanagari ? 11 : 10;
    else                    fontSize = hasDevanagari ? 10 : 9;

    function applySize(s) {
      addr.style.setProperty('font-size', s + 'px', 'important');
      footer.querySelectorAll('.store-mobile, .separator').forEach(el => {
        el.style.setProperty('font-size', Math.max(8, s) + 'px', 'important');
      });
    }
    applySize(fontSize);
    const footerWidth = Math.max(50, footer.clientWidth || (footer.getBoundingClientRect && footer.getBoundingClientRect().width) || 794);
    let siblingsWidth = 0;
    Array.from(footer.children).forEach(ch => {
      if (ch === addr) return;
      ch.style.display = ch.style.display || 'inline-block';
      siblingsWidth += (ch.getBoundingClientRect && ch.getBoundingClientRect().width) || 0;
    });
    const paddingAllowance = 20;
    const availableWidth = Math.max(40, footerWidth - siblingsWidth - paddingAllowance);

    const minFont = 4;
    let iter = 0;
    while (addr.scrollWidth > availableWidth && fontSize > minFont && iter < 80) {
      fontSize -= 0.3;
      applySize(fontSize);
      iter++;
    }

    if (addr.scrollWidth > availableWidth) {
      addr.style.setProperty('max-width', (availableWidth - 6) + 'px', 'important');
      addr.style.setProperty('text-overflow', 'ellipsis', 'important');
      addr.style.setProperty('overflow', 'hidden', 'important');
      addr.style.setProperty('white-space', 'nowrap', 'important');
    } else {
      addr.style.removeProperty('max-width');
      addr.style.setProperty('text-overflow', 'clip', 'important');
      addr.style.setProperty('overflow', 'visible', 'important');
      addr.style.setProperty('white-space', 'nowrap', 'important');
    }
  });
}

function adjustFooterShift() {
  const footer = document.getElementById("storeFooterName");
  if (!footer) return;

  const addr = footer.querySelector(".store-address");
  if (!addr) return;

  const length = addr.textContent.trim().length;

  if (length > 60) {
    footer.classList.add("long");
  } else {
    footer.classList.remove("long");
  }
}

function applyFooterColor(){
  const c = document.getElementById("footerTextColor").value;
  document.querySelectorAll(".store-address, .separator, .store-mobile").forEach(el => {
    el.style.setProperty('color', c, 'important');
    el.style.fontWeight = "600";
  });
  // recolor and re-apply SVG
  inlineSvgAsDataUrl('.contact-icon img', { color: c });
  document.querySelectorAll(".contact-icon").forEach(icon => {
    const img = icon.querySelector('img');
    if (!img) return;
    img.src = createColoredContactSvg(c);
    img.style.removeProperty('filter');
  });
}


function setStoreFooterFontSize() {
  document.querySelectorAll('#storeFooterName .store-address').forEach(a => {
    a.style.setProperty('font-size', '9px', 'important');
  });
  if (window._fitStoreFooterNow) window._fitStoreFooterNow();
}

/* ---------- Footer position ---------- */
function adjustFooterPosition(){
  const footers = document.querySelectorAll("#storeFooterName, #storeFooterNameFinal");
  // read selected footer position radio (default to footer_only)
  const pos = (document.querySelector('input[name="footer_position"]:checked')||{value:'footer_only'}).value;
  footers.forEach(footer => {
    const textLength = footer.textContent.trim().length;
    let baseBottom;

    // Use smaller bottom offsets so the footer sits closer to the page edge
    // (below decorative dividers) and avoids overlapping content above it.
    if (textLength < 80) baseBottom = 12;
    else if (textLength < 128) baseBottom = 9;
    else baseBottom = 6;

    // If user selected the new 'more_down' option, move the address further down
    if (pos === 'more_down') {
      // Smaller bottom value moves the element closer to the bottom edge
      // If the user chose 'more_down', push it further down slightly
      if (baseBottom === 12) baseBottom = 8;
      else if (baseBottom === 9) baseBottom = 6;
      else baseBottom = 4;
    }
    footer.style.bottom = baseBottom + "px";
    footer.style.left = '50%';
    // center precisely; use -50% to avoid small centering drift
    footer.style.transform = 'translateX(-50%)';
    footer.style.textAlign = 'center';
    footer.style.maxWidth = '95%';
  });
  // toggle a class on the main template box so CSS can apply !important overrides
  try {
    const templateBox = document.getElementById('templateBox') || document.querySelector('.template-box');
    if (templateBox) {
      if (pos === 'more_down') templateBox.classList.add('more-down');
      else templateBox.classList.remove('more-down');
    }
  } catch(e){ /* ignore */ }
}

/* ---------- Font wait helper for html2canvas / canvas correctness ---------- */
async function waitForLangFont(lang){
  const fam = LANG_FONT_MAP[lang] || "NotoSans";
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load(`16px "${fam}"`);
      await document.fonts.ready;
    } else {
      await new Promise(r => setTimeout(r, 250));
    }
  } catch(e){ console.warn("font load err", e); }
}

/* ---------- sync final layer helper for clones (keeps background + footer) ---------- */
function syncFinalLayerFor(box){
  if(!box) return;
  // avoid creating a "final" footer inside the live editor box itself
  // (syncFinalLayerFor is intended for cloned boxes used for export)
  if (box.id === 'templateBox') return;
  let tgt = box.querySelector("[data-final-template]");
  if(!tgt){
    tgt = document.createElement("div");
    tgt.setAttribute("data-final-template","1");
    tgt.style.position = "absolute";
    tgt.style.inset = "0";
    tgt.style.zIndex = 10;
    tgt.style.pointerEvents = "none";
    tgt.style.backgroundSize = "cover";
    tgt.style.backgroundPosition = "center";
    tgt.style.backgroundRepeat = "no-repeat";
    box.appendChild(tgt);
  }
  const bgImage = window.getComputedStyle(box).backgroundImage;
  const bgColor = window.getComputedStyle(box).backgroundColor;
  if (bgImage && bgImage !== 'none') {
    tgt.style.backgroundImage = bgImage;
    tgt.style.backgroundColor = 'transparent';
  } else {
    tgt.style.backgroundImage = '';
    tgt.style.backgroundColor = bgColor || 'transparent';
  }

  let footerFinal = box.querySelector("#storeFooterNameFinal");
  if(!footerFinal){
    footerFinal = document.createElement("div");
    footerFinal.id = "storeFooterNameFinal";
    footerFinal.style.position = "absolute";
    // position the final footer a bit closer to the page bottom so it
    // doesn't overlap decorative dividers or rules above it.
    footerFinal.style.bottom = "12px";
    footerFinal.style.left = "50%";
    // center precisely and reserve some horizontal space to avoid
    // overlapping with right-side elements (like a QR code).
    footerFinal.style.transform = "translateX(-50%)";
    footerFinal.style.zIndex = 20;
    footerFinal.style.pointerEvents = "none";
    // Constrain width so the footer text won't run into side content.
    // Leave horizontal padding for potential QR/badges on the right.
    footerFinal.style.width = "calc(100% - 140px)";
    footerFinal.style.maxWidth = "100%";
    footerFinal.style.boxSizing = "border-box";
    footerFinal.style.textAlign = "center";
    footerFinal.style.whiteSpace = "nowrap";
    footerFinal.style.overflow = "hidden";
    footerFinal.style.textOverflow = "ellipsis";
    footerFinal.style.padding = "0 8px";
    box.appendChild(footerFinal);
  }

  // Only look for a footer inside this box. Using the global
  // document.getElementById("storeFooterName") here caused the
  // editor's footer to be used for multiple cloned boxes, resulting
  // in the address being rendered twice (editor + overlay). Avoid
  // the global fallback so each box uses its own local footer only.
  const editorFooter = box.querySelector("#storeFooterName");
  let addressText = "", phoneText = "";
  if (editorFooter) {
    const addr = editorFooter.querySelector(".store-address");
    const mobile = editorFooter.querySelector(".store-mobile");
    if (addr) addressText = addr.textContent.trim();
    else addressText = editorFooter.textContent.trim();
    if (mobile) phoneText = mobile.textContent.trim();
  }
  footerFinal.innerHTML = '';
  const spanAddr = document.createElement("span");
  spanAddr.className = "store-address";
  spanAddr.textContent = addressText;
  footerFinal.appendChild(spanAddr);
  if (phoneText) {
    // group separator, icon and phone into a single inline group
    const group = document.createElement('span');
    group.className = 'contact-group';

    const sep = document.createElement("span");
    sep.className = "separator";
    sep.textContent = "|";

    const spanPhone = document.createElement("span");
    spanPhone.className = "store-mobile";
    spanPhone.textContent = phoneText;

    group.appendChild(sep);
    group.appendChild(spanPhone);
    footerFinal.appendChild(group);
  }

  ensureContactIconAfterSeparator(box);
  // ensure footer positions are recalculated to respect the editor radio setting
  try { adjustFooterPosition(); } catch(e){ /* ignore */ }
  
  // Add a per-template Download A4 button on cloned templates so users can
  // download a single Perfect A4 PDF for that generated template.
  try { addDownloadButtonToNode(box); } catch(e) { console.warn('addDownloadButtonToNode failed', e); }
}

function cloneExactFooter(sourceBox, targetBox) {
  // prefer the live editor footer, but fall back to the final footer
  let src = sourceBox.querySelector("#storeFooterName") || sourceBox.querySelector("#storeFooterNameFinal");
  // If the source box doesn't contain the editor footer (edge cases),
  // fallback to the global editor footer element so clones still get
  // the address when the live footer is mounted elsewhere.
  if (!src) {
    src = document.getElementById('storeFooterName') || document.getElementById('storeFooterNameFinal') || src;
  }
  const dst = targetBox.querySelector("#storeFooterNameFinal");

  if (!src || !dst) return;

  // copy content and classes
  dst.innerHTML = src.innerHTML;
  dst.className = src.className || dst.className;

  // copy inline styles if present
  try {
    dst.style.cssText = src.style.cssText || dst.style.cssText;
  } catch (e) { /* ignore css copy errors */ }

  // copy computed positioning so clone footer aligns like the source
  try {
    const comp = window.getComputedStyle(src);
    if (comp) {
      if (comp.left) dst.style.left = comp.left;
      if (comp.bottom) dst.style.bottom = comp.bottom;
      if (comp.transform) dst.style.transform = comp.transform;
      if (comp.display) dst.style.display = comp.display;
      if (comp.alignItems) dst.style.alignItems = comp.alignItems;
      if (comp.justifyContent) dst.style.justifyContent = comp.justifyContent;
      if (comp.whiteSpace) dst.style.whiteSpace = comp.whiteSpace;
    }
  } catch (e) { /* ignore */ }

  dst.style.whiteSpace = dst.style.whiteSpace || "nowrap";
}



function ensureContactIconAfterSeparator(container = document) {
  const footers = container.querySelectorAll('#storeFooterName, #storeFooterNameFinal');
  footers.forEach(f => {
    const sep = f.querySelector('.separator');
    if (!sep) return;

    // if a contact-icon wrapper exists, ensure it's positioned before the
    // phone number (i.e. after the separator but before the .store-mobile).
    let iconWrapper = f.querySelector('.contact-icon');
    if (iconWrapper) {
      const phone = f.querySelector('.store-mobile');
      if (phone && phone.parentNode) {
        if (phone.previousElementSibling !== iconWrapper) phone.parentNode.insertBefore(iconWrapper, phone);
      } else {
        const next = sep.nextElementSibling;
        if (next !== iconWrapper) sep.insertAdjacentElement('afterend', iconWrapper);
      }
      // ensure the inner <img> has consistent attributes
      const existingImg = iconWrapper.querySelector('img');
      if (existingImg) {
        existingImg.style.width = existingImg.style.width || '18px';
        existingImg.style.height = existingImg.style.height || '18px';
        existingImg.style.display = 'inline-block';
        existingImg.style.verticalAlign = 'middle';
        existingImg.style.objectFit = 'contain';
        existingImg.style.pointerEvents = 'none';
        const iconSrc = CONTACT_ICON_BASE64 || CONTACT_SVG_CANDIDATES[0];
        if (existingImg.getAttribute('src') !== iconSrc) existingImg.setAttribute('src', iconSrc);
      }
      return;
    }

    // create a dedicated wrapper + IMG element (not innerHTML)
    iconWrapper = document.createElement('span');
    iconWrapper.className = 'contact-icon';
    iconWrapper.style.display = 'inline-flex';
    iconWrapper.style.alignItems = 'center';
    iconWrapper.style.marginLeft = '0px';

    const img = document.createElement('img');
    img.alt = 'phone';
    const iconSrc = CONTACT_ICON_BASE64 || CONTACT_SVG_CANDIDATES[0];
    img.setAttribute('src', iconSrc);
    img.style.width = '18px';
    img.style.height = '18px';
    img.style.display = 'inline-block';
    img.style.verticalAlign = 'middle';
    img.style.objectFit = 'contain';
    img.style.pointerEvents = 'none';

    iconWrapper.appendChild(img);
    // prefer inserting before phone if it exists
    const phone = f.querySelector('.store-mobile');
    if (phone && phone.parentNode) {
      phone.parentNode.insertBefore(iconWrapper, phone);
    } else {
      sep.insertAdjacentElement('afterend', iconWrapper);
    }
  });
}


// Create and attach a small Download A4 button to a template `box`.
function addDownloadButtonToNode(box) {
  if (!box || box.id === 'templateBox') return;
  // avoid adding multiple buttons
  if (box.querySelector('.download-a4-btn')) return;

  const ctrl = document.createElement('div');
  ctrl.style.position = 'absolute';
  ctrl.style.top = '6px';
  ctrl.style.right = '6px';
  ctrl.style.zIndex = 99999;
  ctrl.style.pointerEvents = 'auto';

  const btn = document.createElement('button');
  btn.className = 'download-a4-btn';
  btn.textContent = '📥 A4';
  btn.title = 'Download Perfect A4 PDF for this template';
  btn.style.padding = '6px 8px';
  btn.style.borderRadius = '6px';
  btn.style.border = '0';
  btn.style.background = '#2c4fb0';
  btn.style.color = '#fff';
  btn.style.cursor = 'pointer';
  btn.style.fontSize = '13px';

  btn.onclick = async function(e){
    e.stopPropagation();
    try {
      // Prepare background candidate if available (use global vars if set)
      let bg = null;
      try {
        if (typeof TEMPLATE_BG_DATA_URL !== 'undefined' && TEMPLATE_BG_DATA_URL) {
          const i = new Image();
          i.src = TEMPLATE_BG_DATA_URL;
          await new Promise(r => { i.onload = r; i.onerror = r; });
          bg = i;
        }
      } catch(_) { bg = null; }

      const a4Canvas = await createA4CanvasFromBox(box, bg);
      const imgData = a4Canvas.toDataURL('image/jpeg', 0.95);
      if (!window.jspdf || !window.jspdf.jsPDF) { alert('PDF library not loaded. Refresh the page.'); return; }
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF('p','mm','a4');
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);

      // derive file name from store address if present
      let name = 'Template';
      try {
        const addrEl = box.querySelector('.store-address');
        if (addrEl && addrEl.textContent.trim()) {
          name = addrEl.textContent.trim().substring(0,40).replace(/[^a-zA-Z0-9]+/g, '_');
        }
      } catch(e){}
      pdf.save(`${name}_PerfectA4.pdf`);
    } catch (err) {
      console.error('Download A4 failed', err);
      alert('Error creating A4 PDF: ' + (err && err.message ? err.message : err));
    }
  };

  ctrl.appendChild(btn);
  box.appendChild(ctrl);
}


function runFooterFixes(scope = document) {
  try {
    ensureContactIconAfterSeparator(scope);
    adjustFooterFontSize().catch(()=>{});
    adjustFooterPosition();
  } catch (e) {
    console.warn('footer fix error', e);
  }
}

window.addEventListener('load', async () => {
  // if footer color chosen, use it to recolor the SVG ring
  const footerColor = (document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || null;
  await inlineSvgAsDataUrl('.contact-icon img', { preferDataUrl: false, color: footerColor });
  setTimeout(() => runFooterFixes(document), 120);
});






/* ---------- Excel parser: populate excelData & excelDataBySheet ---------- */
document.getElementById('storesExcel')?.addEventListener('change', function (e) {
  const f = e.target.files && e.target.files[0];
  if (!f) { alert('No Excel selected'); return; }

  const reader = new FileReader();
  reader.onload = function(ev) {
    try {
      const data = new Uint8Array(ev.target.result);
      const wb = XLSX.read(data, { type: 'array' });

      // reset globals
      excelDataBySheet = {};
      wb.SheetNames.forEach(name => {
        const ws = wb.Sheets[name];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: "" }); // array of objects
        excelDataBySheet[name] = rows;
      });

      // pick first sheet as default (or keep previous if available)
      const sheetNames = Object.keys(excelDataBySheet);
      currentSheetName = sheetNames.length ? sheetNames[0] : "";
      excelData = excelDataBySheet[currentSheetName] || [];

      console.log('Excel parsed. Sheets:', sheetNames, 'currentSheetName=', currentSheetName, 'rows=', excelData.length);
      alert(`Excel loaded: ${sheetNames.length} sheet(s). Using "${currentSheetName}". Click Generate.`);

      // populate state dropdown automatically (calls below)
      if (typeof updateStateDropdown === 'function') updateStateDropdown();

      // optionally update any UI that depends on languages / columns
      if (typeof checkLanguageColumnsSingle === 'function') {
        try { checkLanguageColumnsSingle(); } catch(e){ console.warn('checkLanguageColumnsSingle error', e); }
      }
    } catch (err) {
      console.error('Excel parse error', err);
      alert('Error parsing Excel: ' + (err.message || err));
    }
  };

  reader.onerror = function(err) {
    console.error('FileReader error', err);
    alert('Failed to read file: ' + (err.message || err));
  };

  reader.readAsArrayBuffer(f);
}, { passive: true });



/* -------- Auto Detect State List from Excel -------- */
function updateStateDropdown() {
  const stateFilter = document.getElementById("stateFilter");
  if (!stateFilter) return;

  // clear old options
  stateFilter.innerHTML = "";

  // Try to find the "state" column in ANY sheet
  let allStates = new Set();

  for (const [sheet, rows] of Object.entries(excelDataBySheet || {})) {
    if (!rows || !rows.length) continue;

    // find any key in the row objects that contains 'state'
    const keys = Object.keys(rows[0] || {}).map(k => k.toLowerCase());
    const stateKey = keys.find(k => k.includes("state"));
    if (!stateKey) continue;

    rows.forEach(r => {
      const rawVal = r[Object.keys(r).find(k => k.toLowerCase() === stateKey)];
      const val = rawVal == null ? "" : String(rawVal).trim();
      if (val) allStates.add(val);
    });
  }

  // Convert Set → Array & sort
  const finalStates = Array.from(allStates).sort((a,b) => a.localeCompare(b));

  // Insert -- All States -- option
  const optAll = document.createElement("option");
  optAll.value = "";
  optAll.textContent = "-- All States --";
  stateFilter.appendChild(optAll);

  // Add detected states
  finalStates.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    stateFilter.appendChild(opt);
  });

  console.log("Auto-Detected States:", finalStates);
}




/* ---------- Safe generate button attach (non-invasive, does not change fonts) ---------- */
(function attachSafeGenerateButton() {
  const btn = document.getElementById("generateStateTemplates");
  if (!btn) {
    console.warn("[GEN-GUARD] Button #generateStateTemplates not found. Check HTML id or script order.");
    return;
  }

  btn.addEventListener("click", async (ev) => {
    ev && ev.preventDefault && ev.preventDefault();
    try {
      console.log("[GEN-GUARD] generateStateTemplates clicked");

      const state = (document.getElementById("stateFilter")?.value || "").trim();
      // If primary/secondary templates uploaded -> prefer two-template flows
      const hasPairMode = !!((TEMPLATE_BG_PRIMARY && TEMPLATE_BG_PRIMARY.length) || (TEMPLATE_BG_SECONDARY && TEMPLATE_BG_SECONDARY.length));
      console.log("[GEN-GUARD] hasPairMode:", hasPairMode, "currentSheetName:", currentSheetName,
                  "excelData length:", (excelData || []).length,
                  "excelDataBySheet keys:", Object.keys(excelDataBySheet || {}).length);

      if (hasPairMode) {
        // Prefer specialized two-template generator if available
        if (typeof generateTemplatesFromSheet_twoTemplate === "function" && excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
          console.log("[GEN-GUARD] Calling generateTemplatesFromSheet_twoTemplate()");
          await generateTemplatesFromSheet_twoTemplate();
          return;
        }
        // Fallback to sheet generator if present
        if (typeof generateTemplatesFromSheet === "function" && excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
          console.log("[GEN-GUARD] generateTemplatesFromSheet_twoTemplate missing — falling back to generateTemplatesFromSheet()");
          await generateTemplatesFromSheet();
          return;
        }
        // Last fallback: use single-sheet uploaded-template generator
        if (typeof generateTemplatesFromUploadedTemplate === "function" && excelData && excelData.length > 0) {
          console.log("[GEN-GUARD] Using generateTemplatesFromUploadedTemplate() as fallback for pair-mode.");
          // produce paired clones within that function/flow (your existing fallback code expects excelData to exist)
          await (async ()=> { 
            // keep existing behavior (call uploaded-template variant which your code already uses as fallback)
            await generateTemplatesFromUploadedTemplate({ selectedState: state });
          })();
          return;
        }

        // Nothing available
        alert("❌ Two-template generation requested, but required generator functions are missing or no Excel uploaded. See console for details.");
        console.error("[GEN-GUARD] No suitable generator found for pair-mode. Check generateTemplatesFromSheet_twoTemplate / generateTemplatesFromSheet / generateTemplatesFromUploadedTemplate existence.");
        return;
      }

      // Non-pair mode (original behavior)
      if (typeof generateTemplatesFromSheet === "function" && excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
        console.log("[GEN-GUARD] Calling generateTemplatesFromSheet()");
        await generateTemplatesFromSheet();
        return;
      }
      if (typeof generateTemplatesFromUploadedTemplate === "function" && excelData && excelData.length > 0) {
        console.log("[GEN-GUARD] Calling generateTemplatesFromUploadedTemplate()");
        await generateTemplatesFromUploadedTemplate({ selectedState: state });
        return;
      }

      alert("❌ No Excel data found. Please upload Excel file first (or check console if generator functions are missing).");

    } catch (err) {
      console.error("[GEN-GUARD] Error in generate click handler:", err);
      alert("❌ Error while generating templates: " + (err && err.message ? err.message : String(err)) + "\n\nOpen devtools console for details.");
    }
  }, { passive: false });
})();


/* ---------- Template upload (single background) ---------- */
// document.getElementById("templateUpload").addEventListener("change", function(e){
//   const file = e.target.files[0];
//   if (!file) return;

//   const reader = new FileReader();
//   reader.onload = ev => {
//     const url = ev.target.result;
//     TEMPLATE_BG_DATA_URL = url;

//     templateBox.style.backgroundImage = `url(${url})`;
//     templateBox.style.backgroundSize = "cover";
//     templateBox.style.backgroundPosition = "center";

//     alert("Template uploaded. Now choose language and click 'Generate Templates'.");
//   };
//   reader.readAsDataURL(file); 
// });


/* ---------- Template upload (single background) ---------- */
document.getElementById("templateUpload").addEventListener("change", async function(e){
  const file = e.target.files[0];
  if (!file) return;

  try {
    // Convert uploaded image to crisp A4 background
    const hdDataUrl = await renderFileToA4DataUrl(file);

    TEMPLATE_BG_DATA_URL = hdDataUrl;

    templateBox.style.backgroundImage = `url(${hdDataUrl})`;
    templateBox.style.backgroundSize = "cover";
    templateBox.style.backgroundPosition = "center";

    alert("Custom template uploaded in HD. Now choose language and click 'Generate Templates'.");
  } catch (err) {
    console.error("Custom template upload failed:", err);
    alert("❌ Error loading custom template: " + err.message);
  }
});

/* ---------- Two-template support: primary + secondary (local language) ---------- */
/* NOTE: This is added without changing any footer/store-address styling. */
let TEMPLATE_BG_PRIMARY = null;    // DataURL for primary (English) template
let TEMPLATE_BG_SECONDARY = null;  // DataURL for secondary (local-language) template
let TEMPLATE_BG_SECONDARY_LANG = 'hi'; // default language for secondary template (can change from UI)

// ----------------- Keep preview boxes safe when regenerating -----------------
function clearGeneratedTemplates() {
  const container = document.getElementById("templatesContainer");
  if (!container) return;
  // ids we MUST preserve (adjust if your preview IDs differ)
  const preserve = new Set([
    'primaryTemplateBox',
    'secondaryTemplateBox',
    'templateClonePrimary',
    'templateCloneSecondary'
  ]);

  // remove all children that are NOT in preserve set
  Array.from(container.children).forEach(child => {
    if (!child.id || !preserve.has(child.id)) {
      // extra guard: do not remove the original editor templateBox if it's inside container
      if (child.id === 'templateBox') return;
      // also preserve any element explicitly flagged as preview
      if (child.dataset && child.dataset.preview === "1") return;
      child.remove();
    }
  });
}

/* Upload handlers (primary + secondary) */
function updateTemplatePreviews() {
  const primaryBox = document.getElementById('primaryTemplateBox');
  const secondaryBox = document.getElementById('secondaryTemplateBox');
  if (primaryBox) {
    primaryBox.innerHTML = TEMPLATE_BG_PRIMARY ? `<img src="${TEMPLATE_BG_PRIMARY}" alt="Primary Template" style="max-width:100%; max-height:110px;">` : '';
  }
  if (secondaryBox) {
    secondaryBox.innerHTML = TEMPLATE_BG_SECONDARY ? `<img src="${TEMPLATE_BG_SECONDARY}" alt="Secondary Template" style="max-width:100%; max-height:110px;">` : '';
  }
}
// Create preview + generated subcontainers (idempotent)
(function ensurePreviewAndGeneratedContainers() {
  const root = document.getElementById('templatesContainer');
  if (!root) return;
  if (!document.getElementById('templatePreviews')) {
    const previewArea = document.createElement('div');
    previewArea.id = 'templatePreviews';
    previewArea.style.minHeight = '1px';
    // keep previews at top
    root.insertAdjacentElement('afterbegin', previewArea);
  }
  if (!document.getElementById('generatedTemplates')) {
    const gen = document.createElement('div');
    gen.id = 'generatedTemplates';
    gen.style.marginTop = '16px';
    root.appendChild(gen);
  }
})();

function getGeneratedContainer() {
  return document.getElementById('generatedTemplates') || document.getElementById('templatesContainer');
}







document.getElementById('templateUploadPrimary')?.addEventListener('change', function(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    TEMPLATE_BG_PRIMARY = ev.target.result;
    updateTemplatePreviews();
    // show on main editor as preview if desired (do not change store-address font/styles)
    const box = document.getElementById('templateBox');
    if (box && !TEMPLATE_BG_DATA_URL) box.style.backgroundImage = `url(${TEMPLATE_BG_PRIMARY})`;
    console.log('Primary (EN) template uploaded');
    alert('Primary template uploaded.');
  };
  reader.readAsDataURL(file);
});



/* ---------- Exact visual clones for Primary + Secondary uploads ---------- */
/* Paste this directly after the secondary upload handler block shown above. */

function createExactClone(id, imageUrl) {
  const container = document.getElementById("templatesContainer");
  if (!container) return;

  // remove old if exists
  const old = document.getElementById(id);
  if (old) old.remove();

  // clone the real templateBox so dimensions/styles are identical
  const original = document.getElementById("templateBox");
  if (!original) return;

  const clone = original.cloneNode(true);
  clone.id = id;
  clone.style.display = "block";
  clone.style.margin = "20px auto";
  clone.style.position = "relative";

  if (imageUrl) {
    clone.style.backgroundImage = `url(${imageUrl})`;
    clone.style.backgroundSize = "cover";
    clone.style.backgroundPosition = "center";
  } else {
    clone.style.backgroundImage = "";
  }

  container.appendChild(clone);

  // sync final overlay/footer layer + run footer fixes so the clone looks identical and prints correctly
  try { syncFinalLayerFor(clone); } catch(e){ console.warn("syncFinalLayerFor failed",e); }
  try { runFooterFixes(clone); } catch(e){ console.warn("runFooterFixes failed",e); }
}

function removeExactClone(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}


document.getElementById('templateUploadSecondary')?.addEventListener('change', function(e){
  const file = e.target.files && e.target.files[0];
  if (!file) { removeExactClone('templateCloneSecondary'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    TEMPLATE_BG_SECONDARY = ev.target.result;
    updateTemplatePreviews();
    // create clone identical to #templateBox with secondary background (if needed elsewhere)
    createExactClone('templateCloneSecondary', ev.target.result);
    console.log('Secondary template uploaded (local language)');
    alert('Secondary template uploaded.');
  };
  reader.readAsDataURL(file);
});

/* When clearAllTemplates() runs, also remove clones if they exist */
const originalClearAll = window.clearAllTemplates;
window.clearAllTemplates = function(...args){
  try { removeExactClone('templateClonePrimary'); } catch(e){}
  try { removeExactClone('templateCloneSecondary'); } catch(e){}
  TEMPLATE_BG_PRIMARY = null;
  TEMPLATE_BG_SECONDARY = null;
  TEMPLATE_BG_DATA_URL = null;
  updateTemplatePreviews();
  if (templateBox) {
    templateBox.style.backgroundImage = "";
    templateBox.style.backgroundColor = "transparent";
  }
  const customUploadInput = document.getElementById('templateUpload');
  if (customUploadInput) {
    customUploadInput.value = "";
  }
  const primaryUploadInput = document.getElementById('templateUploadPrimary');
  if (primaryUploadInput) {
    primaryUploadInput.value = "";
  }
  const secondaryUploadInput = document.getElementById('templateUploadSecondary');
  if (secondaryUploadInput) {
    secondaryUploadInput.value = "";
  }
  if (typeof originalClearAll === 'function') return originalClearAll(...args);

};


document.getElementById('templateUploadSecondary')?.addEventListener('change', function(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    TEMPLATE_BG_SECONDARY = ev.target.result;
    console.log('Secondary template uploaded (local language)');
    alert('Secondary template uploaded.');
  };
  reader.readAsDataURL(file);
});



async function generateTemplatesFromSheet() {
  const container = document.getElementById("templatesContainer");
  
  clearGeneratedTemplates();

  // chosenState may be an actual "state" value or a sheet name (we handle both)
  const chosenStateOrSheet = (document.getElementById("stateFilter")?.value || "").trim();
  // prefer using sheet name if it matches an existing sheet key exactly (case-sensitive)
  const sheets = Object.keys(excelDataBySheet || {});
  let sheetToUse = "";
  if (chosenStateOrSheet && sheets.includes(chosenStateOrSheet)) {
    sheetToUse = chosenStateOrSheet;
  } else {
    // fallback: if the dropdown is "-- All States --" or doesn't match a sheet, use currentSheetName
    sheetToUse = currentSheetName || (sheets.length ? sheets[0] : "");
  }

  if (!sheetToUse || !excelDataBySheet[sheetToUse] || !excelDataBySheet[sheetToUse].length) {
    alert("No sheet data found. Please upload Excel and select a sheet (or pick the sheet name in the state filter).");
    return;
  }

  const rows = excelDataBySheet[sheetToUse];
  const keys = Object.keys(rows[0] || {});
  // find sensible address & mobile keys
  const addressKey = keys.find(k => k.toLowerCase() === "address_eng") ||
                     keys.find(k => k.toLowerCase().includes("address_eng")) ||
                     keys.find(k => k.toLowerCase().includes("address")) || null;
  const mobileKey  = keys.find(k => k.toLowerCase().includes("mobile")) ||
                     keys.find(k => k.toLowerCase().includes("mobileno")) ||
                     keys.find(k => k.toLowerCase().includes("phone")) || null;

  // language columns config (keeps your previous badges/fonts but only uses keys found in sheet)
  const langConfig = {
    mr: { names: ['address_mr','address_marathi'], badge: 'MR' },
    ta: { names: ['address_tm','address_ta','address_tamil'], badge: 'TA' },
    te: { names: ['address_te','address_telugu'], badge: 'TE' },
    hi: { names: ['address_hi','address_hindi'], badge: 'HI' },
    gu: { names: ['address_gu','address_gujarati'], badge: 'GU' },
    bn: { names: ['address_bn','address_bengali'], badge: 'BN' },
    kn: { names: ['address_kn','address_kannada'], badge: 'KN' }
  };

  // detect which language columns actually exist in this sheet
  const langColumns = [];
  const already = new Set();
  for (const [code, cfg] of Object.entries(langConfig)) {
    for (const candidate of cfg.names) {
      const found = keys.find(k => k.toLowerCase() === candidate.toLowerCase());
      if (found && !already.has(found.toLowerCase())) {
        langColumns.push({ key: found, badge: cfg.badge, code });
        already.add(found.toLowerCase());
        break;
      }
    }
  }

  // dynamic detection of additional address language columns beyond the preconfigured list
  keys.forEach(originalKey => {
    const lowerKey = originalKey.toLowerCase();
    if (already.has(lowerKey)) return;
    if (!lowerKey.includes("address")) return;
    if (lowerKey === "address" || lowerKey === "address1" || lowerKey === "address_eng") return;
    const normCode = extractLangCodeFromColumnName(originalKey);
    if (!normCode || normCode === "en") return;
    langColumns.push({ key: originalKey, badge: normCode.toUpperCase(), code: normCode });
    already.add(lowerKey);
  });

  keys.forEach(originalKey => {
    const lower = originalKey.toLowerCase();
    if (already.has(lower)) return;
    if (!lower.includes("address")) return;
    if (lower === "address" || lower === "address1") return;
    const normCode = extractLangCodeFromColumnName(originalKey);
    if (!normCode || normCode === "en") return;
    langColumns.push({ key: originalKey, badge: normCode.toUpperCase(), code: normCode });
    already.add(lower);
  });

  // Disable creation of separate local-language templates; only English templates should be generated
  langColumns.length = 0;

  // create templates
  rows.forEach((store, i) => {
    // English clone
    const cloneEn = templateBox.cloneNode(true);
    cloneEn.id = `template_sheet_${i}_en`;
    cloneEn.style.display = "block";
    cloneEn.style.margin = "20px auto";
    cloneEn.style.position = "relative";
    cloneEn.dataset.storeIndex = String(i);
    cloneEn.dataset.lang = "en";
    cloneEn.dataset.variant = "primary";
    cloneEn.dataset.variantOrder = "0";
    cloneEn.dataset.langSource = addressKey || "";

    const footerEn = cloneEn.querySelector("#storeFooterName");
    if (footerEn) {
      const engAddr = (addressKey && store[addressKey]) || "";
      footerEn.innerHTML = `<span class="store-address">${escapeHtml(engAddr)}</span>` +
        (mobileKey && store[mobileKey] ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(store[mobileKey]||"")}</span>` : "");
      Object.values(FONT_CLASS_MAP).forEach(cls => {
        footerEn.classList.remove(cls);
        cloneEn.classList.remove(cls);
      });
      footerEn.classList.add(FONT_CLASS_MAP.en || "lang-en");
      cloneEn.classList.add(FONT_CLASS_MAP.en || "lang-en");
    }
    container.appendChild(cloneEn);
    syncFinalLayerFor(cloneEn);

    // Local language clones (only when column exists and has content)
    langColumns.forEach((lc, langIdx) => {
      const text = store[lc.key];
      if (text && String(text).trim().length) {
        const cloneLang = templateBox.cloneNode(true);
        cloneLang.id = `template_sheet_${i}_${lc.badge.toLowerCase()}`;
        cloneLang.style.display = "block";
        cloneLang.style.margin = "20px auto";
        cloneLang.style.position = "relative";
        cloneLang.dataset.storeIndex = String(i);
        const normalizedLangCode = normalizeLangCode(lc.code) || lc.code || "";
        cloneLang.dataset.lang = normalizedLangCode;
        cloneLang.dataset.variant = "lang";
        cloneLang.dataset.variantOrder = String(langIdx + 1);
        cloneLang.dataset.langSource = lc.key;
        const footerLang = cloneLang.querySelector("#storeFooterName");
        if (footerLang) {
          footerLang.innerHTML = `<span class="store-address">${escapeHtml(text)}</span>` +
            (mobileKey && store[mobileKey] ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(store[mobileKey]||"")}</span>` : "");
          Object.values(FONT_CLASS_MAP).forEach(cls => {
            footerLang.classList.remove(cls);
            cloneLang.classList.remove(cls);
          });
          if (normalizedLangCode && FONT_CLASS_MAP[normalizedLangCode]) {
            const className = FONT_CLASS_MAP[normalizedLangCode];
            footerLang.classList.add(className);
            cloneLang.classList.add(className);
          }
        }
        const badge = document.createElement("div");
        badge.className = "badge-debug";
        badge.textContent = lc.badge;
        cloneLang.appendChild(badge);
        container.appendChild(cloneLang);
        syncFinalLayerFor(cloneLang);
      }
    });
  });

  await inlineSvgAsDataUrl('.contact-icon img');
  setTimeout(() => { adjustFooterFontSize(); adjustFooterPosition(); }, 150);

  const langSummary = langColumns.length > 0 ? `Languages found: ${langColumns.map(l=>l.badge).join(", ")}` : "No language columns detected (only English)";
  alert(`✅ Generated ${rows.length} templates for sheet: ${sheetToUse}\n\n${langSummary}`);
}



async function generateTemplatesFromSheet_twoTemplate() {
  const containerRoot = document.getElementById("templatesContainer");
  if (!containerRoot) { alert("Missing #templatesContainer in DOM"); return; }

  // Preserve preview boxes, clear only generated templates
  clearGeneratedTemplates();

  // pick sheet to use (same logic as generateTemplatesFromSheet)
  const chosenStateOrSheet = (document.getElementById("stateFilter")?.value || "").trim();
  const sheets = Object.keys(excelDataBySheet || {});
  let sheetToUse = "";
  if (chosenStateOrSheet && sheets.includes(chosenStateOrSheet)) sheetToUse = chosenStateOrSheet;
  else sheetToUse = currentSheetName || (sheets.length ? sheets[0] : "");

  if (!sheetToUse || !excelDataBySheet[sheetToUse] || !excelDataBySheet[sheetToUse].length) {
    alert("No sheet data found. Please upload Excel and select a sheet (or pick the sheet name in the state filter).");
    return;
  }

  const rows = excelDataBySheet[sheetToUse];
  const keys = Object.keys(rows[0] || {});

  // sensible keys
  const englishAddressKey = keys.find(k => k.toLowerCase() === "address_eng") ||
                            keys.find(k => k.toLowerCase().includes("address_eng")) ||
                            keys.find(k => k.toLowerCase() === "address") ||
                            keys.find(k => k.toLowerCase().includes("address")) || null;
  const mobileKey = keys.find(k => k.toLowerCase().includes("mobile")) ||
                    keys.find(k => k.toLowerCase().includes("mobileno")) ||
                    keys.find(k => k.toLowerCase().includes("phone")) || null;

  // language column config (same mapping you used earlier)
  const langConfig = {
    mr: { names: ['address_mr','address_marathi'], badge: 'MR', code: 'mr' },
    ta: { names: ['address_tm','address_ta','address_tamil'], badge: 'TA', code: 'ta' },
    te: { names: ['address_te','address_telugu'], badge: 'TE', code: 'te' },
    hi: { names: ['address_hi','address_hindi'], badge: 'HI', code: 'hi' },
    gu: { names: ['address_gu','address_gujarati'], badge: 'GU', code: 'gu' },
    bn: { names: ['address_bn','address_bengali'], badge: 'BN', code: 'bn' },
    kn: { names: ['address_kn','address_kannada'], badge: 'KN', code: 'kn' }
  };

  // detect available language columns
  const langColumns = [];
  const already = new Set();
  for (const [code, cfg] of Object.entries(langConfig)) {
    for (const candidate of cfg.names) {
      const found = keys.find(k => k.toLowerCase() === candidate.toLowerCase());
      if (found && !already.has(found.toLowerCase())) {
        langColumns.push({ key: found, badge: cfg.badge, code });
        already.add(found.toLowerCase());
        break;
      }
    }
  }

  // dynamic detection of additional address language columns beyond the predefined mapping
  keys.forEach(originalKey => {
    const lowerKey = originalKey.toLowerCase();
    if (already.has(lowerKey)) return;
    if (!lowerKey.includes("address")) return;
    if (lowerKey === "address" || lowerKey === "address1" || lowerKey === "address_eng") return;
    const normCode = extractLangCodeFromColumnName(originalKey);
    if (!normCode || normCode === "en") return;
    langColumns.push({ key: originalKey, badge: normCode.toUpperCase(), code: normCode });
    already.add(lowerKey);
  });

  // which local language should we prefer for the secondary template?
  const secondaryLangRaw = TEMPLATE_BG_SECONDARY_LANG || (document.getElementById('secondaryTemplateLang')?.value || null);
  const secondaryLangCodePreferred = normalizeLangCode(secondaryLangRaw) || (secondaryLangRaw ? String(secondaryLangRaw).trim().toLowerCase() : "");


  // where to append generated templates (preserve previews)
  const generatedContainer = document.getElementById('generatedTemplates') || containerRoot;

  let createdPairs = 0;
  for (let i = 0; i < rows.length; i++) {
    const store = rows[i];

    // --- PRIMARY (English) ---
    const clonePrimary = templateBox.cloneNode(true);
    clonePrimary.id = `template_pair_${i}_primary`;
    clonePrimary.style.display = "block";
    clonePrimary.style.margin = "20px auto";
    clonePrimary.style.position = "relative";
    clonePrimary.dataset.storeIndex = String(i);
    clonePrimary.dataset.lang = "en";
    clonePrimary.dataset.variant = "primary";
    clonePrimary.dataset.variantOrder = "0";
    clonePrimary.dataset.langSource = englishAddressKey || "";

    // pick primary background (uploaded primary > global template data URL)
    if (TEMPLATE_BG_PRIMARY) {
      clonePrimary.style.backgroundImage = `url(${TEMPLATE_BG_PRIMARY})`;
      clonePrimary.style.backgroundSize = "cover";
      clonePrimary.style.backgroundPosition = "center";
    } else if (TEMPLATE_BG_DATA_URL) {
      clonePrimary.style.backgroundImage = `url(${TEMPLATE_BG_DATA_URL})`;
    }

    // english address text
    const engAddr = (englishAddressKey && store[englishAddressKey]) || "";
    const primaryFooter = clonePrimary.querySelector("#storeFooterName");
    if (primaryFooter) {
      Object.values(FONT_CLASS_MAP).forEach(cls => {
        primaryFooter.classList.remove(cls);
        clonePrimary.classList.remove(cls);
      });
      const contactHtml = buildContactSegment(mobileKey ? (store[mobileKey] || "") : "");
      primaryFooter.innerHTML = `<span class="store-address">${escapeHtml(engAddr || "")}</span>` + contactHtml;
      // ensure class for english font
      primaryFooter.classList.add(FONT_CLASS_MAP.en || 'lang-en');
      clonePrimary.classList.add(FONT_CLASS_MAP.en || 'lang-en');
    }

    // sync + append
    syncFinalLayerFor(clonePrimary);
    generatedContainer.appendChild(clonePrimary);

    // --- SECONDARY (Local language) ---
    // strategy to pick local language text:
    // 1) try explicit address_{secondaryLang}
    // 2) try to find any detected language column (prefer the one that matches secondaryLang)
    // 3) fallback to english if no local-language column exists (still create secondary clone)
    let secondaryAddr = "";
    let secondaryLangCodeUsed = null;
    let secondarySourceKey = null;
    if (secondaryLangRaw || secondaryLangCodePreferred) {
      const candidateKeys = [];
      if (secondaryLangCodePreferred) candidateKeys.push(`address_${secondaryLangCodePreferred}`);
      const rawLower = secondaryLangRaw ? String(secondaryLangRaw).trim().toLowerCase() : "";
      if (rawLower && !candidateKeys.includes(`address_${rawLower}`)) candidateKeys.push(`address_${rawLower}`);

      for (const candidate of candidateKeys) {
        const explicitKey = Object.keys(store).find(k => k.toLowerCase() === candidate);
        if (explicitKey && store[explicitKey] && String(store[explicitKey]).trim().length) {
          secondaryAddr = store[explicitKey];
          secondaryLangCodeUsed = normalizeLangCode(secondaryLangCodePreferred || rawLower) || secondaryLangCodePreferred || rawLower || null;
          secondarySourceKey = explicitKey;
          break;
        }
      }
    }
    if (!secondaryAddr && secondaryLangCodePreferred) {
      // find the langColumns entry that matches requested lang and has data
      const matched = langColumns.find(lc => lc.code === secondaryLangCodePreferred && store[lc.key] && String(store[lc.key]).trim().length);
      if (matched) {
        secondaryAddr = store[matched.key];
        secondaryLangCodeUsed = matched.code;
        secondarySourceKey = matched.key;
      }
    }
    if (!secondaryAddr) {
      // fallback: pick any non-English language column present (first available)
      const anyLang = langColumns.find(lc => store[lc.key] && String(store[lc.key]).trim().length);
      if (anyLang) {
        secondaryAddr = store[anyLang.key];
        secondaryLangCodeUsed = anyLang.code;
        secondarySourceKey = anyLang.key;
      }
    }
    if (!secondaryAddr) {
      // final fallback to english (so secondary template still exists)
      secondaryAddr = engAddr || "";
      secondaryLangCodeUsed = "en";
      secondarySourceKey = englishAddressKey || "";
    }

    secondaryLangCodeUsed = resolveLangCode(secondaryLangCodeUsed, secondaryAddr);

    // Create secondary clone only if there's any meaningful content (we choose to always create pair to keep parity)
    const cloneSecondary = templateBox.cloneNode(true);
    cloneSecondary.id = `template_pair_${i}_secondary`;
    cloneSecondary.style.display = "block";
    cloneSecondary.style.margin = "20px auto";
    cloneSecondary.style.position = "relative";
    cloneSecondary.dataset.storeIndex = String(i);
    cloneSecondary.dataset.variant = "secondary";
    cloneSecondary.dataset.variantOrder = "1";
    cloneSecondary.dataset.lang = (secondaryLangCodeUsed || "en").toLowerCase();
    cloneSecondary.dataset.langSource = secondarySourceKey || "";

    // pick secondary background: prefer TEMPLATE_BG_SECONDARY, then TEMPLATE_BG_PRIMARY, then global fallback
    if (TEMPLATE_BG_SECONDARY) {
      cloneSecondary.style.backgroundImage = `url(${TEMPLATE_BG_SECONDARY})`;
      cloneSecondary.style.backgroundSize = "cover";
      cloneSecondary.style.backgroundPosition = "center";
    } else if (TEMPLATE_BG_PRIMARY) {
      cloneSecondary.style.backgroundImage = `url(${TEMPLATE_BG_PRIMARY})`;
      cloneSecondary.style.backgroundSize = "cover";
      cloneSecondary.style.backgroundPosition = "center";
    } else if (TEMPLATE_BG_DATA_URL) {
      cloneSecondary.style.backgroundImage = `url(${TEMPLATE_BG_DATA_URL})`;
    }

    const secondaryFooter = cloneSecondary.querySelector("#storeFooterName");
    if (secondaryFooter) {
      Object.values(FONT_CLASS_MAP).forEach(cls => {
        secondaryFooter.classList.remove(cls);
        cloneSecondary.classList.remove(cls);
      });
      const contactHtmlSec = buildContactSegment(mobileKey ? (store[mobileKey] || "") : "");
      secondaryFooter.innerHTML = `<span class="store-address">${escapeHtml(secondaryAddr || "")}</span>` + contactHtmlSec;

      // add language class if we can detect (optional)
      const langClassKey = (secondaryLangCodeUsed || "en").toLowerCase();
      if (FONT_CLASS_MAP[langClassKey]) {
        const className = FONT_CLASS_MAP[langClassKey];
        secondaryFooter.classList.add(className);
        cloneSecondary.classList.add(className);
      } else {
        const detectedClassCode = detectLangCodeFromText(secondaryAddr);
        if (FONT_CLASS_MAP[detectedClassCode]) {
          const className = FONT_CLASS_MAP[detectedClassCode];
          secondaryFooter.classList.add(className);
          cloneSecondary.classList.add(className);
        }
      }
    }

    syncFinalLayerFor(cloneSecondary);
    generatedContainer.appendChild(cloneSecondary);

    // run per-clone footer fixes so clones display correctly immediately
    try { runFooterFixes(clonePrimary); } catch (e) { console.warn(e); }
    try { runFooterFixes(cloneSecondary); } catch (e) { console.warn(e); }

    createdPairs++;
  } // end rows loop

  // ensure icons inline and final layout tweaks
  await inlineSvgAsDataUrl('.contact-icon img');
  setTimeout(() => { adjustFooterFontSize(); adjustFooterPosition(); }, 180);

  alert(`✅ Generated ${createdPairs} store pairs (primary (EN) + secondary (local) per store).`);
}











/* ---------- Generator: Single sheet uploaded-template variant ---------- */
async function generateTemplatesFromUploadedTemplate({ selectedState = "" } = {}) {
  if (!excelData || !excelData.length) {
    alert("Please upload Excel first.");
    return;
  }
  const lang = "en"; // force templates to be generated only in English
  const container = document.getElementById("templatesContainer");
  // container.innerHTML = "";
  clearGeneratedTemplates();

  const originalKeys = Object.keys(excelData[0] || {});
  const keyMap = {};
  originalKeys.forEach(k => keyMap[k.toLowerCase()] = k);
  const addressKey = keyMap["address"] || originalKeys.find(k => k.toLowerCase().includes("address"));
  const phoneKey = keyMap["mobile"] || keyMap["phone"] ||
    originalKeys.find(k => k.toLowerCase().includes("mobile") || k.toLowerCase().includes("phone"));
  const stateKey = keyMap["state"] || originalKeys.find(k => k.toLowerCase().includes("state"));

  let rows = excelData;
  if (selectedState && stateKey){
    rows = rows.filter(r => (String(r[stateKey] || "")).toLowerCase() === selectedState.toLowerCase());
  }

  for (let i = 0; i < rows.length; i++){

    const store = rows[i];
    const clone = templateBox.cloneNode(true);
    clone.id = `template_clone_${i}_${lang}`;
    clone.style.display = "block";
    clone.style.margin = "20px auto";
    clone.style.position = "relative";
    clone.dataset.lang = lang;

    const langVariations = [
      `address_${lang}`,
      lang === 'ta' ? 'address_tm' : null,
      lang === 'ta' ? 'address_tamil' : null
    ].filter(Boolean);
    
    let langColKey = null;
    for (const variation of langVariations) {
      langColKey = originalKeys.find(k => k.toLowerCase() === variation.toLowerCase());
      if (langColKey) break;
    }
    
    let addressText = "";
    if (langColKey && store[langColKey]) addressText = store[langColKey];
    else addressText = (addressKey && store[addressKey]) || store["Address"] || store["address"] || "";

    const mobileText = (phoneKey && store[phoneKey]) ||
      store["Mobile"] || store["mobile"] || store["Phone"] || store["phone"] || "";

    const footerEl = clone.querySelector("#storeFooterName");
    if (!footerEl) continue;
    footerEl.innerHTML =
      `<span class="store-address">${escapeHtml(addressText)}</span>` +
      (mobileText
        ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(mobileText)}</span>`
        : "");

    Object.values(FONT_CLASS_MAP).forEach(c => clone.classList.remove(c));
    const fontClass = FONT_CLASS_MAP[lang] || FONT_CLASS_MAP.en;
    clone.classList.add(fontClass);
    footerEl.classList.add(fontClass);

    const badge = document.createElement("div");
    badge.className = "badge-debug";
    badge.textContent = lang.toUpperCase();
    clone.appendChild(badge);

    container.appendChild(clone);
    syncFinalLayerFor(clone);
  }

  await inlineSvgAsDataUrl('.contact-icon img');
  await waitForLangFont(lang);
  setTimeout(() => {
    adjustFooterFontSize();
    adjustFooterPosition();
  }, 200);
  alert(`✅ ${rows.length} templates generated for ${lang.toUpperCase()}`);
}

/* ---------- Attach generate button logic (UPDATED to prefer two-template when primary/secondary uploaded) ---------- */
document.getElementById("generateStateTemplates").addEventListener("click", async () => {
  const state = document.getElementById("stateFilter").value || "";

  // If user uploaded either primary or secondary template (two-template mode), prefer paired output
  if ((TEMPLATE_BG_PRIMARY && TEMPLATE_BG_PRIMARY.length) || (TEMPLATE_BG_SECONDARY && TEMPLATE_BG_SECONDARY.length)) {
    // If multi-sheet data exists use two-template sheet generator
    if (excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
      await generateTemplatesFromSheet_twoTemplate();
    } else if (excelData && excelData.length > 0) {
      // Fallback: single-sheet variant — produce pairs by reusing uploaded-template flow
      // We'll produce primary + secondary clones for single-sheet rows
      // Build a temporary mapping to reuse generateTemplatesFromUploadedTemplate's logic minimally
      const originalKeys = Object.keys(excelData[0] || {});
      const keyMap = {};
      originalKeys.forEach(k => keyMap[k.toLowerCase()] = k);
      const addressKey = keyMap["address"] || originalKeys.find(k => k.toLowerCase().includes("address"));
      const phoneKey = keyMap["mobile"] || keyMap["phone"] ||
        originalKeys.find(k => k.toLowerCase().includes("mobile") || k.toLowerCase().includes("phone"));

      const container = document.getElementById("templatesContainer");
      // Only clear generated templates, not preview boxes
      Array.from(container.children).forEach(child => {
        if (!['primaryTemplateBox', 'secondaryTemplateBox'].includes(child.id)) {
          child.remove();
        }
      });

      const secondaryLang = TEMPLATE_BG_SECONDARY_LANG || (document.getElementById('secondaryTemplateLang')?.value || 'hi');

      for (let i = 0; i < excelData.length; i++) {
        const store = excelData[i];

        // Primary
        const cloneEn = templateBox.cloneNode(true);
        cloneEn.id = `template_singlepair_${i}_en`;
        cloneEn.style.display = "block";
        cloneEn.style.margin = "20px auto";
        cloneEn.style.position = "relative";
        if (TEMPLATE_BG_PRIMARY) {
          cloneEn.style.backgroundImage = `url(${TEMPLATE_BG_PRIMARY})`;
          cloneEn.style.backgroundSize = "cover";
          cloneEn.style.backgroundPosition = "center";
        }
        const addrEn = pickAddressForLanguage(store, 'en', [addressKey]);
        const footerEn = cloneEn.querySelector('#storeFooterName');
        if (footerEn) footerEn.innerHTML = `<span class="store-address">${escapeHtml(addrEn||"")}</span>` + (store[phoneKey] ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(store[phoneKey]||"")}</span>` : "");
        container.appendChild(cloneEn);
        syncFinalLayerFor(cloneEn);

        // Secondary
        const addrSec = pickAddressForLanguage(store, secondaryLang, [addressKey]);
        const hasSec = (TEMPLATE_BG_SECONDARY && TEMPLATE_BG_SECONDARY.length) || (addrSec && addrSec.length);
        if (hasSec) {
          const cloneSec = templateBox.cloneNode(true);
          cloneSec.id = `template_singlepair_${i}_${secondaryLang}`;
          cloneSec.style.display = "block";
          cloneSec.style.margin = "20px auto";
          cloneSec.style.position = "relative";
          if (TEMPLATE_BG_SECONDARY) {
            cloneSec.style.backgroundImage = `url(${TEMPLATE_BG_SECONDARY})`;
            cloneSec.style.backgroundSize = "cover";
            cloneSec.style.backgroundPosition = "center";
          } else if (TEMPLATE_BG_PRIMARY) {
            cloneSec.style.backgroundImage = `url(${TEMPLATE_BG_PRIMARY})`;
          }
          const footerSec = cloneSec.querySelector('#storeFooterName');
          if (footerSec) footerSec.innerHTML = `<span class="store-address">${escapeHtml(addrSec || addrEn || "")}</span>` + (store[phoneKey] ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(store[phoneKey]||"")}</span>` : "");
          container.appendChild(cloneSec);
          syncFinalLayerFor(cloneSec);
        }
      }

      await inlineSvgAsDataUrl('.contact-icon img');
      setTimeout(() => { adjustFooterFontSize(); adjustFooterPosition(); }, 150);
      alert(`✅ Generated ${excelData.length} store-pairs (primary + secondary where available).`);
    } else {
      alert("❌ Please upload Excel file first!");
    }
  } else {
    // Original behavior (no primary/secondary uploaded) — unchanged
    if (excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
      await generateTemplatesFromSheet();
    } else if (excelData && excelData.length > 0) {
      await generateTemplatesFromUploadedTemplate({ selectedState: state });
    } else {
      alert("❌ Please upload Excel file first!");
    }
  }
});

document.getElementById("languageSelect").addEventListener("change", async () => {
  if (excelData && excelData.length > 0) {
    const state = document.getElementById("stateFilter").value || "";
    await generateTemplatesFromUploadedTemplate({ selectedState: state });
  }
});

/* ---------- OCR translation runner ---------- */
async function runOcrModelOnExcelAddresses() {
  if (!excelData || !excelData.length) { alert("Please upload Excel file first!"); return; }
  const LANGS = ["hi","gu","mr","ta","te","bn","kn"];
  const addrKey = Object.keys(excelData[0]).find(k => k.toLowerCase().includes("address"));
  if (!addrKey) { alert("❌ No address column found in Excel!"); return; }

  const progressMsg = document.createElement("div");
  progressMsg.id = "translationProgress";
  progressMsg.style.cssText =
    `position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.9); color:white; padding:20px 40px; border-radius:10px; z-index:10000; font-size:18px; text-align:center;`;
  progressMsg.innerHTML = `<div>🔄 Translating addresses...<br><span id="progressCount">0/${excelData.length}</span></div>`;
  document.body.appendChild(progressMsg);

  let successCount = 0, errorCount = 0;
  for (let i=0;i<excelData.length;i++){
    const store = excelData[i];
    const engAddr = store[addrKey];
    document.getElementById("progressCount").textContent = `${i+1}/${excelData.length}`;
    if (!engAddr) continue;
    try {
      const res = await fetch("/api/ocr_translate", {
        method: "POST",
        headers: {"Content-Type":"application/json"},
        body: JSON.stringify({ text: engAddr })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (data.translations) {
        LANGS.forEach(l => store[`address_${l}`] = data.translations[l] || "");
        successCount++;
      } else {
        console.warn("no translations for row", i);
      }
    } catch(err) {
      errorCount++;
      console.error("translation error", err);
    }
    await new Promise(r => setTimeout(r, 200));
  }

  document.getElementById("translationProgress")?.remove();
  checkLanguageColumnsSingle();
  alert(`Translation done. Success: ${successCount}, Failed: ${errorCount}`);
}

async function downloadBilingualHD() {
  alert("This function has been disabled.");
  return;
}

/* Clear all generated templates */
function clearAllTemplates() {
  const container = document.getElementById("templatesContainer");
  const templateBox = document.getElementById("templateBox");
  
  if (container) {
    const confirmClear = confirm("Are you sure you want to clear all generated templates?");
    if (confirmClear) {
      // container.innerHTML = "";
      clearGeneratedTemplates();
      const footerEl = templateBox?.querySelector("#storeFooterName");
      if (footerEl) {
        footerEl.innerHTML = "Default Store Name";
      }
      const draggables = templateBox?.querySelectorAll('.draggable');
      if (draggables) {
        draggables.forEach(el => el.remove());
      }
      console.log("✓ All templates and content cleared");
      alert("✅ All templates have been cleared!");
    }
  }
}

function makeAddressVisible(scope = document) {
  scope.querySelectorAll('#storeFooterName, #storeFooterNameFinal').forEach(f => {
    const addr = f.querySelector('.store-address');
    if (addr) {
      addr.style.display = 'inline-block';
      addr.style.whiteSpace = 'normal';
      addr.style.overflow = 'visible';
      addr.style.background = '#fff';
      addr.style.zIndex = '60';
      const sep = f.querySelector('.separator');
      const phone = f.querySelector('.store-mobile');
      if (sep && phone) {
        if (addr.nextElementSibling !== sep) {
          addr.insertAdjacentElement('afterend', sep);
        }
        if (sep.nextElementSibling !== phone) {
          sep.insertAdjacentElement('afterend', phone);
        }
      }
    }
  });
}

window.addEventListener('load', () => setTimeout(() => makeAddressVisible(document), 120));
window.addEventListener('resize', () => setTimeout(() => makeAddressVisible(document), 120));



async function downloadTemplateWithLang(which) {
  const isPrimary = which === 'primary';

  // pick the correct box you’re exporting
  const box = isPrimary
    ? (document.getElementById("templateClonePrimary") || document.getElementById("templateBox"))
    : (document.getElementById("templateCloneSecondary") || document.getElementById("templateBox"));

  if (!box) {
    alert("No template box found to export.");
    return;
  }

  // make sure contact icon span + <img> exists in this box
  ensureContactIconAfterSeparator(box);

  // use current footer color (same as live preview)
  const footerColorInput = document.getElementById("footerTextColor");
  const footerColor = (footerColorInput && footerColorInput.value) ? footerColorInput.value : "#000000";

  // inline SVG → data URL + recolor ring
  await inlineSvgAsDataUrl(`#${box.id} .contact-icon img`, {
    preferDataUrl: true,
    color: footerColor
  });

  // convert SVG data URLs (if any) to PNG for html2canvas
  await convertSvgImagesToPng(`#${box.id} .contact-icon img`, 28);

  const exportAddressTweaks = [];
  box.querySelectorAll('#storeFooterName .store-address, #storeFooterNameFinal .store-address').forEach(addr => {
    exportAddressTweaks.push({
      el: addr,
      prevPosition: addr.style.position,
      prevTop: addr.style.top
    });
    addr.style.setProperty('position', 'relative', 'important');
    addr.style.setProperty('top', '-4px', 'important');
  });
  try {
    // render the visible box (with background + footer + icon)
    // Use A4 helper so output matches Perfect A4 rendering
    const bgCandidate = (typeof TEMPLATE_BG_DATA_URL !== 'undefined' && TEMPLATE_BG_DATA_URL) ? await (async () => { const i=new Image(); i.src=TEMPLATE_BG_DATA_URL; await new Promise(r=>i.onload=r); return i; })() : null;
    const a4Canvas = await createA4CanvasFromBox(box, bgCandidate);
    const imgData = a4Canvas.toDataURL("image/jpeg", 0.95);

    // create A4 PDF
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("❌ PDF library (jsPDF) not loaded. Please refresh the page.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF("p", "mm", "a4");

    const pdfWidth = 210;
    const pdfHeight = (a4Canvas.height / a4Canvas.width) * pdfWidth;
    pdf.addImage(imgData, "JPEG", 0, 0, pdfWidth, pdfHeight);

    // build filename from address
    const footer = box.querySelector("#storeFooterName, #storeFooterNameFinal");
    let name = isPrimary ? "Primary" : "Secondary";

    if (footer) {
      const addrEl = footer.querySelector(".store-address");
      if (addrEl && addrEl.textContent.trim()) {
        name = addrEl.textContent
          .trim()
          .substring(0, 40)
          .replace(/[^a-zA-Z0-9]+/g, "_");
      }
    }

    const suffix = isPrimary ? "_EN" : "_LOCAL";
    pdf.save(`${name || 'Template'}${suffix}.pdf`);
  } finally {
    exportAddressTweaks.forEach(({ el, prevPosition, prevTop }) => {
      if (prevPosition) el.style.setProperty('position', prevPosition);
      else el.style.removeProperty('position');

      if (prevTop) el.style.setProperty('top', prevTop);
      else el.style.removeProperty('top');
    });
  }
}

async function downloadSuperHDA4() {
  try {
    // Use TEMPLATE_BG_DATA_URL, or fallback to primary/secondary template
    let bgDataUrl = TEMPLATE_BG_DATA_URL || TEMPLATE_BG_PRIMARY || TEMPLATE_BG_SECONDARY;
    if (!bgDataUrl) {
      alert("Please upload a template first (Custom, Primary, or Secondary).");
      return;
    }

    const { jsPDF } = window.jspdf;

    const A4_WIDTH = 2480;
    const A4_HEIGHT = 3508;

    const canvas = document.createElement("canvas");
    canvas.width = A4_WIDTH;
    canvas.height = A4_HEIGHT;

    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, A4_WIDTH, A4_HEIGHT);

    const bg = new Image();
    bg.src = bgDataUrl;

    await new Promise(resolve => { bg.onload = resolve; });

    ctx.drawImage(bg, 0, 0, A4_WIDTH, A4_HEIGHT);

    const footerEl = document.getElementById("storeFooterNameFinal");
    let address = "";
    let mobile = "";

    if (footerEl) {
      const addrEl = footerEl.querySelector(".store-address");
      const mobEl = footerEl.querySelector(".store-mobile");
      address = addrEl ? addrEl.textContent.trim() : "";
      mobile = mobEl ? mobEl.textContent.trim() : "";
    }

    const footerText = mobile ? `${address} | ${mobile}` : address;

    ctx.fillStyle = "#000";
    ctx.font = "bold 48px Arial";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Shift footer text further down on the A4 download (approx. 10mm)
    const DPI = 300; // canvas is sized for ~300 DPI A4
    const shiftMm = 10; // requested ~10mm downward shift
    const shiftPx = (shiftMm * DPI) / 25.4;
    const baseY = A4_HEIGHT - 80 + shiftPx;
    const footerY = Math.min(A4_HEIGHT - 5, baseY); // keep a small bottom margin

    ctx.fillText(footerText, A4_WIDTH / 2, footerY);

    const finalImg = canvas.toDataURL("image/jpeg", 0.95);

    const pdf = new jsPDF("p", "mm", "a4");
    pdf.addImage(finalImg, "JPEG", 0, 0, 210, 297);
    pdf.save("Super_HD_A4.pdf");

  } catch (err) {
    alert("Error: " + err.message);
    console.error(err);
  }
}

function getFooterInfoFromBox(box) {
  const footer =
    box.querySelector("#storeFooterName") ||
    box.querySelector("#storeFooterNameFinal");

  let address = "";
  let mobile = "";

  if (footer) {
    const addrEl = footer.querySelector(".store-address");
    const mobEl = footer.querySelector(".store-mobile");
    address = addrEl ? addrEl.textContent.trim() : (footer.textContent || "").trim();
    mobile = mobEl ? mobEl.textContent.trim() : "";
  }

  return { address, mobile };
}


async function downloadAllPerfectA4() {
  console.log("=== Starting Ultra HD A4 PDF Generator (NO html2canvas) ===");
  // Ensure live footer state is applied to the DOM before starting export.
  // If the user edited footer inputs and immediately clicked Download,
  // update the DOM so exported PDFs include the latest address.
  try {
    if (typeof updateFooterInfo === 'function') updateFooterInfo();
    try { runFooterFixes(document); } catch(e){}
    // short wait to allow styles/fonts to settle
    await new Promise(r => setTimeout(r, 120));
  } catch (e) { /* ignore */ }

  let overlay = null;
  try {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("❌ PDF library (jsPDF) not loaded. Please refresh the page.");
      return;
    }
    const { jsPDF } = window.jspdf;

    const A4_W = 2480;
    const A4_H = 3508;

    if (document.fonts && document.fonts.ready) {
      try { await document.fonts.ready; } catch (e) {}
    }

    let footerTextColor = "#000000";
    const footerColorInput = document.getElementById("footerTextColor");
    if (footerColorInput && footerColorInput.value) {
      footerTextColor = footerColorInput.value;
    }

    // ------ NEW: helper to load images ------
    const loadImage = (url) => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = (e) => reject(e);
        img.src = url;
      });
    };

    // ------ NEW: preload all possible backgrounds ------
    let bgCustom = null;
    let bgPrimary = null;
    let bgSecondary = null;

    try {
      if (typeof TEMPLATE_BG_DATA_URL !== "undefined" && TEMPLATE_BG_DATA_URL) {
        bgCustom = await loadImage(TEMPLATE_BG_DATA_URL);
      }
    } catch (e) {
      console.warn("Failed to load custom A4 template:", e);
      bgCustom = null;
    }

    try {
      if (typeof TEMPLATE_BG_PRIMARY !== "undefined" && TEMPLATE_BG_PRIMARY) {
        bgPrimary = await loadImage(TEMPLATE_BG_PRIMARY);
      }
    } catch (e) {
      console.warn("Failed to load PRIMARY A4 template:", e);
      bgPrimary = null;
    }

    try {
      if (typeof TEMPLATE_BG_SECONDARY !== "undefined" && TEMPLATE_BG_SECONDARY) {
        bgSecondary = await loadImage(TEMPLATE_BG_SECONDARY);
      }
    } catch (e) {
      console.warn("Failed to load SECONDARY A4 template:", e);
      bgSecondary = null;
    }

    if (!bgCustom && !bgPrimary && !bgSecondary) {
      alert("❌ Please upload your A4 template first (Custom, Primary, or Secondary Template Upload).");
      return;
    }

    // Prepare contact icon SVG as Blob URL (reliable for canvas)
    const svgBase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 861">
      <path fill="#ffffff" opacity="1.000000" stroke="none" d=" M425.000000,862.000000   C283.333374,862.000000 142.166748,862.000000 1.000095,862.000000   C1.000063,575.000122 1.000063,288.000244 1.000032,1.000287   C274.333130,1.000191 547.666260,1.000191 820.999512,1.000096   C820.999695,287.999725 820.999695,574.999451 820.999878,861.999573   C689.166687,862.000000 557.333313,862.000000 425.000000,862.000000  M454.029053,839.641479   C473.001038,836.123657 492.227661,833.619690 510.904938,828.928467   C667.800537,789.521057 786.795227,656.085266 807.856689,495.270264   C816.519714,429.123199 809.410950,364.419495 786.026367,301.576263   C721.074280,127.025307 542.460876,18.924192 354.198486,46.002522   C273.030029,57.677212 201.002823,90.218719 141.274323,146.737244   C31.018562,251.067581 -9.870629,379.097717 20.350185,527.382690   C53.869297,691.851440 192.867157,817.514343 359.771942,838.863220   C390.803802,842.832520 421.973999,841.557922 454.029053,839.641479  z"/>
      <path fill="${footerTextColor}" opacity="1.000000" stroke="none" d=" M453.567352,839.677124   C421.973999,841.557922 390.803802,842.832520 359.771942,838.863220   C192.867157,817.514343 53.869297,691.851440 20.350185,527.382690   C-9.870629,379.097717 31.018562,251.067581 141.274323,146.737244   C201.002823,90.218719 273.030029,57.677212 354.198486,46.002522   C542.460876,18.924192 721.074280,127.025307 786.026367,301.576263   C809.410950,364.419495 816.519714,429.123199 807.856689,495.270264   C786.795227,656.085266 667.800537,789.521057 510.904938,828.928467   C492.227661,833.619690 473.001038,836.123657 453.567352,839.677124  M391.862091,544.634521   C355.268280,503.425110 326.928192,456.935364 304.265564,406.895447   C298.503632,394.172943 293.477966,381.066895 293.309906,366.695862   C293.215240,358.597260 296.051544,351.919586 302.664001,347.291718   C308.103149,343.485016 313.802155,339.988464 319.642609,336.828796   C332.560822,329.840149 345.112030,322.513580 355.920105,312.268066   C360.964203,307.486542 362.827606,303.107544 362.328796,296.012787   C360.290283,267.017914 350.969818,240.635712 334.934601,216.693420   C330.690765,210.356918 324.891083,204.430725 318.526581,200.275497   C304.564209,191.159897 287.639221,192.691040 273.567871,204.632462   C263.989685,212.760864 255.218155,222.110825 247.353622,231.929932   C231.998871,251.100754 221.296951,272.510254 219.972229,297.709564   C218.225052,330.945068 221.793915,363.596985 230.906982,395.577576   C246.874893,451.613861 273.256622,502.577850 307.349182,549.591309   C338.222473,592.165466 374.442596,629.387207 419.322144,657.445190   C445.252075,673.656128 472.569611,686.250732 503.754059,688.526733   C538.026611,691.028076 566.918274,679.275452 591.167603,655.716797   C604.869629,642.405090 606.535278,628.909607 596.789795,613.361572   C585.214478,594.894043 571.005615,578.586304 553.763367,565.106262   C533.812256,549.508362 512.553406,547.729187 491.103088,561.164307   C479.167603,568.639954 468.325256,577.880249 457.113312,586.485596   C447.402039,593.939209 446.910187,594.699890 437.573242,586.664490   C422.070862,573.323120 407.381531,559.036987 391.862091,544.634521  z"/>
      <path fill="#ffffff" opacity="1.000000" stroke="none" d=" M392.105896,544.891663   C407.381531,559.036987 422.070862,573.323120 437.573242,586.664490   C446.910187,594.699890 447.402039,593.939209 457.113312,586.485596   C468.325256,577.880249 479.167603,568.639954 491.103088,561.164307   C512.553406,547.729187 533.812256,549.508362 553.763367,565.106262   C571.005615,578.586304 585.214478,594.894043 596.789795,613.361572   C606.535278,628.909607 604.869629,642.405090 591.167603,655.716797   C566.918274,679.275452 538.026611,691.028076 503.754059,688.526733   C472.569611,686.250732 445.252075,673.656128 419.322144,657.445190   C374.442596,629.387207 338.222473,592.165466 307.349182,549.591309   C273.256622,502.577850 246.874893,451.613861 230.906982,395.577576   C221.793915,363.596985 218.225052,330.945068 219.972229,297.709564   C221.296951,272.510254 231.998871,251.100754 247.353622,231.929932   C255.218155,222.110825 263.989685,212.760864 273.567871,204.632462   C287.639221,192.691040 304.564209,191.159897 318.526581,200.275497   C324.891083,204.430725 330.690765,210.356918 334.934601,216.693420   C350.969818,240.635712 360.290283,267.017914 362.328796,296.012787   C362.827606,303.107544 360.964203,307.486542 355.920105,312.268066   C345.112030,322.513580 332.560822,329.840149 319.642609,336.828796   C313.802155,339.988464 308.103149,343.485016 302.664001,347.291718   C296.051544,351.919586 293.215240,358.597260 293.309906,366.695862   C293.477966,381.066895 298.503632,394.172943 304.265564,406.895447   C326.928192,456.935364 355.268280,503.425110 392.105896,544.891663  z"/></svg>`;

    // Create blob URL for the SVG (safe for canvas)
    let contactIcon = null;
    let contactIconLoaded = false;
    try {
      const svgBlob = new Blob([svgBase], { type: "image/svg+xml" });
      const blobUrl = URL.createObjectURL(svgBlob);

      contactIcon = new Image();
      contactIcon.crossOrigin = "anonymous";

      await new Promise((resolve) => {
        contactIcon.onload = () => {
          contactIconLoaded = true;
          try { URL.revokeObjectURL(blobUrl); } catch (e) {}
          resolve();
        };
        contactIcon.onerror = (e) => {
          console.warn("Contact icon (SVG blob) failed to load for canvas:", e);
          try { URL.revokeObjectURL(blobUrl); } catch (e) {}
          resolve();
        };
        contactIcon.src = blobUrl;
      });
    } catch (err) {
      console.warn("Error preparing contact icon blob:", err);
      contactIconLoaded = false;
      contactIcon = null;
    }

    const containerRoot = document.getElementById("generatedTemplates") || document.getElementById("templatesContainer");
    // Include any node that looks like a generated template: nodes with
    // `data-store-index`, legacy `.template-box`, or id patterns used
    // by template clones. Also accept nodes that have either a
    // `.store-address` element or a `#storeFooterName` /
    // `#storeFooterNameFinal` footer element so templates are not
    // skipped when the address was moved to a final overlay.
    // Include all likely template nodes (don't require `.store-address`)
    // — some generated clones may only have the final footer overlay.
    const datasetNodes = containerRoot
      ? Array.from(containerRoot.querySelectorAll("[data-store-index], .template-box, [id^='template_sheet_'], [id^='template_clone_'], [id^='template_pair_']"))
      : [];

    let storeGroups = [];

    if (datasetNodes.length) {
      const grouped = new Map();
      datasetNodes.forEach(node => {
        const storeIndexRaw = Number(node.dataset.storeIndex);
        if (!Number.isFinite(storeIndexRaw)) return;
        if (!grouped.has(storeIndexRaw)) grouped.set(storeIndexRaw, []);
        grouped.get(storeIndexRaw).push(node);
      });
      storeGroups = Array.from(grouped.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([storeIndex, nodes]) => {
          const sortedNodes = nodes.slice().sort((a, b) => {
            const orderA = Number(a.dataset.variantOrder ?? (a.dataset.variant === "primary" ? 0 : 1));
            const orderB = Number(b.dataset.variantOrder ?? (b.dataset.variant === "primary" ? 0 : 1));
            return orderA - orderB;
          });
          return { storeIndex, nodes: sortedNodes };
        });
    } else {
      let legacyTemplates = document.querySelectorAll(
        "#templatesContainer > .template-box, " +
        "#templatesContainer > [id^='template_sheet_'], " +
        "#templatesContainer > [id^='template_clone_'], " +
        "#templatesContainer > div"
      );
      legacyTemplates = Array.from(legacyTemplates).filter(t => t.querySelector(".store-address"));

      if (legacyTemplates.length) {
        // existing behaviour: use any generated templates inside templatesContainer
        storeGroups = legacyTemplates.map((node, idx) => ({ storeIndex: idx, nodes: [node] }));
      } else {
        // NEW: fallback to the main editor box so a single-page
        // Perfect A4 PDF can be created after Upload Custom Template
        const mainBox = document.getElementById("templateBox");
        if (!mainBox) {
          alert("❌ No templates found.\nPlease click 'Generate Templates' or upload a template first.");
          return;
        }
        storeGroups = [{ storeIndex: 0, nodes: [mainBox] }];
      }
    }

    const totalPdfCount = storeGroups.reduce((sum, group) => sum + group.nodes.length, 0);
    if (!totalPdfCount) {
      alert("❌ No templates found.\nPlease click 'Generate Templates' first.");
      return;
    }

    overlay = document.createElement("div");
    overlay.style.cssText = `
      position:fixed;
      top:50%;
      left:50%;
      transform:translate(-50%,-50%);
      background:linear-gradient(135deg,#8b0000,#dc143c);
      color:#fff;
      padding:28px 48px;
      border-radius:14px;
      box-shadow:0 10px 40px rgba(0,0,0,0.35);
      font-size:18px;
      font-weight:bold;
      text-align:center;
      z-index:99999;
    `;
    overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">0 / ${totalPdfCount}</span>`;
    document.body.appendChild(overlay);

    let processedPdfCount = 0;
    const langCounts = {};

    for (let storeIdx = 0; storeIdx < storeGroups.length; storeIdx++) {
      const group = storeGroups[storeIdx];

      // one multi-page PDF per store
      let storePdf = null;
      let baseAddressForName = "";

      for (let variantIdx = 0; variantIdx < group.nodes.length; variantIdx++) {
        const box = group.nodes[variantIdx];

        let address = "";
        let mobile = "";
        try {
          const footerInfo = getFooterInfoFromBox(box);
          address = footerInfo.address || "";
          mobile = footerInfo.mobile || "";
        } catch (err) {
          console.error("Error getting footer info:", err);
        }
        const footerAddress = (address || "").trim();
        const phoneText = (mobile || "").trim();
        const hasPhone = !!phoneText;

        const footerFullText = hasPhone
          ? `${footerAddress} | ${phoneText}`
          : footerAddress;

        if (variantIdx === 0 && footerAddress) {
          baseAddressForName = footerAddress;
        }

        const hasDeva     = /[\u0900-\u097F]/.test(footerFullText);
        const hasTamil    = /[\u0B80-\u0BFF]/.test(footerFullText);
        const hasGujarati = /[\u0A80-\u0AFF]/.test(footerFullText);
        const hasBengali  = /[\u0980-\u09FF]/.test(footerFullText);
        const hasTelugu   = /[\u0C00-\u0C7F]/.test(footerFullText);
        const hasKannada  = /[\u0C80-\u0CFF]/.test(footerFullText);

        let langCode = (box.dataset?.lang || "").toLowerCase();
        if (!langCode) {
          const footerNode = box.querySelector("#storeFooterName, #storeFooterNameFinal");
          if (footerNode) {
            for (const [code, cls] of Object.entries(FONT_CLASS_MAP)) {
              if (footerNode.classList.contains(cls)) {
                langCode = code;
                break;
              }
            }
          }
        }
        if (!langCode && box.classList) {
          for (const [code, cls] of Object.entries(FONT_CLASS_MAP)) {
            if (box.classList.contains(cls)) {
              langCode = code;
              break;
            }
          }
        }
        if (!langCode) {
          if (hasTamil) langCode = "ta";
          else if (hasGujarati) langCode = "gu";
          else if (hasBengali)  langCode = "bn";
          else if (hasTelugu)   langCode = "te";
          else if (hasKannada)  langCode = "kn";
          else if (hasDeva)     langCode = "mr";
          else langCode = "en";
        }

        // NEW: variant info (primary / secondary)
        const variant = (box.dataset && box.dataset.variant
          ? box.dataset.variant.toLowerCase()
          : "");

        processedPdfCount += 1;
        overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">Store ${storeIdx + 1} / ${storeGroups.length} • PDF ${processedPdfCount} / ${totalPdfCount}${langCode ? ` • ${langCode.toUpperCase()}` : ""}</span>`;

        let fontFamily = LANG_FONT_MAP[langCode] || "NotoSans";
        if (!LANG_FONT_MAP[langCode]) {
          if      (hasDeva)     fontFamily = "NotoSansDeva";
          else if (hasTamil)    fontFamily = "NotoSansTamil";
          else if (hasGujarati) fontFamily = "NotoSansGuj";
          else if (hasBengali)  fontFamily = "NotoSansBeng";
          else if (hasTelugu)   fontFamily = "NotoSansTelugu";
          else if (hasKannada)  fontFamily = "NotoSansKannada";
        }

        let footerRatioY = 0.92;
        const domFooter =
          box.querySelector("#storeFooterName") ||
          box.querySelector("#storeFooterNameFinal");

        if (domFooter) {
          const boxRect = box.getBoundingClientRect();
          const footerRect = domFooter.getBoundingClientRect();
          const footerCenterY =
            footerRect.top - boxRect.top + footerRect.height / 2;
          footerRatioY = footerCenterY / boxRect.height;
        }

        // NEW: choose correct background per page
        let bgToUse = null;
        if (bgCustom) {
          // if custom is uploaded, use same for all
          bgToUse = bgCustom;
        } else if (variant === "secondary" && bgSecondary) {
          bgToUse = bgSecondary;
        } else if (variant === "primary" && bgPrimary) {
          bgToUse = bgPrimary;
        } else if (langCode && langCode !== "en" && bgSecondary) {
          // fallback: non-English → secondary background if available
          bgToUse = bgSecondary;
        } else {
          bgToUse = bgPrimary || bgSecondary;
        }

        if (!bgToUse) {
          console.warn("No background image found for this template; skipping.", { storeIdx, variant, langCode });
          continue;
        }

        // Try to capture a live A4 snapshot of the current "box" (generated
        // template or editor preview). If html2canvas + our helper exists
        // and succeeds, use that snapshot directly as the A4 page so the
        // exported PDF matches the live/generated template exactly.
            try {
              // Ensure the exported box has the synced final footer layer
              try {
                if (typeof syncFinalLayerFor === 'function') syncFinalLayerFor(box);
                // If there is a main editor footer, copy it into this box so
                // the exported snapshot matches the generated preview exactly.
                const mainBox = document.getElementById && document.getElementById('templateBox');
                if (mainBox && typeof cloneExactFooter === 'function') {
                  cloneExactFooter(mainBox, box);
                }
              } catch(e) { /* ignore sync errors */ }

              if (window.html2canvas && typeof createA4CanvasFromBox === 'function') {
            // Ensure any contact SVGs inside this box are inlined and
            // converted to PNG data URLs so html2canvas can capture them.
            // let _tempId = null;
            // try {
            //   if (!box.id) {
            //     _tempId = 'export_tmp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            //     box.id = _tempId;
            //   }
            //   const sel = `#${box.id} .contact-icon img`;
            //   try { await inlineSvgAsDataUrl(sel, { preferDataUrl: true, color: footerTextColor }); } catch(e){ console.warn('inlineSvgAsDataUrl failed for box', e); }
            //   try { await convertAnySvgImagesToPng(sel, 28); } catch(e){ console.warn('convertAnySvgImagesToPng failed for box', e); }
            // } catch(e) {
            //   console.warn('Error preparing contact icons for snapshot', e);
            // }

          let _tempId = null;
        try {
          if (!box.id) {
            _tempId = 'export_tmp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
            box.id = _tempId;
          }

          const sel = `#${box.id} .contact-icon img`;

          try {
            await inlineSvgAsDataUrl(sel, { preferDataUrl: true, color: footerTextColor });
          } catch(e){
            console.warn('inlineSvgAsDataUrl failed for box', e);
          }

          try {
            await convertAnySvgImagesToPng(sel, 28);
          } catch(e){
            console.warn('convertAnySvgImagesToPng failed for box', e);
          }

          // ⭐ VERY IMPORTANT — WAIT FOR RENDER
          await new Promise(r => setTimeout(r, 150));

        } catch(e) {
          console.warn('Error preparing contact icons for snapshot', e);
        }





        try {
          if (typeof _tempId !== 'undefined' && _tempId) box.removeAttribute('id');
        } catch(e) {
          console.warn('Error cleaning up temporary id for snapshot', e);
        }

            const snapA4 = await createA4CanvasFromBox(box, bgToUse);
            if (snapA4 && snapA4.width && snapA4.height) {
              const snapData = snapA4.toDataURL("image/jpeg", 0.95);
              if (!storePdf) {
                storePdf = new jsPDF("p", "mm", "a4");
              } else {
                storePdf.addPage();
              }
              storePdf.addImage(snapData, "JPEG", 0, 0, 210, 297);
              langCounts[langCode] = (langCounts[langCode] || 0) + 1;
              // small throttle for UI update
              await new Promise(r => setTimeout(r, 150));
                // cleanup temporary id if we set one
                try { if (typeof _tempId !== 'undefined' && _tempId) box.removeAttribute('id'); } catch(e) {}
                // snapshot saved, skip manual canvas composition below
                continue;
            }
          }
        } catch (e) {
          console.warn('A4 snapshot via createA4CanvasFromBox failed, falling back to manual render', e);
        }

        // Fallback: build A4 canvas manually (background, logos, footer drawing)
        const canvas = document.createElement("canvas");
        canvas.width = A4_W;
        canvas.height = A4_H;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, A4_W, A4_H);

        const ratio = Math.min(A4_W / bgToUse.width, A4_H / bgToUse.height);
        const drawW = bgToUse.width * ratio;
        const drawH = bgToUse.height * ratio;
        const dx = (A4_W - drawW) / 2;
        const dy = (A4_H - drawH) / 2;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bgToUse, dx, dy, drawW, drawH);

        // ----- Draw draggable/logo images -----
        try {
          const logoImgs = Array.from(box.querySelectorAll('img.draggable, .draggable img')).filter(Boolean);
          if (logoImgs.length) {
            const loadedImgs = await Promise.all(logoImgs.map(imgEl => new Promise(res => {
              try {
                const im = new Image();
                // im.crossOrigin = 'anonymous';
                im.onload = () => res({ img: im, el: imgEl, ok: true });
                im.onerror = () => {
                  console.warn('Logo image failed to load for export:', imgEl.src || imgEl.getAttribute('src'));
                  res({ img: im, el: imgEl, ok: false });
                };
                im.src = imgEl.src || imgEl.getAttribute('src') || '';
              } catch (e) {
                console.warn('Error preparing logo image for export', e);
                res({ img: null, el: imgEl, ok: false });
              }
            })));

            const boxRect = box.getBoundingClientRect();
            loadedImgs.forEach(({ img: im, el, ok }) => {
              if (!ok || !im || !im.width) return;
              try {
                const elRect = el.getBoundingClientRect();
                const relLeft = (elRect.left - boxRect.left);
                const relTop  = (elRect.top  - boxRect.top);
                const relW    = elRect.width;
                const relH    = elRect.height;

                const scaleX = drawW / bgToUse.width;
                const drawX = Math.round(dx + relLeft * scaleX);
                const drawY = Math.round(dy + relTop * scaleX);
                const drawWidth  = Math.round(relW * scaleX);
                const drawHeight = Math.round(relH * scaleX);

                ctx.drawImage(im, drawX, drawY, drawWidth, drawHeight);
              } catch (e) {
                console.warn('Failed to draw logo on canvas for export', e);
              }
            });
          }
        } catch (e) {
          console.warn('Error while rendering draggable logos to canvas:', e);
        }

        // If this page is the main editor `templateBox`, capture the live DOM
        // rendering (which may include positioned HTML elements) via html2canvas
        // and paint that snapshot onto the A4 canvas so the exported PDF
        // matches the live preview exactly.
        try {
          const isMainEditorBox = (box.id === 'templateBox' || box.getAttribute('id') === 'templateBox');
          // if (isMainEditorBox && window.html2canvas) {
          if (false && isMainEditorBox && window.html2canvas) {
            // capture at a scale that maps box width -> A4 drawW
            const boxRect = box.getBoundingClientRect();
            const targetScale = Math.max(1, Math.floor((A4_W / (boxRect.width || 1))));
            const canvasSnap = await html2canvas(box, { backgroundColor: null, scale: Math.min(6, targetScale) });
            const snapImg = new Image();
            snapImg.crossOrigin = 'anonymous';
            snapImg.src = canvasSnap.toDataURL('image/png');
            await new Promise(r => { snapImg.onload = r; snapImg.onerror = r; });

            // compute destination placement to center the snapshot inside A4
            const snapRatio = Math.min(A4_W / snapImg.width, A4_H / snapImg.height);
            const snapW = Math.round(snapImg.width * snapRatio);
            const snapH = Math.round(snapImg.height * snapRatio);
            const snapX = Math.round((A4_W - snapW) / 2);
            const snapY = Math.round((A4_H - snapH) / 2);

            try { ctx.drawImage(snapImg, snapX, snapY, snapW, snapH); }
            catch (err) { console.warn('Failed to draw live snapshot onto A4 canvas', err); }
          }
        } catch (err) {
          console.warn('html2canvas snapshot for A4 failed', err);
        }

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        const len = footerFullText.length;
        let fontSize;
        if      (len <= 35) fontSize = 48;
        else if (len <= 60) fontSize = 44;
        else if (len <= 85) fontSize = 40;
        else                fontSize = 36;

        const maxWidth = A4_W * 0.86;

        while (fontSize > 22) {
          ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
          const w = ctx.measureText(footerFullText).width;
          if (w <= maxWidth) break;
          fontSize -= 1.5;
        }

        // Base footer placement in Perfect A4 export
        const DPI_A4 = 300; // canvas sized for ~300 DPI
        const shiftMmA4 = 16;
        const shiftPxA4 = (shiftMmA4 * DPI_A4) / 25.4;
        const footerNudgeUpPx = 175; // move footer/store-address slightly more upward in Download All A4 export
        const rawFooterY = A4_H * footerRatioY + 50 + shiftPxA4;
        const cappedFooterY = Math.min(A4_H - 20, rawFooterY); // keep small bottom margin
        const footerY = Math.max(0, cappedFooterY - footerNudgeUpPx);

        ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
        // ctx.fillStyle = footerTextColor;
        // Always draw solid dark badge for visibility
        ctx.fillStyle = "#000000";
        ctx.fill();
        // ctx.strokeStyle = footerTextColor;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.4;

        const addressPart = hasPhone ? `${footerAddress} | ` : footerAddress;
        ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
        const addressWidth = ctx.measureText(addressPart).width;
        const phoneWidth = hasPhone ? ctx.measureText(phoneText).width : 0;

        const iconGap  = (contactIconLoaded && hasPhone) ? 8 : 0;
        const iconSize = (contactIconLoaded && hasPhone) ? fontSize + 6 : 0;
        const totalWidth = addressWidth + iconSize + iconGap + phoneWidth;

        // Footer line position in Download All Perfect A4 export
        const footerNudgeLeftPx = 80;
        const startX = Math.round((A4_W - totalWidth) / 2) - footerNudgeLeftPx;
        let x = startX;

        ctx.strokeText(addressPart, x, footerY);
        ctx.fillText(addressPart, x, footerY);
        x += addressWidth;

        if (hasPhone && iconSize > 0) {
          const iconX = x;
          const iconY = footerY - iconSize / 2;
          // Always draw a solid circular badge for the contact icon (ensures visibility)
          ctx.save();
          ctx.beginPath();
          ctx.arc(iconX + iconSize / 2, footerY, iconSize / 2, 0, Math.PI * 2);
          ctx.fillStyle = footerTextColor;
          ctx.fill();
          ctx.restore();

          // Draw simple handset stroke in white on top
          ctx.save();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(2, iconSize * 0.13);
          ctx.lineCap = 'round';
          const cx = iconX + iconSize / 2, cy = footerY, r = iconSize * 0.28;
          ctx.beginPath();
          ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.25, false);
          ctx.stroke();
          ctx.restore();

          // If the prepared SVG blob loaded, attempt to draw it over the badge
          if (contactIconLoaded && contactIcon) {
            try {
              ctx.drawImage(contactIcon, iconX, iconY, iconSize, iconSize);
            } catch (err) {
              console.warn('Could not draw contactIcon image onto canvas (overlay), continuing with painted badge', err);
            }
          }

          x += iconSize + iconGap;
        }

        if (hasPhone) {
          ctx.strokeText(phoneText, x, footerY);
          ctx.fillText(phoneText, x, footerY);
        }

        const imgData = canvas.toDataURL("image/jpeg", 0.95);

        // build a single multi-page PDF per store (EN page first, then local)
        if (!storePdf) {
          storePdf = new jsPDF("p", "mm", "a4");
        } else {
          storePdf.addPage();
        }
        storePdf.addImage(imgData, "JPEG", 0, 0, 210, 297);

        langCounts[langCode] = (langCounts[langCode] || 0) + 1;

        await new Promise(r => setTimeout(r, 150));
      }

      // after processing all variants for this store, save exactly one PDF
      if (storePdf) {
        let fname = "Template";
        if (baseAddressForName && baseAddressForName.trim()) {
          fname = baseAddressForName.trim().substring(0, 40).replace(/[^a-zA-Z0-9]+/g, "_");
        }
        const pdfName = `${fname || "Template"}_PerfectA4.pdf`;
        storePdf.save(pdfName);
      }
    }

    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
    }

    const langSummary = Object.entries(langCounts)
      .map(([code, count]) => `${code.toUpperCase()}: ${count}`)
      .join(", ");
    const storeWord = storeGroups.length === 1 ? "store" : "stores";
    alert(`✅ Downloaded ${totalPdfCount} PDFs for ${storeGroups.length} ${storeWord}.${langSummary ? `\nLanguages: ${langSummary}` : ""}`);

  } catch (err) {
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
    }
    console.error("downloadAllPerfectA4 error:", err);
    alert("❌ Error in downloadAllPerfectA4: " + err.message);
  }
}



































































