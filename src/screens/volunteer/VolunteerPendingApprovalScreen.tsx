import {
  React,
  Text,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  auth,
  db,
  doc,
  setDoc,
  serverTimestamp,
  signOut,
  useStore
} from "../shared/ScreenDeps";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { l } from "../../services/i18n";

/**
 * VOL-PENDING DOSYA HARITASI
 * - VOL-PENDING-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - VOL-PENDING-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - VOL-PENDING-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */
// [FONKSIYON] VolunteerPendingApprovalScreen: Başvuru onay bekleme durumunu ve test geçiş aksiyonlarını gösterir.
export const VolunteerPendingApprovalScreen = () => {
  const { user, userData, setUserData } = useStore();
  const showToast = useStore((s) => s.showToast);
  const locale = useStore((s) => s.locale);
  const amoledMode = useStore((s) => s.amoledMode);
  const lightMode = useStore((s) => s.lightMode);

  const L = (tr: string, en: string) => l(locale, tr, en);

  const pageBg = lightMode ? "#eef2f7" : amoledMode ? "#020205" : "#0a0710";
  const gradColors = lightMode
    ? ["#ffffff", "#f3f4f6", "#e5e7eb"]
    : amoledMode
      ? ["#1a060d", "#09030a", "#020205"]
      : ["#7a0c1a", "#b11226", "#4f0a15"];
  const panelBg = lightMode ? "rgba(255,255,255,0.93)" : "rgba(255,255,255,0.08)";
  const panelBorder = lightMode ? "rgba(148,163,184,0.24)" : "rgba(255,255,255,0.12)";
  const titleColor = lightMode ? "#0f172a" : "white";
  const subColor = lightMode ? "#334155" : "#ffe4e6";
  const bodyColor = lightMode ? "#1f2937" : "#ffe4e6";
  const mutedColor = lightMode ? "#64748b" : "#fecdd3";

  // [FONKSIYON] setStatus: Gönüllü durumunu draft/approved olarak günceller ve public profile yansıtır.
  const setStatus = async (status: "draft" | "approved") => {
    if (!user) return;
    try {
      await setDoc(
        doc(db, "users", user.uid),
        {
          volunteerStatus: status,
          lastActiveAt: serverTimestamp(),
          ...(status === "approved" ? { isApprovedVolunteer: true } : {})
        } as any,
        { merge: true } as any
      );
      await upsertUserPublicDoc(user.uid, {
        ...(userData || {}),
        volunteerStatus: status,
        ...(status === "approved" ? { isApprovedVolunteer: true } : {})
      } as any);
      setUserData({
        ...(userData || {}),
        volunteerStatus: status,
        ...(status === "approved" ? { isApprovedVolunteer: true } : {})
      });
      showToast(
        status === "draft"
          ? L("Başvuru düzenleme moduna alındı.", "Application moved to edit mode.")
          : L("Demo onayı verildi. Gönüllü paneli açılıyor.", "Demo approval granted. Volunteer panel is opening."),
        "success"
      );
    } catch (e) {
      console.warn("[volunteer-pending] status update failed", e);
      showToast(L("Başvuru durumu güncellenemedi.", "Application status could not be updated."), "error");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: pageBg }}>
      <LinearGradient colors={gradColors as any} style={{ flex: 1, paddingHorizontal: 16, paddingTop: 58, paddingBottom: 24 }}>
        <View style={{ alignItems: "center", marginTop: 24 }}>
          <View
            style={{
              width: 82,
              height: 82,
              borderRadius: 41,
              backgroundColor: lightMode ? "rgba(239,68,68,0.1)" : "rgba(255,255,255,0.12)",
              borderWidth: 1,
              borderColor: lightMode ? "rgba(239,68,68,0.25)" : "rgba(255,255,255,0.2)",
              alignItems: "center",
              justifyContent: "center"
            }}
          >
            <Ionicons name="time-outline" size={38} color={lightMode ? "#b91c1c" : "#fff1f2"} />
          </View>
          <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 30, marginTop: 18 }}>
            {L("Onay Bekleniyor", "Approval Pending")}
          </Text>
          <Text
            style={{
              color: subColor,
              fontFamily: "Inter",
              fontSize: 13,
              lineHeight: 19,
              textAlign: "center",
              marginTop: 8,
              maxWidth: 320
            }}
          >
            {L(
              "Gönüllü başvurunuz alındı. Yönetici onayı sonrası görev üstlenme ve operasyon ekranları aktif edilecektir.",
              "Your volunteer application has been received. Mission and operations screens will be enabled after coordinator approval."
            )}
          </Text>
        </View>

        <View
          style={{
            marginTop: 22,
            borderRadius: 20,
            backgroundColor: panelBg,
            borderWidth: 1,
            borderColor: panelBorder,
            padding: 14
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <View
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                backgroundColor: "rgba(34,197,94,0.14)",
                alignItems: "center",
                justifyContent: "center",
                marginRight: 8
              }}
            >
              <Ionicons name="checkmark-circle" size={16} color="#16a34a" />
            </View>
            <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 13 }}>
              {L("Tamamlanan Adımlar", "Completed Steps")}
            </Text>
          </View>

          {[
            L("Temel hesap oluşturma / giriş", "Base account creation / login"),
            L("Telefon doğrulama", "Phone verification"),
            L("KVKK onayı", "Consent approval"),
            L("Rol seçimi (Gönüllü)", "Role selection (Volunteer)"),
            L("Gönüllü onboarding formu gönderimi", "Volunteer onboarding form submission")
          ].map((line) => (
            <View key={line} style={{ flexDirection: "row", alignItems: "center", marginBottom: 7 }}>
              <Ionicons name="ellipse" size={7} color={lightMode ? "#ef4444" : "#fecaca"} style={{ marginRight: 8 }} />
              <Text style={{ color: bodyColor, fontFamily: "Inter", fontSize: 12 }}>{line}</Text>
            </View>
          ))}
        </View>

        <View
          style={{
            marginTop: 16,
            borderRadius: 18,
            backgroundColor: panelBg,
            borderWidth: 1,
            borderColor: panelBorder,
            padding: 12
          }}
        >
          <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 13, marginBottom: 6 }}>
            {L("Durum Bilgisi", "Status Info")}
          </Text>
          <Text style={{ color: mutedColor, fontFamily: "Inter", fontSize: 12, lineHeight: 18 }}>
            {L(
              "Başvurunuz değerlendirilirken profil bilgileriniz ve yetkinlik alanlarınız kontrol edilir. Gerekirse düzenleme için geri döndürülebilir.",
              "While your application is reviewed, profile details and competencies are checked. It may be returned for edits if required."
            )}
          </Text>
        </View>

        <View style={{ marginTop: "auto" }}>
          <TouchableOpacity
            onPress={() => setStatus("draft")}
            style={{
              height: 52,
              borderRadius: 16,
              backgroundColor: lightMode ? "#f8fafc" : "rgba(255,255,255,0.08)",
              borderWidth: 1,
              borderColor: panelBorder,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 10
            }}
          >
            <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 13 }}>
              {L("BAŞVURUYU DÜZENLE", "EDIT APPLICATION")}
            </Text>
          </TouchableOpacity>

          {__DEV__ ? (
            <TouchableOpacity onPress={() => setStatus("approved")} style={{ height: 52, borderRadius: 16, overflow: "hidden", marginBottom: 10 }}>
              <LinearGradient colors={["#22c55e", "#15803d"]} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 13 }}>
                  {L("DEMO ONAYI VER (TEST)", "GRANT DEMO APPROVAL (TEST)")}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          ) : null}

          <TouchableOpacity
            onPress={() => signOut(auth)}
            style={{
              height: 50,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              borderWidth: 1,
              borderColor: "rgba(248,113,113,0.24)",
              backgroundColor: lightMode ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.05)"
            }}
          >
            <Text style={{ color: "#b91c1c", fontFamily: "Inter-Bold", fontSize: 13 }}>
              {L("ÇIKIŞ YAP", "SIGN OUT")}
            </Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
};
