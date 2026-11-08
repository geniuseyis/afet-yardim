/**
 * PRIVACY FILE MAP
 * - PRIVACY-NORMALIZE: Standardizes TC / phone / email.
 * - PRIVACY-HASH: Produces deterministic *_hash values.
 * - PRIVACY-MASK: Masks sensitive fields for UI.
 */

import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex } from "@noble/hashes/utils";

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

type PiiScope = "tcNo" | "phone" | "email";

const legacyPiiHash = (scope: PiiScope, value: string): string =>
  value ? fnv1a32(`afy-v1|${scope}|${value}`) : "";

// eski kayitlar yalnizca giriste karsilastirilir, sonra yeni ozete gecer
export const legacyHashTc = (tcNo?: string | null): string => legacyPiiHash("tcNo", normalizeTc(tcNo));
export const legacyHashPhone = (phone?: string | null): string => legacyPiiHash("phone", normalizePhone(phone));

const PII_ITERATIONS = 20000;

// hermes'te TextEncoder'a guvenmemek icin elle utf-8
const toBytes = (text: string): Uint8Array => {
  const out: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
  }
  return Uint8Array.from(out);
};

// functions/src/pii.ts ile ayni sonucu vermeli, kayit cakismasi orada da aranir
const piiHash = async (scope: PiiScope, value: string): Promise<string> => {
  if (!value) return "";
  const key = await pbkdf2Async(sha256, toBytes(value), toBytes(`afy-v3|${scope}`), { c: PII_ITERATIONS, dkLen: 16 });
  return bytesToHex(key);
};

export const hashTc = (tcNo?: string | null): Promise<string> => piiHash("tcNo", normalizeTc(tcNo));
export const hashPhone = (phone?: string | null): Promise<string> => piiHash("phone", normalizePhone(phone));
export const hashEmail = (email?: string | null): Promise<string> => piiHash("email", normalizeEmail(email));

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
