/**
 * VERİFY EMAIL SCREEN
 * Kullanıcı kayıt olduktan sonra e-posta doğrulaması yapana kadar bu ekran gösterilir.
 *
 * AKIŞ:
 *   1. Kayıt → sendEmailVerification → signOut → Login ekranına yönlendirme
 *   2. Login → emailVerified false → bu ekran açılır
 *   3. Kullanıcı e-postasındaki bağlantıya tıklar
 *   4. Uygulamaya geri döner → "Doğrulandım, Devam Et" → reload() → emailVerified: true → normal akış
 *   5. Arka planda her 5 saniyede bir otomatik kontrol yapılır (polling)
 */
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { reload, sendEmailVerification, signOut } from "firebase/auth/cordova";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../../firebase";
import { useStore } from "../../store";
import { l } from "../../services/i18n";

export const VerifyEmailScreen = ({ onVerified }: { onVerified: () => void }) => {
  const locale = useStore((s) => s.locale);
  const lightMode = useStore((s) => s.lightMode);
  const amoledMode = useStore((s) => s.amoledMode);
  const showToast = useStore((s) => s.showToast);
  const L = (tr: string, en: string) => l(locale, tr, en);

  const [checking, setChecking] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  const userEmail = auth.currentUser?.email || "";

  // ─── Otomatik polling: her 5 saniyede reload() yaparak emailVerified'ı kontrol et ───
  useEffect(() => {
    const interval = setInterval(async () => {
      const u = auth.currentUser;
      if (!u) return;
      try {
        await reload(u);           // Firebase'den güncel kullanıcı durumunu çek
        if (u.emailVerified) {     // Artık doğrulandıysa
          clearInterval(interval);
          onVerified();            // RootNavigator'a bildir → normal akış
        }
      } catch {
        // Ağ hatası: sessizce devam et, bir sonraki tick'te tekrar dener
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [onVerified]);

  // ─── Cooldown geri sayım zamanlayıcısı ───
  useEffect(() => {
    if (!cooldown) return;
    const timer = setInterval(() => setCooldown((v) => Math.max(0, v - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // ─── Manuel kontrol butonu ───
  const handleManualCheck = async () => {
    const u = auth.currentUser;
    if (!u || checking) return;
    setChecking(true);
    try {
      await reload(u);
      if (u.emailVerified) {
        onVerified();
      } else {
        showToast(
          L("E-posta henüz doğrulanmadı. Gelen kutunuzu kontrol edin.", "Email not verified yet. Check your inbox."),
          "info"
        );
      }
    } catch {
      showToast(L("Kontrol başarısız. İnternet bağlantınızı kontrol edin.", "Check failed. Check your connection."), "error");
    } finally {
      setChecking(false);
    }
  };

  // ─── Doğrulama e-postasını yeniden gönder (Cloud Function → fallback Firebase) ───
  const handleResend = async () => {
    const u = auth.currentUser;
    if (!u || resending || cooldown > 0) return;
    setResending(true);
    try {
      const fn = httpsCallable(functions, "sendVerificationEmail");
      await fn({ email: u.email });
      setCooldown(60);
      showToast(L("Doğrulama e-postası yeniden gönderildi.", "Verification email resent."), "success");
    } catch {
      // Cloud Function başarısız → Firebase fallback
      try {
        await sendEmailVerification(u);
        setCooldown(60);
        showToast(L("Doğrulama e-postası gönderildi.", "Verification email sent."), "success");
      } catch {
        showToast(L("E-posta gönderilemedi. Biraz sonra tekrar deneyin.", "Could not send email. Try later."), "error");
      }
    } finally {
      setResending(false);
    }
  };

  // ─── Çıkış yap ───
  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch {}
  };

  const gradientColors: [string, string, string] = lightMode
    ? ["#ffffff", "#f3f4f6", "#e5e7eb"]
    : amoledMode
      ? ["#1a060d", "#09030a", "#020205"]
      : ["#7a001f", "#9f102f", "#4d0018"];

  const cardBg = lightMode ? "rgba(255,255,255,0.96)" : "rgba(255,255,255,0.08)";
  const cardBorder = lightMode ? "rgba(148,163,184,0.24)" : "rgba(255,255,255,0.12)";
  const titleColor = lightMode ? "#0f172a" : "#fff1f2";
  const subColor = lightMode ? "#334155" : "#fecdd3";

  return (
    <LinearGradient colors={gradientColors} style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}>
      <View
        style={{
          width: "100%",
          maxWidth: 360,
          backgroundColor: cardBg,
          borderRadius: 22,
          borderWidth: 1,
          borderColor: cardBorder,
          padding: 28,
          alignItems: "center"
        }}
      >
        {/* İkon */}
        <View
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            backgroundColor: "rgba(185,28,28,0.12)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18
          }}
        >
          <Ionicons name="mail-outline" size={38} color="#b91c1c" />
        </View>

        {/* Başlık */}
        <Text style={{ color: titleColor, fontFamily: "Inter-Bold", fontSize: 21, marginBottom: 10, textAlign: "center" }}>
          {L("E-postanı Doğrula", "Verify Your Email")}
        </Text>

        {/* Açıklama */}
        <Text style={{ color: subColor, fontFamily: "Inter", fontSize: 14, textAlign: "center", lineHeight: 21, marginBottom: 6 }}>
          {L(
            `${userEmail} adresine bir doğrulama bağlantısı gönderildi. Bağlantıya tıklayarak hesabını aktif et.`,
            `A verification link was sent to ${userEmail}. Click the link to activate your account.`
          )}
        </Text>
        <Text style={{ color: lightMode ? "#94a3b8" : "#fca5a5", fontFamily: "Inter", fontSize: 12, textAlign: "center", marginBottom: 24 }}>
          {L("Spam / Gereksiz klasörünü de kontrol et.", "Also check your spam / junk folder.")}
        </Text>

        {/* Otomatik kontrol göstergesi */}
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 20, gap: 8 }}>
          <ActivityIndicator size="small" color={lightMode ? "#b91c1c" : "#fca5a5"} />
          <Text style={{ color: lightMode ? "#64748b" : "#fda4af", fontFamily: "Inter", fontSize: 12 }}>
            {L("Otomatik kontrol ediliyor...", "Checking automatically...")}
          </Text>
        </View>

        {/* Doğrulandım butonu */}
        <TouchableOpacity
          onPress={handleManualCheck}
          disabled={checking}
          style={{
            width: "100%",
            height: 50,
            backgroundColor: "#b91c1c",
            borderRadius: 14,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            opacity: checking ? 0.75 : 1
          }}
        >
          {checking
            ? <ActivityIndicator color="white" />
            : <Text style={{ color: "white", fontFamily: "Inter-Bold", fontSize: 15 }}>
                {L("E-postayı Doğruladım, Devam Et", "I Verified My Email, Continue")}
              </Text>
          }
        </TouchableOpacity>

        {/* Yeniden gönder butonu */}
        <TouchableOpacity
          onPress={handleResend}
          disabled={resending || cooldown > 0}
          style={{
            width: "100%",
            height: 46,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: lightMode ? "rgba(185,28,28,0.3)" : "rgba(255,255,255,0.18)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 18,
            opacity: resending || cooldown > 0 ? 0.6 : 1
          }}
        >
          <Text style={{ color: lightMode ? "#b91c1c" : "#fecdd3", fontFamily: "Inter", fontSize: 14 }}>
            {cooldown > 0
              ? L(`Tekrar Gönder (${cooldown}s)`, `Resend (${cooldown}s)`)
              : resending
                ? L("Gönderiliyor...", "Sending...")
                : L("Doğrulama E-postasını Tekrar Gönder", "Resend Verification Email")
            }
          </Text>
        </TouchableOpacity>

        {/* Doğrulamayı atla */}
        <TouchableOpacity
          onPress={onVerified}
          style={{
            width: "100%",
            height: 46,
            borderRadius: 14,
            borderWidth: 1.5,
            borderColor: lightMode ? "rgba(148,163,184,0.4)" : "rgba(255,255,255,0.1)",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 10,
            backgroundColor: lightMode ? "rgba(148,163,184,0.08)" : "rgba(255,255,255,0.05)",
            flexDirection: "row",
            gap: 6,
          }}
        >
          <Ionicons name="arrow-forward-circle-outline" size={17} color={lightMode ? "#64748b" : "#94a3b8"} />
          <Text style={{ color: lightMode ? "#64748b" : "#94a3b8", fontFamily: "Inter", fontSize: 13 }}>
            {L("Doğrulamayı Atla", "Skip Verification")}
          </Text>
        </TouchableOpacity>

        {/* Çıkış yap */}
        <TouchableOpacity onPress={handleSignOut}>
          <Text style={{ color: lightMode ? "#94a3b8" : "#fda4af", fontFamily: "Inter", fontSize: 13 }}>
            {L("Farklı hesapla giriş yap", "Sign in with a different account")}
          </Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};
