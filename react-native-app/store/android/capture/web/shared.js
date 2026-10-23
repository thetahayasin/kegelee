/**
 * What frame.html and feature.html share: the language setup, the headline,
 * the phone's markup and the screenshot inside it. Plain browser script; the
 * pages load it after fonts-cjk.js.
 */
/* eslint-disable no-unused-vars */
/* global installCjkFaces */

/** Language and direction for the page, with the CJK faces that language uses. */
function setLanguage(lang, dir) {
  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  installCjkFaces(lang);
}

/**
 * Write a headline into `h1`. `*Stars*` mark the emphasised phrase; a "\n"
 * forces a line break where a language needs one.
 */
function fillHeadline(h1, headline) {
  h1.textContent = '';
  headline.split(/(\*[^*]+\*)/).forEach((part) => {
    if (!part) return;
    const node = document.createElement('span');
    if (part.startsWith('*') && part.endsWith('*')) node.className = 'em';
    part.replace(/^\*|\*$/g, '').split('\n').forEach((line, i) => {
      if (i) node.appendChild(document.createElement('br'));
      node.appendChild(document.createTextNode(line));
    });
    h1.appendChild(node);
  });
}

/**
 * The largest headline size that fits, never cutting a word off or pushing
 * one past the edge: on two lines between `max` and `twoLineMin`, else on
 * three down to `threeLineMin`. Naskh and Thai draw small for their pixel
 * size, so they are scaled up to stand as tall as the Latin headlines.
 */
function fitHeadline(h1, lang, { max, twoLineMin, threeLineMin }) {
  const fits = (size, maxLines) => {
    h1.style.fontSize = `${size}px`;
    const lineHeight = parseFloat(window.getComputedStyle(h1).lineHeight);
    const lines = Math.round(h1.getBoundingClientRect().height / lineHeight);
    return lines <= maxLines && h1.scrollWidth <= h1.clientWidth + 1;
  };
  const scale = { ar: 1.2, th: 1.15 }[lang.split('-')[0]] || 1;
  const px = (n) => Math.round(n * scale);
  let size = px(max);
  while (size > px(twoLineMin) && !fits(size, 2)) size -= 2;
  if (!fits(size, 2)) {
    size = px(max);
    while (size > px(threeLineMin) && !fits(size, 3)) size -= 2;
  }
  h1.style.fontSize = `${size}px`;
  return size;
}

/** Draw the phone into `el` (a .phone) and load the screen capture into it. */
function mountPhone(el, shot) {
  el.innerHTML = `
    <div class="btn power"></div>
    <div class="btn vol"></div>
    <div class="screen">
      <img class="shot" alt="" />
      <div class="status">
        <span>9:30</span>
        <span class="icons">
          <svg viewBox="0 0 20 16"><path d="M10 15 0.6 4.6a13 13 0 0 1 18.8 0z" fill="#fff" /></svg>
          <svg viewBox="0 0 18 16"><path d="M1 15h16V1z" fill="#fff" /></svg>
          <svg viewBox="0 0 12 20"><rect x="3.5" y="0" width="5" height="2" rx="1" fill="#fff" /><rect x="0.5" y="1.5" width="11" height="18" rx="2.5" fill="#fff" /></svg>
        </span>
      </div>
      <div class="camera"></div>
      <div class="pill"></div>
      <div class="glare"></div>
    </div>`;
  const img = el.querySelector('.shot');
  return new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error(`could not load ${shot}`));
    img.src = shot;
  });
}
