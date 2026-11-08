import type { AppLocale } from "../store";

/**
 * I18N FILE MAP
 * - I18N-MESSAGES: locale bazlı statik metin sözlüğü (tr/en)
 * - I18N-T: key üzerinden sözlükten çeviri çeker
 * - I18N-L: inline iki dilli (tr/en) kısa seçim helper'ı
 */
const MESSAGES = {
  tr: {
    authLoginTitle: "Giriş Yap",
    authRegisterTitle: "Kayıt Ol",
    authName: "Ad Soyad",
    authTc: "TC Kimlik Numarası",
    authPhone: "Telefon Numarası",
    authEmail: "E-posta",
    authPassword: "Şifre",
    authPasswordAgain: "Şifre Tekrar",
    authForgotPassword: "Şifremi Unuttum",
    authNoAccount: "Hesabın yok mu?",
    authHaveAccount: "Zaten hesabın var mı?",
    authProcessing: "İşleniyor...",
    offlineBannerTitle: "Çevrimdışı Mod",
    offlineBannerSub: "Son senkron veriler gösteriliyor.",
    localeTurkish: "Türkçe",
    localeEnglish: "İngilizce",
    localeSwitchTitle: "Dil",
    localeSwitchSub: "Uygulama dili ayarı"
  },
  en: {
    authLoginTitle: "Sign In",
    authRegisterTitle: "Sign Up",
    authName: "Full Name",
    authTc: "National ID",
    authPhone: "Phone Number",
    authEmail: "Email",
    authPassword: "Password",
    authPasswordAgain: "Confirm Password",
    authForgotPassword: "Forgot Password",
    authNoAccount: "No account?",
    authHaveAccount: "Already have an account?",
    authProcessing: "Processing...",
    offlineBannerTitle: "Offline Mode",
    offlineBannerSub: "Showing last synced data.",
    localeTurkish: "Turkish",
    localeEnglish: "English",
    localeSwitchTitle: "Language",
    localeSwitchSub: "Application language"
  }
} as const;

export type I18nKey = keyof typeof MESSAGES.tr;

export const t = (locale: AppLocale, key: I18nKey): string => {
  return MESSAGES[locale]?.[key] || MESSAGES.tr[key];
};

export const l = (locale: AppLocale, tr: string, en: string): string => (locale === "en" ? en : tr);

const AUTO_TR_TO_EN_RULES: Array<[RegExp, string]> = [
  [/Giriş yapıldı\. Yönlendiriliyorsunuz\.\.\./gi, "Signed in. Redirecting..."],
  [/Giriş yapıldı/gi, "Signed in"],
  [/Yönlendiriliyorsunuz\.\.\./gi, "Redirecting..."],
  [/Lütfen bekleyin/gi, "Please wait"],
  [/Konum bekleniyor\.\.\./gi, "Waiting for location..."],
  [/Aktif talep yok/gi, "No active request"],
  [/TAM HARITA/gi, "FULL MAP"],
  [/CANLI İZLEME/gi, "LIVE TRACKING"],
  [/SOS Teslimat Logu/gi, "SOS Delivery Log"],
  [/Son durum/gi, "Latest status"],
  [/Kayıt yok/gi, "No record"],
  [/Acil SOS için butona basılı tutun\./gi, "Press and hold the SOS button for emergency mode."],
  [/Acil Araçlar Paneli/gi, "Emergency Tools Panel"],
  [/Acil Araçlar/gi, "Emergency Tools"],
  [/Acil Araçlar Pro ekranından aç/gi, "Open from Emergency Tools Pro screen"],
  [/Yüksek alarm sesi/gi, "High alarm tone"],
  [/Düdük sesi açılamadı\. expo-audio kurulumunu kontrol edin\./gi, "Whistle tone could not start. Check expo-audio setup."],
  [/Mors İşaretleyici/gi, "Morse Signaler"],
  [/MORS CALISIYOR\.\.\./gi, "MORSE RUNNING..."],
  [/MORS CALISTIR/gi, "RUN MORSE"],
  [/Sismograf \(Ortam Hareket İzleme\)/gi, "Seismograph (Ambient Motion Monitor)"],
  [/AKTIF/gi, "ACTIVE"],
  [/PASIF/gi, "PASSIVE"],
  [/PANELİ KAPAT/gi, "CLOSE PANEL"],
  [/Aile \/ Yakınlar Ağı/gi, "Family / Contacts Network"],
  [/Güvendeyim ve yardım sinyali listesi/gi, "Safety check and emergency signal list"],
  [/PAYLAS/gi, "SHARE"],
  [/YÖNET/gi, "MANAGE"],
  [/İLK YARDIM REHBERİ/gi, "FIRST AID GUIDE"],
  [/ONLINE/gi, "ONLINE"],
  [/Detaylı yardım talebi gönder/gi, "Send a detailed aid request"],
  [/Yardım ve konum görünümü/gi, "Aid and location view"],
  [/Yeni bildirim yok\./gi, "No new notifications."],
  [/TÜM UYARILAR/gi, "ALL ALERTS"],
  [/ACIL OZET/gi, "URGENT SUMMARY"],
  [/Su anda acil oncelikli yeni bildirim bulunmuyor\./gi, "There are no urgent priority notifications right now."],
  [/Yardım Talebi/gi, "Aid Request"],
  [/GÖNDER/gi, "SEND"],
  [/Anlaşıldı/gi, "Got it"],
  [/Bu başlık için içerik hazırlanıyor\./gi, "Content for this topic is being prepared."],
  [/Ana sayfa verileri yüklenemedi\./gi, "Home data could not be loaded."],
  [/SMS gönderilecek yakınınız bulunmuyor\./gi, "No contact found for SMS delivery."],
  [/SMS oluşturma ekranı açılamadı\./gi, "Could not open SMS composer."],
  [/112 arama ekranı açılamadı\./gi, "Could not open 112 dial screen."],
  [/SOS başlatıldı\. 112 arama ekranı açılıyor\.\.\./gi, "SOS started. Opening 112 dial screen..."],
  [/SOS akışında hata oluştu\./gi, "An error occurred during SOS flow."],
  [/\bAna Sayfa\b/gi, "Home"],
  [/\bHarita\b/gi, "Map"],
  [/\bMesajlar\b/gi, "Messages"],
  [/\bProfil\b/gi, "Profile"],
  [/\bTaleplerim\b/gi, "My Requests"],
  [/\bTalep\b/gi, "Request"],
  [/\bGönüllü\b/gi, "Volunteer"],
  [/\bAfetzede\b/gi, "Victim"],
  [/\bYönetici\b/gi, "Coordinator"],
  [/\bAcil\b/gi, "Urgent"],
  [/\bUyarılar\b/gi, "Alerts"],
  [/\bBildirim Merkezi\b/gi, "Notification Center"],
  [/\bTalep Oluştur\b/gi, "Create Request"],
  [/\bCanlı Harita\b/gi, "Live Map"],
  [/\bİlk Yardım Rehberi\b/gi, "First Aid Guide"],
  [/\bDurum\b/gi, "Status"],
  [/\bBekliyor\b/gi, "Waiting"],
  [/\bYardım yolda\b/gi, "Help on the way"],
  [/\bTamamlandı\b/gi, "Completed"],
  [/\bKaydet\b/gi, "Save"],
  [/\bSil\b/gi, "Delete"],
  [/\bGönder\b/gi, "Send"],
  [/\bKapat\b/gi, "Close"],
  [/\bDevam Et\b/gi, "Continue"],
  [/\bGeri\b/gi, "Back"],
  [/\bÇıkış Yap\b/gi, "Sign Out"],
  [/\bKonum\b/gi, "Location"],
  [/\bAçıklama\b/gi, "Description"],
  [/\bYükleniyor\b/gi, "Loading"],
  [/\bBaşarılı\b/gi, "Success"],
  [/\bHata\b/gi, "Error"],
  [/\bGörev\b/gi, "Task"],
  [/\bOnay Bekliyor\b/gi, "Pending Approval"],
  [/\bMüsait\b/gi, "Available"],
  [/\bMeşgul\b/gi, "Busy"],
  [/\bAskıda\b/gi, "Suspended"]
];

const AUTO_TR_TO_EN_PHRASES: Array<[string, string]> = [
  ["Afet Yardım Sistemi", "Disaster Aid System"],
  ["Güvendeyim", "I'm Safe"],
  ["Yakınlarım Ağı", "Family Safety Network"],
  ["Canlı Durum Özeti", "Live Status Summary"],
  ["Yakın Ekle", "Add Contact"],
  ["Kayıtlı Yakınlar", "Saved Contacts"],
  ["Acil Uyarılar", "Emergency Alerts"],
  ["Acil Araçlar", "Emergency Tools"],
  ["Acil Araçlar Pro", "Emergency Tools Pro"],
  ["Talep Durumu", "Request Status"],
  ["Talep Bilgileri", "Request Details"],
  ["Yardım Ulaştı", "Aid Arrived"],
  ["Yardım Yolda", "Aid on the Way"],
  ["Gönüllü Atandı", "Volunteer Assigned"],
  ["İnceleniyor", "Under Review"],
  ["Talep Alındı", "Request Received"],
  ["Tahmini Ulaşım Süresi", "Estimated Arrival Time"],
  ["Destek ile İletişime Geç", "Contact Support"],
  ["Yardım Talebi Oluştur", "Create Aid Request"],
  ["Akıllı Acil Form", "Smart Emergency Form"],
  ["Aciliyet Seviyesi", "Urgency Level"],
  ["Kişi Sayısı", "People Count"],
  ["Yaralı Sayısı", "Injured Count"],
  ["İlk Yardım", "First Aid"],
  ["Toplanma Alanı", "Assembly Area"],
  ["Toplanma Alanları", "Assembly Areas"],
  ["Harita yükleniyor...", "Loading map..."],
  ["KONUMUMA DÖN", "RETURN TO MY LOCATION"],
  ["Mesaj hattı aktif.", "Message channel active."],
  ["Yönetici Dashboard", "Coordinator Dashboard"],
  ["Operasyon Komuta Merkezi", "Operations Command Center"],
  ["Bildirim Merkezi", "Notification Center"],
  ["Duyuru Merkezi", "Announcement Center"],
  ["Görev Atama Motoru", "Task Assignment Engine"],
  ["Gönüllü Merkezi", "Volunteer Hub"],
  ["Aday / Yeni", "Candidate / New"]
];

const AUTO_TR_TO_EN_WORDS: Array<[string, string]> = [
  ["ana", "home"],
  ["sayfa", "page"],
  ["taleplerim", "my requests"],
  ["talepler", "requests"],
  ["talep", "request"],
  ["yardım", "aid"],
  ["durum", "status"],
  ["bildirim", "notification"],
  ["bildirimler", "notifications"],
  ["uyarı", "alert"],
  ["uyarılar", "alerts"],
  ["harita", "map"],
  ["mesaj", "message"],
  ["mesajlar", "messages"],
  ["profil", "profile"],
  ["giriş", "sign in"],
  ["kayıt", "sign up"],
  ["şifre", "password"],
  ["telefon", "phone"],
  ["konum", "location"],
  ["gönüllü", "volunteer"],
  ["afetzede", "victim"],
  ["yönetici", "coordinator"],
  ["duyuru", "announcement"],
  ["duyurular", "announcements"],
  ["onay", "approval"],
  ["bekliyor", "waiting"],
  ["bekleyen", "pending"],
  ["tamamlandı", "completed"],
  ["tamamla", "complete"],
  ["açık", "open"],
  ["acil", "urgent"],
  ["düşük", "low"],
  ["orta", "medium"],
  ["yüksek", "high"],
  ["görev", "mission"],
  ["görevler", "missions"],
  ["merkezi", "center"],
  ["rota", "route"],
  ["yakın", "nearby"],
  ["yakınlarım", "my contacts"],
  ["güvendeyim", "i'm safe"],
  ["ilk", "first"],
  ["rehberi", "guide"],
  ["ekle", "add"],
  ["sil", "delete"],
  ["düzenle", "edit"],
  ["kaydet", "save"],
  ["yenile", "refresh"],
  ["oluştur", "create"],
  ["üstlen", "claim"],
  ["ata", "assign"],
  ["gönder", "send"],
  ["geri", "back"],
  ["devam", "continue"],
  ["çıkış", "sign out"],
  ["çevrimdışı", "offline"],
  ["çevrimiçi", "online"],
  ["müsait", "available"],
  ["meşgul", "busy"],
  ["askıda", "suspended"]
];

const escapeRegExp = (v: string): string => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const autoLocaleText = (locale: AppLocale, text: string): string => {
  if (locale !== "en") return text;
  let out = text;
  for (const [rule, replacement] of AUTO_TR_TO_EN_RULES) {
    out = out.replace(rule, replacement);
  }
  for (const [tr, en] of AUTO_TR_TO_EN_PHRASES.sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(escapeRegExp(tr), "gi"), en);
  }
  for (const [trWord, enWord] of AUTO_TR_TO_EN_WORDS.sort((a, b) => b[0].length - a[0].length)) {
    out = out.replace(new RegExp(`\\b${escapeRegExp(trWord)}\\b`, "gi"), enWord);
  }
  return out;
};
