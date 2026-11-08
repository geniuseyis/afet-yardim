/**
 * UTC+3 (Europe/Istanbul) timezone ile tarih/saat formatlama yardımcıları.
 * Uygulamadaki tüm tarih/saat gösterimi bu fonksiyonlardan geçmeli.
 */

const TZ = "Europe/Istanbul";

/** "14:32" formatında saat döner — UTC+3 */
export const formatTime = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleTimeString(
      locale === "en" ? "en-US" : "tr-TR",
      { hour: "2-digit", minute: "2-digit", timeZone: TZ }
    );
  } catch {
    return "--:--";
  }
};

/** "14 Oca" veya "Jan 14" formatında kısa tarih döner — UTC+3 */
export const formatDateShort = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleDateString(
      locale === "en" ? "en-US" : "tr-TR",
      { day: "numeric", month: "short", timeZone: TZ }
    );
  } catch {
    return "-";
  }
};

/** "14 Ocak 2025 14:32" formatında tam tarih+saat döner — UTC+3 */
export const formatDateTime = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleString(
      locale === "en" ? "en-US" : "tr-TR",
      { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ }
    );
  } catch {
    return "-";
  }
};

/** "14.01.2025" formatında tarih döner — UTC+3 */
export const formatDateNumeric = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleDateString(
      locale === "en" ? "en-US" : "tr-TR",
      { day: "2-digit", month: "2-digit", year: "numeric", timeZone: TZ }
    );
  } catch {
    return "-";
  }
};

/** "14 Ocak" veya "January 14" formatında ay+gün döner — UTC+3 */
export const formatMonthDay = (ms: number, locale: string): string => {
  try {
    return new Date(ms).toLocaleDateString(
      locale === "en" ? "en-US" : "tr-TR",
      { day: "numeric", month: "long", timeZone: TZ }
    );
  } catch {
    return "-";
  }
};

/** Kaç dakika/saat/gün önce döner — UTC+3 farkına göre */
export const formatRelative = (ms: number, locale: string): string => {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);

  if (locale === "en") {
    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  }
  if (minutes < 1) return "az önce";
  if (minutes < 60) return `${minutes}dk önce`;
  if (hours < 24) return `${hours}sa önce`;
  return `${days}g önce`;
};
