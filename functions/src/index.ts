import { createHash, createHmac, randomBytes, randomInt, randomUUID } from "crypto";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated, onDocumentWritten } from "firebase-functions/v2/firestore";
import { logger, setGlobalOptions } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";
import { initializeApp } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";
import { getStorage } from "firebase-admin/storage";
import OpenAI from "openai";
import { canTransitionRequest, detectRisk, resolvedRole, transitionStatusForAction, urgentScore } from "./domain";
import type { Role } from "./domain";
import { mustAuth } from "./guards";

initializeApp();
setGlobalOptions({ maxInstances: 10, region: "us-central1" });

const db = getFirestore();
const storage = getStorage();
const messaging = getMessaging();
let openaiClient: OpenAI | null = null;
type AiProvider = "auto" | "openai" | "gemini";

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE SECRET MANAGER TANIMI
// ─────────────────────────────────────────────────────────────────────────────
// defineSecret(): Google Cloud Secret Manager'da saklanan hassas değerleri
// (API anahtarları, şifreler) Firebase Functions'a güvenli şekilde bağlar.
// Bu değerler kaynak kodda YAZILMAZ; Cloud'da şifreli tutulur.
// Uygulama çalışırken .value() metodu ile okunur.
const OPENAI_API_KEY_SECRET = defineSecret("OPENAI_API_KEY");
const GEMINI_API_KEY_SECRET = defineSecret("GEMINI_API_KEY");
// Twilio SMS servisi
const TWILIO_ACCOUNT_SID_SECRET = defineSecret("TWILIO_ACCOUNT_SID");
const TWILIO_AUTH_TOKEN_SECRET = defineSecret("TWILIO_AUTH_TOKEN");
const TWILIO_FROM_NUMBER_SECRET = defineSecret("TWILIO_FROM_NUMBER");
const TWILIO_WHATSAPP_FROM_SECRET = defineSecret("TWILIO_WHATSAPP_FROM");
// E-posta: Gmail SMTP — firebase functions:secrets:set MAIL_USER / MAIL_PASS
const MAIL_USER_SECRET = defineSecret("MAIL_USER");
const MAIL_PASS_SECRET = defineSecret("MAIL_PASS");

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI FONKSİYON: getSecretOrEnv
// ─────────────────────────────────────────────────────────────────────────────
// Önce Firebase Secret Manager'dan (.value()) okumayı dener.
// Eğer secret bağlı değilse (örn. lokal geliştirme ortamı) process.env'e düşer.
// Bu sayede hem production hem de local ortamda çalışır.
const getSecretOrEnv = (
  secret: { value: () => string },
  envName: "OPENAI_API_KEY" | "GEMINI_API_KEY" | "TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_FROM_NUMBER" | "TWILIO_WHATSAPP_FROM"
): string => {
  try {
    const v = `${secret.value() || ""}`.trim();
    if (v) return v;
  } catch {
    // Secret runtime'da bağlı değilse .env fallback'e geç.
  }
  return `${process.env[envName] || ""}`.trim();
};

const getOpenAIClient = (): OpenAI | null => {
  const apiKey = getSecretOrEnv(OPENAI_API_KEY_SECRET, "OPENAI_API_KEY");
  if (!apiKey) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
};

const getGeminiApiKey = (): string => getSecretOrEnv(GEMINI_API_KEY_SECRET, "GEMINI_API_KEY");

// kotuye kullanim siniri, sayac rate_limits koleksiyonunda ve istemciye kapali
const consumeQuota = async (key: string, limit: number, windowSec: number): Promise<void> => {
  const id = createHash("sha256").update(key).digest("hex").slice(0, 40);
  const ref = db.collection("rate_limits").doc(id);
  const now = Date.now();
  const allowed = await db.runTransaction(async (tx) => {
    const row = (await tx.get(ref)).data() || {};
    const expired = !row.resetAtMs || now > Number(row.resetAtMs);
    const count = expired ? 0 : Number(row.count || 0);
    if (count >= limit) return false;
    tx.set(ref, { count: count + 1, resetAtMs: expired ? now + windowSec * 1000 : row.resetAtMs }, { merge: true });
    return true;
  });
  if (!allowed) throw new HttpsError("resource-exhausted", "Çok fazla deneme yapıldı. Lütfen daha sonra tekrar deneyin.");
};

// ─────────────────────────────────────────────────────────────────────────────
// E-POSTA: sendMail — nodemailer + Gmail SMTP
// ─────────────────────────────────────────────────────────────────────────────
const sendMail = async (to: string, subject: string, html: string): Promise<void> => {
  const mailUser = MAIL_USER_SECRET.value?.() || process.env.MAIL_USER || "";
  const mailPass = MAIL_PASS_SECRET.value?.() || process.env.MAIL_PASS || "";
  if (!mailUser || !mailPass) { logger.warn("[mail] MAIL_USER/MAIL_PASS secret eksik"); return; }
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const nodemailer = require("nodemailer") as typeof import("nodemailer");
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user: mailUser, pass: mailPass } });
  await transporter.sendMail({ from: `"Afet Yardım" <${mailUser}>`, to, subject, html });
};

export const sendVerificationEmail = onCall(
  { secrets: ["MAIL_USER", "MAIL_PASS"] },
  async (request) => {
    // yalnizca oturum sahibinin kendi adresine gider
    const { uid, token } = mustAuth(request.auth);
    const email = `${(token as any)?.email || ""}`.trim();
    if (!email) throw new HttpsError("failed-precondition", "Hesapta e-posta yok.");
    await consumeQuota(`mail-verify:${uid}`, 5, 3600);
    const { emailVerificationTemplate } = await import("./emailTemplates.js");
    try {
      const link = await getAuth().generateEmailVerificationLink(email, {
        url: "https://afetyardim-79135.web.app/verified"
      });
      await sendMail(email, "Afet Yardım — E-postanı Doğrula", emailVerificationTemplate(link, email));
      return { success: true };
    } catch (err: any) {
      logger.error("[sendVerificationEmail]", err?.message);
      throw new HttpsError("internal", "Mail gönderilemedi.");
    }
  }
);

export const sendCustomPasswordResetEmail = onCall(
  { secrets: ["MAIL_USER", "MAIL_PASS"] },
  async (request) => {
    const email = `${request.data?.email || ""}`.trim().toLowerCase();
    if (!email || email.length > 254 || !email.includes("@")) {
      throw new HttpsError("invalid-argument", "email gerekli");
    }
    await consumeQuota(`mail-reset:${email}`, 3, 3600);
    const { passwordResetTemplate } = await import("./emailTemplates.js");
    try {
      const link = await getAuth().generatePasswordResetLink(email, {
        url: "https://afetyardim-79135.web.app/reset"
      });
      await sendMail(email, "Afet Yardım — Şifre Sıfırlama", passwordResetTemplate(link, email));
    } catch (err: any) {
      // hesabin var olup olmadigi disariya sizmasin
      logger.warn("[sendCustomPasswordResetEmail]", err?.code || err?.message);
    }
    return { success: true };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI FONKSİYON: getTwilioConfig
// ─────────────────────────────────────────────────────────────────────────────
// Twilio'ya bağlanmak için gerekli 3 değeri Secret Manager'dan okuyup
// tek bir nesne olarak döndürür.
// Bu fonksiyon sendTwilioSms() içinden çağrılır.
const getTwilioConfig = () => ({
  accountSid: getSecretOrEnv(TWILIO_ACCOUNT_SID_SECRET, "TWILIO_ACCOUNT_SID"),
  authToken: getSecretOrEnv(TWILIO_AUTH_TOKEN_SECRET, "TWILIO_AUTH_TOKEN"),
  from: getSecretOrEnv(TWILIO_FROM_NUMBER_SECRET, "TWILIO_FROM_NUMBER")
});


const requestGemini = async (payload: { prompt: string }): Promise<string | null> => {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  const fetchAny = (globalThis as any).fetch as ((...args: any[]) => Promise<any>) | undefined;
  if (!fetchAny) return null;
  try {
    const response = await fetchAny(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: payload.prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 500
          }
        })
      }
    );
    if (!response?.ok) {
      logger.warn("[chatWithAi] gemini request failed", { status: response?.status });
      return null;
    }
    const json = await response.json();
    const text = `${json?.candidates?.[0]?.content?.parts?.[0]?.text || ""}`.trim();
    return text || null;
  } catch (e) {
    logger.warn("[chatWithAi] gemini exception", e as any);
    return null;
  }
};

const requestOpenAI = async (payload: { prompt: string }): Promise<string | null> => {
  const openai = getOpenAIClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        { role: "user", content: payload.prompt }
      ]
    });
    const text = completion.choices[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    logger.warn("[chatWithAi] openai exception", e as any);
    return null;
  }
};

const buildServerFallbackAiReply = (message: string, escalationFlag: boolean): string => {
  const q = `${message || ""}`.trim().toLocaleLowerCase("tr");
  if (escalationFlag) {
    return "Acil risk algılandı. 1) Güvenli alana geçin. 2) 112'yi arayın. 3) Konum ve yaralı sayısını paylaşın. Gerekirse koordinatör hattına aktarım başlatın.";
  }
  if (/(merhaba|selam|selamlar|iyi günler)/i.test(q)) {
    return "Merhaba, ben Afet.AI. Durumunuzu kısaca yazarsanız size adım adım yönlendirme verebilirim.";
  }
  if (/(nasılsın|naber|nasilsin|nbr)/i.test(q)) {
    return "Hazırım. Size yardımcı olabilmem için olay türü, konum ve kişi/yaralı sayısını yazın.";
  }
  if (q.includes("konum")) {
    return "Konum paylaşımı için harita ekranında canlı konumu açın, ardından buraya koordinatı veya adresi yazın.";
  }
  if (q.includes("deprem")) {
    return "Deprem sonrası önce güvenli alan, sonra gaz/elektrik kontrolü, ardından toplanma alanına geçiş önerilir. Yaralı varsa 112'yi önceliklendirin.";
  }
  if (q.includes("kanama") || q.includes("yaralı") || q.includes("ilk yardım")) {
    return "İlk yardım önceliği: ortam güvenliği, bilinç/solunum kontrolü, kanama varsa doğrudan bası. Kritik durumda 112 ile eş zamanlı ilerleyin.";
  }
  const shortMsg = `${message || ""}`.trim().slice(0, 120);
  return `Mesajınızı aldım: "${shortMsg}". Daha net yönlendirme için olay türü, konum, kişi sayısı ve aciliyet bilgisini ekleyin.`;
};

// Telefon numarasından rakam dışındaki karakterleri temizler, max 11 hane alır.
// Örnek: "0532 123 45 67" → "05321234567"
const normalizeDigits11 = (value: unknown): string => `${value || ""}`.replace(/\D/g, "").slice(0, 11);

// SMS gönderimi için telefon numarasını temizler, max 15 hane alır (uluslararası format).
// Örnek: "+90 532 123 4567" → "905321234567"
const normalizePhoneForSms = (value: unknown): string => `${value || ""}`.replace(/\D/g, "").slice(0, 15);

// ─────────────────────────────────────────────────────────────────────────────
// GİZLİLİK: FNV-1a Hash Algoritması
// ─────────────────────────────────────────────────────────────────────────────
// TC kimlik no ve telefon gibi kişisel verileri veritabanında AÇIK saklamak
// yerine tek yönlü hash'e çeviririz. Böylece veri sızıntısında gerçek değerler
// ele geçirilmez. FNV-1a hızlı ve deterministik bir hash algoritmasıdır.
const fnv1a32 = (input: string): string => {
  let hash = 0x811c9dc5; // FNV offset basis sabit başlangıç değeri
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);           // XOR: karakter kodu ile hash'i karıştır
    hash = Math.imul(hash, 0x01000193) >>> 0; // FNV prime ile çarp, 32 bite sığdır
  }
  return hash.toString(16).padStart(8, "0"); // 8 karakterlik hex string döndür
};

// piiHash: Kişisel veriyi (TC, telefon, e-posta) scope etiketi ile hash'ler.
// Örnek: piiHash("phone", "05321234567") → "a3f2c1d8"
// Aynı telefon numarası her zaman aynı hash'i verir → kayıt çakışması tespitinde kullanılır.
const piiHash = (scope: "tcNo" | "phone" | "email", value: string): string =>
  value ? fnv1a32(`afy-v1|${scope}|${value}`) : "";

// smsCodeHash: SMS doğrulama kodunu veritabanında açık saklamak yerine hash'ler.
// uid + code birlikte hash'lenir → farklı kullanıcıların aynı kodu tahmin etmesi engellenir.
const smsCodeHash = (uid: string, code: string, salt: string): string =>
  createHmac("sha256", salt).update(`${uid}|${code}`).digest("hex");

// ─────────────────────────────────────────────────────────────────────────────
// ANA FONKSİYON: sendTwilioSms
// ─────────────────────────────────────────────────────────────────────────────
// Twilio REST API kullanarak gerçek bir SMS gönderir.
//
// PARAMETRE:
//   to   → alıcı telefon numarası (E.164 formatı: +905321234567)
//   body → SMS içeriği (doğrulama kodu metni)
//
// DÖNÜŞ:
//   true  → SMS başarıyla gönderildi
//   false → credentials eksik veya Twilio hatası → üst katman mock moda geçer
//
// NASIL ÇALIŞIR:
//   1. getTwilioConfig() ile secret değerleri okunur
//   2. Credentials eksikse hata loglanır, false döner
//   3. Twilio REST endpoint'ine HTTP POST atılır
//   4. Authorization: Basic auth header ile kimlik doğrulanır
//      (accountSid:authToken base64 encode edilir)
//   5. Form-urlencoded body ile From/To/Body parametreleri gönderilir
//   6. HTTP 2xx yanıtı → true, hata yanıtı → error loglanır, false döner
const sendTwilioSms = async (to: string, body: string): Promise<boolean> => {
  // Secret Manager'dan Twilio kimlik bilgilerini oku
  const conf = getTwilioConfig();
  const { accountSid, authToken, from } = conf;

  logger.info("[sms] twilio attempt", { hasSid: !!accountSid, hasToken: !!authToken, hasFrom: !!from });

  // Herhangi bir credential eksikse SMS gönderilemez → false döner
  if (!accountSid || !authToken || !from) {
    logger.error("[sms] secrets bos - mock moda dusuyor");
    return false;
  }

  // Node.js Cloud Run ortamında global fetch kullanılabilir (Node 18+)
  const fetchAny = (globalThis as any).fetch as ((...args: any[]) => Promise<any>) | undefined;
  if (!fetchAny) return false;

  // Twilio Messages API endpoint'i: hesap SID URL'e encode edilerek eklenir
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(conf.accountSid)}/Messages.json`;

  // HTTP Basic Authentication: "accountSid:authToken" → base64
  const basic = Buffer.from(`${conf.accountSid}:${conf.authToken}`).toString("base64");

  // Twilio API application/x-www-form-urlencoded formatı bekler
  const params = new URLSearchParams();
  params.append("From", conf.from); // Twilio'dan satın alınan numara (gönderen)
  params.append("To", to);          // Kullanıcının telefon numarası (alıcı)
  params.append("Body", body);      // SMS içeriği

  try {
    const res = await fetchAny(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: params.toString()
    });

    if (!res?.ok) {
      // HTTP 4xx/5xx → Twilio hata detayını logla
      const errBody = await res?.text?.().catch(() => "(body okunamadi)");
      logger.error("[sms] twilio error", { status: res?.status, body: errBody, to, from: conf.from });
      return false;
    }

    return true; // HTTP 2xx → SMS kuyruğa alındı
  } catch (e) {
    // Ağ hatası veya beklenmeyen exception
    logger.error("[sms] twilio fetch exception", { err: String(e), to });
    return false;
  }
};


const sendTwilioWhatsApp = async (to: string, body: string): Promise<boolean> => {
  const conf = getTwilioConfig();
  const whatsappFromRaw = getSecretOrEnv(TWILIO_WHATSAPP_FROM_SECRET, "TWILIO_WHATSAPP_FROM");
  const { accountSid, authToken } = conf;

  if (!accountSid || !authToken || !whatsappFromRaw) {
    logger.warn("[whatsapp] secrets eksik — TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM gerekli");
    return false;
  }

  const fetchAny = (globalThis as any).fetch as ((...args: any[]) => Promise<any>) | undefined;
  if (!fetchAny) return false;

  // e164 formatı: +905XXXXXXXXX
  const e164 = to.replace(/\D/g, "");
  const toFormatted = e164.startsWith("90") ? `+${e164}` : e164.startsWith("0") ? `+9${e164}` : `+${e164}`;

  // From: whatsapp: prefix'i zaten varsa ekleme
  const fromFormatted = whatsappFromRaw.startsWith("whatsapp:") ? whatsappFromRaw : `whatsapp:${whatsappFromRaw}`;
  const toWA = `whatsapp:${toFormatted}`;

  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const basic = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  const params = new URLSearchParams();
  params.append("From", fromFormatted);
  params.append("To", toWA);
  params.append("Body", body);

  logger.info("[whatsapp] gönderiliyor", { from: fromFormatted, to: toWA });

  try {
    const res = await fetchAny(endpoint, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString()
    });

    const resText = await res?.text?.().catch(() => "");
    if (!res?.ok) {
      logger.error("[whatsapp] twilio hata", { status: res?.status, body: resText, to: toWA });
      return false;
    }
    logger.info("[whatsapp] gönderildi", { to: toWA, status: res?.status });
    return true;
  } catch (e) {
    logger.error("[whatsapp] fetch exception", { err: String(e), to: toWA });
    return false;
  }
};

const normalizeRoleValue = (value: unknown): Role | null => {
  const role = `${value || ""}`.trim().toLocaleLowerCase("tr");
  if (!role) return null;
  if (["coordinator", "yonetici", "yönetici", "admin"].includes(role)) return "coordinator";
  if (["volunteer", "gonullu", "gönüllü"].includes(role)) return "volunteer";
  if (["victim", "afetzede"].includes(role)) return "victim";
  return null;
};

const resolvedRoleWithFallback = async (uid: string, token: any): Promise<Role | null> => {
  const claimRole = resolvedRole(token);
  if (claimRole) return claimRole;
  const userSnap = await db.collection("users").doc(uid).get();
  if (!userSnap.exists) return null;
  const data = userSnap.data() || {};
  if (data.isCoordinator === true) return "coordinator";
  return normalizeRoleValue(data.role);
};

const mustRole = async (uid: string, token: any, expected: Role): Promise<Role> => {
  const r = await resolvedRoleWithFallback(uid, token);
  if (r !== expected) throw new HttpsError("permission-denied", "Yetkiniz yok.");
  return r;
};

const writeAudit = async (payload: {
  actorId: string;
  actorRole: string | null;
  action: string;
  entityType: string;
  entityId: string;
  diff?: Record<string, unknown>;
}) => {
  await db.collection("audit_logs").add({
    ...payload,
    createdAt: FieldValue.serverTimestamp()
  });
};

const getDeviceTokens = async (uid: string): Promise<string[]> => {
  const snap = await db.collection("users").doc(uid).collection("devices").get();
  return snap.docs.map((d) => `${d.data()?.token || d.id}`).filter(Boolean);
};

const sendStatusNotification = async (requestId: string, payload: any): Promise<void> => {
  const targets = [payload?.createdBy, payload?.assignedVolunteerId].filter(Boolean) as string[];
  if (!targets.length) return;
  const tokenSets = await Promise.all(targets.map((uid) => getDeviceTokens(uid)));
  const tokens = [...new Set(tokenSets.flat())];
  if (!tokens.length) return;

  await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title: "Afet Yardim",
      body: `Talep durumu guncellendi: ${payload?.status || "Bilinmiyor"}`
    },
    data: { requestId, type: "request_status" },
    android: { priority: "high", notification: { channelId: "operations" } }
  });
};

export const createRequest = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await mustRole(uid, token, "victim");

  const data = request.data || {};
  const type = `${data?.type || ""}`.trim();
  const urgency = `${data?.urgency || ""}`.trim();
  const description = `${data?.description || ""}`.trim();
  const location = data?.location || {};

  if (!type || !description) throw new HttpsError("invalid-argument", "Talep alani eksik.");
  if (typeof location?.lat !== "number" || typeof location?.lng !== "number") {
    throw new HttpsError("invalid-argument", "Konum zorunlu.");
  }

  const docRef = await db.collection("requests").add({
    createdBy: uid,
    type,
    urgency,
    description,
    location,
    source: "mobile",
    status: "open",
    priorityScore: urgentScore(urgency),
    sla: { targetMinutes: urgency.toLowerCase().includes("acil") ? 20 : 45 },
    timeline: [
      {
        status: "open",
        at: FieldValue.serverTimestamp(),
        note: "Talep alindi"
      }
    ],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  await writeAudit({
    actorId: uid,
    actorRole: role,
    action: "REQUEST_CREATE",
    entityType: "request",
    entityId: docRef.id
  });

  return { requestId: docRef.id };
});

export const checkRegistrationConflicts = onCall(async (request) => {
  // kayit oncesi cagrilir, oturum yok; ip basina sinirlanir
  await consumeQuota(`conflicts:${request.rawRequest?.ip || "unknown"}`, 20, 3600);
  const data = request.data || {};
  const tcNo = normalizeDigits11(data?.tcNo);
  const phone = normalizeDigits11(data?.phone);

  if (tcNo.length !== 11 || phone.length !== 11) {
    throw new HttpsError("invalid-argument", "TC ve telefon 11 hane olmali.");
  }

  const tcHash = piiHash("tcNo", tcNo);
  const phoneHash = piiHash("phone", phone);

  const [tcHashSnap, phoneHashSnap, tcLegacySnap, phoneLegacySnap, tcNestedLegacySnap, phoneNestedLegacySnap] = await Promise.all([
    db.collection("users").where("tcNo_hash", "==", tcHash).limit(1).get(),
    db.collection("users").where("phone_hash", "==", phoneHash).limit(1).get(),
    db.collection("users").where("tcNo", "==", tcNo).limit(1).get(),
    db.collection("users").where("phone", "==", phone).limit(1).get(),
    // Legacy compatibility: old onboarding bug wrote tc/phone under "skills" object.
    db.collection("users").where("skills.tcNo", "==", tcNo).limit(1).get(),
    db.collection("users").where("skills.phone", "==", phone).limit(1).get()
  ]);

  return {
    tcExists: !tcHashSnap.empty || !tcLegacySnap.empty || !tcNestedLegacySnap.empty,
    phoneExists: !phoneHashSnap.empty || !phoneLegacySnap.empty || !phoneNestedLegacySnap.empty
  };
});

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CLOUD FUNCTION: sendPhoneVerificationCode
// ─────────────────────────────────────────────────────────────────────────────
// Mobil uygulamadan çağrılan (onCall) Firebase Cloud Function.
// Kullanıcı "KOD GÖNDER" butonuna bastığında React Native bu fonksiyonu çağırır.
//
// ADIMLAR:
//   1. Kullanıcının oturum açık mı kontrol et (mustAuth)
//   2. Gelen telefon numarasının formatlı olduğunu doğrula
//   3. Firestore'daki kullanıcı profilinden kayıtlı telefon hash'ini karşılaştır
//      → Başka birinin telefon numarasıyla kod istenemez
//   4. 6 haneli rastgele doğrulama kodu üret (örn: 482 913)
//   5. Kodun hash'ini + süresini Firestore'a yaz (phone_verifications/{uid})
//      → Kodu açık saklamıyoruz, sadece hash'ini saklıyoruz (güvenlik)
//   6. Twilio ile gerçek SMS gönder → sentReal: true/false
//   7. mode: "real" veya "mock" döndür
//      → "real": SMS gönderildi, "mock": demo mod (credentials yok)
//
// secrets: [...] → Bu fonksiyon çalışırken Twilio secret'ları Cloud Run'a mount edilir.
// Bu olmazsa getTwilioConfig() boş değer döndürür ve SMS mock moda geçer.
export const sendPhoneVerificationCode = onCall(
  { secrets: [TWILIO_ACCOUNT_SID_SECRET, TWILIO_AUTH_TOKEN_SECRET, TWILIO_FROM_NUMBER_SECRET, TWILIO_WHATSAPP_FROM_SECRET] },
  async (request) => {
  // Adım 1: Oturum doğrulama — giriş yapmamış kullanıcı istek atamaz
  const { uid } = mustAuth(request.auth);

  // Adım 2: Telefon numarasını temizle ve uzunluk kontrolü yap
  const rawPhone = normalizePhoneForSms(request.data?.phone);
  if (rawPhone.length < 10) throw new HttpsError("invalid-argument", "Gecerli telefon gerekli.");
  await consumeQuota(`sms:${uid}`, 5, 3600);

  // Adım 3: Firestore'dan kullanıcı profilini oku
  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Kullanici profili bulunamadi.");
  const userData = userSnap.data() || {};

  // Kayıtta telefon hash'i varsa, girilen numara ile eşleş kontrolü yap
  // → Başka bir telefona kod gönderilmesini engeller
  const expectedHash = `${userData?.phone_hash || ""}`.trim();
  if (expectedHash) {
    const inputHash = piiHash("phone", rawPhone.slice(0, 11));
    if (inputHash !== expectedHash) {
      throw new HttpsError("permission-denied", "Telefon bilgisi hesap kaydiyla eslesmiyor.");
    }
  }

  // Adım 4: 6 haneli rastgele kod üret (100000–999999 arası)
  const code = String(randomInt(100000, 1000000));
  const codeSalt = randomBytes(16).toString("hex");
  const expiresInSec = 180;                              // 3 dakika geçerlilik süresi
  const expiresAtMs = Date.now() + expiresInSec * 1000; // Unix timestamp (ms)

  // Adım 5: Kodu Firestore'a yaz — AÇIK değil, sadece hash'ini sakla
  // phone_verifications/{uid} koleksiyonuna upsert (merge: true)
  await db.collection("phone_verifications").doc(uid).set(
    {
      uid,
      phoneHash: piiHash("phone", rawPhone.slice(0, 11)), // hangi telefona gönderildi
      codeSalt,
      codeHash: smsCodeHash(uid, code, codeSalt),                    // kodun hash'i (uid + code)
      attempts: 0,                                          // hatalı deneme sayacı
      expiresAtMs,                                          // son geçerlilik zamanı
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // Adım 6: Twilio credentials'larını kontrol et (debug için)
  const twilioConf = getTwilioConfig();
  logger.info("[sms] config check", {
    hasSid: !!twilioConf.accountSid,
    hasToken: !!twilioConf.authToken,
    hasFrom: !!twilioConf.from
  });

  // Telefon numarasını E.164 formatına çevir: +905321234567
  // Eğer numara zaten + ile başlıyorsa olduğu gibi kullan, değilse +90 ekle
  const msgBody = `Afet Yardım uygulaması için doğrulama kodunuz: ${code}. Bu kodu girerek başarıyla giriş sağlayabilirsiniz. Başkalarıyla paylaşmayınız.`;
  const e164Phone = rawPhone.startsWith("+") ? rawPhone : `+90${rawPhone.slice(-10)}`;

  // WhatsApp önce dene, başarısız olursa SMS'e geç
  const sentWp = await sendTwilioWhatsApp(e164Phone, msgBody);
  let sentReal = sentWp;

  if (!sentWp) {
    logger.info("[sms] WhatsApp basarisiz, SMS deneniyor", { uid });
    sentReal = await sendTwilioSms(e164Phone, msgBody);
    logger.info("[sms] verification code issued", { uid, sentReal });
  } else {
    logger.info("[whatsapp] verification code issued", { uid, sentReal });
  }

  // yayinda sahte dogrulama yok, kod gitmediyse istemci bunu bilmeli
  if (!sentReal && process.env.FUNCTIONS_EMULATOR !== "true") {
    throw new HttpsError("unavailable", "Doğrulama kodu şu an gönderilemedi.");
  }

  return {
    sent: true,
    mode: sentReal ? "real" : "mock",
    expiresInSec
  };
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CLOUD FUNCTION: verifyPhoneVerificationCode
// ─────────────────────────────────────────────────────────────────────────────
// Kullanıcının SMS ile aldığı 6 haneli kodu doğrular.
// Mobil uygulama "DOĞRULA" butonuna basıldığında bu fonksiyon çağrılır.
//
// ADIMLAR:
//   1. Oturum doğrulama (mustAuth)
//   2. Girilen kodun 6 haneli sayı olduğunu kontrol et (regex)
//   3. Firestore'dan bu kullanıcının aktif doğrulama kaydını oku
//   4. Hatalı deneme sayısı 5'e ulaştıysa bloke et
//   5. Kodun süresinin dolup dolmadığını kontrol et (expiresAtMs)
//   6. Girilen kodu hash'le, Firestore'daki hash ile karşılaştır
//   7. Eşleşirse users/{uid}.phoneVerifiedAt alanını güncelle → doğrulama tamamlandı
//   8. Eşleşmezse hatalı deneme sayısını artır
//
// GÜVENLİK:
//   - Kod veritabanında açık saklanmaz, sadece hash'i tutulur
//   - Brute force koruması: 5 hatalı denemede hesap bloke edilir
//   - Süre aşımı: 3 dakika sonra kod geçersiz kalır
export const verifyPhoneVerificationCode = onCall(async (request) => {
  // Adım 1: Oturum kontrolü
  const { uid } = mustAuth(request.auth);

  // Adım 2: Gelen kodun tam olarak 6 haneli sayı olduğunu doğrula
  const code = `${request.data?.code || ""}`.trim();
  if (!/^\d{6}$/.test(code)) throw new HttpsError("invalid-argument", "6 haneli kod gerekli.");

  const ref = db.collection("phone_verifications").doc(uid);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("failed-precondition", "Aktif doğrulama kodu yok.");

  const row = snap.data() || {};
  const attempts = Number(row.attempts || 0);
  // Adım 4: Brute force koruması — 5 hatalı denemede bloke
  if (attempts >= 5) throw new HttpsError("resource-exhausted", "Cok fazla hatali deneme.");

  // Adım 5: Süre kontrolü — expiresAtMs geçmişse kod artık geçersiz
  const expiresAtMs = Number(row.expiresAtMs || 0);
  if (!expiresAtMs || Date.now() > expiresAtMs) throw new HttpsError("deadline-exceeded", "Dogrulama kodunun suresi doldu.");

  // Adım 6: Kod doğrulama — girilen kodu hash'le, Firestore'daki ile karşılaştır
  // Kod açık saklanmadığı için direkt eşleştirme yapamayız, hash karşılaştırması yaparız
  const ok = !!row.codeSalt && `${row.codeHash || ""}` === smsCodeHash(uid, code, `${row.codeSalt}`);
  if (!ok) {
    // Yanlış kod → deneme sayısını artır ve hata döndür
    await ref.set(
      {
        attempts: attempts + 1,
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );
    throw new HttpsError("permission-denied", "Dogrulama kodu hatali.");
  }

  // Adım 7: Doğrulama başarılı → kullanıcı profiline phoneVerifiedAt timestamp'i yaz
  await db.collection("users").doc(uid).set(
    {
      phoneVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // Kullanılmış doğrulama kaydını sil (tek kullanımlık)
  await ref.delete().catch(() => undefined);

  return { verified: true };
});

// FIREBASE-PHONE-VERIFY:
// İstemci tarafında Firebase Phone Auth (expo-firebase-recaptcha) ile doğrulanan
// telefon numarasını backend'de kayıt eder.
// 1) İstemciden gelen phoneIdToken'ı Admin SDK ile doğrular.
// 2) Token'daki telefon numarasını kullanıcının phone_hash'iyle karşılaştırır.
// 3) Eşleşirse users/{uid}.phoneVerifiedAt alanını günceller.
export const confirmPhoneByFirebaseToken = onCall(async (request) => {
  const { uid } = mustAuth(request.auth);
  const phoneIdToken = `${request.data?.phoneIdToken || ""}`.trim();
  if (!phoneIdToken) throw new HttpsError("invalid-argument", "phoneIdToken gerekli.");

  let decodedToken: DecodedIdToken;
  try {
    decodedToken = await getAuth().verifyIdToken(phoneIdToken);
  } catch {
    throw new HttpsError("permission-denied", "Geçersiz veya süresi dolmuş telefon doğrulama tokeni.");
  }

  const rawPhoneNumber = decodedToken.phone_number;
  if (!rawPhoneNumber) {
    throw new HttpsError("permission-denied", "Token telefon kimlik doğrulaması içermiyor.");
  }

  // Firebase +905XXXXXXXXX formatını 05XXXXXXXXX (11 hane) formatına çevirir.
  const normalizedPhone = rawPhoneNumber.startsWith("+90")
    ? "0" + rawPhoneNumber.slice(3)
    : rawPhoneNumber;

  const userRef = db.collection("users").doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) throw new HttpsError("failed-precondition", "Kullanıcı profili bulunamadı.");

  const userData = userSnap.data() || {};
  const expectedHash = `${userData?.phone_hash || ""}`.trim();

  if (expectedHash) {
    const inputHash = piiHash("phone", normalizedPhone.slice(0, 11));
    if (inputHash !== expectedHash) {
      throw new HttpsError("permission-denied", "Doğrulanan telefon numarası hesap bilgisiyle eşleşmiyor.");
    }
  }

  await userRef.set(
    {
      phoneVerifiedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // Geçici telefon auth kullanıcısını temizle (isteğe bağlı)
  const phoneAuthUid = decodedToken.uid;
  if (phoneAuthUid !== uid) {
    getAuth().deleteUser(phoneAuthUid).catch(() => undefined);
  }

  logger.info("[phone] Firebase phone verification confirmed", { uid, phoneTail: normalizedPhone.slice(-4) });
  return { verified: true };
});

export const assignVolunteer = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await mustRole(uid, token, "coordinator");

  const requestId = `${request.data?.requestId || ""}`.trim();
  if (!requestId) throw new HttpsError("invalid-argument", "requestId zorunlu.");

  const reqRef = db.collection("requests").doc(requestId);
  const volunteersSnap = await db
    .collection("users")
    .where("role", "==", "volunteer")
    .limit(80)
    .get();
  if (volunteersSnap.empty) throw new HttpsError("failed-precondition", "Uygun gonullu yok.");

  const assignedVolunteerId = await db.runTransaction(async (tx) => {
    const reqSnap = await tx.get(reqRef);
    if (!reqSnap.exists) throw new HttpsError("not-found", "Talep bulunamadi.");
    const reqData = reqSnap.data() || {};
    if (reqData.status !== "open") throw new HttpsError("failed-precondition", "Talep atamaya uygun degil.");

    const loadMap: Record<string, number> = {};
    const activeAssigned = await db
      .collection("requests")
      .where("status", "in", ["assigned", "in_progress"])
      .limit(400)
      .get();
    activeAssigned.forEach((d) => {
      const vId = `${d.data()?.assignedVolunteerId || ""}`;
      if (vId) loadMap[vId] = (loadMap[vId] || 0) + 1;
    });

    const candidate = volunteersSnap.docs
      .map((d) => ({ id: d.id, data: d.data() as any, load: loadMap[d.id] || 0 }))
      .sort((a, b) => a.load - b.load)[0];
    if (!candidate) throw new HttpsError("failed-precondition", "Atilabilir gonullu bulunamadi.");

    tx.update(reqRef, {
      status: "assigned",
      assignedVolunteerId: candidate.id,
      assignedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: "assigned",
        at: FieldValue.serverTimestamp(),
        note: "Koordinator atama yapti",
        actor: uid
      })
    });
    return candidate.id;
  });

  await writeAudit({
    actorId: uid,
    actorRole: role,
    action: "REQUEST_ASSIGN",
    entityType: "request",
    entityId: requestId,
    diff: { assignedVolunteerId }
  });

  return { assignedVolunteerId };
});

export const claimRequest = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await mustRole(uid, token, "volunteer");

  const requestId = `${request.data?.requestId || ""}`.trim();
  const volunteerLive = request.data?.volunteerLive || null;
  if (!requestId) throw new HttpsError("invalid-argument", "requestId zorunlu.");

  const reqRef = db.collection("requests").doc(requestId);
  const appRef = db.collection("volunteerApplications").doc(`${uid}_${requestId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(reqRef);
    if (!snap.exists) throw new HttpsError("not-found", "Talep bulunamadi.");
    const row = snap.data() || {};
    if (row.status !== "open") throw new HttpsError("failed-precondition", "Talep artik musait degil.");

    tx.set(
      appRef,
      {
        volunteerId: uid,
        requestId,
        status: "pending",
        volunteerLive,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      },
      { merge: true }
    );

    tx.update(reqRef, {
      lastApplicantId: uid,
      volunteerLive,
      updatedAt: FieldValue.serverTimestamp(),
      timeline: FieldValue.arrayUnion({
        status: "application_pending",
        at: FieldValue.serverTimestamp(),
        note: "Gonullu basvurusu alindi",
        actor: uid
      })
    });
  });

  await writeAudit({
    actorId: uid,
    actorRole: role,
    action: "REQUEST_CLAIM",
    entityType: "request",
    entityId: requestId
  });

  return { assignedVolunteerId: uid, applicationStatus: "pending" };
});

export const transitionRequestStatus = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await resolvedRoleWithFallback(uid, token);

  const requestId = `${request.data?.requestId || ""}`.trim();
  const action = `${request.data?.action || ""}`.trim();
  if (!requestId || !action) throw new HttpsError("invalid-argument", "requestId ve action zorunlu.");

  const reqRef = db.collection("requests").doc(requestId);
  const snap = await reqRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "Talep bulunamadi.");
  const row = snap.data() as any;

  let newStatus = row.status;
  const targetStatus = transitionStatusForAction(action);
  if (!targetStatus) {
    throw new HttpsError("invalid-argument", "Bilinmeyen action.");
  }

  if (action === "START_ROUTE") {
    if (!canTransitionRequest({ action, role, actorId: uid, assignedVolunteerId: row.assignedVolunteerId })) {
      throw new HttpsError("permission-denied", "Yola cikma yetkisi yok.");
    }
  } else if (action === "COMPLETE") {
    if (!canTransitionRequest({ action, role, actorId: uid, assignedVolunteerId: row.assignedVolunteerId })) {
      throw new HttpsError("permission-denied", "Tamamlama yetkisi yok.");
    }
  } else if (action === "REOPEN") {
    if (!canTransitionRequest({ action, role, actorId: uid, assignedVolunteerId: row.assignedVolunteerId })) {
      await mustRole(uid, token, "coordinator");
    }
  }
  newStatus = targetStatus;

  await reqRef.update({
    status: newStatus,
    closedReason: action === "COMPLETE" ? "resolved" : FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
    timeline: FieldValue.arrayUnion({
      status: newStatus,
      at: FieldValue.serverTimestamp(),
      note: `Transition: ${action}`,
      actor: uid
    })
  });

  await writeAudit({
    actorId: uid,
    actorRole: role,
    action: `REQUEST_${action}`,
    entityType: "request",
    entityId: requestId,
    diff: { status: newStatus }
  });

  return { newStatus };
});

export const publishAnnouncement = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await mustRole(uid, token, "coordinator");

  const data = request.data || {};
  const title = `${data?.title || "Acil Duyuru"}`.trim();
  const message = `${data?.message || ""}`.trim();
  const severity = `${data?.severity || "medium"}`.trim();
  const targetRoles = Array.isArray(data?.targetRoles) ? data.targetRoles : ["victim", "volunteer"];

  if (!message) throw new HttpsError("invalid-argument", "Duyuru metni zorunlu.");

  const ref = await db.collection("announcements").add({
    title,
    message,
    severity,
    targetRoles,
    createdBy: uid,
    createdAt: FieldValue.serverTimestamp()
  });

  await writeAudit({
    actorId: uid,
    actorRole: role,
    action: "ANNOUNCEMENT_PUBLISH",
    entityType: "announcement",
    entityId: ref.id
  });

  return { announcementId: ref.id };
});

export const chatWithAi = onCall(
  {
    secrets: [OPENAI_API_KEY_SECRET, GEMINI_API_KEY_SECRET]
  },
  async (request) => {
  const { uid } = mustAuth(request.auth);
  const data = request.data || {};
  // bot konusmasi kisiye ozel, istemcinin verdigi kanala yazilmaz
  const chatId = uid;
  const message = `${data?.message || ""}`.trim();
  const context = `${data?.context || ""}`.trim();
  const providerRaw = `${data?.provider || "auto"}`.trim().toLowerCase();
  const provider = (providerRaw === "openai" || providerRaw === "gemini" ? providerRaw : "auto") as AiProvider;

  if (!message) throw new HttpsError("invalid-argument", "Mesaj zorunlu.");
  if (message.length > 2000) throw new HttpsError("invalid-argument", "Mesaj çok uzun.");
  await consumeQuota(`ai-chat:${uid}`, 60, 3600);

  const msgRef = db.collection("chats").doc(chatId).collection("messages");
  await msgRef.add({
    senderId: uid,
    role: "user",
    text: message,
    createdAt: FieldValue.serverTimestamp()
  });

  const escalationFlag = detectRisk(message);

  const kbSnap = await db.collection("knowledge_chunks").limit(20).get();
  const kbContext = kbSnap.docs
    .map((d) => `${d.data()?.title || "Bilgi"}: ${d.data()?.content || ""}`)
    .join("\n\n")
    .slice(0, 4000);

  const systemPrompt = [
    "Sen afet yardim asistanisin.",
    "Yaniti Turkce, kisa ve adim adim ver.",
    "Hayati risk varsa 112 ve resmi ekip yonlendirmesini one al.",
    "Tahmin veya uydurma bilgi verme.",
    escalationFlag ? "Bu mesaj yuksek risk sinifina girdi, operator eskalasyonu oner." : ""
  ].join("\n");

  let aiMessage = "Mesajin alindi.";
  let providerUsed: "openai" | "gemini" | "fallback" = "fallback";
  const finalPrompt = `${systemPrompt}\n\nBilgi tabani:\n${kbContext}\n\nKontekst: ${context}\nMesaj: ${message}`;

  if (provider === "openai") {
    const text = await requestOpenAI({ prompt: finalPrompt });
    if (text) {
      aiMessage = text;
      providerUsed = "openai";
    }
  } else if (provider === "gemini") {
    const text = await requestGemini({ prompt: finalPrompt });
    if (text) {
      aiMessage = text;
      providerUsed = "gemini";
    }
  } else {
    const textOpenAI = await requestOpenAI({ prompt: finalPrompt });
    if (textOpenAI) {
      aiMessage = textOpenAI;
      providerUsed = "openai";
    } else {
      const textGemini = await requestGemini({ prompt: finalPrompt });
      if (textGemini) {
        aiMessage = textGemini;
        providerUsed = "gemini";
      }
    }
  }

  if (providerUsed === "fallback") {
    aiMessage = buildServerFallbackAiReply(message, escalationFlag);
  }
  await msgRef.add({
    senderId: "ai",
    role: "assistant",
    text: aiMessage,
    escalationFlag,
    createdAt: FieldValue.serverTimestamp()
  });

  if (escalationFlag) {
    await db.collection("chats").doc(chatId).set(
      {
        escalation: {
          status: "operator_required",
          triggeredAt: FieldValue.serverTimestamp(),
          reason: "risk_keyword"
        }
      },
      { merge: true }
    );
  }

  return { aiMessage, escalationFlag, providerUsed };
  }
);

const AI_PHOTO_PROMPT = `Bu afet/acil durum fotoğrafını analiz et ve hangi durumla karşı karşıya olduğumuzu belirle.

Olası kategoriler (KESINLIKLE birini seç):
- accident: Trafik kazası, araç çarpışması, devrilmiş araç
- fire: Yangın, alev, duman, yanan bina/araç/orman
- debris: Çökmüş bina enkazı, deprem hasarı, arama-kurtarma
- flood: Sel, su baskını, taşkın
- structural: Bina çatlağı, eğilme, kısmi çökme tehlikesi
- gas_leak: Gaz kaçağı, kimyasal sızıntı, tehlikeli madde
- missing: Kayıp kişi ilanı/fotoğrafı
- animal: Mahsur veya yaralı hayvan
- health: Yaralı kişi, kanama, ilk yardım ihtiyacı
- food: Açlık, gıda yardımı
- shelter: Çadır, barınma ihtiyacı
- baby: Bebek/çocuk ihtiyaçları
- water: Su veya elektrik kesintisi
- transport: Tahliye, ulaşım ihtiyacı
- psych: Psikolojik destek
- other: Yukarıdakilere uymuyor

SADECE saf JSON döndür, başka açıklama/metin EKLEME:
{"category":"<key>","urgency":"high|medium|low","description":"kısa Türkçe durum açıklaması (maks 80 karakter)","confidence":0.0-1.0}`;

const aiTextPrompt = (description: string): string => `Aşağıdaki afet yardım talebini analiz et ve JSON ile yanıtla:
"${description}"

Sadece şu JSON formatında yanıtla (başka metin ekleme):
{"category":"<key>","urgency":"high|medium|low","reason":"kısa gerekçe","confidence":0.0-1.0}

Olası kategoriler:
- accident: Trafik kazası, araç çarpışması
- fire: Yangın
- debris: Enkaz, çökme, arama-kurtarma
- flood: Sel, su baskını
- structural: Yapısal hasar, çatlak
- gas_leak: Gaz kaçağı, kimyasal sızıntı
- missing: Kayıp kişi
- animal: Hayvan kurtarma
- health: Sağlık/yaralanma/ilaç
- food: Gıda/yiyecek
- shelter: Barınma/çadır
- baby: Bebek/çocuk ihtiyaçları
- water: Su/elektrik kesintisi
- transport: Ulaşım/tahliye
- psych: Psikolojik destek
- other: Diğer`;

const requestVision = async (prompt: string, imageBase64: string): Promise<string | null> => {
  const geminiKey = getGeminiApiKey();
  if (geminiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(geminiKey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inlineData: { mimeType: "image/jpeg", data: imageBase64 } }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 250 }
          })
        }
      );
      if (response.ok) {
        const json: any = await response.json();
        const text = `${json?.candidates?.[0]?.content?.parts?.[0]?.text || ""}`.trim();
        if (text) return text;
      } else {
        logger.warn("[analyzeRequest] gemini failed", { status: response.status });
      }
    } catch (e) {
      logger.warn("[analyzeRequest] gemini exception", e as any);
    }
  }

  const openai = getOpenAIClient();
  if (!openai) return null;
  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.1,
      max_tokens: 250,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
        ]
      }]
    });
    return `${completion.choices?.[0]?.message?.content || ""}`.trim() || null;
  } catch (e) {
    logger.warn("[analyzeRequest] openai exception", e as any);
    return null;
  }
};

// talep analizi: anahtarlar sunucuda kalir, prompt istemciden alinmaz
export const analyzeRequestWithAi = onCall(
  { secrets: [OPENAI_API_KEY_SECRET, GEMINI_API_KEY_SECRET] },
  async (request) => {
    const { uid } = mustAuth(request.auth);
    const kind = `${request.data?.kind || ""}`;
    await consumeQuota(`ai-analyze:${uid}`, 30, 3600);

    if (kind === "text") {
      const description = `${request.data?.description || ""}`.trim();
      if (description.length < 10 || description.length > 2000) {
        throw new HttpsError("invalid-argument", "Açıklama 10-2000 karakter olmalı.");
      }
      const prompt = aiTextPrompt(description);
      return { rawText: (await requestGemini({ prompt })) || (await requestOpenAI({ prompt })) || "" };
    }

    if (kind === "photo") {
      const imageBase64 = `${request.data?.imageBase64 || ""}`;
      if (!imageBase64 || imageBase64.length > 7_000_000 || !/^[A-Za-z0-9+/=]+$/.test(imageBase64)) {
        throw new HttpsError("invalid-argument", "Geçersiz fotoğraf.");
      }
      return { rawText: (await requestVision(AI_PHOTO_PROMPT, imageBase64)) || "" };
    }

    throw new HttpsError("invalid-argument", "Geçersiz analiz türü.");
  }
);

export const requestDataDeletion = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await resolvedRoleWithFallback(uid, token);
  const targetUid = `${request.data?.uid || uid}`;
  if (targetUid !== uid && role !== "coordinator") {
    throw new HttpsError("permission-denied", "Bu islem icin yetkiniz yok.");
  }

  const ticketId = randomUUID();
  await db.collection("deletion_tickets").doc(ticketId).set({
    uid: targetUid,
    status: "pending",
    createdAt: FieldValue.serverTimestamp()
  });
  return { ticketId };
});

export const exportUserData = onCall(async (request) => {
  const { uid, token } = mustAuth(request.auth);
  const role = await resolvedRoleWithFallback(uid, token);
  const targetUid = `${request.data?.uid || uid}`;
  if (targetUid !== uid && role !== "coordinator") {
    throw new HttpsError("permission-denied", "Bu islem icin yetkiniz yok.");
  }

  const [userSnap, requestsSnap] = await Promise.all([
    db.collection("users").doc(targetUid).get(),
    db.collection("requests").where("createdBy", "==", targetUid).limit(300).get()
  ]);

  const exportPayload = {
    user: userSnap.exists ? userSnap.data() : null,
    requests: requestsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    exportedAt: new Date().toISOString()
  };

  const filePath = `exports/${targetUid}/export-${Date.now()}.json`;
  await storage.bucket().file(filePath).save(JSON.stringify(exportPayload, null, 2), {
    contentType: "application/json"
  });

  const [signedUrl] = await storage.bucket().file(filePath).getSignedUrl({
    action: "read",
    expires: Date.now() + 1000 * 60 * 30
  });

  await db.collection("exports").add({
    uid: targetUid,
    filePath,
    signedUrl,
    createdAt: FieldValue.serverTimestamp()
  });

  return { signedUrl };
});

export const registerDeviceToken = onCall(async (request) => {
  const { uid } = mustAuth(request.auth);
  const token = `${request.data?.token || ""}`.trim();
  const platform = `${request.data?.platform || "unknown"}`.trim();
  if (!token) throw new HttpsError("invalid-argument", "Token gerekli.");
  await db.collection("users").doc(uid).collection("devices").doc(token).set(
    {
      token,
      platform,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );
  return { ok: true };
});

export const onRequestStatusChanged = onDocumentUpdated("requests/{requestId}", async (event) => {
  const before = event.data?.before.data();
  const after = event.data?.after.data();
  if (!before || !after) return;
  if (before.status === after.status) return;

  await writeAudit({
    actorId: "system",
    actorRole: "system",
    action: "REQUEST_STATUS_CHANGED",
    entityType: "request",
    entityId: event.params.requestId,
    diff: { from: before.status, to: after.status }
  });
  await sendStatusNotification(event.params.requestId, after);
});

// ─────────────────────────────────────────────────────────────────────────────
// YARDIMCI FONKSİYON: haversineKm
// ─────────────────────────────────────────────────────────────────────────────
// İki GPS koordinatı arasındaki mesafeyi kilometre cinsinden hesaplar.
// Haversine formülü: dünya küresel kabul edilerek hesaplanır, ~%0.3 hata payı var.
//
// Parametreler:
//   lat1, lon1 → Başlangıç noktası (gönüllü konumu)
//   lat2, lon2 → Bitiş noktası (talep konumu)
//
// Kullanım: haversineKm(41.01, 28.97, 41.05, 29.02) → ~5.2 km
const haversineKm = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
  const R = 6371; // Dünya yarıçapı (km)
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
};

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CLOUD FUNCTION: autoAssignVolunteer (Firestore Trigger)
// ─────────────────────────────────────────────────────────────────────────────
// Yeni bir yardım talebi (requests/{id}) oluşturulduğunda OTOMATİK olarak
// en uygun gönüllüyü bulup atar.
//
// ATAMA SKORU HESABI (düşük skor = daha iyi aday):
//   skor = mesafe(km) × 0.6 + mevcutGörevSayısı × 15 + müsaitlikCezası
//   müsaitlikCezası: "busy" ise +50, "offline" ise +9999 (atlamasın)
//
// Gönüllünün Firestore şeması (users/{uid}):
//   volunteerLat: number   → son bilinen enlem  (VolunteerMapScreen tarafından yazılır)
//   volunteerLng: number   → son bilinen boylam
//   availability: "available" | "busy" | "offline"
//   role: "volunteer"
//   volunteerStatus: "approved"
//
// Talebin Firestore şeması (requests/{id}):
//   lat: number    → talep konumu
//   lng: number    → talep konumu
//   status: "open" → yalnızca "open" talepler için atama yapılır
//
// SONUÇ: requests/{id} güncellenir:
//   status: "assigned"
//   assignedVolunteerId: uid
//   assignedAt: serverTimestamp
//   autoAssigned: true   → koordinatör manuel atamadan ayırt edebilsin
export const autoAssignVolunteer = onDocumentWritten("requests/{requestId}", async (event) => {
  const requestId = event.params.requestId;

  // Yalnızca CREATE olaylarını işle (before yoksa yeni döküman)
  const before = event.data?.before;
  const after = event.data?.after;
  if (before?.exists || !after?.exists) return; // UPDATE veya DELETE → atla

  const reqData = after.data() || {};

  // Yalnızca "open" statusundaki talepler için otomatik atama yap.
  // reqData.autoAssign === true ise koordinatör bunu açıkça istediyse çalışır.
  // Aksi halde gönüllüler listeyi görebilsin, manuel başvursun.
  if (reqData.status !== "open") return;
  if (reqData.autoAssign !== true) return; // Koordinatör aktif etmeden otomatik atama yapma

  // Talep koordinatları — yoksa atla
  const reqLat = typeof reqData.lat === "number" ? reqData.lat : null;
  const reqLng = typeof reqData.lng === "number" ? reqData.lng : null;

  try {
    // 1. Aktif gönüllüleri getir
    const volunteerSnap = await db
      .collection("users")
      .where("role", "==", "volunteer")
      .where("volunteerStatus", "==", "approved")
      .where("availability", "in", ["available", "busy"])
      .limit(100)
      .get();

    if (volunteerSnap.empty) {
      logger.info("[autoAssign] Uygun gönüllü bulunamadı", { requestId });
      return;
    }

    // 2. Her gönüllünün mevcut aktif görev sayısını hesapla
    const activeSnap = await db
      .collection("requests")
      .where("status", "in", ["assigned", "in_progress"])
      .limit(500)
      .get();

    const loadMap: Record<string, number> = {};
    activeSnap.forEach((d) => {
      const vid = `${d.data()?.assignedVolunteerId || ""}`;
      if (vid) loadMap[vid] = (loadMap[vid] || 0) + 1;
    });

    // 3. Her gönüllü için skor hesapla
    type Candidate = { id: string; score: number };
    const candidates: Candidate[] = volunteerSnap.docs.map((d) => {
      const v = d.data() as any;
      const load = loadMap[d.id] || 0;

      // Müsaitlik cezası
      const availPenalty = v.availability === "busy" ? 50 : 0;

      // Mesafe hesabı — koordinat yoksa yüksek penaltı ver (uzak varsay)
      let distKm = 50; // varsayılan: 50 km
      if (reqLat !== null && reqLng !== null &&
          typeof v.volunteerLat === "number" && typeof v.volunteerLng === "number") {
        distKm = haversineKm(v.volunteerLat, v.volunteerLng, reqLat, reqLng);
      }

      // Skor = mesafe × 0.6 + görev yükü × 15 + müsaitlik cezası
      const score = distKm * 0.6 + load * 15 + availPenalty;

      return { id: d.id, score };
    });

    // 4. En düşük skorlu gönüllüyü seç
    candidates.sort((a, b) => a.score - b.score);
    const best = candidates[0];
    if (!best) return;

    // 5. Firestore transaction ile ata — eş zamanlı çakışmayı önle
    const reqRef = db.collection("requests").doc(requestId);
    await db.runTransaction(async (tx) => {
      const freshSnap = await tx.get(reqRef);
      if (!freshSnap.exists) return;
      const fresh = freshSnap.data() || {};

      // Transaction içinde tekrar kontrol: başka bir işlem zaten attıysa atla
      if (fresh.status !== "open") return;

      tx.update(reqRef, {
        status: "assigned",
        assignedVolunteerId: best.id,
        assignedAt: FieldValue.serverTimestamp(),
        autoAssigned: true, // koordinatör manuel atamadan ayırt edebilsin
        updatedAt: FieldValue.serverTimestamp(),
        timeline: FieldValue.arrayUnion({
          status: "assigned",
          at: FieldValue.serverTimestamp(),
          note: `Otomatik atama (skor: ${best.score.toFixed(1)})`,
          actor: "system"
        })
      });
    });

    logger.info("[autoAssign] Gönüllü atandı", { requestId, volunteerId: best.id, score: best.score });
  } catch (e) {
    // Hata → loğa yaz, talebi engelleme (koordinatör manuel atayabilir)
    logger.error("[autoAssign] Hata", { requestId, err: String(e) });
  }
});

export const syncUserRoleClaims = onDocumentWritten("users/{uid}", async (event) => {
  const uid = event.params.uid;
  const after = event.data?.after;
  if (!after?.exists) return;
  const data = after.data() || {};
  const role: Role | null = normalizeRoleValue(data?.role) || (data?.isCoordinator ? "coordinator" : null);
  if (!role) return;
  const claims = {
    role,
    victim: role === "victim",
    volunteer: role === "volunteer",
    coordinator: role === "coordinator"
  };
  try {
    await getAuth().setCustomUserClaims(uid, claims);
  } catch (e) {
    logger.error("setCustomUserClaims failed", e);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// FIREBASE CLOUD FUNCTION: claimCoordinatorRole
// ─────────────────────────────────────────────────────────────────────────────
// Koordinatör davet kodu doğrulaması.
// Admin panelden oluşturulan tek kullanımlık kodlar coordinator_invites/{code}
// koleksiyonunda tutulur. Kullanıcı kodu girer, backend doğrular ve rolü atar.
//
// Firestore yapısı: coordinator_invites/{code} → { active: true, usedBy?: string, usedAt?: Timestamp }
// Admin bu koleksiyona elle veya bir admin panelinden kayıt ekler.
export const claimCoordinatorRole = onCall(async (request) => {
  const { uid } = mustAuth(request.auth);

  const code = `${request.data?.code || ""}`.trim();
  if (!code || code.length < 4) {
    throw new HttpsError("invalid-argument", "Geçerli bir davet kodu gerekli.");
  }

  await consumeQuota(`invite:${uid}`, 10, 3600);

  // ayni kod iki kisiye gitmesin diye transaction icinde
  const inviteRef = db.collection("coordinator_invites").doc(code);
  await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError("not-found", "Davet kodu geçersiz.");
    const data = inviteSnap.data() || {};
    if (!data.active) throw new HttpsError("failed-precondition", "Bu davet kodu artık geçerli değil.");
    if (data.usedBy) throw new HttpsError("already-exists", "Bu davet kodu daha önce kullanıldı.");
    tx.update(inviteRef, {
      usedBy: uid,
      usedAt: FieldValue.serverTimestamp(),
      active: false
    });
  });

  // Kullanıcıya coordinator rolünü ata
  await db.collection("users").doc(uid).set(
    {
      role: "coordinator",
      isCoordinator: true,
      updatedAt: FieldValue.serverTimestamp()
    },
    { merge: true }
  );

  // Custom claims güncelle
  try {
    await getAuth().setCustomUserClaims(uid, {
      role: "coordinator",
      coordinator: true,
      victim: false,
      volunteer: false
    });
  } catch (e) {
    logger.error("[claimCoordinator] setCustomUserClaims failed", e);
  }

  logger.info("[claimCoordinator] coordinator role granted", { uid });
  return { success: true };
});
