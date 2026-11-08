/**
 * FRAUD DETECTION (Trust & Safety)
 *
 * Talepleri kural tabanlı skorlayıp sahte/şüpheli olanları işaretler.
 * Tüm hesaplama client tarafında, yöneticinin gördüğü talep listesi üzerinde
 * yapılır — backend deploy gerektirmez, ama gerçek kurallarla çalışır.
 *
 * Skor 0-100 arası, 70+ "şüpheli" sayılır.
 */

import { toMillis } from "../screens/shared/ScreenHelpers";

export type FraudReason = {
  code: "DUPLICATE_USER" | "GEO_CLUSTER" | "LOW_DETAIL" | "SPAM_KEYWORDS" | "URGENT_NO_PROOF" | "RAPID_FIRE";
  weight: number;
  labelTr: string;
  labelEn: string;
};

export type FraudResult = {
  score: number;
  reasons: FraudReason[];
  level: "clean" | "low" | "medium" | "high";
};

export type RequestLike = {
  id: string;
  createdBy?: string;
  userId?: string;
  description?: string;
  urgency?: string;
  photoUrl?: string;
  location?: { lat?: number; lng?: number } | null;
  createdAt?: any;
};

const SPAM_PATTERNS = [
  /\b(test\s*test|deneme|asdf|qwerty|abc{2,}|xx+|123{2,})\b/i,
  /(.)\1{6,}/, // aynı karakter 7+ kez (örn: "aaaaaaaa")
  /\b(spam|fake|sahte|trolling|şaka)\b/i
];

const GENERIC_DESCRIPTIONS = [
  "yardım", "yardim", "help", "acil", "lutfen", "lütfen", "gelin", "kurtarın", "kurtarin"
];

// İki nokta arası ~ metre cinsinden mesafe (haversine yaklaşımı, küçük mesafelerde yeterli)
const distMeters = (
  a: { lat?: number; lng?: number } | null | undefined,
  b: { lat?: number; lng?: number } | null | undefined
): number => {
  if (!a?.lat || !a?.lng || !b?.lat || !b?.lng) return Infinity;
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};

/**
 * Bir talebi tüm talep evreni içinde skorlar.
 * allRequests: aynı sahibe ve/veya konuma yakın diğer talepleri tespit için.
 */
export const scoreRequest = (req: RequestLike, allRequests: RequestLike[]): FraudResult => {
  const reasons: FraudReason[] = [];
  const desc = `${req.description || ""}`.trim();
  const ownerId = req.createdBy || req.userId || "";
  const createdMs = toMillis(req.createdAt) || 0;
  const urgency = `${req.urgency || ""}`.toLowerCase();

  // 1) Açıklama çok kısa
  if (desc.length > 0 && desc.length < 15) {
    reasons.push({
      code: "LOW_DETAIL",
      weight: 25,
      labelTr: "Açıklama çok kısa (<15 karakter)",
      labelEn: "Description too short (<15 chars)"
    });
  }

  // 2) Açıklama jenerik veya spam pattern
  const descLower = desc.toLocaleLowerCase("tr");
  if (SPAM_PATTERNS.some((p) => p.test(desc))) {
    reasons.push({
      code: "SPAM_KEYWORDS",
      weight: 40,
      labelTr: "Spam/test paterni tespit edildi",
      labelEn: "Spam/test pattern detected"
    });
  } else if (desc.length < 30 && GENERIC_DESCRIPTIONS.some((g) => descLower === g || descLower.startsWith(g + " ") || descLower.endsWith(" " + g))) {
    reasons.push({
      code: "LOW_DETAIL",
      weight: 15,
      labelTr: "Açıklama çok genel",
      labelEn: "Description too generic"
    });
  }

  // 3) Aynı kullanıcıdan kısa sürede tekrar (RAPID_FIRE)
  if (ownerId && createdMs) {
    const sameUserRecent = allRequests.filter((r) => {
      if (r.id === req.id) return false;
      const oid = r.createdBy || r.userId || "";
      if (oid !== ownerId) return false;
      const ms = toMillis(r.createdAt) || 0;
      return ms > 0 && Math.abs(createdMs - ms) < 5 * 60 * 1000;
    });
    if (sameUserRecent.length >= 1) {
      reasons.push({
        code: "RAPID_FIRE",
        weight: 35,
        labelTr: `Aynı kullanıcıdan 5dk içinde ${sameUserRecent.length + 1} talep`,
        labelEn: `${sameUserRecent.length + 1} requests from same user in 5min`
      });
    }
  }

  // 4) Aynı kullanıcı + benzer açıklama (duplicate)
  if (ownerId && desc.length >= 10) {
    const dupes = allRequests.filter((r) => {
      if (r.id === req.id) return false;
      const oid = r.createdBy || r.userId || "";
      if (oid !== ownerId) return false;
      const d = `${r.description || ""}`.trim().toLocaleLowerCase("tr");
      return d.length > 0 && (d === descLower || (d.length > 15 && descLower.includes(d)) || (descLower.length > 15 && d.includes(descLower)));
    });
    if (dupes.length >= 1) {
      reasons.push({
        code: "DUPLICATE_USER",
        weight: 30,
        labelTr: "Aynı kullanıcıdan benzer içerikli talep",
        labelEn: "Duplicate content from same user"
      });
    }
  }

  // 5) Aynı küçük alanda (50m) farklı kullanıcılardan çok talep — koordineli sahte ihbar riski
  if (req.location?.lat && req.location?.lng && createdMs) {
    const nearby = allRequests.filter((r) => {
      if (r.id === req.id) return false;
      const ms = toMillis(r.createdAt) || 0;
      if (Math.abs(createdMs - ms) > 30 * 60 * 1000) return false;
      return distMeters(req.location, r.location) < 50;
    });
    // 3+ farklı kullanıcıdan dar alanda → şüpheli (gerçek afet olabilir, sadece flag)
    const uniqueOwners = new Set(
      nearby.map((r) => r.createdBy || r.userId || "").filter(Boolean)
    );
    if (uniqueOwners.size >= 3) {
      reasons.push({
        code: "GEO_CLUSTER",
        weight: 20,
        labelTr: `50m içinde ${uniqueOwners.size} farklı kullanıcıdan talep`,
        labelEn: `${uniqueOwners.size} different users requesting within 50m`
      });
    }
  }

  // 6) "Acil" işaretli ama açıklama kısa ve fotoğraf yok
  const isUrgent = urgency.includes("acil") || urgency.includes("high") || urgency.includes("yuksek") || urgency.includes("yüksek");
  if (isUrgent && !req.photoUrl && desc.length < 40) {
    reasons.push({
      code: "URGENT_NO_PROOF",
      weight: 15,
      labelTr: "Acil işaretli, kanıt (foto+detay) yetersiz",
      labelEn: "Marked urgent, insufficient evidence"
    });
  }

  const score = Math.min(100, reasons.reduce((acc, r) => acc + r.weight, 0));
  const level: FraudResult["level"] =
    score >= 70 ? "high" : score >= 40 ? "medium" : score >= 20 ? "low" : "clean";

  return { score, reasons, level };
};

export const fraudLevelColor = (level: FraudResult["level"]): string => {
  if (level === "high") return "#ef4444";
  if (level === "medium") return "#f59e0b";
  if (level === "low") return "#facc15";
  return "#22c55e";
};

export const fraudLevelLabel = (level: FraudResult["level"], locale?: string): string => {
  const en = locale === "en";
  if (level === "high") return en ? "HIGH RISK" : "YÜKSEK RİSK";
  if (level === "medium") return en ? "SUSPICIOUS" : "ŞÜPHELİ";
  if (level === "low") return en ? "LOW RISK" : "DÜŞÜK RİSK";
  return en ? "CLEAN" : "TEMİZ";
};
