import {
  React, useMemo, useState,
  Alert, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
  Ionicons, LinearGradient,
  db, doc, setDoc, serverTimestamp, useStore,
  signOut, auth
} from "../shared/ScreenDeps";
import { maskPhone, maskTc } from "../../utils/privacy";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { l } from "../../services/i18n";

/**
 * VOL-ONBOARD DOSYA HARITASI
 * - VOL-ONBOARD-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - VOL-ONBOARD-VALIDATE: Bu bolumde form alanlari icin dogrulama ve temizleme kurallari vardir.
 * - VOL-ONBOARD-PERSIST: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - VOL-ONBOARD-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */

type StepKey =
  | "personal"
  | "region"
  | "skills"
  | "availability"
  | "terms"
  | "preview";

type SkillLevel = "beginner" | "intermediate" | "expert";
type Availability = "available" | "busy" | "offline";

type FormState = {
  fullName: string;
  phone: string;
  city: string;
  district: string;
  interests: string[];
  skills: string[];
  skillLevel: SkillLevel | "";
  availability: Availability | "";
  motivation: string;
  volunteerTermsAccepted: boolean;
};

type FieldErrors = Partial<Record<keyof FormState, string>>;

const STEP_KEYS: StepKey[] = ["personal", "region", "skills", "availability", "terms", "preview"];

const CITY_OPTIONS = [
  "İstanbul", "Ankara", "İzmir", "Bursa", "Antalya", "Adana", "Kahramanmaraş", "Hatay", "Gaziantep"
];

const INTEREST_OPTIONS = [
  "Sağlık Desteği", "Lojistik", "Barınma", "Gıda Dağıtımı", "Arama Kurtarma Desteği", "Psikososyal Destek"
];

const SKILL_OPTIONS = [
  "İlk Yardım", "Saha Lojistiği", "Araç Kullanımı", "Harita / Navigasyon", "Çocuk Desteği", "Koordinasyon"
];

const PILL_BASE = {
  borderRadius: 999,
  borderWidth: 1,
  paddingHorizontal: 11,
  paddingVertical: 8
} as const;

// [FONKSIYON] slugify: Şehir/bölge metnini regionId için güvenli anahtara dönüştürür.
const slugify = (v: string) =>
  v
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9ğüşöçıİ]+/gi, "-")
    .replace(/^-+|-+$/g, "");

// [FONKSIYON] toggleMulti: Çoklu seçim dizisinde eleman ekleme/çıkarma yapar.
const toggleMulti = (arr: string[], value: string) =>
  arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];

// [FONKSIYON] VolunteerOnboardingStepperScreen: Gönüllü başvuru stepper formunu ve gönderim sürecini yönetir.
export const VolunteerOnboardingStepperScreen = () => {
  const { user, userData, setUserData } = useStore();
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const L = (tr: string, en: string) => l(locale, tr, en);

  const [form, setForm] = useState<FormState>({
    fullName: userData?.fullName || "",
    phone: String((userData as any)?.phone_masked || "").trim(),
    city: userData?.city || "",
    district: userData?.district || "",
    interests: Array.isArray(userData?.interests) ? userData!.interests! : [],
    skills: Array.isArray(userData?.skills) ? userData!.skills! : [],
    skillLevel: (userData?.skillLevel as SkillLevel) || "",
    availability: (userData?.availability as Availability) || "",
    motivation: userData?.motivation || "",
    volunteerTermsAccepted: Boolean(userData?.volunteerTermsAccepted)
  });

  const STEPS: Array<{ key: StepKey; title: string; sub: string }> = useMemo(
    () => [
      { key: "personal", title: L("Kişisel Bilgiler", "Personal Info"), sub: L("Ad, TC ve telefon bilgilerinizi kontrol edin.", "Check your name, ID and phone details.") },
      { key: "region", title: L("Bölge & İletişim", "Region & Contact"), sub: L("Şehir ve ilçe bilgisi görev eşleştirmede kullanılır.", "City and district are used for mission matching.") },
      { key: "skills", title: L("Yetkinlik / İlgi", "Skills / Interests"), sub: L("Saha uygunluğunu artırmak için ilgi ve yetkinlik seçin.", "Choose interests and skills to improve field matching.") },
      { key: "availability", title: L("Uygunluk", "Availability"), sub: L("Müsaitlik ve beceri seviyenizi belirtin.", "Set your availability and skill level.") },
      { key: "terms", title: L("Onaylar", "Consents"), sub: L("Gönüllü sorumluluk ve motivasyon bilgisini tamamlayın.", "Complete volunteer responsibility and motivation info.") },
      { key: "preview", title: L("Önizleme", "Preview"), sub: L("Başvurunuzu göndermeden önce kontrol edin.", "Review before submitting your application.") }
    ],
    [locale]
  );
  const step = STEPS[stepIndex];
  const progressPct = Math.round(((stepIndex + 1) / STEPS.length) * 100);
  const maskedTc = maskTc(userData?.tcNo);
  const maskedPhone = maskPhone(form.phone);

  // VOL-ONBOARD-TURETIM: Bu bolumde veriden turetilen hesaplamalar ve gosterge metrikleri bulunur.
  const previewRows = useMemo(
    () => [
      { label: L("Ad Soyad", "Full Name"), value: form.fullName || "-" },
      { label: L("TC Kimlik", "National ID"), value: maskedTc },
      { label: L("Telefon", "Phone"), value: maskedPhone },
      { label: L("Şehir", "City"), value: form.city || "-" },
      { label: L("İlçe", "District"), value: form.district || "-" },
      { label: L("İlgi Alanları", "Interests"), value: form.interests.join(", ") || "-" },
      { label: L("Yetkinlikler", "Skills"), value: form.skills.join(", ") || "-" },
      { label: L("Beceri Seviyesi", "Skill Level"), value: form.skillLevel || "-" },
      { label: L("Müsaitlik", "Availability"), value: form.availability || "-" },
      { label: L("Motivasyon", "Motivation"), value: form.motivation || "-" }
    ],
    [form, maskedTc, maskedPhone, locale]
  );

  // [FONKSIYON] patchForm: Form state'ini parça güncellemelerle birleştirir.
  const patchForm = (patch: Partial<FormState>) => {
    setForm((p) => ({ ...p, ...patch }));
  };

  // VOL-ONBOARD-VALIDATE: Bu bolumde form alanlari icin dogrulama ve temizleme kurallari vardir.
  // [FONKSIYON] validateStep: İlgili adımın zorunlu alanlarını doğrular.
  const validateStep = (index: number) => {
    const nextErrors: FieldErrors = {};
    const key = STEPS[index].key;

    if (key === "personal") {
      if (!form.fullName.trim()) nextErrors.fullName = L("Ad soyad zorunlu.", "Full name is required.");
      if (!form.phone.trim() || form.phone === "-") nextErrors.phone = L("Telefon bilgisi eksik.", "Phone info is missing.");
    }
    if (key === "region") {
      if (!form.city.trim()) nextErrors.city = L("Şehir seçin.", "Select a city.");
    }
    if (key === "skills") {
      if (!form.interests.length) nextErrors.interests = L("En az bir ilgi alanı seçin.", "Select at least one interest.");
      if (!form.skills.length) nextErrors.skills = L("En az bir yetkinlik seçin.", "Select at least one skill.");
    }
    if (key === "availability") {
      if (!form.skillLevel) nextErrors.skillLevel = L("Beceri seviyesi seçin.", "Select skill level.");
      if (!form.availability) nextErrors.availability = L("Müsaitlik seçin.", "Select availability.");
    }
    if (key === "terms") {
      if (!form.motivation.trim()) nextErrors.motivation = L("Kısa motivasyon / saha notu girin.", "Enter short motivation / field note.");
      if (!form.volunteerTermsAccepted) nextErrors.volunteerTermsAccepted = L("Gönüllü sorumluluk onayı gereklidir.", "Volunteer responsibility consent is required.");
    }

    setErrors((prev) => ({ ...prev, ...nextErrors }));
    return Object.keys(nextErrors).length === 0;
  };

  // [FONKSIYON] nextStep: Doğrulama başarılıysa bir sonraki step'e geçirir.
  const nextStep = () => {
    if (!validateStep(stepIndex)) return;
    setStepIndex((p) => Math.min(p + 1, STEPS.length - 1));
  };

  // [FONKSIYON] prevStep: Stepper içinde bir önceki adıma döner.
  const prevStep = () => setStepIndex((p) => Math.max(p - 1, 0));

  // VOL-ONBOARD-PERSIST: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
  // [FONKSIYON] persist: Onboarding verisini users ve users_public koleksiyonlarına kaydeder.
  const persist = async (status: "draft" | "submitted") => {
    if (!user) return;
    setSaving(true);
    try {
      const phoneMasked = String((userData as any)?.phone_masked || form.phone || "").trim();
      const tcMaskedValue = String((userData as any)?.tcNo_masked || maskedTc || "").trim();
      const phoneHashValue = String((userData as any)?.phone_hash || "").trim();
      const tcHashValue = String((userData as any)?.tcNo_hash || "").trim();
      const payload = {
        role: "volunteer",
        volunteerStatus: status,
        fullName: form.fullName.trim(),
        phone_masked: phoneMasked,
        ...(phoneHashValue ? { phone_hash: phoneHashValue } : {}),
        tcNo_masked: tcMaskedValue,
        ...(tcHashValue ? { tcNo_hash: tcHashValue } : {}),
        city: form.city.trim(),
        district: form.district.trim(),
        regionId: slugify(form.city || "genel"),
        interests: form.interests,
        skills: form.skills,
        ...(form.skillLevel ? { skillLevel: form.skillLevel } : {}),
        availability: form.availability || "offline",
        motivation: form.motivation.trim(),
        volunteerTermsAccepted: form.volunteerTermsAccepted,
        onboardingCompletedAt: status === "submitted" ? serverTimestamp() : userData?.onboardingCompletedAt || null,
        lastActiveAt: serverTimestamp()
      };

      const sanitizedPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
      await setDoc(doc(db, "users", user.uid), sanitizedPayload as any, { merge: true } as any);
      await upsertUserPublicDoc(user.uid, {
        ...(userData || {}),
        ...(sanitizedPayload as any)
      });
      setUserData({ ...(userData || {}), ...(sanitizedPayload as any) });
      showToast(
        status === "submitted"
          ? L("Gönüllü başvurunuz alındı. Onay bekleniyor.", "Your volunteer application was received. Waiting for approval.")
          : L("Taslak kaydedildi.", "Draft saved."),
        "success"
      );
    } catch (e) {
      console.warn("[volunteer-onboarding] persist failed", e);
      showToast(L("Gönüllü kaydı kaydedilemedi. Bağlantıyı kontrol edin.", "Volunteer profile could not be saved. Check connection."), "error");
    } finally {
      setSaving(false);
    }
  };

  // [FONKSIYON] submit: Tüm adımları doğrulayıp başvuruyu submitted durumunda gönderir.
  const submit = async () => {
    for (let i = 0; i < STEPS.length - 1; i += 1) {
      const ok = validateStep(i);
      if (!ok) {
        setStepIndex(i);
        return;
      }
    }
    await persist("submitted");
  };

  // [FONKSIYON] renderError: Alan bazlı doğrulama hatasını küçük metin olarak gösterir.
  const renderError = (key: keyof FormState) =>
    errors[key] ? <Text style={{ color: "#fecaca", fontFamily: "Inter", fontSize: 11, marginTop: 6 }}>{errors[key]}</Text> : null;

  const sectionCardStyle = {
    borderRadius: 18,
    backgroundColor: lightMode ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: lightMode ? "rgba(148,163,184,0.24)" : "rgba(255,255,255,0.08)",
    padding: 14
  } as const;

  return (
    <View style={{ flex: 1, backgroundColor: lightMode ? "#eef2f7" : amoledMode ? "#020205" : "#0b0910" }}>
      <LinearGradient
        colors={
          lightMode
            ? (["#ffffff", "#f3f4f6", "#e5e7eb"] as any)
            : amoledMode
              ? (["#1a060d", "#09030a", "#020205"] as any)
              : (["#7a0c1a", "#b11226", "#4b0711"] as any)
        }
        style={{ paddingTop: 56, paddingHorizontal: 16, paddingBottom: 14 }}
      >
        <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
          <View style={{ flex: 1, paddingRight: 10 }}>
            <Text style={{ color: lightMode ? "#334155" : "#fecdd3", fontFamily: "Inter", fontSize: 12 }}>
              {L("Gönüllü Kayıt / Onboarding", "Volunteer Registration / Onboarding")}
            </Text>
            <Text style={{ color: lightMode ? "#0f172a" : "white", fontFamily: "Inter-Bold", fontSize: 28, lineHeight: 32, marginTop: 4 }}>
              {L("Gönüllü Başvuru Formu", "Volunteer Application Form")}
            </Text>
            <Text style={{ color: lightMode ? "#334155" : "#ffe4e6", fontFamily: "Inter", fontSize: 12, marginTop: 6 }}>
              {L("Adım", "Step")} {stepIndex + 1}/{STEPS.length} • %{progressPct} {L("tamamlandı", "completed")}
            </Text>
          </View>
          <View style={{ alignItems: "center", gap: 8 }}>
            <View style={{ width: 52, height: 52, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" }}>
              <Ionicons name="shield-checkmark-outline" size={24} color="#fff1f2" />
            </View>
            <TouchableOpacity
              onPress={() => Alert.alert(
                L("Çıkış Yap", "Sign Out"),
                L("Giriş ekranına dönmek istiyor musunuz?", "Do you want to return to the login screen?"),
                [
                  { text: L("İptal", "Cancel"), style: "cancel" },
                  { text: L("Çıkış Yap", "Sign Out"), style: "destructive", onPress: () => void signOut(auth) }
                ]
              )}
              style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.07)", borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}
            >
              <Ionicons name="log-out-outline" size={12} color="#fecdd3" />
              <Text style={{ color: "#fecdd3", fontFamily: "Inter-Bold", fontSize: 10, letterSpacing: 0.5 }}>{L("ÇIKIŞ", "EXIT")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ marginTop: 12, height: 8, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.12)", overflow: "hidden" }}>
          <View style={{ width: `${progressPct}%`, height: "100%", backgroundColor: "#fff1f2" }} />
        </View>
      </LinearGradient>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 12}
      >
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 110 }}
      >
        <View style={sectionCardStyle}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
            <View style={{ width: 32, height: 32, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.14)", alignItems: "center", justifyContent: "center", marginRight: 8 }}>
              <Ionicons name="layers-outline" size={16} color="#fecaca" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: lightMode ? "#0f172a" : "#fff1f2", fontFamily: "Inter-Bold", fontSize: 15 }}>{step.title}</Text>
              <Text style={{ color: lightMode ? "#334155" : "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 1 }}>{step.sub}</Text>
            </View>
          </View>

          {step.key === "personal" ? (
            <>
              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginBottom: 6 }}>{L("Ad Soyad", "Full Name")}</Text>
              <TextInput
                value={form.fullName}
                editable={false}
                style={[inputStyle, disabledInputStyle]}
                placeholder={L("Ad Soyad", "Full Name")}
                placeholderTextColor="#cbd5e1"
              />
              {renderError("fullName")}

              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 12, marginBottom: 6 }}>{L("TC Kimlik Numarası", "National ID Number")}</Text>
              <TextInput
                value={maskedTc}
                editable={false}
                style={[inputStyle, disabledInputStyle]}
                placeholder={L("TC Kimlik Numarası", "National ID Number")}
                placeholderTextColor="#cbd5e1"
              />

              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 12, marginBottom: 6 }}>{L("Telefon", "Phone")}</Text>
              <TextInput
                value={maskedPhone}
                editable={false}
                style={[inputStyle, disabledInputStyle]}
                placeholder={L("05XXXXXXXXX", "05XXXXXXXXX")}
                placeholderTextColor="#cbd5e1"
                maxLength={11}
              />
              {renderError("phone")}
            </>
          ) : null}

          {step.key === "region" ? (
            <>
              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginBottom: 6 }}>{L("Şehir / Bölge", "City / Region")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {CITY_OPTIONS.map((city) => {
                  const active = form.city === city;
                  return (
                    <TouchableOpacity
                      key={city}
                      onPress={() => {
                        patchForm({ city });
                        setErrors((p) => ({ ...p, city: undefined }));
                      }}
                      style={{
                        ...PILL_BASE,
                        backgroundColor: active ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)",
                        borderColor: active ? "rgba(248,113,113,0.34)" : "rgba(255,255,255,0.08)"
                      }}
                    >
                      <Text style={{ color: active ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 }}>{city}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {renderError("city")}

              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 12, marginBottom: 6 }}>{L("İlçe (opsiyonel)", "District (optional)")}</Text>
              <TextInput
                value={form.district}
                onChangeText={(v) => patchForm({ district: v })}
                style={inputStyle}
                placeholder={L("Örn. Ataşehir", "e.g. Atasehir")}
                placeholderTextColor="#cbd5e1"
              />
            </>
          ) : null}

          {step.key === "skills" ? (
            <>
              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginBottom: 6 }}>{L("İlgi Alanları", "Interests")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {INTEREST_OPTIONS.map((item) => {
                  const active = form.interests.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => {
                        patchForm({ interests: toggleMulti(form.interests, item) });
                        setErrors((p) => ({ ...p, interests: undefined }));
                      }}
                      style={{
                        ...PILL_BASE,
                        backgroundColor: active ? "rgba(239,68,68,0.18)" : "rgba(255,255,255,0.04)",
                        borderColor: active ? "rgba(248,113,113,0.34)" : "rgba(255,255,255,0.08)"
                      }}
                    >
                      <Text style={{ color: active ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 }}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {renderError("interests")}

              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 12, marginBottom: 6 }}>{L("Yetkinlikler", "Skills")}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {SKILL_OPTIONS.map((item) => {
                  const active = form.skills.includes(item);
                  return (
                    <TouchableOpacity
                      key={item}
                      onPress={() => {
                        patchForm({ skills: toggleMulti(form.skills, item) });
                        setErrors((p) => ({ ...p, skills: undefined }));
                      }}
                      style={{
                        ...PILL_BASE,
                        backgroundColor: active ? "rgba(59,130,246,0.16)" : "rgba(255,255,255,0.04)",
                        borderColor: active ? "rgba(147,197,253,0.28)" : "rgba(255,255,255,0.08)"
                      }}
                    >
                      <Text style={{ color: active ? "#dbeafe" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 }}>{item}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {renderError("skills")}
            </>
          ) : null}

          {step.key === "availability" ? (
            <>
              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginBottom: 6 }}>{L("Beceri Seviyesi", "Skill Level")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  ["beginner", L("Başlangıç", "Beginner"), "#94a3b8"],
                  ["intermediate", L("Orta", "Intermediate"), "#f59e0b"],
                  ["expert", L("Uzman", "Expert"), "#22c55e"]
                ].map(([value, label, color]) => {
                  const active = form.skillLevel === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => {
                        patchForm({ skillLevel: value as SkillLevel });
                        setErrors((p) => ({ ...p, skillLevel: undefined }));
                      }}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? `${color}` : "rgba(255,255,255,0.08)",
                        backgroundColor: active ? `${color}22` : "rgba(255,255,255,0.04)",
                        paddingVertical: 10,
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ color: active ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {renderError("skillLevel")}

              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginTop: 12, marginBottom: 6 }}>{L("Müsaitlik Durumu", "Availability Status")}</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {[
                  ["available", L("Müsait", "Available"), "#22c55e"],
                  ["busy", L("Meşgul", "Busy"), "#f59e0b"],
                  ["offline", "Offline", "#64748b"]
                ].map(([value, label, color]) => {
                  const active = form.availability === value;
                  return (
                    <TouchableOpacity
                      key={value}
                      onPress={() => {
                        patchForm({ availability: value as Availability });
                        setErrors((p) => ({ ...p, availability: undefined }));
                      }}
                      style={{
                        flex: 1,
                        borderRadius: 14,
                        borderWidth: 1,
                        borderColor: active ? `${color}` : "rgba(255,255,255,0.08)",
                        backgroundColor: active ? `${color}22` : "rgba(255,255,255,0.04)",
                        paddingVertical: 10,
                        alignItems: "center"
                      }}
                    >
                      <Text style={{ color: active ? "#fff1f2" : "#fecdd3", fontFamily: "Inter-Bold", fontSize: 12 }}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              {renderError("availability")}
            </>
          ) : null}

          {step.key === "terms" ? (
            <>
              <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 11, marginBottom: 6 }}>{L("Kısa Motivasyon / Saha Notu", "Short Motivation / Field Note")}</Text>
              <TextInput
                value={form.motivation}
                onChangeText={(v) => {
                  patchForm({ motivation: v });
                  setErrors((p) => ({ ...p, motivation: undefined }));
                }}
                style={[inputStyle, { minHeight: 110, textAlignVertical: "top", paddingTop: 12 }]}
                multiline
                maxLength={280}
                placeholder={L("Kısa saha deneyimi, nasıl destek olmak istediğiniz vb.", "Short field experience and how you want to help.")}
                placeholderTextColor="#cbd5e1"
              />
              <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 10, marginTop: 5, textAlign: "right" }}>{form.motivation.length}/280</Text>
              {renderError("motivation")}

              <View
                style={{
                  marginTop: 12,
                  marginBottom: 12,
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: form.volunteerTermsAccepted ? "rgba(34,197,94,0.24)" : "rgba(255,255,255,0.08)",
                  backgroundColor: form.volunteerTermsAccepted ? "rgba(34,197,94,0.10)" : "rgba(255,255,255,0.03)",
                  padding: 12,
                  paddingBottom: 14
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    patchForm({ volunteerTermsAccepted: !form.volunteerTermsAccepted });
                    setErrors((p) => ({ ...p, volunteerTermsAccepted: undefined }));
                  }}
                  style={{ flexDirection: "row", alignItems: "flex-start", minHeight: 52 }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      marginRight: 10,
                      backgroundColor: form.volunteerTermsAccepted ? "#22c55e" : "rgba(255,255,255,0.08)",
                      borderWidth: 1,
                      borderColor: form.volunteerTermsAccepted ? "#22c55e" : "rgba(255,255,255,0.12)",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                  >
                    {form.volunteerTermsAccepted ? <Ionicons name="checkmark" size={13} color="white" /> : null}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Gönüllü sorumluluk onayını kabul ediyorum", "I accept volunteer responsibility consent")}</Text>
                    <Text style={{ color: "#fecdd3", fontFamily: "Inter", fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                      {L("Saha güvenlik kuralları ve koordinasyon yönergelerine uygun hareket edeceğimi kabul ederim.", "I agree to follow field safety rules and coordination guidelines.")}
                    </Text>
                  </View>
                </TouchableOpacity>
                {renderError("volunteerTermsAccepted")}
              </View>
            </>
          ) : null}

          {step.key === "preview" ? (
            <>
              {previewRows.map((row) => (
                <View key={row.label} style={{ borderRadius: 14, backgroundColor: "rgba(255,255,255,0.03)", borderWidth: 1, borderColor: "rgba(255,255,255,0.06)", padding: 10, marginBottom: 8 }}>
                  <Text style={{ color: "#fda4af", fontFamily: "Inter", fontSize: 10 }}>{row.label}</Text>
                  <Text style={{ color: "#fff1f2", fontFamily: "Inter-Bold", fontSize: 13, marginTop: 2 }}>{row.value}</Text>
                </View>
              ))}
              <View style={{ borderRadius: 14, backgroundColor: "rgba(59,130,246,0.12)", borderWidth: 1, borderColor: "rgba(147,197,253,0.2)", padding: 10 }}>
                <Text style={{ color: "#dbeafe", fontFamily: "Inter-Bold", fontSize: 12 }}>{L("Durum", "Status")}</Text>
                <Text style={{ color: "#bfdbfe", fontFamily: "Inter", fontSize: 11, marginTop: 3 }}>
                  {L('Gönderildikten sonra başvurunuz "Onay Bekleniyor" durumuna geçerek yönetici onayına sunulur.', 'After submission, your application becomes "Pending Approval" and is sent for admin approval.')}
                </Text>
              </View>
            </>
          ) : null}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
          <TouchableOpacity onPress={prevStep} disabled={stepIndex === 0 || saving} style={[secondaryBtn, { opacity: stepIndex === 0 ? 0.5 : 1 }]}>
            <Text style={secondaryBtnText}>{L("GERİ", "BACK")}</Text>
          </TouchableOpacity>
          {stepIndex < STEPS.length - 1 ? (
            <TouchableOpacity onPress={nextStep} disabled={saving} style={primaryBtn}>
              <LinearGradient colors={["#b11226", "#7a0c1a"]} style={primaryBtnInner}>
                <Text style={primaryBtnText}>{L("DEVAM ET", "CONTINUE")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity onPress={submit} disabled={saving} style={primaryBtn}>
              <LinearGradient colors={["#dc2626", "#991b1b"]} style={primaryBtnInner}>
                <Text style={primaryBtnText}>{saving ? L("GÖNDERİLİYOR...", "SUBMITTING...") : L("BAŞVURUYU GÖNDER", "SUBMIT APPLICATION")}</Text>
              </LinearGradient>
            </TouchableOpacity>
          )}
        </View>

        <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
          <TouchableOpacity onPress={async () => { await persist("draft"); }} disabled={saving} style={secondaryBtn}>
            <Text style={secondaryBtnText}>{saving ? L("KAYDEDİLİYOR...", "SAVING...") : L("TASLAK KAYDET", "SAVE DRAFT")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={async () => { await persist("draft"); }} disabled={saving} style={secondaryBtn}>
            <Text style={secondaryBtnText}>{L("DAHA SONRA", "LATER")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={{ color: lightMode ? "#334155" : "#cbd5e1", opacity: 0.7, fontFamily: "Inter", fontSize: 11, textAlign: "center", marginTop: 10 }}>
          {L("Bu form tamamlanmadan gönüllü görev ekranları açılmaz.", "Volunteer mission screens remain locked until this form is completed.")}
        </Text>
      </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
};

const inputStyle = {
  height: 48,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
  backgroundColor: "rgba(255,255,255,0.04)",
  color: "#fff1f2",
  paddingHorizontal: 12,
  fontFamily: "Inter"
} as const;

const disabledInputStyle = {
  opacity: 0.95,
  color: "#e5e7eb",
  borderColor: "rgba(255,255,255,0.08)",
  backgroundColor: "rgba(255,255,255,0.02)"
} as const;

const secondaryBtn = {
  flex: 1,
  height: 46,
  borderRadius: 14,
  borderWidth: 1,
  borderColor: "rgba(255,255,255,0.1)",
  backgroundColor: "rgba(255,255,255,0.04)",
  alignItems: "center",
  justifyContent: "center"
} as const;

const secondaryBtnText = {
  color: "#fff1f2",
  fontFamily: "Inter-Bold",
  fontSize: 12
} as const;

const primaryBtn = {
  flex: 1,
  borderRadius: 14,
  overflow: "hidden"
} as const;

const primaryBtnInner = {
  height: 46,
  alignItems: "center",
  justifyContent: "center"
} as const;

const primaryBtnText = {
  color: "white",
  fontFamily: "Inter-Bold",
  fontSize: 12
} as const;


