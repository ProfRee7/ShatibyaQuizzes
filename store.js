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
