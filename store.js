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
