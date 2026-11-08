/**
 * PRIVACY FILE MAP
 * - PRIVACY-NORMALIZE: Standardizes TC / phone / email.
 * - PRIVACY-HASH: Produces deterministic *_hash values.
 * - PRIVACY-MASK: Masks sensitive fields for UI.
 */

const STAR = "*";

const maskKeepingLast = (raw: string, keep = 2): string => {
  const value = String(raw || "").trim();
  if (!value) return "-";
  if (value.includes(STAR)) return value;
  if (value.length <= keep) return value;
  const hiddenLen = Math.max(0, value.length - keep);
  return `${STAR.repeat(hiddenLen)}${value.slice(-keep)}`;
};

export const normalizeTc = (tcNo?: string | null): string =>
  String(tcNo || "").replace(/\D/g, "").slice(0, 11);

export const normalizePhone = (phone?: string | null): string =>
  String(phone || "").replace(/\D/g, "").slice(0, 11);

export const normalizeEmail = (email?: string | null): string =>
  String(email || "").trim().toLowerCase();

// Lightweight deterministic hash for client-side comparisons.
const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

const piiHash = (scope: "tcNo" | "phone" | "email", value: string): string =>
  value ? fnv1a32(`afy-v1|${scope}|${value}`) : "";

export const hashTc = (tcNo?: string | null): string => piiHash("tcNo", normalizeTc(tcNo));
export const hashPhone = (phone?: string | null): string => piiHash("phone", normalizePhone(phone));
export const hashEmail = (email?: string | null): string => piiHash("email", normalizeEmail(email));

export const maskPhone = (phone?: string | null): string => {
  const raw = String(phone || "").trim();
  if (!raw) return "-";
  if (raw.includes(STAR)) return raw;
  const digits = normalizePhone(raw);
  return digits ? maskKeepingLast(digits, 2) : "-";
};

export const maskTc = (tcNo?: string | null): string => {
  const raw = String(tcNo || "").trim();
  if (!raw) return "-";
  if (raw.includes(STAR)) return raw;
  const digits = normalizeTc(raw);
  return digits ? maskKeepingLast(digits, 2) : "-";
};

export const maskEmail = (email?: string | null): string => {
  const value = String(email || "").trim();
  if (!value) return "-";
  if (value.includes(STAR)) return value;
  const [localRaw, domainRaw] = value.split("@");
  if (!domainRaw) return maskKeepingLast(value, 2);

  const local = maskKeepingLast(localRaw, 2);
  const domainParts = domainRaw.split(".");
  const host = domainParts[0] ? maskKeepingLast(domainParts[0], 2) : "**";
  const tld = domainParts.length > 1 ? domainParts.slice(1).join(".") : "";
  return tld ? `${local}@${host}.${tld}` : `${local}@${host}`;
};
