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

document.getElementById("bgUpload").addEventListener("change", function(e){
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => { templateBox.style.backgroundImage = `url(${ev.target.result})`; };
  reader.readAsDataURL(file);
});

function applyColor(){
  const color = document.getElementById("bgColor").value;
  templateBox.style.backgroundImage = "";
  templateBox.style.backgroundColor = color;
}

document.getElementById("logoUpload").addEventListener("change", function(e){
  const file = e.target.files[0];
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const logo = document.createElement("img");
    logo.src = ev.target.result;
    logo.className = "draggable";
    logo.style.width = "150px";
    logo.style.height = "auto";
    logo.style.top = "20px";
    logo.style.left = "20px";
    templateBox.appendChild(logo);
    makeDraggable(logo);
  };
  reader.readAsDataURL(file);
});

function applyCombinedColor(){
  const color = document.getElementById("combinedColor").value;
  const storeName = document.getElementById("storeFooterName");
  if(storeName) storeName.style.color = color;
}

/* ---------- Contact SVG inlining helper ---------- */

// Embedded base64 SVG for contact icon
const CONTACT_ICON_BASE64 = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2ZXJzaW9uPSIxLjEiIGlkPSJMYXllcl8xIiB4PSIwcHgiIHk9IjBweCIgd2lkdGg9IjEwMCUiIHZpZXdCb3g9IjAgMCA4MjAgODYxIiBlbmFibGUtYmFja2dyb3VuZD0ibmV3IDAgMCA4MjAgODYxIiB4bWw6c3BhY2U9InByZXNlcnZlIj4NCjxwYXRoIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjEuMDAwMDAwIiBzdHJva2U9Im5vbmUiIGQ9IiBNNDI1LjAwMDAwMCw4NjIuMDAwMDAwICAgQzI4My4zMzMzNzQsODYyLjAwMDAwMCAxNDIuMTY2NzQ4LDg2Mi4wMDAwMDAgMS4wMDAwOTUsODYyLjAwMDAwMCAgIEMxLjAwMDA2Myw1NzUuMDAwMTIyIDEuMDAwMDYzLDI4OC4wMDAyNDQgMS4wMDAwMzIsMS4wMDAyODcgICBDMjc0LjMzMzEzMCwxLjAwMDE5MSA1NDcuNjY2MjYwLDEuMDAwMTkxIDgyMC45OTk1MTIsMS4wMDAwOTYgICBDODIwLjk5OTY5NSwyODcuOTk5NzI1IDgyMC45OTk2OTUsNTc0Ljk5OTQ1MSA4MjAuOTk5ODc4LDg2MS45OTk1NzMgICBDNjg5LjE2NjY4Nyw4NjIuMDAwMDAwIDU1Ny4zMzMzMTMsODYyLjAwMDAwMCA0MjUuMDAwMDAwLDg2Mi4wMDAwMDAgIE00NTQuMDI5MDUzLDgzOS42NDE0NzkgICBDNDczLjAwMTAzOCw4MzYuMTIzNjU3IDQ5Mi4yMjc2NjEsODMzLjYxOTY5MCA1MTAuOTA0OTM4LDgyOC45Mjg0NjcgICBDNjY3LjgwMDUzNyw3ODkuNTIxMDU3IDc4Ni43OTUyMjcsNjU2LjA4NTI2NiA4MDcuODU2Njg5LDQ5NS4yNzAyNjQgICBDODE2LjUxOTcxNCw0MjkuMTIzMTk5IDgwOS40MTA5NTAsMzY0LjQxOTQ5NSA3ODYuMDI2MzY3LDMwMS41NzYyNjMgICBDNzIxLjA3NDI4MCwxMjcuMDI1MzA3IDU0Mi40NjA4NzYsMTguOTI0MTkyIDM1NC4xOTg0ODYsNDYuMDAyNTIyICAgQzI3My4wMzAwMjksNTcuNjc3MjEyIDIwMS4wMDI4MjMsOTAuMjE4NzE5IDE0MS4yNzQzMjMsMTQ2LjczNzI0NCAgIEMzMS4wMTg1NjIsMjUxLjA2NzU4MSAtOS44NzA2MjksMzc5LjA5NzcxNyAyMC4zNTAxODUsNTI3LjM4MjY5MCAgIEM1My44NjkyOTcsNjkxLjg1MTQ0MCAxOTIuODY3MTU3LDgxNy41MTQzNDMgMzU5Ljc3MTk0Miw4MzguODYzMjIwICAgQzM5MC44MDM4MDIsODQyLjgzMjUyMCA0MjEuOTczOTk5LDg0MS41NTc5MjIgNDU0LjAyOTA1Myw4MzkuNjQxNDc5ICB6Ii8+DQo8cGF0aCBmaWxsPSIjMDAwMDAwIiBvcGFjaXR5PSIxLjAwMDAwMCIgc3Ryb2tlPSJub25lIiBkPSIgTTQ1My41NjczNTIsODM5LjY3NzEyNCAgIEM0MjEuOTczOTk5LDg0MS41NTc5MjIgMzkwLjgwMzgwMiw4NDIuODMyNTIwIDM1OS43NzE5NDIsODM4Ljg2MzIyMCAgIEMxOTIuODY3MTU3LDgxNy41MTQzNDMgNTMuODY5Mjk3LDY5MS44NTE0NDAgMjAuMzUwMTg1LDUyNy4zODI2OTAgICBDLTkuODcwNjI5LDM3OS4wOTc3MTcgMzEuMDE4NTYyLDI1MS4wNjc1ODEgMTQxLjI3NDMyMywxNDYuNzM3MjQ0ICAgQzIwMS4wMDI4MjMsOTAuMjE4NzE5IDI3My4wMzAwMjksNTcuNjc3MjEyIDM1NC4xOTg0ODYsNDYuMDAyNTIyICAgQzU0Mi40NjA4NzYsMTguOTI0MTkyIDcyMS4wNzQyODAsMTI3LjAyNTMwNyA3ODYuMDI2MzY3LDMwMS41NzYyNjMgICBDODA5LjQxMDk1MCwzNjQuNDE5NDk1IDgxNi41MTk3MTQsNDI5LjEyMzE5OSA4MDcuODU2Njg5LDQ5NS4yNzAyNjQgICBDNzg2Ljc5NTIyNyw2NTYuMDg1MjY2IDY2Ny44MDA1MzcsNzg5LjUyMTA1NyA1MTAuOTA0OTM4LDgyOC45Mjg0NjcgICBDNDkyLjIyNzY2MSw4MzMuNjE5NjkwIDQ3My4wMDEwMzgsODM2LjEyMzY1NyA0NTMuNTY3MzUyLDgzOS42NzcxMjQgIE0zOTEuODYyMDkxLDU0NC42MzQ1MjEgICBDMzU1LjI2ODI4MCw1MDMuNDI1MTEwIDMyNi45MjgxOTIsNDU2LjkzNTM2NCAzMDQuMjY1NTY0LDQwNi44OTU0NDcgICBDMjk4LjUwMzYzMiwzOTQuMTcyOTQzIDI5My40Nzc5NjYsMzgxLjA2Njg5NSAyOTMuMzA5OTA2LDM2Ni42OTU4NjIgICBDMjkzLjIxNTI0MCwzNTguNTk3MjYwIDI5Ni4wNTE1NDQsMzUxLjkxOTU4NiAzMDIuNjY0MDAxLDM0Ny4yOTE3MTggICBDMzA4LjEwMzE0OSwzNDMuNDg1MDE2IDMxMy44MDIxNTUsMzM5Ljk4ODQ2NCAzMTkuNjQyNjA5LDMzNi44Mjg3OTYgICBDMzMyLjU2MDgyMiwzMjkuODQwMTQ5IDM0NS4xMTIwMzAsMzIyLjUxMzU4MCAzNTUuOTIwMTA1LDMxMi4yNjgwNjYgICBDMzYwLjk2NDIwMywzMDcuNDg2NTQyIDM2Mi44Mjc2MDYsMzAzLjEwNzU0NCAzNjIuMzI4Nzk2LDI5Ni4wMTI3ODcgICBDMzYwLjI5MDI4MywyNjcuMDE3OTE0IDM1MC45Njk4MTgsMjQwLjYzNTcxMiAzMzQuOTM0NjAxLDIxNi42OTM0MjAgICBDMzMwLjY5MDc2NSwyMTAuMzU2OTE4IDMyNC44OTEwODMsMjA0LjQzMDcyNSAzMTguNTI2NTgxLDIwMC4yNzU0OTcgICBDMzA0LjU2NDIwOSwxOTEuMTU5ODk3IDI4Ny42MzkyMjEsMTkyLjY5MTA0MCAyNzMuNTY3ODcxLDIwNC42MzI0NjIgICBDMjYzLjk4OTY4NSwyMTIuNzYwODY0IDI1NS4yMTgxNTUsMjIyLjExMDgyNSAyNDcuMzUzNjIyLDIzMS45Mjk5MzIgICBDMjMxLjk5ODg3MSwyNTEuMTAwNzU0IDIyMS4yOTY5NTEsMjcyLjUxMDI1NCAyMTkuOTcyMjI5LDI5Ny43MDk1NjQgICBDMjE4LjIyNTA1MiwzMzAuOTQ1MDY4IDIyMS43OTM5MTUsMzYzLjU5Njk4NSAyMzAuOTA2OTgyLDM5NS41Nzc1NzYgICBDMjQ2Ljg3NDg5Myw0NTEuNjEzODYxIDI3My4yNTY2MjIsNTAyLjU3Nzg1MCAzMDcuMzQ5MTgyLDU0OS41OTEzMDkgICBDMzM4LjIyMjQ3Myw1OTIuMTY1NDY2IDM3NC40NDI1OTYsNjI5LjM4NzIwNyA0MTkuMzIyMTQ0LDY1Ny40NDUxOTAgICBDNDQ1LjI1MjA3NSw2NzMuNjU2MTI4IDQ3Mi41Njk2MTEsNjg2LjI1MDczMiA1MDMuNzU0MDU5LDY4OC41MjY3MzMgICBDNTM4LjAyNjYxMSw2OTEuMDI4MDc2IDU2Ni45MTgyNzQsNjc5LjI3NTQ1MiA1OTEuMTY3NjAzLDY1NS43MTY3OTcgICBDNjA0Ljg2OTYyOSw2NDIuNDA1MDkwIDYwNi41MzUyNzgsNjI4LjkwOTYwNyA1OTYuNzg5Nzk1LDYxMy4zNjE1NzIgICBDNTg1LjIxNDQ3OCw1OTQuODk0MDQzIDU3MS4wMDU2MTUsNTc4LjU4NjMwNCA1NTMuNzYzMzY3LDU2NS4xMDYyNjIgICBDNTMzLjgxMjI1Niw1NDkuNTA4MzYyIDUxMi41NTM0MDYsNTQ3LjcyOTE4NyA0OTEuMTAzMDg4LDU2MS4xNjQzMDcgICBDNDc5LjE2NzYwMyw1NjguNjM5OTU0IDQ2OC4zMjUyNTYsNTc3Ljg4MDI0OSA0NTcuMTEzMzEyLDU4Ni40ODU1OTYgICBDNDQ3LjQwMjAzOSw1OTMuOTM5MjA5IDQ0Ni45MTAxODcsNTk0LjY5OTg5MCA0MzcuNTczMjQyLDU4Ni42NjQ0OTAgICBDNDIyLjA3MDg2Miw1NzMuMzIzMTIwIDQwNy4zODE1MzEsNTU5LjAzNjk4NyAzOTEuODYyMDkxLDU0NC42MzQ1MjEgIHoiLz4NCjxwYXRoIGZpbGw9IiNmZmZmZmYiIG9wYWNpdHk9IjEuMDAwMDAwIiBzdHJva2U9Im5vbmUiIGQ9IiBNMzkyLjEwNTg5Niw1NDQuODkxNjYzICAgQzQwNy4zODE1MzEsNTU5LjAzNjk4NyA0MjIuMDcwODYyLDU3My4zMjMxMjAgNDM3LjU3MzI0Miw1ODYuNjY0NDkwICAgQzQ0Ni45MTAxODcsNTk0LjY5OTg5MCA0NDcuNDAyMDM5LDU5My45Mzk2MjA5IDQ1Ny4xMTMzMTIsNTg2LjQ4NTU5NiAgIEM0NjguMzI1MjU2LDU3Ny44ODAyNDkgNDc5LjE2NzYwMyw1NjguNjM5OTU0IDQ5MS4xMDMwODgsNTYxLjE2NDMwNyAgIEM1MTIuNTUzNDA2LDU0Ny43MjkxODcgNTMzLjgxMjI1Niw1NDkuNTA4MzYyIDU1My43NjMzNjcsNTY1LjEwNjI2MiAgIEM1NzEuMDA1NjE1LDU3OC41ODYzMDQgNTg1LjIxNDQ3OCw1OTQuODk0MDQzIDU5Ni43ODk3OTUsNjEzLjM2MTU3MiAgIEM2MDYuNTM1Mjc4LDYyOC45MDk2MDcgNjA0Ljg2OTYyOSw2NDIuNDA1MDkwIDU5MS4xNjc2MDMsNjU1LjcxNjc5NyAgIEM1NjYuOTE4Mjc0LDY3OS4yNzU0NTIgNTM4LjAyNjYxMSw2OTEuMDI4MDc2IDUwMy43NTQwNTksNjg4LjUyNjczMyAgIEM0NzIuNTY5NjExLDY4Ni4yNTA3MzIgNDQ1LjI1MjA3NSw2NzMuNjU2MTI4IDQxOS4zMjIxNDQsNjU3LjQ0NTE5MCAgIEMzNzQuNDQyNTk2LDYyOS4zODcyMDcgMzM4LjIyMjQ3Myw1OTIuMTY1NDY2IDMwNy4zNDkxODIsNTQ5LjU5MTMwOSAgIEMyNzMuMjU2NjIyLDUwMi41Nzc4NTAgMjQ2Ljg3NDg5Myw0NTEuNjEzODYxIDIzMC45MDY5ODIsMzk1LjU3NzU3NiAgIEMyMjEuNzkzOTE1LDM2My41OTY5ODUgMjE4LjIyNTA1MiwzMzAuOTQ1MDY4IDIxOS45NzIyMjksMjk3LjcwOTU2NCAgIEMyMjEuMjk2OTUxLDI3Mi41MTAyNTQgMjMxLjk5ODg3MSwyNTEuMTAwNzU0IDI0Ny4zNTM2MjIsMjMxLjkyOTkzMiAgIEMyNTUuMjE4MTU1LDIyMi4xMTA4MjUgMjYzLjk4OTY4NSwyMTIuNzYwODY0IDI3My41Njc4NzEsMjA0LjYzMjQ2MiAgIEMyODcuNjM5MjIxLDE5Mi42OTEwNDAgMzA0LjU2NDIwOSwxOTEuMTU5ODk3IDMxOC41MjY1ODEsMjAwLjI3NTQ5NyAgIEMzMjQuODkxMDgzLDIwNC40MzA3MjUgMzMwLjY5MDc2NSwyMTAuMzU2OTE4IDMzNC45MzQ2MDEsMjE2LjY5MzQyMCAgIEMzNTAuOTY5ODE4LDI0MC42MzU3MTIgMzYwLjI5MDI4MywyNjcuMDE3OTE0IDM2Mi4zMjg3OTYsMjk2LjAxMjc4NyAgIEMzNjIuODI3NjA2LDMwMy4xMDc1NDQgMzYwLjk2NDIwMywzMDcuNDg2NTQyIDM1NS45MjAxMDUsMzEyLjI2ODA2NiAgIEMzNDUuMTExMjAzLDMyMi41MTM1ODAgMzMyLjU2MDgyMiwzMjkuODQwMTQ5IDMxOS42NDI2MDksMzM2LjgyODc5NiAgIEMzMTMuODAyMTU1LDMzOS45ODg0NjQgMzA4LjEwMzE0OSwzNDMuNDg1MDE2IDMwMi42NjQwMDEsMzQ3LjI5MTcxOCAgIEMyOTYuMDUxNTQ0LDM1MS45MTk1ODYgMjkzLjIxNTI0MCwzNTguNTk3MjYwIDI5My4zMDk5MDYsMzY2LjY5NTg2MiAgIEMyOTMuNDc3OTY2LDM4MS4wNjY4OTUgMjk4LjUwMzYzMiwzOTQuMTcyOTQzIDMwNC4yNjU1NjQsNDA2Ljg5NTQ0NyAgIEMzMjYuOTI4MTkyLDQ1Ni45MzUzNjQgMzU1LjI2ODI4MCw1MDMuNDI1MTEwIDM5Mi4xMDU4OTYsNTQ0Ljg5MTY2MyAgeiIvPg0KPC9zdmc+DQ==';

// Global helper: create colored contact SVG with colored ring + white phone
function createColoredContactSvg(bgColor) {
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 820 861">
<path fill="#ffffff" opacity="1" stroke="none" d="M425,862C283.333,862 142.167,862 1,862C1,575 1,288 1,1C274.333,1 547.666,1 821,1C821,288 821,575 821,862C689.167,862 557.333,862 425,862M454.029,839.641C473.001,836.124 492.228,833.62 510.905,828.928C667.801,789.521 786.795,656.085 807.857,495.27C816.52,429.123 809.411,364.419 786.026,301.576C721.074,127.025 542.461,18.924 354.198,46.003C273.03,57.677 201.003,90.219 141.274,146.737C31.019,251.068 -9.871,379.098 20.35,527.383C53.869,691.851 192.867,817.514 359.772,838.863C390.804,842.833 421.974,841.558 454.029,839.641z"/>
<path fill="${bgColor}" opacity="1" stroke="none" d="M453.567,839.677C421.974,841.558 390.804,842.833 359.772,838.863C192.867,817.514 53.869,691.851 20.35,527.383C-9.871,379.098 31.019,251.068 141.274,146.737C201.003,90.219 273.03,57.677 354.198,46.003C542.461,18.924 721.074,127.025 786.026,301.576C809.411,364.419 816.52,429.123 807.857,495.27C786.795,656.085 667.801,789.521 510.905,828.928C492.228,833.62 473.001,836.124 453.567,839.677M391.862,544.635C355.268,503.425 326.928,456.935 304.266,406.895C298.504,394.173 293.478,381.067 293.31,366.696C293.215,358.597 296.052,351.92 302.664,347.292C308.103,343.485 313.802,339.988 319.643,336.829C332.561,329.84 345.112,322.514 355.92,312.268C360.964,307.487 362.828,303.108 362.329,296.013C360.29,267.018 350.97,240.636 334.935,216.693C330.691,210.357 324.891,204.431 318.527,200.275C304.564,191.16 287.639,192.691 273.568,204.632C263.99,212.761 255.218,222.111 247.354,231.93C231.999,251.101 221.297,272.51 219.972,297.71C221.297,272.51 231.999,251.101 247.354,231.93C255.218,222.111 263.99,212.761 273.568,204.632C287.639,192.691 304.564,191.16 318.527,200.275C324.891,204.431 330.691,210.357 334.935,216.693C350.97,240.636 360.29,267.018 362.329,296.013C362.828,303.108 360.964,307.487 355.92,312.268C345.112,322.514 332.561,329.84 319.643,336.829C313.802,339.988 308.103,343.485 302.664,347.292C296.052,351.92 293.215,358.597 293.31,366.696C293.478,381.067 298.504,394.173 304.266,406.895C326.928,456.935 355.268,503.425 391.862,544.635z"/>
<path fill="#ffffff" opacity="1" stroke="none" d="M392.106,544.892C407.382,559.037 422.071,573.323 437.573,586.664C446.91,594.7 447.402,593.939 457.113,586.486C468.325,577.88 479.168,568.64 491.103,561.164C512.553,547.729 533.812,549.508 553.763,565.106C571.006,578.586 585.214,594.894 596.79,613.362C606.535,628.91 604.87,642.405 591.168,655.717C566.918,679.275 538.027,691.028 503.754,688.527C472.57,686.251 445.252,673.656 419.322,657.445C374.443,629.387 338.222,592.165 307.349,549.591C273.257,502.578 246.875,451.614 230.907,395.578C221.794,363.597 218.225,330.945 219.972,297.71C221.297,272.51 231.999,251.101 247.354,231.93C255.218,222.111 263.99,212.761 273.568,204.632C287.639,192.691 304.564,191.16 318.527,200.275C324.891,204.431 330.691,210.357 334.935,216.693C350.97,240.636 360.29,267.018 362.329,296.013C362.828,303.108 360.964,307.487 355.92,312.268C345.112,322.514 332.561,329.84 319.643,336.829C313.802,339.988 308.103,343.485 302.664,347.292C296.052,351.92 293.215,358.597 293.31,366.696C293.478,381.067 298.504,394.173 304.266,406.895C326.928,456.935 355.268,503.425 392.106,544.892z"/>
</svg>`;
  return 'data:image/svg+xml;base64,' + btoa(svgContent);
}

async function inlineSvgAsDataUrl(imgSelector) {
  // Use the embedded base64 SVG
  document.querySelectorAll(imgSelector).forEach(img => {
    img.setAttribute('src', CONTACT_ICON_BASE64);
  });
  console.log('Inlined SVG from embedded base64');
  return true;
}

/* ---------- Footer and color functions ---------- */
function updateFooterInfo() {
  const storeNameVal = document.getElementById("footerName").value.trim() || "Store Name";
  const whatsappVal = document.getElementById("footerWhatsApp").value.trim();
  const separator = `<span class="separator">|</span>`;
  const contactLogo = `<span class="contact-icon"><img src="/static/images/contact-logo.svg" alt="phone"></span>`;

  let footerHTML = `<span class="store-address">${escapeHtml(storeNameVal)}</span>`;
  if (whatsappVal) {
    footerHTML += `${separator}${contactLogo}<span class="store-mobile">${escapeHtml(whatsappVal)}</span>`;
  }

  const footerEl = document.getElementById("storeFooterName");
  if (footerEl) {
    footerEl.innerHTML = footerHTML;
    footerEl.style.display = "inline-flex";
    footerEl.style.alignItems = "center";
    footerEl.style.justifyContent = "center";
    footerEl.style.whiteSpace = "nowrap";
    footerEl.style.pointerEvents = "none";
  }

  setTimeout(() => {
    adjustFooterFontSize();
    adjustFooterPosition();
  }, 40);
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

    addr.style.setProperty('white-space', 'nowrap', 'important');
    addr.style.setProperty('display', 'inline', 'important');

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

function applyColors(){
  const storeNameColor = document.getElementById("storeNameColor").value;
  const storeName = document.getElementById("storeFooterName");
  if (storeName) storeName.style.color = storeNameColor;

  document.querySelectorAll('.store-mobile').forEach(m => m.style.color = '#000');
}

function applyFooterColor(){
  const c = document.getElementById("footerTextColor").value;
  document.querySelectorAll(".store-address, .separator, .store-mobile").forEach(el => {
    el.style.setProperty('color', c, 'important');
    el.style.fontWeight = "600";
  });
  document.querySelectorAll("#storeFooterName, #storeFooterNameFinal").forEach(el => {
    el.style.setProperty('color', c, 'important');
  });

  document.querySelectorAll(".contact-icon").forEach(icon => {
    icon.style.setProperty('color', c, 'important');
    const phoneImg = icon.querySelector('img, svg');
    if (phoneImg) {
      phoneImg.style.filter = 'brightness(0) invert(1)';
      phoneImg.style.color = '#fff';
      if (phoneImg.tagName.toLowerCase() === 'svg') {
        phoneImg.setAttribute('fill', '#fff');
      }
    }
  });
  
  document.querySelectorAll(".contact-icon").forEach(icon => {
    icon.style.setProperty('color', c, 'important');
    const img = icon.querySelector('img');
    if (img) {
      img.src = createColoredContactSvg(c) + `#${Date.now()}`;
      img.style.removeProperty('filter');
    }
  });
}

/* ---------- Footer position ---------- */
function adjustFooterPosition(){
  const footers = document.querySelectorAll("#storeFooterName, #storeFooterNameFinal");
  footers.forEach(footer => {
    const textLength = footer.textContent.trim().length;
    
    if (textLength < 80) footer.style.bottom = "38px";
    else if (textLength < 128) footer.style.bottom = "29px";
    else footer.style.bottom = "28px";
    
    footer.style.left = '50%';
    footer.style.transform = 'translateX(-50%)';
    footer.style.textAlign = 'center';
    footer.style.maxWidth = '95%';
  });
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
    footerFinal.style.bottom = "30px";
    footerFinal.style.left = "50%";
    footerFinal.style.transform = "translateX(-50%)";
    footerFinal.style.zIndex = 20;
    footerFinal.style.pointerEvents = "none";
    box.appendChild(footerFinal);
  }

  const editorFooter = box.querySelector("#storeFooterName") || document.getElementById("storeFooterName");
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
    const sep = document.createElement("span");
    sep.className = "separator";
    sep.textContent = " | ";
    const spanPhone = document.createElement("span");
    spanPhone.className = "store-mobile";
    spanPhone.textContent = phoneText;
    footerFinal.appendChild(sep);
    footerFinal.appendChild(spanPhone);
  }

  ensureContactIconAfterSeparator(box);
}

function cloneExactFooter(sourceBox, targetBox) {
  const src = sourceBox.querySelector("#storeFooterName");
  const dst = targetBox.querySelector("#storeFooterNameFinal");

  if (!src || !dst) return;

  dst.innerHTML = src.innerHTML;
  dst.className = src.className;
  dst.style.cssText = src.style.cssText;

  dst.style.left = src.style.left;
  dst.style.bottom = src.style.bottom;
  dst.style.transform = src.style.transform;

  dst.style.display = "inline-flex";
  dst.style.alignItems = "center";
  dst.style.justifyContent = "center";
  dst.style.whiteSpace = "nowrap";
}

function ensureContactIconAfterSeparator(container = document) {
  const footers = container.querySelectorAll('#storeFooterName, #storeFooterNameFinal');
  footers.forEach(f => {
    const sep = f.querySelector('.separator');
    let icon = f.querySelector('.contact-icon');
    if (!sep) return;
    if (icon) {
      const next = sep.nextElementSibling;
      if (next !== icon) {
        sep.insertAdjacentElement('afterend', icon);
      }
      return;
    }
    icon = document.createElement('span');
    icon.className = 'contact-icon';
    icon.innerHTML = `<img src="/static/images/contact-logo.svg" alt="phone" />`;
    sep.insertAdjacentElement('afterend', icon);
  });
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
  await inlineSvgAsDataUrl('.contact-icon img');
  setTimeout(() => {
    runFooterFixes(document);
  }, 120);
});

window.addEventListener('resize', () => {
  setTimeout(() => runFooterFixes(document), 80);
});

/* ---------- Template upload (single background) ---------- */
document.getElementById("templateUpload").addEventListener("change", function(e){
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = ev => {
    const url = ev.target.result;
    TEMPLATE_BG_DATA_URL = url;

    templateBox.style.backgroundImage = `url(${url})`;
    templateBox.style.backgroundSize = "cover";
    templateBox.style.backgroundPosition = "center";

    alert("Template uploaded. Now choose language and click 'Generate Templates'.");
  };
  reader.readAsDataURL(file);
});

/* ---------- Preloaded templates (small) ---------- */
const preloadedTemplates = ["template1.jpg","template2.jpg"];
preloadedTemplates.forEach(src => {
  const slide = document.createElement("img");
  slide.src = src;
  slide.alt = src;
  templateSlider.appendChild(slide);
  slide.addEventListener("click", () => {
    templateBox.style.backgroundImage = `url(${src})`;
    templateBox.style.backgroundSize = "cover";
    templateBox.style.backgroundPosition = "center";
  });
});

/* ---------- Excel upload (multi-sheet aware) ---------- */
document.getElementById("storesExcel").addEventListener("change", async function(e){
  const file = e.target.files[0];
  if (!file) return alert("Please upload an Excel file!");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });

  excelDataBySheet = {};
  workbook.SheetNames.forEach(sheetName => {
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "" });
    excelDataBySheet[sheetName] = rows;
  });

  excelData = excelDataBySheet[workbook.SheetNames[0]] || [];
  currentSheetName = workbook.SheetNames[0];

  const langSelect = document.getElementById("languageSelect");
  Array.from(langSelect.options).forEach(opt => {
    if(opt.dataset && opt.dataset.sheet === "1") opt.remove();
  });

  workbook.SheetNames.forEach(sheetName => {
    const opt = document.createElement("option");
    opt.value = "sheet::" + sheetName;
    opt.textContent = sheetName;
    opt.dataset.sheet = "1";
    langSelect.appendChild(opt);
  });

  const stateFilter = document.getElementById("stateFilter");
  stateFilter.innerHTML = '<option value="">-- All States --</option>';
  workbook.SheetNames.forEach(sn => {
    const o = document.createElement("option");
    o.value = sn;
    o.textContent = sn;
    stateFilter.appendChild(o);
  });
  stateFilter.value = currentSheetName;
  langSelect.value = "sheet::" + currentSheetName;

  console.log("✅ Excel loaded. Sheets:", workbook.SheetNames);
  alert("✔ Loaded sheets: " + workbook.SheetNames.join(", "));
});

function checkLanguageColumnsSingle() {
  if (!excelData || !excelData.length) return;
  const LANGS = ["hi","gu","mr","ta","te","bn","kn"];
  const columns = Object.keys(excelData[0]);
  const available = [];
  LANGS.forEach(lang => {
    const variations = [
      `address_${lang}`,
      lang === 'ta' ? 'address_tm' : null,
      lang === 'ta' ? 'address_tamil' : null
    ].filter(Boolean);
    
    const found = variations.some(v => columns.some(c => c.toLowerCase() === v.toLowerCase()));
    if (found) available.push(lang.toUpperCase());
  });
  const statusEl = document.getElementById("langColumnStatus");
  statusEl.innerHTML = available.length
    ? `<span style="color:#28a745;">✅ Translated: ${available.join(", ")}</span>`
    : `<span style="color:#dc3545;">❌ No translations yet</span>`;
}

function addDummyTranslations() {
  if (!excelData || !excelData.length) { alert("Upload Excel first"); return; }
  const addrKey = Object.keys(excelData[0]).find(k => k.toLowerCase().includes("address"));
  if (!addrKey) { alert("No address column found"); return; }
  excelData.forEach(store => {
    const original = store[addrKey] || "";
    ["hi","gu","mr","ta","te","bn","kn"].forEach(l => store[`address_${l}`] = `[${l.toUpperCase()}] ${original}`);
  });
  checkLanguageColumnsSingle();
  alert("Dummy translations added.");
}

/* ---------- Generator: Multi-sheet variant ---------- */
async function generateTemplatesFromSheet(){
  const container = document.getElementById("templatesContainer");
  container.innerHTML = "";

  const selectedState = document.getElementById("stateFilter").value;
  const sheetToUse = selectedState || currentSheetName;
  if (!sheetToUse || !excelDataBySheet[sheetToUse] || !excelDataBySheet[sheetToUse].length) {
    alert("No sheet data found. Please upload Excel and select a sheet.");
    return;
  }
  const rows = excelDataBySheet[sheetToUse];
  const keys = Object.keys(rows[0] || {});
  
  console.log("Excel columns found:", keys);
  
  const addressKey = keys.find(k => k.toLowerCase().includes("address") && !k.toLowerCase().includes("_")) || keys.find(k=>k.toLowerCase().includes("address"));
  const mobileKey = keys.find(k => k.toLowerCase().includes("mobile") || k.toLowerCase().includes("phone"));

  console.log("English address key:", addressKey);
  console.log("Mobile key:", mobileKey);

  const langColumns = [];
  const langConfig = {
    mr: { names: ['address_mr', 'address_marathi'], font: "'Noto Sans Devanagari', 'Noto Sans', Arial, sans-serif", badge: 'MR' },
    tm: { names: ['address_tm', 'address_tamil'], font: "'Noto Sans Tamil', 'Noto Sans', Arial, sans-serif", badge: 'TM' },
    ta: { names: ['address_ta'], font: "'Noto Sans Tamil', 'Noto Sans', Arial, sans-serif", badge: 'TA' },
    te: { names: ['address_te', 'address_telugu'], font: "'Noto Sans Telugu', 'Noto Sans', Arial, sans-serif", badge: 'TE' },
    hi: { names: ['address_hi', 'address_hindi'], font: "'Noto Sans Devanagari', 'Noto Sans', Arial, sans-serif", badge: 'HI' },
    gu: { names: ['address_gu', 'address_gujarati'], font: "'Noto Sans Gujarati', 'Noto Sans', Arial, sans-serif", badge: 'GU' },
    bn: { names: ['address_bn', 'address_bengali'], font: "'Noto Sans Bengali', 'Noto Sans', Arial, sans-serif", badge: 'BN' },
    kn: { names: ['address_kn', 'address_kannada'], font: "'Noto Sans Kannada', 'Noto Sans', Arial, sans-serif", badge: 'KN' }
  };

  const alreadyAddedColumns = new Set();
  for (const [langCode, config] of Object.entries(langConfig)) {
    for (const colName of config.names) {
      const foundKey = keys.find(k => k.toLowerCase() === colName.toLowerCase());
      if (foundKey && !alreadyAddedColumns.has(foundKey.toLowerCase())) {
        console.log(`Found language column: ${foundKey} for ${langCode}`);
        langColumns.push({ key: foundKey, ...config });
        alreadyAddedColumns.add(foundKey.toLowerCase());
        break;
      }
    }
  }
  
  console.log("Detected language columns:", langColumns);
  
  if (langColumns.length === 0) {
    console.warn("⚠️ No language columns found. Only English templates will be generated.");
  } else {
    console.log(`✅ Will generate ${langColumns.length} language template(s) per store:`, langColumns.map(l => l.badge).join(', '));
  }

  rows.forEach((store,i) => {
    console.log(`\n--- Processing store ${i+1} ---`);
    
    const cloneEn = templateBox.cloneNode(true);
    cloneEn.id = `template_sheet_${i}_en`;
    cloneEn.style.display = "block";
    cloneEn.style.margin = "20px auto";
    cloneEn.style.position = "relative";

    const footerElEn = cloneEn.querySelector("#storeFooterName");
    if (footerElEn) {
      footerElEn.style.fontFamily = "'Noto Sans', Arial, sans-serif";
      footerElEn.innerHTML =
        `<span class="store-address">${escapeHtml(store[addressKey] || "")}</span>` +
        (store[mobileKey]
          ? `<span class="separator">|</span><span class="contact-icon"><img src="/static/images/contact-logo.svg" alt="phone"></span><span class="store-mobile">${escapeHtml(store[mobileKey] || "")}</span>`
          : "");
    }
    const badge = document.createElement("div");
    badge.className = "badge-debug";
    badge.textContent = "EN";
    cloneEn.appendChild(badge);
    container.appendChild(cloneEn);
    syncFinalLayerFor(cloneEn);
    console.log(`  ✓ Created English template for store ${i+1}`);

    console.log(`  Checking ${langColumns.length} language column(s)...`);
    langColumns.forEach(langCol => {
      if (store[langCol.key]) {
        console.log(`  ✓ Creating ${langCol.badge} template for store ${i+1} using column "${langCol.key}"`);
        const cloneLang = templateBox.cloneNode(true);
        cloneLang.id = `template_sheet_${i}_${langCol.badge.toLowerCase()}`;
        cloneLang.style.display = "block";
        cloneLang.style.margin = "20px auto";
        cloneLang.style.position = "relative";
        const footerElLang = cloneLang.querySelector("#storeFooterName");
        if (footerElLang) {
          footerElLang.style.fontFamily = langCol.font;
          footerElLang.innerHTML =
            `<span class="store-address">${escapeHtml(store[langCol.key])}</span>` +
            (store[mobileKey]
              ? `<span class="separator">|</span><span class="contact-icon"><img src="/static/images/contact-logo.svg" alt="phone"></span><span class="store-mobile">${escapeHtml(store[mobileKey] || "")}</span>`
              : "");
        }
        const badgeLang = document.createElement("div");
        badgeLang.className = "badge-debug";
        badgeLang.textContent = langCol.badge;
        cloneLang.appendChild(badgeLang);
        container.appendChild(cloneLang);
        syncFinalLayerFor(cloneLang);
      } else {
        console.log(`  ⊗ Skipping ${langCol.badge} for store ${i+1} - no data in column "${langCol.key}"`);
      }
    });
  });

  await inlineSvgAsDataUrl('.contact-icon img');
  setTimeout(() => {
    adjustFooterFontSize();
    adjustFooterPosition();
  }, 150);
  
  const langSummary = langColumns.length > 0 
    ? `\n\nLanguages found: ${langColumns.map(l => l.badge).join(", ")}`
    : "\n\nNo language columns detected (only English)";
  alert(`✅ Generated ${rows.length} templates for sheet: ${sheetToUse}${langSummary}`);
}

/* ---------- Generator: Single sheet uploaded-template variant ---------- */
async function generateTemplatesFromUploadedTemplate({ selectedState = "" } = {}) {
  if (!excelData || !excelData.length) {
    alert("Please upload Excel first.");
    return;
  }
  const lang = document.getElementById("languageSelect").value || "en";
  const container = document.getElementById("templatesContainer");
  container.innerHTML = "";

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
        ? `<span class="separator">|</span><span class="contact-icon"><img src="/static/images/contact-logo.svg" alt="phone"></span><span class="store-mobile">${escapeHtml(mobileText)}</span>`
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

/* ---------- Attach generate button logic ---------- */
document.getElementById("generateStateTemplates").addEventListener("click", async () => {
  const state = document.getElementById("stateFilter").value || "";
  if (excelDataBySheet && Object.keys(excelDataBySheet).length > 0 && currentSheetName) {
    await generateTemplatesFromSheet();
  } else if (excelData && excelData.length > 0) {
    await generateTemplatesFromUploadedTemplate({ selectedState: state });
  } else {
    alert("❌ Please upload Excel file first!");
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
      container.innerHTML = "";
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

async function downloadSuperHDA4() {
  try {
    if (!TEMPLATE_BG_DATA_URL) {
      alert("Please upload a template first.");
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
    bg.src = TEMPLATE_BG_DATA_URL;

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
    ctx.fillText(footerText, A4_WIDTH / 2, A4_HEIGHT - 80);

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

  try {
    if (!TEMPLATE_BG_DATA_URL) {
      alert("❌ Please upload your A4 template first (Template Upload).");
      return;
    }

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

    const bg = new Image();
    bg.src = TEMPLATE_BG_DATA_URL;

    await new Promise((res, rej) => {
      bg.onload = () => res();
      bg.onerror = (e) => rej(e);
    });

    const contactIcon = new Image();
    contactIcon.src = createColoredContactSvg(footerTextColor);
    let contactIconLoaded = false;

    await new Promise((res) => {
      contactIcon.onload = () => { contactIconLoaded = true; res(); };
      contactIcon.onerror = (e) => {
        console.warn("Contact icon failed to load, continuing without icon:", e);
        contactIconLoaded = false;
        res();
      };
    });

    let templates = document.querySelectorAll(
      "#templatesContainer > .template-box, " +
      "#templatesContainer > [id^='template_sheet_'], " +
      "#templatesContainer > [id^='template_clone_'], " +
      "#templatesContainer > div"
    );
    templates = Array.from(templates).filter(t => t.querySelector(".store-address"));

    if (!templates.length) {
      alert("❌ No templates found.\nPlease click 'Generate Templates' first.");
      return;
    }

    const overlay = document.createElement("div");
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
    overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">0 / ${templates.length}</span>`;
    document.body.appendChild(overlay);

    for (let i = 0; i < templates.length; i++) {
      const box = templates[i];
      overlay.innerHTML = `💎 Generating Perfect A4 PDFs...<br><span style="font-size:14px;">${i + 1} / ${templates.length}</span>`;

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

      const hasDeva     = /[\u0900-\u097F]/.test(footerFullText);
      const hasTamil    = /[\u0B80-\u0BFF]/.test(footerFullText);
      const hasGujarati = /[\u0A80-\u0AFF]/.test(footerFullText);
      const hasBengali  = /[\u0980-\u09FF]/.test(footerFullText);
      const hasTelugu   = /[\u0C00-\u0C7F]/.test(footerFullText);
      const hasKannada  = /[\u0C80-\u0CFF]/.test(footerFullText);

      let fontFamily = "NotoSans";
      if      (hasDeva)     fontFamily = "NotoSansDeva";
      else if (hasTamil)    fontFamily = "NotoSansTamil";
      else if (hasGujarati) fontFamily = "NotoSansGuj";
      else if (hasBengali)  fontFamily = "NotoSansBeng";
      else if (hasTelugu)   fontFamily = "NotoSansTelugu";
      else if (hasKannada)  fontFamily = "NotoSansKannada";

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

      const canvas = document.createElement("canvas");
      canvas.width = A4_W;
      canvas.height = A4_H;
      const ctx = canvas.getContext("2d");

      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, A4_W, A4_H);

      const ratio = Math.min(A4_W / bg.width, A4_H / bg.height);
      const drawW = bg.width * ratio;
      const drawH = bg.height * ratio;
      const dx = (A4_W - drawW) / 2;
      const dy = (A4_H - drawH) / 2;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(bg, dx, dy, drawW, drawH);

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

      const footerY = A4_H * footerRatioY + 30;

      ctx.font = `900 ${fontSize}px "${fontFamily}", "NotoSans", Arial, sans-serif`;
      ctx.fillStyle = footerTextColor;
      ctx.strokeStyle = footerTextColor;
      ctx.lineWidth = 1.4;

      const addressPart = hasPhone ? `${footerAddress} | ` : footerAddress;
      const addressWidth = ctx.measureText(addressPart).width;
      const phoneWidth   = hasPhone ? ctx.measureText(phoneText).width : 0;

      const iconGap  = (contactIconLoaded && hasPhone) ? 8 : 0;
      const iconSize = (contactIconLoaded && hasPhone) ? fontSize + 6 : 0;

      const totalWidth = addressWidth + iconSize + iconGap + phoneWidth;

      const H_SHIFT_LEFT = 140;
      const startX = A4_W / 2 - totalWidth / 2 - H_SHIFT_LEFT;

      let nextX = startX;

      if (addressPart) {
        ctx.strokeText(addressPart, nextX, footerY);
        ctx.fillText(addressPart, startX, footerY);
      }
      nextX += addressWidth;

      if (hasPhone) {
        if (contactIconLoaded && iconSize > 0) {
          const iconX = nextX;
          const iconY = footerY - iconSize / 2;
          try {
            ctx.drawImage(contactIcon, iconX, iconY, iconSize, iconSize);
          } catch (err) {
            console.warn("Could not draw contact icon:", err);
          }
          nextX = iconX + iconSize + iconGap;
        }
        ctx.strokeText(phoneText, nextX, footerY);
        ctx.fillText(phoneText, nextX, footerY);
      }

      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF("p", "mm", "a4");
      pdf.addImage(imgData, "JPEG", 0, 0, 210, 297);

      let fname = "Template";
      if (address && address.trim()) {
        fname = address.trim().substring(0, 40).replace(/[^a-zA-Z0-9]+/g, "_");
      }
      pdf.save(`${fname || "Template"}_PerfectA4.pdf`);

      await new Promise(r => setTimeout(r, 150));
    }

    document.body.removeChild(overlay);
    alert(`✅ All ${templates.length} templates downloaded in TRUE A4 Ultra HD.`);

  } catch (err) {
    console.error("downloadAllPerfectA4 error:", err);
    alert("❌ Error in downloadAllPerfectA4: " + err.message);
  }
}
