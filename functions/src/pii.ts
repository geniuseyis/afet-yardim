import { pbkdf2Sync } from "crypto";

export type PiiScope = "tcNo" | "phone" | "email";

const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
};

export const legacyPiiHash = (scope: PiiScope, value: string): string =>
  value ? fnv1a32(`afy-v1|${scope}|${value}`) : "";

// src/utils/privacy.ts ile ayni sonucu vermeli
export const piiHash = (scope: PiiScope, value: string): string =>
  value ? pbkdf2Sync(value, `afy-v3|${scope}`, 20000, 16, "sha256").toString("hex") : "";

// giris yapmamis eski hesaplarin ozeti hala v1 olabilir
export const matchesPiiHash = (stored: string, scope: PiiScope, value: string): boolean =>
  stored === piiHash(scope, value) || stored === legacyPiiHash(scope, value);
