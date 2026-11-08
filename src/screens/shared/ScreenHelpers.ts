import { C } from "./ScreenConstants";

export const toMillis = (value: any): number => {
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (typeof value?.seconds === "number") return value.seconds * 1000;
  return 0;
};

export const isUrgent = (u?: string): boolean => {
  const s = `${u || ""}`.toLowerCase();
  return s.includes("acil") || s.includes("yuksek") || s.includes("yüksek") || s.includes("high") || s.includes("urgent");
};

// Aciliyet değerini locale'e göre okunabilir etikete çevirir
export const urgencyLabel = (u?: string, locale?: string): string => {
  const s = `${u || ""}`.toLowerCase();
  const isHigh = s.includes("acil") || s.includes("yüksek") || s.includes("yuksek") || s.includes("high") || s.includes("urgent");
  const isMedium = s.includes("orta") || s.includes("medium");
  const isLow = s.includes("düşük") || s.includes("dusuk") || s.includes("low");
  if (locale === "en") {
    if (isHigh) return "Urgent";
    if (isMedium) return "Medium";
    if (isLow) return "Low";
    return u || "Normal";
  }
  if (isHigh) return "Acil";
  if (isMedium) return "Orta";
  if (isLow) return "Düşük";
  return u || "Normal";
};

// Türkçe karakter normalizasyonu
const normTR = (s: string) =>
  s.toLocaleLowerCase("tr-TR")
   .replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ü/g, "u")
   .replace(/ö/g, "o").replace(/ı/g, "i").replace(/ç/g, "c")
   .replace(/İ/g, "i").replace(/Ş/g, "s").replace(/Ğ/g, "g");

export const requestTypeMeta = (type?: string): { icon: any; color: string; bg: string; label: string } => {
  const t = normTR(`${type || ""}`);
  if (t.includes("kaza") || t.includes("trafik") || t.includes("arac kaza") || t.includes("carpis") || t.includes("accident")) return { icon: "car-sport", color: "#b91c1c", bg: "#fee2e2", label: type || "Trafik / Araç Kazası" };
  if (t.includes("yangin") || t.includes("alev") || t.includes("fire")) return { icon: "flame", color: "#ea580c", bg: "#ffedd5", label: type || "Yangın" };
  if (t.includes("enkaz") || t.includes("cokme") || t.includes("kurtarma") || t.includes("debris") || t.includes("rescue")) return { icon: "construct", color: "#7c2d12", bg: "#fed7aa", label: type || "Enkaz / Arama-Kurtarma" };
  if (t.includes("sel") || t.includes("su baskin") || t.includes("tasma") || t.includes("flood")) return { icon: "rainy", color: "#0369a1", bg: "#dbeafe", label: type || "Sel / Su Baskını" };
  if (t.includes("yapisal") || t.includes("catlak") || t.includes("hasar") || t.includes("structural")) return { icon: "warning", color: "#a16207", bg: "#fef3c7", label: type || "Yapısal Hasar" };
  if (t.includes("gaz") || t.includes("kacak") || t.includes("kimyasal") || t.includes("hazmat") || t.includes("gas")) return { icon: "skull", color: "#7c3aed", bg: "#ede9fe", label: type || "Gaz Kaçağı / Tehlikeli Madde" };
  if (t.includes("kayip") || t.includes("missing")) return { icon: "person-remove", color: "#be185d", bg: "#fce7f3", label: type || "Kayıp Kişi" };
  if (t.includes("hayvan") || t.includes("animal")) return { icon: "paw", color: "#0d9488", bg: "#ccfbf1", label: type || "Hayvan Kurtarma" };
  if (t.includes("saglik") || t.includes("ilac") || t.includes("tibbi") || t.includes("yarali") || t.includes("medical") || t.includes("health")) return { icon: "medical", color: "#dc2626", bg: "#fee2e2", label: type || "Sağlık / Yaralı" };
  if (t.includes("barin") || t.includes("cadir") || t.includes("kamp") || t.includes("shelter")) return { icon: "home", color: "#65a30d", bg: "#ecfccb", label: type || "Barınma" };
  if (t.includes("gida") || t.includes("yiyecek") || t.includes("erzak") || t.includes("food")) return { icon: "fast-food", color: "#d97706", bg: "#fef3c7", label: type || "Gıda" };
  if (t.includes("bebek") || t.includes("cocuk") || t.includes("baby") || t.includes("child")) return { icon: "happy", color: "#8b5cf6", bg: "#ede9fe", label: type || "Bebek" };
  if (t.includes("su") || t.includes("elektrik") || t.includes("altyapi") || t.includes("water")) return { icon: "water", color: "#0284c7", bg: "#e0f2fe", label: type || "Su / Elektrik" };
  if (t.includes("ulasim") || t.includes("tasima") || t.includes("transport")) return { icon: "car", color: "#0891b2", bg: "#e0f7fa", label: type || "Ulaşım" };
  if (t.includes("psikolojik") || t.includes("destek") || t.includes("mental") || t.includes("psych")) return { icon: "heart", color: "#e879f9", bg: "#fdf4ff", label: type || "Psikolojik Destek" };
  if (t.includes("guvenlik") || t.includes("security")) return { icon: "shield", color: "#1e40af", bg: "#dbeafe", label: type || "Güvenlik" };
  return { icon: "apps", color: "#6b7280", bg: "#f3f4f6", label: type || "Diğer" };
};

export const kmBetween = (
  current?: { latitude: number; longitude: number } | null,
  target?: { lat?: number; lng?: number } | null
): string | null => {
  if (!current || typeof target?.lat !== "number" || typeof target?.lng !== "number") return null;
  const toRad = (deg: number): number => (deg * Math.PI) / 180;
  const dLat = toRad(target.lat - current.latitude);
  const dLng = toRad(target.lng - current.longitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(current.latitude)) * Math.cos(toRad(target.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (6371 * c).toFixed(1);
};
