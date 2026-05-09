export function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePhone(value) {
  return String(value ?? "").replace(/[^\d+]/g, "");
}

export function normalizeLookupIdentifier(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("@")) return normalizeEmail(raw);
  if (/^\+?\d[\d\s().-]*$/.test(raw)) return normalizePhone(raw);
  return raw;
}
