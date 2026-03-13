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

    // Recolor any inline SVG contact badges inside the clone so the
    // export clone visually matches the preview's selected footer color.
    try {
      const footerColorInline = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || null;
      if (footerColorInline) {
        clone.querySelectorAll('.contact-icon svg').forEach(svg => {
          try {
            const circle = svg.querySelector('circle');
            if (circle) circle.setAttribute('fill', footerColorInline);
            const handset = svg.querySelector('path');
            if (handset) {
              try { handset.setAttribute('fill', '#ffffff'); } catch(e){}
              try { handset.setAttribute('stroke', '#ffffff'); } catch(e){}
            }
          } catch(e){}
        });
      }
    } catch(e) { /* ignore */ }

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
        // After copying footer HTML from the original, ensure any inline SVG
        // contact icons are inlined and converted inside the clone so html2canvas
        // captures them exactly as in the preview.
        try {
          const footerColor2 = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || '#000000';
          if (typeof inlineSvgAsDataUrl === 'function') await inlineSvgAsDataUrl(`#${exportId} .contact-icon img`, { preferDataUrl: true, color: footerColor2 });
          if (typeof convertAnySvgImagesToPng === 'function') await convertAnySvgImagesToPng(`#${exportId} .contact-icon img`, 28);
        } catch(e) { console.warn('post-clone inline/convert failed', e); }
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
      // Apply the currently selected footer color to the cloned footer so
      // exported PDFs match the preview color picker immediately.
      try {
        const selectedColor = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || null;
        if (selectedColor) {
          cloneFooter.querySelectorAll('.store-address, .separator, .store-mobile').forEach(el => {
            try { el.style.setProperty('color', selectedColor, 'important'); } catch(e){}
          });
          // recolor any contact-icon img inside cloned footer
          const iconImg = cloneFooter.querySelector('.contact-icon img');
          if (iconImg) {
            try { iconImg.src = createColoredContactSvg(selectedColor); } catch(e){}
          }
        }
      } catch(e) { /* ignore */ }
      // Ensure the cloned footer is visible despite global stylesheet rules
      try {
        cloneFooter.style.setProperty('display', 'inline-flex', 'important');
        cloneFooter.style.setProperty('pointer-events', 'none', 'important');
        // also force color on the container to be safe
        if (typeof selectedColor !== 'undefined' && selectedColor) cloneFooter.style.setProperty('color', selectedColor, 'important');
      } catch(e) { console.warn('createA4CanvasFromBox: could not force display on cloneFooter', e); }
      // Ensure clone has contact icon wrapper & recolored images after innerHTML assignment
      try {
        ensureContactIconAfterSeparator(exportClone);
        restoreAndColorContactIcons();
      } catch(e) { console.warn('post-clone ensureContactIcon failed', e); }
    }

    // Force-embed the live preview contact icon into the export clone as a PNG
    // This is the most reliable way to guarantee the downloaded PDF shows
    // the exact same raster rendering as the preview (handles inline SVGs
    // and CSS-applied effects that html2canvas sometimes misses when
    // operating on a cloned DOM). We render the preview's .contact-icon to
    // a small canvas (via html2canvas) and set that data-URL as the src of
    // the cloned .contact-icon <img> (or replace inline svg in the clone).
    try {
      const previewIconNode = document.querySelector('.contact-icon');
      if (previewIconNode && window.html2canvas) {
        try {
          const iconCanvas = await html2canvas(previewIconNode, { backgroundColor: null, scale: Math.min(3, (window.devicePixelRatio||1) * 2), useCORS: true });
          if (iconCanvas) {
            const dataUrl = iconCanvas.toDataURL('image/png');
            // prefer a cloned <img> target
            const targetImg = exportClone.querySelector('.contact-icon img');
            const targetWrapperSvg = exportClone.querySelector('.contact-icon svg');
            if (targetImg) {
              try { targetImg.setAttribute('src', dataUrl); } catch(e){ targetImg.src = dataUrl; }
            } else if (targetWrapperSvg) {
              // replace inline svg with an img tag carrying the rasterized preview
              const wrapper = targetWrapperSvg.parentNode || targetWrapperSvg.closest('.contact-icon');
              if (wrapper) {
                const newImg = document.createElement('img');
                newImg.alt = 'phone';
                newImg.src = dataUrl;
                newImg.style.width = targetWrapperSvg.getAttribute('width') || '18px';
                newImg.style.height = targetWrapperSvg.getAttribute('height') || '18px';
                wrapper.innerHTML = '';
                wrapper.appendChild(newImg);
              }
            } else {
              // last resort: find any contact-icon wrapper and inject an <img>
              const anyWrap = exportClone.querySelector('.contact-icon');
              if (anyWrap) {
                anyWrap.innerHTML = '';
                const i = document.createElement('img');
                i.alt = 'phone'; i.src = dataUrl; i.style.width = '18px'; i.style.height = '18px';
                anyWrap.appendChild(i);
              }
            }
            // allow a short settle before snapshot capture
            await new Promise(r => setTimeout(r, 40));
          }
        } catch (e) {
          console.warn('Rasterizing preview contact icon failed', e);
        }
      }
    } catch (e) {
      console.warn('Embedding preview contact icon into export clone failed', e);
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
    const iconEl = box.querySelector('.contact-icon img, .contact-icon svg');
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
      // slightly enlarge the icon used in the A4 overlay so it reads better in PDF
      const ICON_EXPORT_SCALE = 1.15;
      const iconW_onA4 = Math.round(iconW_onSnap * snapRatio * ICON_EXPORT_SCALE);
      const iconH_onA4 = Math.round(iconH_onSnap * snapRatio * ICON_EXPORT_SCALE);

      // Prefer to draw the actual preview icon (img or inline SVG) so
      // the exported A4 matches the preview. Only draw the deterministic
      // black fallback badge if loading/drawing the preview icon fails.
      let drewPreviewIcon = false;
      try {
        if (iconEl.tagName && iconEl.tagName.toLowerCase() === 'img') {
          const iconSrc = iconEl.getAttribute('src') || iconEl.src;
          if (iconSrc) {
            const iconImg = new Image();
            try { iconImg.crossOrigin = 'anonymous'; } catch(e){}
            const ok = await new Promise((res) => {
              iconImg.onload = () => res(true);
              iconImg.onerror = () => res(false);
              iconImg.src = iconSrc;
            });
            if (ok && iconImg && iconImg.width) {
              try { ctx.drawImage(iconImg, iconX_onA4, iconY_onA4, iconW_onA4, iconH_onA4); drewPreviewIcon = true; } catch(e) { console.warn('drawImage failed', e); }
            }
          }
        } else if (iconEl.tagName && iconEl.tagName.toLowerCase() === 'svg') {
          try {
            const serializer = new XMLSerializer();
            const svgText = serializer.serializeToString(iconEl);
            const svgData = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgText)));
            const svgImg = new Image();
            try { svgImg.crossOrigin = 'anonymous'; } catch(e){}
            const ok = await new Promise((res) => { svgImg.onload = () => res(true); svgImg.onerror = () => res(false); svgImg.src = svgData; });
            if (ok && svgImg && svgImg.width) {
              try { ctx.drawImage(svgImg, iconX_onA4, iconY_onA4, iconW_onA4, iconH_onA4); drewPreviewIcon = true; } catch(e) { console.warn('draw SVG image failed', e); }
            }
          } catch(e) { console.warn('serialize SVG failed', e); }
        }
      } catch (e) {
        console.warn('createA4CanvasFromBox: overlay preview icon attempt failed', e);
      }

      if (!drewPreviewIcon) {
        // Draw circular badge fallback (black background + white handset)
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
// Default to a brown badge (matching the design) with a white handset.
const CONTACT_ICON_BASE64 = createColoredContactSvg('#5b2b25');

// In-memory inline SVG (when fetched successfully). Populated asynchronously.
let CONTACT_ICON_SVG = null;

// Try to fetch the SVG source and inline it into existing `.contact-icon` elements.
// Candidate filenames for contact SVG (tries these in order)
const CONTACT_SVG_CANDIDATES = [
  // '/static/images/contact-logo.svg',
  // '/static/images/Contact icon.svg',
  // '/static/images/Contact%20icon.svg',
  // '/static/images/Contact_icon.svg',
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
  const badge = createColoredContactSvg('#000000'); // black fallback
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
  const svgContent = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="10" fill="${safeColor}" stroke="none" stroke-width="0"/>\n  <path fill="#ffffff" stroke="#ffffff" stroke-width="0" d="M6.62 10.79a15.466 15.466 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.24c.96.39 2.06.76 3.06.76a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h2.5a1 1 0 011 1c.01.24.09.47.22.68.18.3.47.56.85.78.47.27 1.08.56 1.86.66.5.07.88.38 1.02.86.12.41.04.84-.25 1.18l-2.2 2.2z"/>\n</svg>`;

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
      // Slightly larger badge for better visual parity with template
      imgEl.style.width = imgEl.style.width || '22px';
      imgEl.style.height = imgEl.style.height || '22px';
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
  const inputStore = (document.getElementById("footerName") && document.getElementById("footerName").value) ? document.getElementById("footerName").value.trim() : "";
  // Prefer explicit input; if empty, reuse any existing footer text already
  // present in the editor so the "Default Store Name" is preserved.
  const existingFooterText = (document.querySelector('#templateBox #storeFooterName') && document.querySelector('#templateBox #storeFooterName').textContent) ? document.querySelector('#templateBox #storeFooterName').textContent.trim() : ((document.getElementById('storeFooterName') && document.getElementById('storeFooterName').textContent) ? document.getElementById('storeFooterName').textContent.trim() : '');
  const storeNameVal = inputStore || existingFooterText || "Store Name";
  const whatsappVal = (document.getElementById("footerWhatsApp") && document.getElementById("footerWhatsApp").value) ? document.getElementById("footerWhatsApp").value.trim() : "";

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
    // remove any other footer elements in the document EXCEPT those
    // that live inside the generated templates container (we must
    // preserve generated templates' footers). Use getGeneratedContainer()
    // when available to locate generated templates.
    const genContainer = (typeof getGeneratedContainer === 'function') ? getGeneratedContainer() : document.getElementById('generatedTemplates');
    document.querySelectorAll('#storeFooterName, #storeFooterNameFinal').forEach(el => {
      if (el === primary) return;
      try {
        if (genContainer && genContainer.contains && genContainer.contains(el)) return;
        // also avoid removing any footer that sits inside #templateBox
        const tpl = document.getElementById('templateBox');
        if (tpl && tpl.contains && tpl.contains(el)) return;
        el.remove();
      } catch(e) { try { el.parentNode && el.parentNode.removeChild(el);} catch(e2){} }
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
  // Ensure the selected footer text color is applied immediately and
  // persistently after the user updates the footer content.
  try { applyFooterColor(); } catch(e) { /* ignore */ }
  try { restoreAndColorContactIcons(); } catch(e) { /* ignore */ }
  try { ensureContactIconWithRetries(document, 4, 80); } catch(e){}
  // Also explicitly recolor any generated templates' footers so the
  // selected color is applied when the user clicks Update.
  try {
    const c = (document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) ? document.getElementById('footerTextColor').value : null;
    if (c) {
      const gen = (typeof getGeneratedContainer === 'function') ? getGeneratedContainer() : document.getElementById('generatedTemplates');
      if (gen) {
        Array.from(gen.querySelectorAll('#storeFooterName, #storeFooterNameFinal')).forEach(f => {
          try {
            f.querySelectorAll('.store-address, .separator, .store-mobile').forEach(el => el.style.setProperty('color', c, 'important'));
            f.querySelectorAll('.contact-icon img').forEach(img => { try { img.src = createColoredContactSvg(c); } catch(e){} });
          } catch(e){}
        });
      }
    }
  } catch(e) { /* ignore */ }
}

// Ensure contact icons exist and are correctly colored across the document
function restoreAndColorContactIcons() {
  try {
    const selectedColor = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || null;
    console.log('restoreAndColorContactIcons: start; selectedColor=', selectedColor);
    // Recreate any missing icons and recolor existing ones
    ensureContactIconAfterSeparator(document);
    // Also ensure generated templates area icons are present
    try { ensureContactIconAfterSeparator(document.getElementById('generatedTemplates') || document); } catch(e){}
    if (selectedColor) {
      document.querySelectorAll('.contact-icon img').forEach(img => {
        try { img.src = createColoredContactSvg(selectedColor); } catch(e) {}
      });
      document.querySelectorAll('.contact-icon svg').forEach(svg => {
        try {
          const circle = svg.querySelector('circle'); if (circle) circle.setAttribute('fill', selectedColor);
          const handset = svg.querySelector('path'); if (handset) { try { handset.setAttribute('fill', '#ffffff'); } catch(e){}; try { handset.setAttribute('stroke', '#ffffff'); } catch(e){} }
        } catch(e) {}
      });
    }
    console.log('restoreAndColorContactIcons: done; icons count=', document.querySelectorAll('.contact-icon').length);
    return true;
  } catch(e) { console.warn('restoreAndColorContactIcons: failed', e); return false; }
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
      // Ensure address and mobile share the same bold styling and color
      try {
        const computed = window.getComputedStyle(footer);
        const color = (computed && computed.color) ? computed.color : null;
        addr.style.setProperty('font-weight', '700', 'important');
        if (color) addr.style.setProperty('color', color, 'important');
        footer.querySelectorAll('.store-mobile, .separator').forEach(el => {
          el.style.setProperty('font-size', Math.max(8, s) + 'px', 'important');
          el.style.setProperty('font-weight', '700', 'important');
          if (color) el.style.setProperty('color', color, 'important');
        });
      } catch(e) {
        footer.querySelectorAll('.store-mobile, .separator').forEach(el => {
          el.style.setProperty('font-size', Math.max(8, s) + 'px', 'important');
          el.style.setProperty('font-weight', '700', 'important');
        });
      }
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
  const colorInput = document.getElementById("footerTextColor");
  const c = (colorInput && colorInput.value) ? colorInput.value : '#000000';

  // Limit recolor to footer instances only so other .store-address usages
  // elsewhere in the page aren't affected.
  const scopes = ['#templateBox', '#storeFooterName', '#storeFooterNameFinal', '#generatedTemplates'];
  const storeSelectors = scopes.map(s => `${s} .store-address, ${s} .separator, ${s} .store-mobile`).join(', ');
  if (storeSelectors) {
    document.querySelectorAll(storeSelectors).forEach(el => {
      el.style.setProperty('color', c, 'important');
      el.style.setProperty('font-weight', '600', 'important');
    });
  }

  // Recolor contact icon images only within the same scopes.
  const iconSelectors = scopes.map(s => `${s} .contact-icon img`).join(', ');
  try { inlineSvgAsDataUrl(iconSelectors, { color: c }); } catch(e){}
  if (iconSelectors) {
    document.querySelectorAll(iconSelectors).forEach(img => {
      try { img.src = createColoredContactSvg(c); img.style.removeProperty('filter'); } catch(e){}
    });
  }
  // Recolor any inline SVG contact badges (circle fill) within scopes
  try {
    const svgSelectors = ['#templateBox', '#storeFooterName', '#storeFooterNameFinal', '#generatedTemplates'].map(s => `${s} .contact-icon svg`).join(', ');
    if (svgSelectors) {
      document.querySelectorAll(svgSelectors).forEach(svg => {
        try {
          const circle = svg.querySelector('circle');
          if (circle) circle.setAttribute('fill', c);
          // keep handset white if present
          const handset = svg.querySelector('path');
          if (handset) {
            if (!handset.getAttribute('fill') || handset.getAttribute('fill') === '#ffffff') handset.setAttribute('fill', '#ffffff');
            if (!handset.getAttribute('stroke') || handset.getAttribute('stroke') === '#ffffff') handset.setAttribute('stroke', '#ffffff');
          }
        } catch(e){}
      });
    }
  } catch(e) { /* ignore */ }
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

    // For short addresses keep footer closer to bottom; for long
    // addresses move it further up so it doesn't cross decorative rules
    // (e.g. the red divider) or overlap right-side QR scanners.
    if (textLength < 80) baseBottom = 6;      // short — near bottom
    else if (textLength < 128) baseBottom = 9; // medium
    else baseBottom = 14;                      // long — move up

    // If user selected the new 'more_down' option, move the address further down
    if (pos === 'more_down') {
      // User requested footer moved further down — reduce bottom offset
      // by a small amount but keep a safe minimum so long addresses
      // still don't intrude into the QR area.
      baseBottom = Math.max(4, baseBottom - 2);
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

  // After repositioning, ensure contact icons remain visible and retain
  // the selected footer color. This prevents the icon disappearing or
  // being unintentionally recolored by other layout adjustments.
  try {
    const selectedColor = (document.getElementById && document.getElementById('footerTextColor') && document.getElementById('footerTextColor').value) || null;
    footers.forEach(f => {
      try {
        // Ensure icon wrapper exists and is visible
        let icon = f.querySelector('.contact-icon');
        if (!icon) {
          // try to create/insert icon after separator if mobile exists
          const sep = f.querySelector('.separator');
          const phone = f.querySelector('.store-mobile');
          if (sep) {
            icon = document.createElement('span');
            icon.className = 'contact-icon';
            icon.style.display = 'inline-flex';
            icon.style.alignItems = 'center';
            icon.style.marginLeft = '0px';
            // insert a default colored badge image
            const img = document.createElement('img');
            img.alt = 'phone';
            img.style.width = '18px'; img.style.height = '18px'; img.style.display = 'inline-block'; img.style.verticalAlign = 'middle'; img.style.pointerEvents = 'none';
            img.src = selectedColor ? createColoredContactSvg(selectedColor) : (typeof CONTACT_ICON_BASE64 !== 'undefined' ? CONTACT_ICON_BASE64 : '');
            icon.appendChild(img);
            if (phone && phone.parentNode) phone.parentNode.insertBefore(icon, phone);
            else sep.insertAdjacentElement('afterend', icon);
          }

        }

        if (icon) {
          icon.style.display = icon.style.display || 'inline-flex';
          // recolor img or inline svg inside icon
          const img = icon.querySelector('img');
          const svg = icon.querySelector('svg');
          if (img && selectedColor) {
            try { img.src = createColoredContactSvg(selectedColor); } catch(e){}
          }
          if (svg && selectedColor) {
            try {
              const circle = svg.querySelector('circle'); if (circle) circle.setAttribute('fill', selectedColor);
              const handset = svg.querySelector('path'); if (handset) { handset.setAttribute('fill', '#ffffff'); handset.setAttribute('stroke', '#ffffff'); }
            } catch(e){}
          }
        }
      } catch(e){}
    });
  } catch(e) { /* ignore */ }
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
    // Compute a dynamic reservation based on any right-aligned elements
    // (images, QR blocks) inside the box so the footer width is reduced
    // and long addresses won't overlap the scanner area.
    try {
      const defaultReserve = 300;
      const boxRect = box.getBoundingClientRect();
      // Find the most-prominent right-side element (likely QR) by scanning
      // for images and common QR selectors; pick the left-most edge of the
      // rightmost candidate and compute a strict maximum width so the
      // footer's right edge stays left of that element minus margin.
      const candidates = Array.from(box.querySelectorAll('img, .qr, .qr-code, .scan, .scanner, [data-qr]'));
      // include any element with a background image as a candidate
      Array.from(box.querySelectorAll('*')).forEach(el => {
        try {
          const bg = window.getComputedStyle(el).backgroundImage || '';
          if (bg && bg !== 'none') candidates.push(el);
        } catch(e){}
      });

      let scannerLeft = null;
      let scannerRect = null;
      candidates.forEach(el => {
        try {
          const r = el.getBoundingClientRect();
          if (!r || r.width < 8) return;
          // prefer elements that are positioned near the right edge of the box
          if (r.left >= boxRect.left + boxRect.width * 0.5) {
            // pick the leftmost edge among right-side elements (closest to center)
            if (scannerLeft === null || (r.left - boxRect.left) < scannerLeft) {
              scannerLeft = r.left - boxRect.left;
              scannerRect = r;
            }
          }
        } catch(e){}
      });

      const marginPx = 24; // safe gap between footer and scanner
      if (scannerLeft !== null && typeof scannerLeft === 'number' && scannerRect) {
        // Anchor the footer to the left and set a strict pixel width so the
        // footer's right edge cannot cross into the scanner area.
        const safeLeft = 24; // px left margin
        // extra safety pad to keep address away from scanner in exports
        const extraPad = 8;
        const computedWidth = Math.max(40, Math.floor(scannerLeft - marginPx - safeLeft - extraPad));
        // apply constraints
        footerFinal.style.left = safeLeft + 'px';
        footerFinal.style.transform = 'none';
        footerFinal.style.width = computedWidth + 'px';
        footerFinal.style.maxWidth = computedWidth + 'px';
        footerFinal.style.right = '';
        footerFinal.style.textAlign = 'left';
        footerFinal.style.whiteSpace = 'nowrap';
        footerFinal.style.overflow = 'hidden';
        footerFinal.style.textOverflow = 'ellipsis';
      } else {
        // no scanner detected — fallback to centered reservation
        footerFinal.style.left = '50%';
        footerFinal.style.transform = 'translateX(-50%)';
        footerFinal.style.right = '';
        footerFinal.style.width = `calc(100% - ${defaultReserve}px)`;
      }
    } catch(e) {
      footerFinal.style.width = "calc(100% - 220px)";
    }
    footerFinal.style.maxWidth = "100%";
    footerFinal.style.boxSizing = "border-box";
    footerFinal.style.textAlign = "center";
    footerFinal.style.whiteSpace = "nowrap";
    footerFinal.style.overflow = "hidden";
    footerFinal.style.textOverflow = "ellipsis";
    footerFinal.style.padding = "0 8px";
    box.appendChild(footerFinal);
  }

  // Force the final footer to be visible even if global CSS hides it
  try {
    footerFinal.style.setProperty('display', 'inline-flex', 'important');
    footerFinal.style.setProperty('pointer-events', 'none', 'important');
  } catch(e) { /* ignore */ }

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

  // Fit footer text into the reserved width: if the assembled footer's
  // content would overflow the computed footer width (due to long
  // addresses), iteratively reduce font-size to prevent overlap with the
  // right-side scanner/QR area. This ensures the address never extends
  // past the reserved width computed above.
  try {
    const fitFooterToWidth = (f) => {
      try {
        const addrEl = f.querySelector('.store-address');
        if (!addrEl) return;
        const mobileEls = Array.from(f.querySelectorAll('.store-mobile, .separator'));
        const contactImg = f.querySelector('.contact-icon img') || f.querySelector('.contact-icon svg');
        const paddingX = 12; // small extra padding to be safe
        const totalWidth = Math.max(40, f.clientWidth - paddingX);

        // compute width used by siblings (mobile, separator, icon)
        let siblingsWidth = 0;
        mobileEls.forEach(el => {
          try { siblingsWidth += Math.ceil((el.getBoundingClientRect && el.getBoundingClientRect().width) || 0); } catch(e){}
        });
        if (contactImg) {
          try { siblingsWidth += Math.ceil((contactImg.getBoundingClientRect && contactImg.getBoundingClientRect().width) || 22); } catch(e){ siblingsWidth += 22; }
        }

        // allocate remaining width for address text
        const maxW = Math.max(24, totalWidth - siblingsWidth - 8);

        // get starting font size (px)
        const comp = window.getComputedStyle(addrEl);
        let fs = parseFloat(comp.fontSize) || 12;
        // If the address is long, start with a slightly smaller base font
        // so the fitting loop needs fewer iterations and preserves layout.
        try {
          const addrLen = (addrEl.textContent || '').trim().length;
          if (addrLen > 40) {
            const scale = Math.max(0.6, 40 / addrLen); // don't go below 60%
            fs = Math.max(8, Math.round(fs * scale));
          }
        } catch(e) { /* ignore */ }
        const minFs = 6; // allow smaller fonts for very long addresses
        let iter = 0;
        // loop until fits or min font reached
        while ((addrEl.scrollWidth > maxW || f.scrollWidth > totalWidth) && fs > minFs && iter < 80) {
          fs = Math.max(minFs, fs - 0.7);
          addrEl.style.setProperty('font-size', fs + 'px', 'important');
          mobileEls.forEach(el => el.style.setProperty('font-size', Math.max(6, fs) + 'px', 'important'));
          iter++;
        }

        // If still overflowing, force truncation with ellipsis
        if (addrEl.scrollWidth > maxW || f.scrollWidth > totalWidth) {
          try {
            addrEl.style.setProperty('max-width', (maxW - 4) + 'px', 'important');
            addrEl.style.setProperty('white-space', 'nowrap', 'important');
            addrEl.style.setProperty('overflow', 'hidden', 'important');
            addrEl.style.setProperty('text-overflow', 'ellipsis', 'important');
          } catch(e){}
        }
      } catch(e) { /* ignore fit errors */ }
    };
    fitFooterToWidth(footerFinal);
  } catch(e) { /* ignore */ }
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

  // Ensure the copied footer is visible (override any global hide rules)
  try {
    dst.style.setProperty('display', 'inline-flex', 'important');
    dst.style.setProperty('pointer-events', 'none', 'important');
  } catch(e) { /* ignore */ }

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
  // After copying footer content into the clone, attempt to reduce font
  // sizes to fit the constrained width so the text does not overlap
  // right-side elements like a QR scanner when exported to A4.
  try { adjustFooterFontSize().catch(()=>{}); } catch(e) { /* ignore */ }
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
    // Prefer the preview's actual contact icon (inline svg or image) when available,
    // otherwise fall back to the embedded base64 or static candidate paths.
    let iconSrc = null;
    try {
      const previewIconImg = document.querySelector('.contact-icon img');
      const previewIconSvg = document.querySelector('.contact-icon svg');
      if (previewIconImg && previewIconImg.src) iconSrc = previewIconImg.src;
      else if (previewIconSvg) {
        try { iconSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(previewIconSvg)); } catch(e){}
      }
    } catch(e){}
    if (!iconSrc) iconSrc = CONTACT_ICON_BASE64 || CONTACT_SVG_CANDIDATES[0];
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
    console.log('ensureContactIconAfterSeparator: inserted icon for footer (container=', (container && container.id) || 'document', ')');
  });
}

// Retry-safe restore: attempt multiple times if initial insertion is lost
function ensureContactIconWithRetries(scope = document, attempts = 3, delay = 120) {
  try {
    let i = 0;
    const run = () => {
      try {
        ensureContactIconAfterSeparator(scope);
        restoreAndColorContactIcons();
        const count = (scope.querySelectorAll && scope.querySelectorAll('.contact-icon').length) || 0;
        console.log('ensureContactIconWithRetries: attempt', i+1, 'icons now=', count);
        if (count > 0) return; // success
      } catch (e) { console.warn('ensureContactIconWithRetries: attempt error', e); }
      i++;
      if (i < attempts) setTimeout(run, delay * Math.pow(2, i));
    };
    run();
  } catch(e) { console.warn('ensureContactIconWithRetries failed', e); }
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

// Watch for accidental removal of contact icons and restore them.
function observeFooterMutations() {
  try {
    const root = document.getElementById('templateBox') || document;
    const mo = new MutationObserver(muts => {
      let needsRestore = false;
      for (const m of muts) {
        if (m.type === 'childList' && (m.removedNodes && m.removedNodes.length)) {
          // if any removed node contained a contact-icon, mark for restore
          for (const n of Array.from(m.removedNodes)) {
            if (n.querySelector && n.querySelector('.contact-icon')) { needsRestore = true; break; }
            if (n.classList && n.classList.contains && n.classList.contains('contact-icon')) { needsRestore = true; break; }
          }
        }
        if (m.type === 'attributes' && m.attributeName === 'class') {
          needsRestore = true;
        }
        if (needsRestore) break;
      }
      if (needsRestore) {
          try {
            console.log('observeFooterMutations: detected removal/attribute change, restoring icons');
            // attempt immediate repair and recolor with retries
            try { ensureContactIconWithRetries(document, 4, 80); } catch(e){}
            try { ensureContactIconWithRetries(document.getElementById('generatedTemplates') || document, 4, 80); } catch(e){}
            try { restoreAndColorContactIcons(); } catch(e){}
            try { applyFooterColor(); } catch(e){}
          } catch(e){ console.warn('observeFooterMutations: restore failed', e); }
      }
    });
    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    // also observe the document to catch removals in generated templates area
    try { const gen = document.getElementById('generatedTemplates'); if (gen) mo.observe(gen, { childList: true, subtree: true }); } catch(e){}
  } catch(e) { /* ignore */ }
}

window.addEventListener('load', () => setTimeout(observeFooterMutations, 250));






/* ---------- Excel parser: populate excelData & excelDataBySheet ---------- */
  
  

// async function downloadAllPerfectA4() {
//   console.log("=== Starting Ultra HD A4 PDF Generator (NO html2canvas) ===");
//   // Ensure live footer state is applied to the DOM before starting export.
//   // If the user edited footer inputs and immediately clicked Download,
//   // update the DOM so exported PDFs include the latest address.
//   try {
//     if (typeof updateFooterInfo === 'function') updateFooterInfo();
//     try { runFooterFixes(document); } catch(e){}
//     // short wait to allow styles/fonts to settle
//     await new Promise(r => setTimeout(r, 120));
//   } catch (e) { /* ignore */ }

//   let overlay = null;
//   try {
//     if (!window.jspdf || !window.jspdf.jsPDF) {
//       alert("❌ PDF library (jsPDF) not loaded. Please refresh the page.");
//       return;
//     }
//     const { jsPDF } = window.jspdf;

//     const A4_W = 2480;
//     const A4_H = 3508;

//     if (document.fonts && document.fonts.ready) {
//       try { await document.fonts.ready; } catch (e) {}
//     }

//     let footerTextColor = "#000000";
//     const footerColorInput = document.getElementById("footerTextColor");
//     if (footerColorInput && footerColorInput.value) {
//       footerTextColor = footerColorInput.value;
//     }

//     // ------ NEW: helper to load images ------
//     const loadImage = (url) => {
//       return new Promise((resolve, reject) => {
//         const img = new Image();
//         img.onload = () => resolve(img);
//         img.onerror = (e) => reject(e);
//         img.src = url;
//       });
//     };

//     // ------ NEW: preload all possible backgrounds ------
//     let bgCustom = null;
//     let bgPrimary = null;
//     let bgSecondary = null;

//     try {
//       if (typeof TEMPLATE_BG_DATA_URL !== "undefined" && TEMPLATE_BG_DATA_URL) {
//         bgCustom = await loadImage(TEMPLATE_BG_DATA_URL);
//       }
//     } catch (e) {
//       console.warn("Failed to load custom A4 template:", e);
//       bgCustom = null;
//     }

//     try {
//       if (typeof TEMPLATE_BG_PRIMARY !== "undefined" && TEMPLATE_BG_PRIMARY) {
//         bgPrimary = await loadImage(TEMPLATE_BG_PRIMARY);
//       }
//     } catch (e) {
//       console.warn("Failed to load PRIMARY A4 template:", e);
//       bgPrimary = null;
//     }

//     try {
//       if (typeof TEMPLATE_BG_SECONDARY !== "undefined" && TEMPLATE_BG_SECONDARY) {
//         bgSecondary = await loadImage(TEMPLATE_BG_SECONDARY);
//       }
//     } catch (e) {
//       console.warn("Failed to load SECONDARY A4 template:", e);
//       bgSecondary = null;
//     }

//     if (!bgCustom && !bgPrimary && !bgSecondary) {
//       alert("❌ Please upload your A4 template first (Custom, Primary, or Secondary Template Upload).");
//       return;
//     }

//     // Prepare contact icon SVG as Blob URL (reliable for canvas)
//     const svgBase = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 861">
//       <path fill="#ffffff" opacity="1.000000" stroke="none" d=" M425.000000,862.000000   C283.333374,862.000000 142.166748,862.000000 1.000095,862.000000   C1.000063,575.000122 1.000063,288.000244 1.000032,1.000287   C274.333130,1.000191 547.666260,1.000191 820.999512,1.000096   C820.999695,287.999725 820.999695,574.999451 820.999878,861.999573   C689.166687,862.000000 557.333313,862.000000 425.000000,862.000000  M454.029053,839.641479   C473.001038,836.123657 492.227661,833.619690 510.904938,828.928467   C667.800537,789.521057 786.795227,656.085266 807.856689,495.270264   C816.519714,429.123199 809.410950,364.419495 786.026367,301.576263   C721.074280,127.025307 542.460876,18.924192 354.198486,46.002522   C273.030029,57.677212 201.002823,90.218719 141.274323,146.737244   C31.018562,251.067581 -9.870629,379.097717 20.350185,527.382690   C53.869297,691.851440 192.867157,817.514343 359.771942,838.863220   C390.803802,842.832520 421.973999,841.557922 454.029053,839.641479  z"/>
//       <path fill="${footerTextColor}" opacity="1.000000" stroke="none" d=" M453.567352,839.677124   C421.973999,841.557922 390.803802,842.832520 359.771942,838.863220   C192.867157,817.514343 53.869297,691.851440 20.350185,527.382690   C-9.870629,379.097717 31.018562,251.067581 141.274323,146.737244   C201.002823,90.218719 273.030029,57.677212 354.198486,46.002522   C542.460876,18.924192 721.074280,127.025307 786.026367,301.576263   C809.410950,364.419495 816.519714,429.123199 807.856689,495.270264   C786.795227,656.085266 667.800537,789.521057 510.904938,828.928467   C492.227661,833.619690 473.001038,836.123657 453.567352,839.677124  M391.862091,544.634521   C355.268280,503.425110 326.928192,456.935364 304.265564,406.895447   C298.503632,394.172943 293.477966,381.066895 293.309906,366.695862   C293.215240,358.597260 296.051544,351.919586 302.664001,347.291718   C308.103149,343.485016 313.802155,339.988464 319.642609,336.828796   C332.560822,329.840149 345.112030,322.513580 355.920105,312.268066   C360.964203,307.486542 362.827606,303.107544 362.328796,296.012787   C360.290283,267.017914 350.969818,240.635712 334.934601,216.693420   C330.690765,210.356918 324.891083,204.430725 318.526581,200.275497   C304.564209,191.159897 287.639221,192.691040 273.567871,204.632462   C263.989685,212.760864 255.218155,222.110825 247.353622,231.929932   C231.998871,251.100754 221.296951,272.510254 219.972229,297.709564   C218.225052,330.945068 221.793915,363.596985 230.906982,395.577576   C246.874893,451.613861 273.256622,502.577850 307.349182,549.591309   C338.222473,592.165466 374.442596,629.387207 419.322144,657.445190   C445.252075,673.656128 472.569611,686.250732 503.754059,688.526733   C538.026611,691.028076 566.918274,679.275452 591.167603,655.716797   C604.869629,642.405090 606.535278,628.909607 596.789795,613.361572   C585.214478,594.894043 571.005615,578.586304 553.763367,565.106262   C533.812256,549.508362 512.553406,547.729187 491.103088,561.164307   C479.167603,568.639954 468.325256,577.880249 457.113312,586.485596   C447.402039,593.939209 446.910187,594.699890 437.573242,586.664490   C422.070862,573.323120 407.381531,559.036987 391.862091,544.634521  z"/>
//       <path fill="#ffffff" opacity="1.000000" stroke="none" d=" M392.105896,544.891663   C407.381531,559.036987 422.070862,573.323120 437.573242,586.664490   C446.910187,594.699890 447.402039,593.939209 457.113312,586.485596   C468.325256,577.880249 479.167603,568.639954 491.103088,561.164307   C512.553406,547.729187 533.812256,549.508362 553.763367,565.106262   C571.005615,578.586304 585.214478,594.894043 596.789795,613.361572   C606.535278,628.909607 604.869629,642.405090 591.167603,655.716797   C566.918274,679.275452 538.026611,691.028076 503.754059,688.526733   C472.569611,686.250732 445.252075,673.656128 419.322144,657.445190   C374.442596,629.387207 338.222473,592.165466 307.349182,549.591309   C273.256622,502.577850 246.874893,451.613861 230.906982,395.577576   C221.793915,363.596985 218.225052,330.945068 219.972229,297.709564   C221.296951,272.510254 231.998871,251.100754 247.353622,231.929932   C255.218155,222.110825 263.989685,212.760864 273.567871,204.632462   C287.639221,192.691040 304.564209,191.159897 318.526581,200.275497   C324.891083,204.430725 330.690765,210.356918 334.934601,216.693420   C350.969818,240.635712 360.290283,267.017914 362.328796,296.012787   C362.827606,303.107544 360.964203,307.486542 355.920105,312.268066   C345.112030,322.513580 332.560822,329.840149 319.642609,336.828796   C313.802155,339.988464 308.103149,343.485016 302.664001,347.291718   C296.051544,351.919586 293.215240,358.597260 293.309906,366.695862   C293.477966,381.066895 298.503632,394.172943 304.265564,406.895447   C326.928192,456.935364 355.268280,503.425110 392.105896,544.891663  z"/></svg>`;

//     // Create blob URL for the SVG (safe for canvas)
//     let contactIcon = null;
//     let contactIconLoaded = false;
//     try {
//       const svgBlob = new Blob([svgBase], { type: "image/svg+xml" });
//       const blobUrl = URL.createObjectURL(svgBlob);

//       contactIcon = new Image();
//       contactIcon.crossOrigin = "anonymous";

//       await new Promise((resolve) => {
//         contactIcon.onload = () => {
//           contactIconLoaded = true;
//           try { URL.revokeObjectURL(blobUrl); } catch (e) {}
//           resolve();
//         };
//         contactIcon.onerror = (e) => {
//           console.warn("Contact icon (SVG blob) failed to load for canvas:", e);
//           try { URL.revokeObjectURL(blobUrl); } catch (e) {}
//           resolve();
//         };
//         contactIcon.src = blobUrl;
//       });
//     } catch (err) {
//       console.warn("Error preparing contact icon blob:", err);
//       contactIconLoaded = false;
//       contactIcon = null;
//     }

//     const containerRoot = document.getElementById("generatedTemplates") || document.getElementById("templatesContainer");
//     // Include any node that looks like a generated template: nodes with
//     // `data-store-index`, legacy `.template-box`, or id patterns used
//     // by template clones. Also accept nodes that have either a
//     // `.store-address` element or a `#storeFooterName` /
//     // `#storeFooterNameFinal` footer element so templates are not
//     // skipped when the address was moved to a final overlay.
//     // Include all likely template nodes (don't require `.store-address`)
//     // — some generated clones may only have the final footer overlay.
//     const datasetNodes = containerRoot
//       ? Array.from(containerRoot.querySelectorAll("[data-store-index], .template-box, [id^='template_sheet_'], [id^='template_clone_'], [id^='template_pair_']"))
//       : [];

//     let storeGroups = [];

//     if (datasetNodes.length) {
//       const grouped = new Map();
//       datasetNodes.forEach(node => {
//         const storeIndexRaw = Number(node.dataset.storeIndex);
//         if (!Number.isFinite(storeIndexRaw)) return;
//         if (!grouped.has(storeIndexRaw)) grouped.set(storeIndexRaw, []);
//         grouped.get(storeIndexRaw).push(node);
//       });
//       storeGroups = Array.from(grouped.entries())
//         .sort((a, b) => a[0] - b[0])
//         .map(([storeIndex, nodes]) => {
//           const sortedNodes = nodes.slice().sort((a, b) => {
//             const orderA = Number(a.dataset.variantOrder ?? (a.dataset.variant === "primary" ? 0 : 1));
//             const orderB = Number(b.dataset.variantOrder ?? (b.dataset.variant === "primary" ? 0 : 1));
//             return orderA - orderB;
//           });
//           return { storeIndex, nodes: sortedNodes };
//         });
//     } else {
//       let legacyTemplates = document.querySelectorAll(
//         "#templatesContainer > .template-box, " +
//         "#templatesContainer > [id^='template_sheet_'], " +
//         "#templatesContainer > [id^='template_clone_'], " +
//         "#templatesContainer > div"
//       );
//       legacyTemplates = Array.from(legacyTemplates).filter(t => t.querySelector(".store-address"));

//       if (legacyTemplates.length) {
//         // existing behaviour: use any generated templates inside templatesContainer
//         storeGroups = legacyTemplates.map((node, idx) => ({ storeIndex: idx, nodes: [node] }));
//       } else {
//         // NEW: fallback to the main editor box so a single-page
//         // Perfect A4 PDF can be created after Upload Custom Template
//         const mainBox = document.getElementById("templateBox");
//         if (!mainBox) {
//           alert("❌ No templates found.\nPlease click 'Generate Templates' or upload a template first.");
//           return;
//         }
//         storeGroups = [{ storeIndex: 0, nodes: [mainBox] }];
//       }
//     }

//     const totalPdfCount = storeGroups.reduce((sum, group) => sum + group.nodes.length, 0);
//     if (!totalPdfCount) {
//       alert("❌ No templates found.\nPlease click 'Generate Templates' first.");
//       return;
//     }

//     overlay = document.createElement("div");
//     overlay.style.cssText = `
//       position:fixed;
//       top:50%;
//       left:50%;
//       transform:translate(-50%,-50%);
//       background:linear-gradient(135deg,#8b0000,#dc143c);
//       color:#fff;
//       padding:28px 48px;
//       border-radius:14px;
//       box-shadow:0 10px 40px rgba(0,0,0,0.35);
//       font-size:18px;
//       font-weight:bold;
//       text-align:center;
//       z-index:99999;
//     `;
//     overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">0 / ${totalPdfCount}</span>`;
//     document.body.appendChild(overlay);

//     // Visible temporary footer banner to help confirm exported footer text
//     // during the A4 generation process. This is shown while PDFs are
//     // generated and removed afterwards.
//     const exportFooterBanner = document.createElement('div');
//     exportFooterBanner.id = 'exportFooterBanner';
//     exportFooterBanner.style.cssText = `
//       position: fixed;
//       left: 50%;
//       transform: translateX(-50%);
//       bottom: 18px;
//       background: rgba(0,0,0,0.8);
//       color: #fff;
//       padding: 8px 14px;
//       border-radius: 8px;
//       z-index: 100000;
//       font-weight:700;
//       max-width: 80%;
//       text-align: center;
//       font-size: 14px;
//       pointer-events: none;
//       display: none;
//     `;
//     document.body.appendChild(exportFooterBanner);

//     let processedPdfCount = 0;
//     const langCounts = {};

//     for (let storeIdx = 0; storeIdx < storeGroups.length; storeIdx++) {
//       const group = storeGroups[storeIdx];

//       // one multi-page PDF per store
//       let storePdf = null;
//       let baseAddressForName = "";

//       for (let variantIdx = 0; variantIdx < group.nodes.length; variantIdx++) {
//         const box = group.nodes[variantIdx];

//       let address = "";
//       let mobile = "";

//       try {
//         // Ensure footer exists inside this template before reading it
//         syncFinalLayerFor(box);
//         await new Promise(r => setTimeout(r, 80));


//         // Force copy footer from editor template
// const mainBox = document.getElementById("templateBox");

//     if (mainBox) {
//       const mainFooter =
//         mainBox.querySelector("#storeFooterNameFinal") ||
//         mainBox.querySelector("#storeFooterName");

//       const targetFooter =
//         box.querySelector("#storeFooterNameFinal") ||
//         box.querySelector("#storeFooterName");

//       if (mainFooter && targetFooter) {
//         targetFooter.innerHTML = mainFooter.innerHTML;
//       }
//     }

//         const footerInfo = getFooterInfoFromBox(box);
//         address = footerInfo.address || "";
//         mobile = footerInfo.mobile || "";

//       } catch (err) {
//         console.error("Error getting footer info:", err);
//       }












//         // let address = "";
//         // let mobile = "";
//         // try {
//         //   const footerInfo = getFooterInfoFromBox(box);
//         //   address = footerInfo.address || "";
//         //   mobile = footerInfo.mobile || "";
//         // } catch (err) {
//         //   console.error("Error getting footer info:", err);
//         // }
//         // Fallback: if the box did not contain a footer/address (e.g. editor
//         // uses a separate overlay for the final footer), try reading the
//         // global footer element so downloads still contain the store address.
//         if (!address) {
//           try {
//             const globalFooter = (document.getElementById && (document.getElementById('storeFooterName') || document.getElementById('storeFooterNameFinal'))) || document.querySelector('#storeFooterName, #storeFooterNameFinal');
//             if (globalFooter) {
//               const gaddr = globalFooter.querySelector('.store-address');
//               const gmob = globalFooter.querySelector('.store-mobile');
//               if (gaddr) address = gaddr.textContent.trim();
//               if (gmob && !mobile) mobile = gmob.textContent.trim();
//             }
//           } catch (e) { /* ignore fallback errors */ }
//         }
//         const footerAddress = (address || "").trim();
//         const phoneText = (mobile || "").trim();
//         const hasPhone = !!phoneText;

//         const footerFullText = hasPhone
//           ? `${footerAddress} | ${phoneText}`
//           : footerAddress;

//         // Update visible export banner so user can confirm what's being exported
//         try {
//           if (exportFooterBanner) {
//             exportFooterBanner.textContent = footerFullText || "(no footer)";
//             exportFooterBanner.style.display = 'block';
//           }
//         } catch(e) { /* ignore */ }

//         if (!footerFullText) {
//           try {
//             const g = document.querySelector('#storeFooterName, #storeFooterNameFinal');
//             console.warn('A4 Export: footer text is empty for this box. globalFooter:', g ? g.textContent.trim().slice(0,200) : null);
//           } catch(e) { console.warn('A4 Export: footer empty and globalFooter check failed', e); }
//         }

//         // Debugging logs: help trace missing footer / blank PDF issues
//         try {
//           console.debug('A4 Export Debug:', { storeIdx, variantIdx, footerAddress, phoneText, footerFullText, hasPhone });
//           const domFooterExists = !!(box.querySelector('#storeFooterName') || box.querySelector('#storeFooterNameFinal'));
//           console.debug('A4 Export Debug: domFooterExists for box?', domFooterExists, 'boxId:', box.id || box.getAttribute('id'));
//           const globalFooter = document.querySelector('#storeFooterName, #storeFooterNameFinal');
//           console.debug('A4 Export Debug: globalFooter text', globalFooter ? globalFooter.textContent.trim().slice(0,120) : null);
//         } catch (e) { console.warn('A4 Export Debug log failed', e); }

//         if (variantIdx === 0 && footerAddress) {
//           baseAddressForName = footerAddress;
//         }

//         const hasDeva     = /[\u0900-\u097F]/.test(footerFullText);
//         const hasTamil    = /[\u0B80-\u0BFF]/.test(footerFullText);
//         const hasGujarati = /[\u0A80-\u0AFF]/.test(footerFullText);
//         const hasBengali  = /[\u0980-\u09FF]/.test(footerFullText);
//         const hasTelugu   = /[\u0C00-\u0C7F]/.test(footerFullText);
//         const hasKannada  = /[\u0C80-\u0CFF]/.test(footerFullText);

//         let langCode = (box.dataset?.lang || "").toLowerCase();
//         if (!langCode) {
//           const footerNode = box.querySelector("#storeFooterName, #storeFooterNameFinal");
//           if (footerNode) {
//             for (const [code, cls] of Object.entries(FONT_CLASS_MAP)) {
//               if (footerNode.classList.contains(cls)) {
//                 langCode = code;
//                 break;
//               }
//             }
//           }
//         }
//         if (!langCode && box.classList) {
//           for (const [code, cls] of Object.entries(FONT_CLASS_MAP)) {
//             if (box.classList.contains(cls)) {
//               langCode = code;
//               break;
//             }
//           }
//         }
//         if (!langCode) {
//           if (hasTamil) langCode = "ta";
//           else if (hasGujarati) langCode = "gu";
//           else if (hasBengali)  langCode = "bn";
//           else if (hasTelugu)   langCode = "te";
//           else if (hasKannada)  langCode = "kn";
//           else if (hasDeva)     langCode = "mr";
//           else langCode = "en";
//         }

//         // NEW: variant info (primary / secondary)
//         const variant = (box.dataset && box.dataset.variant
//           ? box.dataset.variant.toLowerCase()
//           : "");

//         processedPdfCount += 1;
//         overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">Store ${storeIdx + 1} / ${storeGroups.length} • PDF ${processedPdfCount} / ${totalPdfCount}${langCode ? ` • ${langCode.toUpperCase()}` : ""}</span>`;

//         let fontFamily = LANG_FONT_MAP[langCode] || "NotoSans";
//         if (!LANG_FONT_MAP[langCode]) {
//           if      (hasDeva)     fontFamily = "NotoSansDeva";
//           else if (hasTamil)    fontFamily = "NotoSansTamil";
//           else if (hasGujarati) fontFamily = "NotoSansGuj";
//           else if (hasBengali)  fontFamily = "NotoSansBeng";
//           else if (hasTelugu)   fontFamily = "NotoSansTelugu";
//           else if (hasKannada)  fontFamily = "NotoSansKannada";
//         }

//         let footerRatioY = 0.92;
//         const domFooter =
//           box.querySelector("#storeFooterName") ||
//           box.querySelector("#storeFooterNameFinal");

//         if (domFooter) {
//           const boxRect = box.getBoundingClientRect();
//           const footerRect = domFooter.getBoundingClientRect();
//           const footerCenterY =
//             footerRect.top - boxRect.top + footerRect.height / 2;
//           footerRatioY = footerCenterY / boxRect.height;
//         }

//         // NEW: choose correct background per page
//         let bgToUse = null;
//         if (bgCustom) {
//           // if custom is uploaded, use same for all
//           bgToUse = bgCustom;
//         } else if (variant === "secondary" && bgSecondary) {
//           bgToUse = bgSecondary;
//         } else if (variant === "primary" && bgPrimary) {
//           bgToUse = bgPrimary;
//         } else if (langCode && langCode !== "en" && bgSecondary) {
//           // fallback: non-English → secondary background if available
//           bgToUse = bgSecondary;
//         } else {
//           bgToUse = bgPrimary || bgSecondary;
//         }

//         if (!bgToUse) {
//           console.warn("No background image found for this template; skipping.", { storeIdx, variant, langCode });
//           continue;
//         }

//         // Try to capture a live A4 snapshot of the current "box" (generated
//         // template or editor preview). If html2canvas + our helper exists
//         // and succeeds, use that snapshot directly as the A4 page so the
//         // exported PDF matches the live/generated template exactly.
//             try {
//               // Ensure the exported box has the synced final footer layer
//               try {
//                 if (typeof syncFinalLayerFor === 'function') syncFinalLayerFor(box);
//                 // If there is a main editor footer, copy it into this box so
//                 // the exported snapshot matches the generated preview exactly.
//                 const mainBox = document.getElementById && document.getElementById('templateBox');
//                 if (mainBox && typeof cloneExactFooter === 'function') {
//                   cloneExactFooter(mainBox, box);
//                 }
//                 // Force-copy global editor footer into the box's final footer
//                 // as a last-resort to ensure the store address is always present
//                 // in the exported snapshot (handles edge-cases where cloneExactFooter
//                 // didn't find or copy the content).
//                 try {
//                   const globalFooter = (mainBox && mainBox.querySelector('#storeFooterName')) || document.getElementById('storeFooterName') || document.querySelector('#storeFooterNameFinal');
//                   if (globalFooter) {
//                     try { if (typeof syncFinalLayerFor === 'function') syncFinalLayerFor(box); } catch(e){}
//                     const dest = box.querySelector('#storeFooterNameFinal') || box.querySelector('#storeFooterName');
//                     if (dest) {
//                       dest.innerHTML = globalFooter.innerHTML;
//                       dest.style.display = 'inline-flex';
//                       dest.style.pointerEvents = 'none';
//                     }
//                   }
//                 } catch(e) { console.warn('force copy global footer into box failed', e); }
//               } catch(e) { /* ignore sync errors */ }

//               // if (window.html2canvas && typeof createA4CanvasFromBox === 'function') {
//             // Ensure any contact SVGs inside this box are inlined and
//             // converted to PNG data URLs so html2canvas can capture them.
//             // let _tempId = null;
//             // try {
//             //   if (!box.id) {
//             //     _tempId = 'export_tmp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
//             //     box.id = _tempId;
//             //   }
//             //   const sel = `#${box.id} .contact-icon img`;
//             //   try { await inlineSvgAsDataUrl(sel, { preferDataUrl: true, color: footerTextColor }); } catch(e){ console.warn('inlineSvgAsDataUrl failed for box', e); }
//             //   try { await convertAnySvgImagesToPng(sel, 28); } catch(e){ console.warn('convertAnySvgImagesToPng failed for box', e); }
//             // } catch(e) {
//             //   console.warn('Error preparing contact icons for snapshot', e);
//             // }
//           if (false && window.html2canvas && typeof createA4CanvasFromBox === 'function') {
//           let _tempId = null;
//         try {
//           if (!box.id) {
//             _tempId = 'export_tmp_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
//             box.id = _tempId;
//           }

//           const sel = `#${box.id} .contact-icon img`;

//           try {
//             await inlineSvgAsDataUrl(sel, { preferDataUrl: true, color: footerTextColor });
//           } catch(e){
//             console.warn('inlineSvgAsDataUrl failed for box', e);
//           }

//           try {
//             await convertAnySvgImagesToPng(sel, 28);
//           } catch(e){
//             console.warn('convertAnySvgImagesToPng failed for box', e);
//           }

//           // ⭐ VERY IMPORTANT — WAIT FOR RENDER
//           await new Promise(r => setTimeout(r, 150));

//         } catch(e) {
//           console.warn('Error preparing contact icons for snapshot', e);
//         }





//         try {
//           if (typeof _tempId !== 'undefined' && _tempId) box.removeAttribute('id');
//         } catch(e) {
//           console.warn('Error cleaning up temporary id for snapshot', e);
//         }

//             // If the current box lacks its own footer, inject a temporary
//             // final footer so createA4CanvasFromBox (and its export clone)
//             // captures the store address/mobile even when the live editor
//             // places the footer elsewhere in the DOM.
//             let _tempExportFooter = null;
//             try {
//               if (!box.querySelector('#storeFooterName') && !box.querySelector('#storeFooterNameFinal') && (address || mobile)) {
//                 _tempExportFooter = document.createElement('div');
//                 _tempExportFooter.id = 'storeFooterNameFinal';
//                 _tempExportFooter.className = 'store-footer export-temp';
//                 _tempExportFooter.innerHTML = `<span class="store-address">${escapeHtml(address || '')}</span>` + (mobile ? `<span class="separator">|</span>${getContactIconHtml()}<span class="store-mobile">${escapeHtml(mobile)}</span>` : '');
//                 box.appendChild(_tempExportFooter);
//                 // small pause to allow DOM to reflow before capture
//                 await new Promise(r => setTimeout(r, 40));
//               }
//             } catch(e) { console.warn('Failed to inject temporary export footer', e); }

//             let snapA4 = null;
//             try {
//               // snapA4 = await createA4CanvasFromBox(box, bgToUse);
//             } catch (e) {
//               console.warn('createA4CanvasFromBox threw:', e);
//               snapA4 = null;
//             }

//             // If createA4CanvasFromBox did not return a valid canvas,
//             // try a direct html2canvas capture of the live `box` as a
//             // robust fallback (some DOM constructs are only captured
//             // correctly when rendered directly).
//             if (!snapA4 || !snapA4.width || !snapA4.height) {
//               try {
//                 if (window.html2canvas) {
//                   const boxRect = box.getBoundingClientRect();
//                   const targetScale = Math.min(6, Math.max(1, Math.floor((A4_W / (boxRect.width || 1)))));
//                   console.debug('A4 Export: falling back to direct html2canvas with scale', targetScale);
//                   const canvasSnap = await html2canvas(box, { backgroundColor: null, scale: targetScale, useCORS: true });
//                   const snapImg = new Image();
//                   snapImg.crossOrigin = 'anonymous';
//                   snapImg.src = canvasSnap.toDataURL('image/png');
//                   await new Promise(r => { snapImg.onload = r; snapImg.onerror = r; });

//                   const tmp = document.createElement('canvas');
//                   tmp.width = A4_W; tmp.height = A4_H;
//                   const tctx = tmp.getContext('2d');
//                   tctx.fillStyle = '#ffffff'; tctx.fillRect(0,0,A4_W,A4_H);
//                   const snapRatio = Math.min(A4_W / snapImg.width, A4_H / snapImg.height);
//                   const snapW = Math.round(snapImg.width * snapRatio);
//                   const snapH = Math.round(snapImg.height * snapRatio);
//                   const snapX = Math.round((A4_W - snapW) / 2);
//                   const snapY = Math.round((A4_H - snapH) / 2);
//                   try { tctx.drawImage(snapImg, snapX, snapY, snapW, snapH); } catch(e){ console.warn('Fallback drawImage failed', e); }
//                   snapA4 = tmp;
//                 }
//               } catch (e) {
//                 console.warn('Direct html2canvas fallback failed', e);
//                 snapA4 = null;
//               }
//             }

//             if (snapA4 && snapA4.width && snapA4.height) {
//               console.debug('A4 Export: using snapA4 canvas for storeIdx', storeIdx, 'variant', variant, 'footer:', footerFullText.slice(0,120));
//               // Use PNG for lossless export to improve clarity/sharpness
//               const snapData = snapA4.toDataURL("image/png");
//               if (!storePdf) {
//                 storePdf = new jsPDF("p", "mm", "a4");
//               } else {
//                 storePdf.addPage();
//               }
//               storePdf.addImage(snapData, "PNG", 0, 0, 210, 297);
//               // Overlay vector footer text in the PDF as a fallback so the
//               // store address appears even if the raster snapshot missed it.
//               try {
//                 // Prefer the computed footer for this box, but fall back to the
//                 // global editor footer so the default store address is always
//                 // embedded into the PDF even when per-box parsing fails.
//                 let footerTextForPdf = (footerFullText || "").trim();
//                 if (!footerTextForPdf) {
//                   try {
//                     const gf = document.querySelector('#templateBox #storeFooterName, #templateBox #storeFooterNameFinal') || document.getElementById('storeFooterName') || document.getElementById('storeFooterNameFinal') || document.querySelector('#storeFooterName, #storeFooterNameFinal');
//                     if (gf) footerTextForPdf = (gf.textContent || '').trim();
//                   } catch(e) { console.warn('Failed to read global footer for PDF overlay', e); }
//                 }
//                 if (footerTextForPdf) {
//                   // Compute footer Y position in PDF mm using same math as canvas
//                   const DPI_A4 = 300;
//                   const A4_W = 2480, A4_H = 3508;
//                   const shiftMmA4 = 16;
//                   const shiftPxA4 = (shiftMmA4 * DPI_A4) / 25.4;
//                   const footerNudgeUpPx = 175;
//                   const rawFooterY = A4_H * (footerRatioY || 0.92) + 50 + shiftPxA4;
//                   const cappedFooterY = Math.min(A4_H - 20, rawFooterY);
//                   const footerYpx = Math.max(0, cappedFooterY - footerNudgeUpPx);
//                   const y_mm = footerYpx / (A4_H / 297);

//                   // Use a conservative font size (pt). Convert from px if needed.
//                   let fontSizePx = 40;
//                   const len = (footerTextForPdf || "").length;
//                   if      (len <= 35) fontSizePx = 48;
//                   else if (len <= 60) fontSizePx = 44;
//                   else if (len <= 85) fontSizePx = 40;
//                   else fontSizePx = 36;
//                   const fontSizePt = Math.max(10, Math.round(fontSizePx * 72 / DPI_A4));

//                   try {
//                     storePdf.setFont('helvetica', 'bold');
//                     storePdf.setTextColor(0,0,0);
//                     storePdf.setFontSize(fontSizePt);
//                     // Center the footer text horizontally and constrain width
//                     storePdf.text(footerTextForPdf, 105, y_mm, { align: 'center', maxWidth: 210 - 80 });
//                   } catch (e) {
//                     console.warn('Could not overlay footer text into PDF', e);
//                   }
//                 }
//               } catch (e) { console.warn('Overlay footer into PDF failed', e); }
//               langCounts[langCode] = (langCounts[langCode] || 0) + 1;
//               // small throttle for UI update
//               await new Promise(r => setTimeout(r, 150));
//                 // cleanup temporary id if we set one
//                 try { if (typeof _tempId !== 'undefined' && _tempId) box.removeAttribute('id'); } catch(e) {}
//                 // remove temporary footer if we injected one
//                 try { if (_tempExportFooter && _tempExportFooter.parentNode) _tempExportFooter.parentNode.removeChild(_tempExportFooter); } catch(e){}
//                 // snapshot saved, skip manual canvas composition below
//                 continue;
//             }
//             // Remove temporary footer if snapshot failed and we'll fall back
//             try { if (_tempExportFooter && _tempExportFooter.parentNode) _tempExportFooter.parentNode.removeChild(_tempExportFooter); } catch(e){}
//           }
//         } catch (e) {
//           console.warn('A4 snapshot via createA4CanvasFromBox failed, falling back to manual render', e);
//         }

//         // Fallback: build A4 canvas manually (background, logos, footer drawing)
//         const canvas = document.createElement("canvas");
//         canvas.width = A4_W;
//         canvas.height = A4_H;
//         const ctx = canvas.getContext("2d");

//         ctx.fillStyle = "#ffffff";
//         ctx.fillRect(0, 0, A4_W, A4_H);

//         const ratio = Math.min(A4_W / bgToUse.width, A4_H / bgToUse.height);
//         const drawW = bgToUse.width * ratio;
//         const drawH = bgToUse.height * ratio;
//         const dx = (A4_W - drawW) / 2;
//         const dy = (A4_H - drawH) / 2;
//         ctx.imageSmoothingEnabled = true;
//         ctx.drawImage(bgToUse, dx, dy, drawW, drawH);

//         // ----- Draw draggable/logo images -----
//         try {
//           const logoImgs = Array.from(box.querySelectorAll('img.draggable, .draggable img')).filter(Boolean);
//           if (logoImgs.length) {
//             const loadedImgs = await Promise.all(logoImgs.map(imgEl => new Promise(res => {
//               try {
//                 const im = new Image();
//                 // im.crossOrigin = 'anonymous';
//                 im.onload = () => res({ img: im, el: imgEl, ok: true });
//                 im.onerror = () => {
//                   console.warn('Logo image failed to load for export:', imgEl.src || imgEl.getAttribute('src'));
//                   res({ img: im, el: imgEl, ok: false });
//                 };
//                 im.src = imgEl.src || imgEl.getAttribute('src') || '';
//               } catch (e) {
//                 console.warn('Error preparing logo image for export', e);
//                 res({ img: null, el: imgEl, ok: false });
//               }
//             })));

//             const boxRect = box.getBoundingClientRect();
//             loadedImgs.forEach(({ img: im, el, ok }) => {
//               if (!ok || !im || !im.width) return;
//               if(console.diagrable.com)
//               try {
//                 const elRect = el.getBoundingClientRect();
//                 const relLeft = (elRect.left - boxRect.left);
//                 const relTop  = (elRect.top  - boxRect.top);
//                 const relW    = elRect.width;
//                 const relH    = elRect.height;

//                 const scaleX = drawW / bgToUse.width;
//                 const drawX = Math.round(dx + relLeft * scaleX);
//                 const drawY = Math.round(dy + relTop * scaleX);
//                 const drawWidth  = Math.round(relW * scaleX);
//                 const drawHeight = Math.round(relH * scaleX);

//                 ctx.drawImage(im, drawX, drawY, drawWidth, drawHeight);
//               } catch (e) {
//                 console.warn('Failed to draw logo on canvas for export', e);
//               }
//             });
//           }
//         } catch (e) {
//           console.warn('Error while rendering draggable logos to canvas:', e);
//         }

//         // If this page is the main editor `templateBox`, capture the live DOM
//         // rendering (which may include positioned HTML elements) via html2canvas
//         // and paint that snapshot onto the A4 canvas so the exported PDF
//         // matches the live preview exactly.
//         try {
//           const isMainEditorBox = (box.id === 'templateBox' || box.getAttribute('id') === 'templateBox');
//           // if (isMainEditorBox && window.html2canvas) {
//           if (false && isMainEditorBox && window.html2canvas) {
//             // capture at a scale that maps box width -> A4 drawW
//             const boxRect = box.getBoundingClientRect();
//             const targetScale = Math.max(1, Math.floor((A4_W / (boxRect.width || 1))));
//             const canvasSnap = await html2canvas(box, { backgroundColor: null, scale: Math.min(6, targetScale) });
//             const snapImg = new Image();
//             snapImg.crossOrigin = 'anonymous';
//             snapImg.src = canvasSnap.toDataURL('image/png');
//             await new Promise(r => { snapImg.onload = r; snapImg.onerror = r; });

//             // compute destination placement to center the snapshot inside A4
//             const snapRatio = Math.min(A4_W / snapImg.width, A4_H / snapImg.height);
//             const snapW = Math.round(snapImg.width * snapRatio);
//             const snapH = Math.round(snapImg.height * snapRatio);
//             const snapX = Math.round((A4_W - snapW) / 2);
//             const snapY = Math.round((A4_H - snapH) / 2);

//             try { ctx.drawImage(snapImg, snapX, snapY, snapW, snapH); }
//             catch (err) { console.warn('Failed to draw live snapshot onto A4 canvas', err); }
//           }
//         } catch (err) {
//           console.warn('html2canvas snapshot for A4 failed', err);
//         }

//         ctx.textAlign = "left";
//         ctx.textBaseline = "middle";

//         const len = footerFullText.length;
//         let fontSize;
//         if      (len <= 35) fontSize = 48;
//         else if (len <= 60) fontSize = 44;
//         else if (len <= 85) fontSize = 40;
//         else                fontSize = 36;

//         const maxWidth = A4_W * 0.86;

//         while (fontSize > 22) {
//           ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
//           const w = ctx.measureText(footerFullText).width;
//           if (w <= maxWidth) break;
//           fontSize -= 1.5;
//         }

//         // Base footer placement in Perfect A4 export
//         const DPI_A4 = 300; // canvas sized for ~300 DPI
//         const shiftMmA4 = 16;
//         const shiftPxA4 = (shiftMmA4 * DPI_A4) / 25.4;
//         const footerNudgeUpPx = 175; // move footer/store-address slightly more upward in Download All A4 export
//         const rawFooterY = A4_H * footerRatioY + 50 + shiftPxA4;
//         const cappedFooterY = Math.min(A4_H - 20, rawFooterY); // keep small bottom margin
//         const footerY = Math.max(0, cappedFooterY - footerNudgeUpPx);

//         ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
//         // ctx.fillStyle = footerTextColor;
//         // Always draw solid dark badge for visibility
//         ctx.fillStyle = "#000000";
//         ctx.fill();
//         // ctx.strokeStyle = footerTextColor;
//         ctx.strokeStyle = '#ffffff';
//         ctx.lineWidth = 1.4;

//         const addressPart = hasPhone ? `${footerAddress} | ` : footerAddress;
//         ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
//         const addressWidth = ctx.measureText(addressPart).width;
//         const phoneWidth = hasPhone ? ctx.measureText(phoneText).width : 0;

//         const iconGap  = (contactIconLoaded && hasPhone) ? 8 : 0;
//         const iconSize = (contactIconLoaded && hasPhone) ? fontSize + 6 : 0;
//         const totalWidth = addressWidth + iconSize + iconGap + phoneWidth;

//         // Footer line position in Download All Perfect A4 export
//         const footerNudgeLeftPx = 80;
//         const startX = Math.round((A4_W - totalWidth) / 2) - footerNudgeLeftPx;
//         let x = startX;

//         ctx.strokeText(addressPart, x, footerY);
//         ctx.fillText(addressPart, x, footerY);
//         x += addressWidth;

//         if (hasPhone && iconSize > 0) {
//           const iconX = x;
//           const iconY = footerY - iconSize / 2;
//           // Always draw a solid circular badge for the contact icon (ensures visibility)
//           ctx.save();
//           ctx.beginPath();
//           ctx.arc(iconX + iconSize / 2, footerY, iconSize / 2, 0, Math.PI * 2);
//           ctx.fillStyle = footerTextColor;
//           ctx.fill();
//           ctx.restore();

//           // Draw simple handset stroke in white on top
//           ctx.save();
//           ctx.strokeStyle = '#ffffff';
//           ctx.lineWidth = Math.max(2, iconSize * 0.13);
//           ctx.lineCap = 'round';
//           const cx = iconX + iconSize / 2, cy = footerY, r = iconSize * 0.28;
//           ctx.beginPath();
//           ctx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 1.25, false);
//           ctx.stroke();
//           ctx.restore();

//           // If the prepared SVG blob loaded, attempt to draw it over the badge
//           if (contactIconLoaded && contactIcon) {
//             try {
//               ctx.drawImage(contactIcon, iconX, iconY, iconSize, iconSize);
//             } catch (err) {
//               console.warn('Could not draw contactIcon image onto canvas (overlay), continuing with painted badge', err);
//             }
//           }

//           x += iconSize + iconGap;
//         }

//         if (hasPhone) {
//           ctx.strokeText(phoneText, x, footerY);
//           ctx.fillText(phoneText, x, footerY);
//         }

//         // Use PNG for lossless export which preserves text sharpness
//         const imgData = canvas.toDataURL("image/png");
//         console.debug('A4 Export: using manual canvas for storeIdx', storeIdx, 'variant', variant, 'footer:', footerFullText.slice(0,120));

//         // build a single multi-page PDF per store (EN page first, then local)
//         if (!storePdf) {
//           storePdf = new jsPDF("p", "mm", "a4");
//         } else {
//           storePdf.addPage();
//         }
//         storePdf.addImage(imgData, "PNG", 0, 0, 210, 297);

//         langCounts[langCode] = (langCounts[langCode] || 0) + 1;

//         await new Promise(r => setTimeout(r, 150));
//       }

//       // after processing all variants for this store, save exactly one PDF
//       if (storePdf) {
//         let fname = "Template";
//         if (baseAddressForName && baseAddressForName.trim()) {
//           fname = baseAddressForName.trim().substring(0, 40).replace(/[^a-zA-Z0-9]+/g, "_");
//         }
//         const pdfName = `${fname || "Template"}_PerfectA4.pdf`;
//         storePdf.save(pdfName);
//       }
//     }

//     if (overlay && overlay.parentNode) {
//       overlay.parentNode.removeChild(overlay);
//       overlay = null;
//     }
//     try { if (exportFooterBanner && exportFooterBanner.parentNode) exportFooterBanner.parentNode.removeChild(exportFooterBanner); } catch(e){}

//     const langSummary = Object.entries(langCounts)
//       .map(([code, count]) => `${code.toUpperCase()}: ${count}`)
//       .join(", ");
//     const storeWord = storeGroups.length === 1 ? "store" : "stores";
//     alert(`✅ Downloaded ${totalPdfCount} PDFs for ${storeGroups.length} ${storeWord}.${langSummary ? `\nLanguages: ${langSummary}` : ""}`);

//   } catch (err) {
//     if (overlay && overlay.parentNode) {
//       overlay.parentNode.removeChild(overlay);
//       overlay = null;
//     }
//     console.error("downloadAllPerfectA4 error:", err);
//     alert("❌ Error in downloadAllPerfectA4: " + err.message);
//   }
// }



async function downloadAllPerfectA4() {

  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("jsPDF not loaded");
    return;
  }

  const { jsPDF } = window.jspdf;

  const templates = document.querySelectorAll(
    "#generatedTemplates [data-store-index], #templatesContainer [data-store-index]"
  );

  if (!templates.length) {
    alert("No generated templates found.");
    return;
  }

  for (let i = 0; i < templates.length; i++) {

    const box = templates[i];

      try {

      // make sure footer exists for this box (sync overlays + styles)
      syncFinalLayerFor(box);
      runFooterFixes(box);

      // If this box does not contain a `.store-address`, the editor may
      // be showing the default footer in a separate global node. In that
      // case, copy the global footer into the box temporarily so
      // html2canvas captures it.
      let _injectedTempFooter = null;
      try {
        const hasAddr = !!box.querySelector('.store-address');
        if (!hasAddr) {
          const globalFooter = document.querySelector('#templateBox #storeFooterName') || document.getElementById('storeFooterName') || document.getElementById('storeFooterNameFinal') || document.querySelector('#storeFooterName, #storeFooterNameFinal');
          if (globalFooter) {
            _injectedTempFooter = globalFooter.cloneNode(true);
            // ensure id uniqueness and expected id for export helpers
            try { _injectedTempFooter.id = 'storeFooterNameFinal'; } catch(e){}
            _injectedTempFooter.style.pointerEvents = 'none';
            _injectedTempFooter.classList.add('export-injected-footer');
            box.appendChild(_injectedTempFooter);
            // let layout settle
            await new Promise(r => setTimeout(r, 60));
          }
        }
      } catch(e) { console.warn('Failed to inject global footer into box for capture', e); }

      await new Promise(r => setTimeout(r, 120));

      // Instead of taking a DOM snapshot, render the A4 page directly
      // by drawing the chosen A4 background and composing any positioned
      // images and the footer text. This avoids html2canvas snapshot
      // issues and ensures the store address is drawn reliably.
      const A4_W = 2480, A4_H = 3508;
      const canvas = document.createElement('canvas');
      canvas.width = A4_W; canvas.height = A4_H;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff'; ctx.fillRect(0,0,A4_W,A4_H);

      // choose background image for this box
      let bgUrl = (typeof TEMPLATE_BG_DATA_URL !== 'undefined' && TEMPLATE_BG_DATA_URL) ? TEMPLATE_BG_DATA_URL : null;
      if (!bgUrl) {
        const variant = (box.dataset && box.dataset.variant) ? box.dataset.variant.toLowerCase() : '';
        if (variant === 'secondary' && typeof TEMPLATE_BG_SECONDARY !== 'undefined' && TEMPLATE_BG_SECONDARY) bgUrl = TEMPLATE_BG_SECONDARY;
        else if (variant === 'primary' && typeof TEMPLATE_BG_PRIMARY !== 'undefined' && TEMPLATE_BG_PRIMARY) bgUrl = TEMPLATE_BG_PRIMARY;
        else bgUrl = (typeof TEMPLATE_BG_PRIMARY !== 'undefined' && TEMPLATE_BG_PRIMARY) ? TEMPLATE_BG_PRIMARY : TEMPLATE_BG_SECONDARY || null;
      }

      let bgImage = null;
      if (bgUrl) {
        bgImage = await new Promise((res) => {
          const i = new Image();
          try { i.crossOrigin = 'anonymous'; } catch(e){}
          i.onload = () => res(i);
          i.onerror = () => res(null);
          i.src = bgUrl;
        });
      }

      if (bgImage && bgImage.width) {
        const ratio = Math.min(A4_W / bgImage.width, A4_H / bgImage.height);
        const drawW = Math.round(bgImage.width * ratio);
        const drawH = Math.round(bgImage.height * ratio);
        const dx = Math.round((A4_W - drawW) / 2);
        const dy = Math.round((A4_H - drawH) / 2);
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(bgImage, dx, dy, drawW, drawH);
      }

      // Draw any draggable images present in the box onto the canvas
      try {
        const logoImgs = Array.from(box.querySelectorAll('img.draggable, .draggable img')).filter(Boolean);
        if (logoImgs.length && bgImage) {
          const loadedImgs = await Promise.all(logoImgs.map(imgEl => new Promise(res => {
            try {
              const im = new Image();
              try { im.crossOrigin = 'anonymous'; } catch(e){}
              im.onload = () => res({ img: im, el: imgEl, ok: true });
              im.onerror = () => res({ img: null, el: imgEl, ok: false });
              im.src = imgEl.src || imgEl.getAttribute('src') || '';
            } catch (e) { res({ img: null, el: imgEl, ok: false }); }
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

              const scaleX = (bgImage && bgImage.width) ? ( (Math.min(A4_W / bgImage.width, A4_H / bgImage.height) * bgImage.width) / bgImage.width ) : 1;
              const drawX = Math.round(dx + relLeft * (drawW / (boxRect.width || 1)));
              const drawY = Math.round(dy + relTop * (drawW / (boxRect.width || 1)));
              const drawWidth  = Math.round(relW * (drawW / (boxRect.width || 1)));
              const drawHeight = Math.round(relH * (drawW / (boxRect.width || 1)));

              ctx.drawImage(im, drawX, drawY, drawWidth, drawHeight);
            } catch (e) { console.warn('Failed to draw logo on export canvas', e); }
          });
        }
      } catch (e) { console.warn('Error drawing draggable images for export', e); }

      // Determine footer text (box first, then global fallback) and mobile
      let footerText = '';
      let mobileText = '';
      try {
        const info = getFooterInfoFromBox(box) || {};
        footerText = (info.address || '').trim();
        mobileText = (info.mobile || '').trim();
        if (!footerText) {
          const gf = document.querySelector('#templateBox #storeFooterName') || document.getElementById('storeFooterName') || document.getElementById('storeFooterNameFinal') || document.querySelector('#storeFooterName, #storeFooterNameFinal');
          if (gf) footerText = (gf.textContent || '').trim();
        }
        if (!mobileText) {
          const mf = box.querySelector('.store-mobile') || document.querySelector('.store-mobile');
          if (mf) mobileText = (mf.textContent || '').trim();
        }
      } catch(e){ console.warn('Error resolving footer/mobile text for export', e); }

      // Draw footer text onto canvas
      try {
        const footerFullText = footerText || '';
        const len = footerFullText.length;
        let fontSize = 40;
        if (len <= 35) fontSize = 48; else if (len <= 60) fontSize = 44; else if (len <= 85) fontSize = 40; else fontSize = 36;
        ctx.font = `900 ${fontSize}px NotoSans, Arial, sans-serif`;
        ctx.fillStyle = '#000000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const footerRatioY = 0.92;
        const DPI_A4 = 300; const shiftMmA4 = 16; const shiftPxA4 = (shiftMmA4 * DPI_A4) / 25.4; const footerNudgeUpPx = 175;
        const rawFooterY = A4_H * footerRatioY + 50 + shiftPxA4;
        const cappedFooterY = Math.min(A4_H - 20, rawFooterY);
        // base footer Y position; we'll apply a small extra downward shift for downloaded PDF
        const footerY = Math.max(0, cappedFooterY - footerNudgeUpPx);
        // download-only shifts (px) to nudge the store address position in the exported PDF
        const downloadFooterShiftPx = 28; // vertical nudge downwards
        const downloadFooterShiftX = 44; // horizontal nudge to the left (increased slightly)
        const maxWidth = A4_W * 0.86;
        // wrap text if too wide
        function drawWrappedText(text, cx, y, maxW, lineHeight) {
          const words = String(text).split(' ');
          let line = '';
          let lines = [];
          for (let n=0;n<words.length;n++){
            const testLine = line ? (line + ' ' + words[n]) : words[n];
            const w = ctx.measureText(testLine).width;
            if (w > maxW && line) { lines.push(line); line = words[n]; }
            else { line = testLine; }
          }
          if (line) lines.push(line);
          const startY = y - ((lines.length-1)/2)*lineHeight;
          lines.forEach((ln, idx) => { ctx.fillText(ln, cx, startY + idx*lineHeight); });
        }
        // First attempt: render the live footer DOM (exact preview) into the A4 canvas
        // using an SVG foreignObject with inline computed styles. If that fails,
        // fall back to the single-line drawing logic below.
        let renderedFooterFromDOM = false;
        try {
          const footerDom = (box && box.querySelector) ? (box.querySelector('#storeFooterName') || box.querySelector('#storeFooterNameFinal')) : (document.querySelector('#storeFooterName') || document.querySelector('#storeFooterNameFinal'));
          if (footerDom) {
            // helper: serialize node with inline computed styles
            function inlineStylesClone(original) {
              const clone = original.cloneNode(true);
              try {
                const origNodes = Array.from(original.querySelectorAll('*'));
                const cloneNodes = Array.from(clone.querySelectorAll('*'));
                // inline root styles
                try { clone.setAttribute('style', getComputedStyle(original).cssText || ''); } catch(e){}
                for (let i = 0; i < cloneNodes.length; i++) {
                  try {
                    const cs = getComputedStyle(origNodes[i]);
                    if (cs && cs.cssText) cloneNodes[i].setAttribute('style', cs.cssText);
                  } catch (e) {}
                }
              } catch (e) { /* ignore */ }
              return clone;
            }

            function createSvgDataUrlFromElement(el) {
              const rect = el.getBoundingClientRect();
              const w = Math.max(1, Math.round(rect.width));
              const h = Math.max(1, Math.round(rect.height));
              const cloned = inlineStylesClone(el);
              // ensure XHTML wrapper
              const serialized = new XMLSerializer().serializeToString(cloned);
              const svg = `<?xml version="1.0" encoding="utf-8"?>\n` +
                `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'>` +
                `<foreignObject width='100%' height='100%'>` +
                `<div xmlns='http://www.w3.org/1999/xhtml'>${serialized}</div>` +
                `</foreignObject></svg>`;
              return { dataUrl: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg), w, h };
            }

            const footerRect = footerDom.getBoundingClientRect();
            const boxRect = box.getBoundingClientRect();
            const relLeft = (footerRect.left - boxRect.left);
            const relTop = (footerRect.top - boxRect.top);
            const drawX = Math.round(dx + relLeft * (drawW / (boxRect.width || 1)));
            const drawY = Math.round(dy + relTop * (drawW / (boxRect.width || 1)));
            const drawWidth = Math.max(1, Math.round(footerRect.width * (drawW / (boxRect.width || 1))));
            const drawHeight = Math.max(1, Math.round(footerRect.height * (drawW / (boxRect.width || 1))));

            try {
                const { dataUrl, w, h } = createSvgDataUrlFromElement(footerDom);
                const img = new Image();
                try { img.crossOrigin = 'anonymous'; } catch(e){}
                await new Promise(res => { img.onload = res; img.onerror = res; img.src = dataUrl; });
                // center the rendered footer horizontally, then shift it a bit left and nudge down for the PDF
                const centeredX = Math.round((A4_W - drawWidth) / 2) - (typeof downloadFooterShiftX === 'number' ? downloadFooterShiftX : 0);
                const nudgedY = Math.round(drawY + downloadFooterShiftPx);
                ctx.drawImage(img, centeredX, nudgedY, drawWidth, drawHeight);
                // update footerY used by the single-line fallback to keep positions consistent
                // (so the single-line renderer uses the same downward nudged Y)
                // Note: we don't override footerY variable globally; single-line will add downloadFooterShiftPx where used.
              renderedFooterFromDOM = true;
            } catch (e) {
              console.warn('Rendering footer DOM into canvas failed, falling back', e);
            }
          }
        } catch(e) { console.warn('Footer DOM render attempt failed', e); }

        // Try to draw everything on a single centered line: address | (icon) mobile
        try {
          const sep = ' | ';
          const originalFooter = footerFullText;
          const phone = mobileText || '';
          // choose initial font sizes (in canvas px). Prefer computed DOM styles when available
          let footerFontSize = fontSize;
          // make mobile font slightly larger to match preview
          let phoneFontSize = Math.max(30, Math.round(fontSize * 1.05));
          // use default canvas-calculated font sizes (do not override with live DOM computed styles)
          // footerFontSize and phoneFontSize remain as initialized above.

          // helper to measure total width for given sizes
          function measureTotalWidth(fSize, pSize, iconSize, gap) {
            ctx.font = `900 ${fSize}px NotoSans, Arial, sans-serif`;
            const fw = ctx.measureText(originalFooter).width;
            ctx.font = `700 ${pSize}px NotoSans, Arial, sans-serif`;
            const pw = ctx.measureText(phone).width;
            ctx.font = `900 ${fSize}px NotoSans, Arial, sans-serif`;
            const sw = ctx.measureText(sep).width;
            return { total: fw + sw + iconSize + gap + pw, fw, sw, pw };
          }

          if (!renderedFooterFromDOM && phone) {
            // initial icon size and gap
            let gap = 8;
            let iconSize = Math.round(phoneFontSize * 1.6);
            // measure and reduce sizes until it fits maxWidth
            let m = measureTotalWidth(footerFontSize, phoneFontSize, iconSize, gap);
            const minFooterSize = 16; const minPhoneSize = 14;
            while (m.total > maxWidth && (footerFontSize > minFooterSize || phoneFontSize > minPhoneSize)) {
              if (footerFontSize > minFooterSize) footerFontSize = Math.max(minFooterSize, Math.round(footerFontSize * 0.94));
              if (phoneFontSize > minPhoneSize) phoneFontSize = Math.max(minPhoneSize, Math.round(phoneFontSize * 0.94));
              iconSize = Math.round(phoneFontSize * 1.25);
              m = measureTotalWidth(footerFontSize, phoneFontSize, iconSize, gap);
              // break safety
              if (footerFontSize <= minFooterSize && phoneFontSize <= minPhoneSize) break;
            }

            // determine start X to center the entire group
            const startX = Math.round((A4_W - m.total) / 2) - (typeof downloadFooterShiftX === 'number' ? downloadFooterShiftX : 0);
            const lineY = footerY + (typeof downloadFooterShiftPx === 'number' ? downloadFooterShiftPx : 0); // nudge down for PDF

            // draw footer
            ctx.font = `900 ${footerFontSize}px NotoSans, Arial, sans-serif`;
            ctx.fillStyle = '#000000'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
            ctx.fillText(originalFooter, startX, lineY);

            // draw separator as text using the same font as the mobile number
            const sepX = startX + m.fw;
            try {
              // draw separator as a thin vertical bar (thin per user request)
              const sepWidth = Math.max(4, Math.round(iconSize * 0.12));
              // shorten separator height for download A4 (slightly increased per request)
              const sepHeight = Math.max(8, Math.round(iconSize * 0.8));
              const sepLeft = Math.round(sepX + (m.sw - sepWidth) / 2);
              ctx.fillStyle = '#000000';
              ctx.fillRect(sepLeft, Math.round(lineY - sepHeight / 2), sepWidth, sepHeight);
            } catch (e) {
              // fallback: draw text separator
              try {
                ctx.fillStyle = '#000000';
                ctx.font = `700 ${phoneFontSize}px NotoSans, Arial, sans-serif`;
                const sepMeasured = ctx.measureText(sep).width;
                const sepDrawX = Math.round(sepX + (m.sw - sepMeasured) / 2);
                ctx.fillText(sep, sepDrawX, lineY);
              } catch (err) { /* ignore */ }
            }

            // draw icon
            const iconX = Math.round(sepX + m.sw);
            try {
              // Prefer the actual contact icon used in the preview (inline SVG or img),
              // but for A4 downloads default to a black circular background with a white handset.
              let iconSrc = null;
              try {
                const contactEl = (box && box.querySelector) ? (box.querySelector('.contact-icon') || document.querySelector('.contact-icon')) : document.querySelector('.contact-icon');
                if (contactEl) {
                  // Prefer inline SVG present in preview (keeps exact colors/styles)
                  const svgEl = contactEl.querySelector && contactEl.querySelector('svg');
                  const imgEl = contactEl.querySelector && contactEl.querySelector('img');
                  if (svgEl) {
                    try {
                      const svgXml = new XMLSerializer().serializeToString(svgEl);
                      iconSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgXml);
                    } catch (e) { /* fallthrough */ }
                  }
                  // If no inline svg, prefer an <img> src from the preview
                  if (!iconSrc && imgEl && imgEl.src) {
                    iconSrc = imgEl.src;
                  }
                }
                // If still nothing, but we have the globally-fetched SVG text, use it
                if (!iconSrc && typeof CONTACT_ICON_SVG === 'string' && CONTACT_ICON_SVG) {
                  try {
                    iconSrc = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(CONTACT_ICON_SVG);
                  } catch(e) { /* ignore */ }
                }
              } catch (e) { /* ignore */ }
              // build download-specific icon with black background + white handset
              function createDownloadContactSvg(bgColor = '#000000') {
                const safeColor = String(bgColor || '#000000').replace(/"/g, '');
                const stroke = '#000000';
                const handset = '#ffffff';
                const svgContent = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n  <circle cx="12" cy="12" r="10" fill="${safeColor}" stroke="${stroke}" stroke-width="0"/>\n  <path fill="${handset}" d="M6.62 10.79a15.466 15.466 0 006.59 6.59l2.2-2.2a1 1 0 011.11-.24c.96.39 2.06.76 3.06.76a1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h2.5a1 1 0 011 1c.01.24.09.47.22.68.18.3.47.56.85.78.47.27 1.08.56 1.86.66.5.07.88.38 1.02.86.12.41.04.84-.25 1.18l-2.2 2.2z"/>\n</svg>`;
                return 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
              }
              // Prefer using the live inline SVG from the preview so the download
              // visually matches the preview. We serialize the DOM SVG (or
              // the fetched CONTACT_ICON_SVG) and wrap it with a black circular
              // background and force the handset paths to white. If that fails,
              // fall back to the deterministic generated black badge.
              iconSrc = null;
              try {
                const domSvg = box.querySelector('.contact-icon svg');
                if (domSvg) {
                  try {
                    const inner = domSvg.innerHTML;
                    const vb = domSvg.getAttribute('viewBox') || '0 0 24 24';
                    const svgContent = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n  <circle cx="12" cy="12" r="12" fill="#000"/>\n  <g fill="#ffffff" stroke="#ffffff">${inner}</g>\n</svg>`;
                    iconSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
                  } catch(e) { iconSrc = null; }
                }
              } catch(e) { /* ignore */ }

              if (!iconSrc && typeof CONTACT_ICON_SVG === 'string' && CONTACT_ICON_SVG) {
                try {
                  const parser = new DOMParser();
                  const doc = parser.parseFromString(CONTACT_ICON_SVG, 'image/svg+xml');
                  const svgEl = doc.querySelector('svg');
                  const vb = (svgEl && svgEl.getAttribute('viewBox')) ? svgEl.getAttribute('viewBox') : '0 0 24 24';
                  // strip outer <svg> so we can wrap inner content
                  const inner = CONTACT_ICON_SVG.replace(/<\/?svg[^>]*>/g, '');
                  const svgContent = `<?xml version="1.0" encoding="utf-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}">\n  <circle cx="12" cy="12" r="12" fill="#000"/>\n  <g fill="#ffffff" stroke="#ffffff">${inner}</g>\n</svg>`;
                  iconSrc = 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(svgContent)));
                } catch(e) { iconSrc = null; }
              }

              if (!iconSrc) iconSrc = createDownloadContactSvg('#000000');

              const iconImg = new Image();
              try { iconImg.crossOrigin = 'anonymous'; } catch(e){}
              await new Promise(res => { iconImg.onload = res; iconImg.onerror = res; iconImg.src = iconSrc; });
              ctx.drawImage(iconImg, iconX, Math.round(lineY - iconSize/2), iconSize, iconSize);
            } catch (e) {
              console.warn('Failed to draw contact icon for export', e);
            }

            // draw phone text
            const phoneX = iconX + iconSize + gap;
            ctx.font = `900 ${phoneFontSize}px NotoSans, Arial, sans-serif`;
            ctx.fillStyle = '#000000';
            ctx.fillText(phone, phoneX, lineY);

            // restore center alignment
            ctx.textAlign = 'center';
          }
        } catch(e){ console.warn('Error drawing single-line footer+phone onto export canvas', e); }
      } catch(e){ console.warn('Error drawing footer onto export canvas', e); }

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p','mm','a4');
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297);

      // filename from store address
      let name = "Template";

      const addrEl = box.querySelector(".store-address");

      if (addrEl && addrEl.textContent.trim()) {
        name = addrEl.textContent
          .trim()
          .substring(0, 40)
          .replace(/[^a-zA-Z0-9]+/g, "_");
      }

      pdf.save(`${name}_PerfectA4.pdf`);

      // cleanup injected footer if we added one
      try { if (_injectedTempFooter && _injectedTempFooter.parentNode) _injectedTempFooter.parentNode.removeChild(_injectedTempFooter); } catch(e){}

    } catch (err) {

      console.error("Download error", err);

    }

  }

  alert("✅ All templates downloaded");

}
































































