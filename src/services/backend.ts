import { httpsCallable } from "firebase/functions";
import { addDoc, collection, doc, getDoc, getDocs, limit, query, serverTimestamp, setDoc, updateDoc, where } from "firebase/firestore";
import { auth, db, functions } from "../firebase";

/**
 * BACKEND FILE MAP
 * - BACKEND-GUARD: callable hata sınıflandırma ve fallback karar yardımcıları
 * - BACKEND-REQUEST: createRequest / assign / claim / transition request API katmanı
 * - BACKEND-COMMS: publishAnnouncement / chatWithAi API çağrıları
 * - BACKEND-PRIVACY: exportUserData / requestDataDeletion KVKK çağrıları
 * - BACKEND-PUSH: registerDeviceToken cihaz token kaydı
 * - BACKEND-FALLBACK: functions unavailable durumunda Firestore best-effort fallback
 */
type LatLng = { lat: number; lng: number };
type AiProvider = "auto" | "openai" | "gemini";

const callableUnavailable = (e: any) => {
  const code = `${e?.code || ""}`.toLowerCase();
  const msg = `${e?.message || ""}`.toLowerCase();
  return (
    code.includes("functions/") ||
    code.includes("unavailable") ||
    code.includes("not-found") ||
    msg.includes("function") ||
    msg.includes("backend") ||
    msg.includes("deploy")
  );
};

const callablePermissionOrRuntime = (e: any) => {
  const code = `${e?.code || ""}`.toLowerCase();
  const msg = `${e?.message || ""}`.toLowerCase();
  return (
    code.includes("permission-denied") ||
    code.includes("failed-precondition") ||
    code.includes("internal") ||
    msg.includes("insufficient") ||
    msg.includes("permission")
  );
};

const shouldFallbackToFirestore = (e: any) => callableUnavailable(e) || callablePermissionOrRuntime(e);

// BACKEND-REQUEST: Talep oluşturma callable; hata halinde Firestore fallback create.
export const createRequestViaApi = async (payload: {
  type: string;
  urgency: string;
  description: string;
  location: LatLng;
  triage?: {
    peopleCount?: number;
    injuredCount?: number;
    hasChild?: boolean;
    hasElderly?: boolean;
    hasDisabled?: boolean;
    needsMedication?: boolean;
    riskTags?: string[];
    score?: number;
  };
}) => {
  try {
    const fn = httpsCallable(functions, "createRequest");
    const res = await fn(payload);
    return res.data as { requestId: string };
  } catch (e) {
    if (!shouldFallbackToFirestore(e)) throw e;
    const uid = auth.currentUser?.uid;
    if (!uid) throw e;
    const ref = await addDoc(collection(db, "requests"), {
      createdBy: uid,
      userId: uid,
      type: payload.type,
      urgency: payload.urgency,
      description: payload.description,
      location: payload.location,
      status: "open",
      triage: payload.triage || null,
      source: "mobile-demo-fallback",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return { requestId: ref.id };
  }
};

export const checkRegistrationConflictsViaApi = async (payload: { tcNo: string; phone: string }) => {
  const fn = httpsCallable(functions, "checkRegistrationConflicts");
  const res = await fn(payload);
  return res.data as { tcExists: boolean; phoneExists: boolean };
};

export const sendPhoneVerificationCodeViaApi = async (payload: { phone: string }) => {
  // TWILIO-CLIENT-SEND:
  // Mobile istemci bu wrapper ile Firebase callable "sendPhoneVerificationCode" fonksiyonunu cagirir.
  const fn = httpsCallable(functions, "sendPhoneVerificationCode");
  const res = await fn(payload);
  return res.data as { sent: boolean; mode: "real" | "mock"; expiresInSec: number };
};

export const verifyPhoneVerificationCodeViaApi = async (payload: { code: string }) => {
  // TWILIO-CLIENT-VERIFY:
  // Girilen OTP kodunu callable "verifyPhoneVerificationCode" fonksiyonuna gonderir.
  const fn = httpsCallable(functions, "verifyPhoneVerificationCode");
  const res = await fn(payload);
  return res.data as { verified: boolean };
};

export const claimCoordinatorRoleViaApi = async (payload: { code: string }) => {
  const fn = httpsCallable(functions, "claimCoordinatorRole", { timeout: 15000 });
  const res = await fn(payload);
  return res.data as { success: boolean };
};

export const confirmPhoneByFirebaseViaApi = async (payload: { phoneIdToken: string }) => {
  // FIREBASE-PHONE-CLIENT-CONFIRM:
  // expo-firebase-recaptcha ile doğrulanan Firebase phone auth token'ını backend'e gönderir.
  // Backend token'ı doğrular, phone_hash kontrolü yapar, phoneVerifiedAt kaydeder.
  const fn = httpsCallable(functions, "confirmPhoneByFirebaseToken");
  const res = await fn(payload);
  return res.data as { verified: boolean };
};

// BACKEND-REQUEST: Talep-gönüllü atama callable; deploy/rules gecikmesinde fallback update.
export const assignVolunteerViaApi = async (requestId: string, volunteerId?: string) => {
  try {
    const fn = httpsCallable(functions, "assignVolunteer");
    const res = await fn(volunteerId ? { requestId, volunteerId } : { requestId });
    return res.data as { assignedVolunteerId: string };
  } catch (e) {
    if (!shouldFallbackToFirestore(e)) throw e;

    if (volunteerId) {
      try {
        await updateDoc(doc(db, "requests", requestId), {
          status: "assigned",
          assignedVolunteerId: volunteerId,
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      } catch {
        await setDoc(
          doc(db, "requests", requestId),
          {
            status: "assigned",
            assignedVolunteerId: volunteerId,
            assignedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          } as any,
          { merge: true }
        );
      }
      await setDoc(
        doc(db, "volunteerApplications", `${volunteerId}_${requestId}`),
        {
          status: "approved",
          updatedAt: serverTimestamp()
        } as any,
        { merge: true }
      ).catch(() => undefined);
      return { assignedVolunteerId: volunteerId };
    }

    const q = query(collection(db, "users_public"), limit(120));
    const snap = await getDocs(q);
    const fallbackVolunteer =
      snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as any) }))
        .find((u: any) => ["volunteer", "gonullu", "gönüllü"].includes(String(u?.role || "").toLowerCase()))
        ?.id || null;
    if (!fallbackVolunteer) throw e;
    try {
      await updateDoc(doc(db, "requests", requestId), {
        status: "assigned",
        assignedVolunteerId: fallbackVolunteer,
        assignedAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    } catch {
      await setDoc(
        doc(db, "requests", requestId),
        {
          status: "assigned",
          assignedVolunteerId: fallbackVolunteer,
          assignedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        } as any,
        { merge: true }
      );
    }
    return { assignedVolunteerId: fallbackVolunteer };
  }
};

// BACKEND-REQUEST: Gönüllü talep üstlenme (application + request candidate işaretleme).
export const claimRequestViaApi = async (requestId: string, volunteerLive?: { lat: number; lng: number } | null) => {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Oturum bulunamadı.");

  try {
    const fn = httpsCallable(functions, "claimRequest");
    const res = await fn({ requestId, volunteerLive: volunteerLive || null });
    return (res.data as any) || { assignedVolunteerId: uid };
  } catch (e) {
    if (!shouldFallbackToFirestore(e)) throw e;

    // Talebi üstlenme akışının ana kaydı: volunteerApplications
    // Not: Doküman daha önce oluşmuşsa sadece izinli alanları update ederiz.
    const appRef = doc(db, "volunteerApplications", `${uid}_${requestId}`);
    const appSnap = await getDoc(appRef);
    if (appSnap.exists()) {
      const currentStatus = String((appSnap.data() as any)?.status || "").toLowerCase();
      if (currentStatus === "approved" || currentStatus === "pending") {
        return { assignedVolunteerId: uid };
      }
      if (currentStatus === "rejected") {
        throw new Error("Bu talep için başvurunuz daha önce reddedildi. Lütfen yöneticiye başvurun.");
      }
      await updateDoc(appRef, {
        status: "pending",
        volunteerLive: volunteerLive || null,
        updatedAt: serverTimestamp()
      } as any);
    } else {
      await setDoc(
        appRef,
        {
          volunteerId: uid,
          requestId,
          status: "pending",
          volunteerLive: volunteerLive || null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        } as any
      );
    }

    // Talep dokümanına aday bilgisini best-effort yaz.
    const reqRef = doc(db, "requests", requestId);
    await updateDoc(reqRef, {
      updatedAt: serverTimestamp(),
      lastApplicantId: uid,
      volunteerLive: volunteerLive || null
    } as any).catch(async () => {
      await setDoc(
        reqRef,
        {
          updatedAt: serverTimestamp(),
          lastApplicantId: uid,
          volunteerLive: volunteerLive || null
        } as any,
        { merge: true }
      ).catch(() => undefined);
    });

    return { assignedVolunteerId: uid };
  }
};

// BACKEND-REQUEST: Durum geçişi callable; fallback ile status alanını güvenli günceller.
export const transitionRequestStatusViaApi = async (requestId: string, action: "START_ROUTE" | "COMPLETE" | "REOPEN") => {
  try {
    const fn = httpsCallable(functions, "transitionRequestStatus");
    const res = await fn({ requestId, action });
    return res.data as { newStatus: string };
  } catch (e) {
    if (!shouldFallbackToFirestore(e)) throw e;
    const ref = doc(db, "requests", requestId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw e;
    const current = (snap.data() as any)?.status;
    const next =
      action === "START_ROUTE" ? "in_progress" :
      action === "COMPLETE" ? "closed" :
      action === "REOPEN" ? "open" :
      current;
    try {
      await updateDoc(ref, { status: next, updatedAt: serverTimestamp() });
    } catch {
      await setDoc(ref, { status: next, updatedAt: serverTimestamp() } as any, { merge: true });
    }
    return { newStatus: next };
  }
};

export const publishAnnouncementViaApi = async (payload: {
  title?: string;
  message: string;
  severity?: "low" | "medium" | "high";
  targetRoles?: string[];
}) => {
  const fn = httpsCallable(functions, "publishAnnouncement");
  const res = await fn(payload);
  return res.data as { announcementId: string };
};

// talep analizi sunucuda yapilir, anahtarlar uygulamaya girmez
export const analyzeRequestWithAiViaApi = async (
  payload: { kind: "text"; description: string } | { kind: "photo"; imageBase64: string }
): Promise<string> => {
  const fn = httpsCallable(functions, "analyzeRequestWithAi", { timeout: 60000 });
  const res = await fn(payload);
  return `${(res.data as { rawText?: string })?.rawText || ""}`;
};

export const chatWithAiViaApi = async (payload: {
  chatId: string;
  message: string;
  context?: string;
  provider?: AiProvider;
  requireRealProvider?: boolean;
}) => {
  const requireRealProvider = Boolean(payload.requireRealProvider);
  const fn = httpsCallable(functions, "chatWithAi");
  try {
    const res = await fn(payload);
    const data = res.data as { aiMessage: string; escalationFlag: boolean; providerUsed?: "openai" | "gemini" | "fallback" };
    if (data.providerUsed !== "fallback") return data;
    if (requireRealProvider) {
      throw new Error("REAL_AI_PROVIDER_UNAVAILABLE");
    }
    return buildLocalAiFallback(payload.message);
  } catch (e) {
    if (!shouldFallbackToFirestore(e)) throw e;
    if (requireRealProvider) {
      throw new Error("REAL_AI_PROVIDER_UNAVAILABLE");
    }
    return buildLocalAiFallback(payload.message);
  }
};

const buildLocalAiFallback = (rawMessage: string): { aiMessage: string; escalationFlag: boolean; providerUsed: "fallback" } => {
  const message = String(rawMessage || "").trim();
  const text = message.toLocaleLowerCase("tr");
  const emergencyWords = [
    "bilinç",
    "nefes",
    "kanama",
    "enkaz",
    "yangın",
    "kalp",
    "bayıl",
    "ölü",
    "acil",
    "112"
  ];
  const escalationFlag = emergencyWords.some((w) => text.includes(w));

  if (escalationFlag) {
    return {
      escalationFlag: true,
      providerUsed: "fallback",
      aiMessage:
        "Acil risk algılandı. 1) Güvenli alana geçin. 2) 112'yi arayın. 3) Konumunuzu paylaşın. Koordinatör hattına öncelikli eskalasyon notu düşüldü."
    };
  }

  if (text.includes("konum")) {
    return {
      escalationFlag: false,
      providerUsed: "fallback",
      aiMessage:
        "Konum paylaşımı için talep ekranından harita bölümünü açıp GPS iznini etkinleştirin. Ardından isteğe kısa durum notu ekleyip gönderin."
    };
  }

  if (text.includes("ilk yardım") || text.includes("yaralı")) {
    return {
      escalationFlag: false,
      providerUsed: "fallback",
      aiMessage:
        "İlk yardımda öncelik: 1) Ortam güvenliği, 2) Bilinç/nefes kontrolü, 3) Kanama kontrolü. Durum kötüleşirse hemen 112 ve en yakın sağlık birimi."
    };
  }

  if (/(merhaba|selam|selamlar|iyi günler)/i.test(text)) {
    return {
      escalationFlag: false,
      providerUsed: "fallback",
      aiMessage:
        "Merhaba, ben Afet.AI. Size yardımcı olabilmem için olay türü, konum ve kişi/yaralı sayısını yazabilirsiniz."
    };
  }

  if (/(nasılsın|nasilsin|naber|nbr)/i.test(text)) {
    return {
      escalationFlag: false,
      providerUsed: "fallback",
      aiMessage:
        "Hazırım. Kısa bir durum özeti yazın; size adım adım aksiyon planı çıkarayım."
    };
  }

  if (text.includes("deprem")) {
    return {
      escalationFlag: false,
      providerUsed: "fallback",
      aiMessage:
        "Deprem sonrası öneri: 1) Güvenli alana geçin. 2) Gaz/elektrik riskini kontrol edin. 3) Yaralı varsa 112'yi arayın ve konum paylaşın."
    };
  }

  const shortMsg = message.slice(0, 120);
  return {
    escalationFlag: false,
    providerUsed: "fallback",
    aiMessage:
      `Mesajınızı aldım: "${shortMsg}". Talep türü, kişi sayısı, yaralı durumu ve konum bilgisini yazarsanız daha net bir yönlendirme verebilirim.`
  };
};

export const exportUserDataViaApi = async (uid?: string) => {
  const fn = httpsCallable(functions, "exportUserData");
  const res = await fn({ uid });
  return res.data as { signedUrl: string };
};

export const requestDataDeletionViaApi = async (uid?: string) => {
  const fn = httpsCallable(functions, "requestDataDeletion");
  const res = await fn({ uid });
  return res.data as { ticketId: string };
};

export const registerDeviceTokenViaApi = async (payload: { token: string; platform: string }) => {
  const fn = httpsCallable(functions, "registerDeviceToken");
  const res = await fn(payload);
  return res.data as { ok: true };
};


