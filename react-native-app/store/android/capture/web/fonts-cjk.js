/**
 * Han, kana and hangul in the forms of the language being shown, as Android
 * picks its CJK face from the locale. Added to the Archivo families at the
 * same weights as fonts.css, after it, so these ranges come from Noto CJK.
 * Shared by the app page (index.html) and the store frame (frame.html).
 */
// eslint-disable-next-line no-unused-vars
function installCjkFaces(lang) {
  var base = String(lang || 'en').split('-')[0];
  var cjk = { ja: 'JP', ko: 'KR', zh: 'SC' }[base] || 'SC';
  var range =
    'U+1100-11FF, U+2E80-2FDF, U+3000-30FF, U+3130-318F, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, U+AC00-D7AF, U+F900-FAFF, U+FF00-FFEF';
  var faces = [
    ['Archivo', [400, 500, 600, 700, 800]],
    ['ArchivoExpanded', [700, 800, 900]],
  ];
  var css = '';
  faces.forEach(function (f) {
    f[1].forEach(function (w) {
      var face = 'Noto Sans CJK ' + cjk + (w >= 600 ? ' Bold' : '');
      css +=
        "@font-face{font-family:'" + f[0] + "';font-weight:" + w + ";src:local('" + face + "');unicode-range:" + range + ';}';
    });
  });
  var style = document.getElementById('cjk-faces') || document.createElement('style');
  style.id = 'cjk-faces';
  style.textContent = css;
  document.head.appendChild(style);
}
