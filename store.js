// تهيئة Firebase + دوال مساعدة مشتركة بين صفحة الأدمن وصفحة الضيف
firebase.initializeApp(FIREBASE_CONFIG);
const fdb = firebase.database();
const fauth = typeof firebase.auth === 'function' ? firebase.auth() : null; // موجود في صفحة الأدمن بس

// ID عشوائي غير قابل للتخمين
function newId(bytes) {
  const a = new Uint8Array(bytes || 6);
  crypto.getRandomValues(a);
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
}
// Firebase ممكن يرجّع المصفوفات ككائنات، فنوحّدها
function toArray(v) {
  if (!v) return [];
  return Array.isArray(v) ? v.filter(x => x != null) : Object.values(v);
}
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---- أسئلة "اسحب الكلمة": الجملة بتتكتب كده: الله [[غفور]] رحيم ----
// بترجّع أجزاء: {t:'text', v:'...'} أو {t:'blank', v:'الكلمة الصح'}
function parseSentence(s) {
  const parts = [];
  const re = /\[\[(.*?)\]\]/g;
  let last = 0, m;
  s = String(s || '');
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push({ t: 'text', v: s.slice(last, m.index) });
    parts.push({ t: 'blank', v: m[1].trim() });
    last = m.index + m[0].length;
  }
  if (last < s.length) parts.push({ t: 'text', v: s.slice(last) });
  return parts;
}
function shuffled(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- أسئلة الإجابة المكتوبة: نسبة التشابه مع الإجابة النموذجية ----
const TEXT_PASS_PERCENT = 50; // الإجابة صح لو النسبة أكبر من ده
// توحيد الكتابة: بنشيل التشكيل والتطويل، ونوحّد الهمزات (أإآ=ا) والياء/الألف المقصورة والتاء المربوطة
function normAr(s) {
  return String(s || '').toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ]/g, '')
    .replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}
// تشابه الحروف (Levenshtein): بيسامح في الأخطاء الإملائية الصغيرة
function levRatio(a, b) {
  if (!a || !b) return 0;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}
const wordsOf = s => normAr(s).split(' ').filter(Boolean).map(w => (w.length > 4 && w.startsWith('ال')) ? w.slice(2) : w);
// تشابه الكلمات: كام كلمة من الإجابة موجودة في التانية (مهما كان ترتيبها)، مع تسامح في الأخطاء
function wordDice(a, b) {
  const A = wordsOf(a), B = wordsOf(b);
  if (!A.length || !B.length) return 0;
  const used = new Set(); let matched = 0;
  for (const w of A) {
    let best = 0, bi = -1;
    B.forEach((x, j) => { if (!used.has(j)) { const r = levRatio(w, x); if (r > best) { best = r; bi = j; } } });
    if (bi >= 0 && best >= 0.8) { used.add(bi); matched++; }
  }
  return 2 * matched / (A.length + B.length);
}
// النسبة النهائية (0-100). لو في أكتر من إجابة نموذجية بناخد الأقرب.
// الجمل المتعددة الكلمات بتتقارن بالكلمات (عشان كلمة مشتركة متنجّحش إجابة غلط)،
// ولو الإجابة أو النموذج كلمة واحدة بنضيف مقارنة الحروف عشان نسامح في الأخطاء الإملائية.
function textScore(student, answers) {
  let best = 0;
  const A = wordsOf(student);
  (typeof answers === 'string' ? [answers] : toArray(answers)).forEach(m => {
    let sc = wordDice(student, m);
    if (A.length <= 1 || wordsOf(m).length <= 1) sc = Math.max(sc, levRatio(normAr(student), normAr(m)));
    best = Math.max(best, sc);
  });
  return Math.round(best * 100);
}

// ---- نص منسّق (Rich text) ----
// أي HTML بيتنضّف بقائمة بيضاء قبل الحفظ وقبل العرض: بنعيد بناء العناصر المسموحة بس
// ومن غير أي attributes غير تنسيقات آمنة، فمستحيل يتنفذ سكريبت حتى لو الداتا اتلعب فيها.
const RICH_TAGS = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SPAN', 'BR', 'P', 'DIV', 'UL', 'OL', 'LI', 'MARK', 'SUB', 'SUP']);
const RICH_SKIP = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'NOSCRIPT', 'TEMPLATE', 'TITLE', 'HEAD', 'META', 'LINK']);
const COLOR_RE = /^(#[0-9a-f]{3,8}|rgba?\(\s*[\d.\s,%]+\)|[a-z]+)$/i;
const RICH_CSS = {
  'color': COLOR_RE, 'background-color': COLOR_RE,
  'font-size': /^([\d.]+(px|em|rem|%)|x-small|small|medium|large|x-large|xx-large|xxx-large|smaller|larger)$/i,
  'font-weight': /^(bold|normal|[1-9]00)$/i, 'font-style': /^(italic|normal)$/i,
  'text-decoration': /^[a-z -]+$/i, 'text-decoration-line': /^[a-z -]+$/i,
  'text-align': /^(left|right|center|justify)$/i
};
function sanitizeHtml(html) {
  const body = new DOMParser().parseFromString(String(html || ''), 'text/html').body;
  const out = document.createElement('div');
  (function walk(src, dst) {
    src.childNodes.forEach(n => {
      if (n.nodeType === 3) { dst.append(document.createTextNode(n.nodeValue)); return; }
      if (n.nodeType !== 1 || RICH_SKIP.has(n.tagName)) return;
      if (n.tagName === 'IMG') {                                          // صورة: بنحتفظ بالـ id بس، والمصدر بيتحمّل من Firebase
        const id = n.getAttribute('data-img') || '';
        if (/^[0-9a-f]{8,24}$/.test(id)) { const c = document.createElement('img'); c.setAttribute('data-img', id); dst.append(c); }
        return;
      }
      if (!RICH_TAGS.has(n.tagName)) { walk(n, dst); return; }          // عنصر غير مسموح: نحتفظ بنصه بس
      const c = document.createElement(n.tagName.toLowerCase());
      for (let i = 0; i < n.style.length; i++) {
        const p = n.style[i], v = n.style.getPropertyValue(p).trim();
        if (RICH_CSS[p] && RICH_CSS[p].test(v)) c.style.setProperty(p, v);
      }
      walk(n, c); dst.append(c);
    });
  })(body, out);
  return out.innerHTML;
}
function htmlToText(html) {
  const d = document.createElement('div'); d.innerHTML = sanitizeHtml(html);
  d.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
  d.querySelectorAll('p,div,li').forEach(b => b.append('\n'));
  return d.textContent.replace(/\n{3,}/g, '\n\n').trim();
}
const plainToHtml = t => esc(t).replace(/\n/g, '<br>');

// ---- صور الأسئلة: بتتخزن مصغّرة في /images/{id} وبتتحمّل لما السؤال يظهر بس ----
const imgReady = {}, imgCache = {};
function loadImage(id) {
  if (!id) return Promise.resolve(null);
  if (!imgCache[id]) imgCache[id] = fdb.ref('images/' + id).once('value').then(s => { const v = s.val(); if (v) imgReady[id] = v; else delete imgCache[id]; return v; }).catch(() => { delete imgCache[id]; return null; });
  return imgCache[id];
}
// تصغير الصورة (أقصى 1000px) وتحويلها JPEG بحجم صغير قبل الرفع
async function compressImage(file) {
  if (!file || !/^image\//.test(file.type)) throw new Error('الملف ده مش صورة');
  if (file.size > 15 * 1024 * 1024) throw new Error('الصورة كبيرة جدًا (أكتر من 15 ميجا)');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('مقدرتش أقرا الصورة')); i.src = url; });
    let max = 1000, data = '', w = 0, h = 0;
    for (let attempt = 0; attempt < 4; attempt++) {
      const sc = Math.min(1, max / Math.max(img.width, img.height));
      w = Math.max(1, Math.round(img.width * sc)); h = Math.max(1, Math.round(img.height * sc));
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, w, h); cx.drawImage(img, 0, 0, w, h);
      for (let q = 0.85; q >= 0.45; q -= 0.1) { data = cv.toDataURL('image/jpeg', q); if (data.length <= 350000) return { data, w, h }; }
      max = Math.round(max * 0.75);
    }
    throw new Error('مقدرتش أصغّر الصورة كفاية، جرّبي صورة أصغر');
  } finally { URL.revokeObjectURL(url); }
}

// الصور اللي جوه النص المنسّق: <img data-img="ID"> والصورة نفسها في /images/ID
const imageIdsIn = html => [...String(html || '').matchAll(/data-img="([0-9a-f]{8,24})"/g)].map(m => m[1]);
function imageIdsOfExercise(ex) {
  const ids = new Set();
  toArray(ex && ex.questions).forEach(q => imageIdsIn((q.contextHtml || '') + (q.textHtml || '')).forEach(i => ids.add(i)));
  return ids;
}
// بيحط مصدر الصور جوه عنصر: من الصور اللي لسه ما اترفعتش (pending) أو من Firebase
function hydrateImages(root, pending) {
  root.querySelectorAll('img[data-img]').forEach(img => {
    const id = img.getAttribute('data-img');
    if (pending && pending[id]) img.src = pending[id].data;
    else if (imgReady[id]) img.src = imgReady[id].data;
    else loadImage(id).then(d => { if (d) img.src = d.data; });
  });
}
