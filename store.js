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
