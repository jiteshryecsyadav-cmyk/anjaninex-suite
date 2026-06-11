// Normalize an Indian phone -> last 10 digits. null if not matchable.
function normalizePhone(raw) {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}
module.exports = { normalizePhone };
