import {
  React,
  useEffect,
  useMemo,
  useRef,
  useState,
  Text,
  TouchableOpacity,
  View,
  LinearGradient,
  Ionicons,
  auth,
  useStore,
  RedPattern,
  s
} from "../shared/ScreenDeps";
import { l } from "../../services/i18n";
import { hashPhone, maskPhone, normalizePhone } from "../../utils/privacy";
import { sendPhoneVerificationCodeViaApi, verifyPhoneVerificationCodeViaApi } from "../../services/backend";

export const PhoneVerificationScreen = ({ onVerified }: { onVerified: () => void }) => {
  const { userData, showToast } = useStore();
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);

  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [resendCooldownSec, setResendCooldownSec] = useState(0);
  const [lockoutSec, setLockoutSec] = useState(0);
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [demoCode, setDemoCode] = useState("");
  const [verificationMode, setVerificationMode] = useState<"real" | "mock">("mock");
  const [demoRequested, setDemoRequested] = useState(false);

  const sessionSaltRef = useRef(Math.floor(Math.random() * 1_000_000_000));
  const sendSeqRef = useRef(0);

  const identitySeed = String((userData as any)?.phone_hash || auth.currentUser?.uid || "");
  const dbPhoneHash = String((userData as any)?.phone_hash || "");
  const maskedPhoneSource = String((userData as any)?.phone_masked || userData?.phone || "");
  const maskedPhone = useMemo(
    () => (maskedPhoneSource ? maskPhone(maskedPhoneSource) : L("Kayıtlı telefon yok", "No registered phone")),
    [maskedPhoneSource, locale]
  );

  const canUseKeypad = sent && lockoutSec === 0 && !verifying;

  const gradientColors = lightMode
    ? ["#ffffff", "#f3f4f6", "#e5e7eb"]
    : amoledMode
      ? ["#1a060d", "#09030a", "#020205"]
      : ["#7a001f", "#9f102f", "#4d0018"];
  const titleColor = lightMode ? "#0f172a" : "white";
  const subColor = lightMode ? "#334155" : "#ffe4e6";
  const cardBg = lightMode ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.08)";
  const cardBorder = lightMode ? "rgba(148,163,184,0.24)" : "rgba(255,255,255,0.12)";

  useEffect(() => {
    if (!resendCooldownSec && !lockoutSec) return;
    const timer = setInterval(() => {
      setResendCooldownSec((v) => Math.max(0, v - 1));
      setLockoutSec((v) => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [resendCooldownSec, lockoutSec]);

  useEffect(() => {
    if (lockoutSec === 0 && failedAttempts >= 3) setFailedAttempts(0);
  }, [lockoutSec, failedAttempts]);

  const formatClock = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s2 = sec % 60;
    return `${m}:${String(s2).padStart(2, "0")}`;
  };

  const generatePhoneBoundDemoCode = (): string => {
    sendSeqRef.current += 1;
    const src = `${identitySeed}:${sessionSaltRef.current}:${sendSeqRef.current}`;
    let hash = 0;
    for (let i = 0; i < src.length; i += 1) hash = (hash * 31 + src.charCodeAt(i)) % 900000;
    return (hash + 100000).toString().slice(-6);
  };

  // Kayıtlı telefon hash'i varsa ekstra doğrulama gerekmez — oturum yeterli
  const phoneIsVerifiable = identitySeed.length > 0;

  const sendCode = async () => {
    if (!auth.currentUser) return showToast(L("Oturum bulunamadı.", "Session not found."), "error");
    if (!identitySeed) return showToast(L("Kayıtlı telefon kimliği bulunamadı.", "Phone identity not found."), "error");
    if (lockoutSec > 0) return showToast(L(`Çok fazla hatalı deneme. ${formatClock(lockoutSec)} sonra tekrar deneyin.`, `Too many failed attempts. Try again in ${formatClock(lockoutSec)}.`), "error");
    if (resendCooldownSec > 0) return showToast(L(`Kodu tekrar göndermek için ${resendCooldownSec} sn bekleyin.`, `Wait ${resendCooldownSec}s to resend code.`), "info");
    if (!phoneIsVerifiable) return showToast(L("Kayıtlı telefon bilgisi bulunamadı.", "Registered phone not found."), "error");

    setSending(true);
    try {
      try {
        const result = await sendPhoneVerificationCodeViaApi({ phone: maskedPhoneSource });
        setVerificationMode(result.mode || "real");
        setSent(true);
        setCode("");
        setResendCooldownSec(Math.max(30, Number(result.expiresInSec || 180)));
        setFailedAttempts(0);
        showToast(
          result.mode === "real"
            ? L(`Doğrulama kodu SMS olarak gönderildi: ${maskPhone(maskedPhoneSource)}`, `Verification SMS sent: ${maskPhone(maskedPhoneSource)}`)
            : L("SMS servisi test modunda. Doğrulama demo kodu ile devam ediyor.", "SMS provider is in test mode. Continuing with demo code."),
          "success"
        );
        if (result.mode === "mock" && __DEV__) {
          const nextCode = generatePhoneBoundDemoCode();
          setDemoCode(nextCode);
          showToast(L(`Demo kodu: ${nextCode}`, `Demo code: ${nextCode}`), "info");
        } else {
          setDemoCode("");
        }
      } catch {
        // yayinda sahte kod yok, gonderilemediyse kullanici bunu gorur
        if (!__DEV__) {
          setSent(false);
          showToast(L("Doğrulama kodu gönderilemedi. Biraz sonra tekrar dene.", "Could not send the code. Try again shortly."), "error");
          return;
        }
        const nextCode = generatePhoneBoundDemoCode();
        setVerificationMode("mock");
        setDemoCode(nextCode);
        setSent(true);
        setCode("");
        setResendCooldownSec(30);
        setFailedAttempts(0);
        showToast(L(`Doğrulama kodu gönderildi: ${maskPhone(maskedPhoneSource)}`, `Verification code sent: ${maskPhone(maskedPhoneSource)}`), "success");
        showToast(L(`Demo kodu: ${nextCode}`, `Demo code: ${nextCode}`), "info");
      }
    } finally {
      setSending(false);
    }
  };

  const requestDemoCode = () => {
    if (!__DEV__) return;
    const nextCode = generatePhoneBoundDemoCode();
    setDemoCode(nextCode);
    setVerificationMode("mock");
    setDemoRequested(true);
    setSent(true);
    setCode(nextCode);
    showToast(L(`Demo kodu uygulandı: ${nextCode}`, `Demo code applied: ${nextCode}`), "info");
  };

  const verifyCode = async () => {
    if (!sent) return showToast(L("Önce kod gönderin.", "Send code first."), "error");
    if (lockoutSec > 0) return showToast(L(`Doğrulama kilitli. ${formatClock(lockoutSec)} sonra tekrar deneyin.`, `Verification locked. Try again in ${formatClock(lockoutSec)}.`), "error");
    if (code.length !== 6) return showToast(L("6 haneli doğrulama kodunu girin.", "Enter 6-digit verification code."), "error");

    setVerifying(true);
    try {
      if (verificationMode === "real") {
        try {
          const res = await verifyPhoneVerificationCodeViaApi({ code });
          if (!res.verified) throw new Error("VERIFY_FAILED");
          setFailedAttempts(0);
          showToast(L("Telefon doğrulaması başarılı.", "Phone verification successful."), "success");
          onVerified();
          return;
        } catch {
          const nextFailCount = failedAttempts + 1;
          setFailedAttempts(nextFailCount);
          setCode("");
          if (nextFailCount >= 3) {
            setLockoutSec(60);
            showToast(L("3 hatalı deneme yapıldı. 1 dakika bekleme başlatıldı.", "3 failed attempts. 1 minute cooldown started."), "error");
            return;
          }
          showToast(L(`Doğrulama kodu hatalı. Kalan hak: ${3 - nextFailCount}`, `Verification code is incorrect. Remaining attempts: ${3 - nextFailCount}`), "error");
          return;
        }
      }

      if (!__DEV__ || !demoCode || code !== demoCode) {
        const nextFailCount = failedAttempts + 1;
        setFailedAttempts(nextFailCount);
        setCode("");
        if (nextFailCount >= 3) {
          setLockoutSec(60);
          showToast(L("3 hatalı deneme yapıldı. 1 dakika bekleme başlatıldı.", "3 failed attempts. 1 minute cooldown started."), "error");
          return;
        }
        showToast(L(`Doğrulama kodu hatalı. Kalan hak: ${3 - nextFailCount}`, `Verification code is incorrect. Remaining attempts: ${3 - nextFailCount}`), "error");
        return;
      }
      setFailedAttempts(0);
      showToast(L("Telefon doğrulaması başarılı.", "Phone verification successful."), "success");
      onVerified();
    } finally {
      setVerifying(false);
    }
  };

  return (
    <LinearGradient colors={gradientColors as any} style={s.roleScreen}>
      <RedPattern />
      <View style={s.phoneVerifyWrap}>
        <Text style={[s.phoneVerifyTitle, { color: titleColor }]}>{L("Telefon Doğrulama", "Phone Verification")}</Text>
        <Text style={[s.phoneVerifySub, { color: subColor }]}>
          {L("Giriş işlemini tamamlamak için kayıtlı telefonunuza gönderilen 6 haneli kodu girin.", "Enter the 6-digit code sent to your registered phone to complete sign-in.")}
        </Text>

        <View style={[s.phoneVerifyCard, { backgroundColor: cardBg, borderColor: cardBorder }]}>
          <View style={s.phoneVerifyIconWrap}>
            <Ionicons name="shield-checkmark-outline" size={26} color="#b91c1c" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.phoneVerifyCardTitle, { color: lightMode ? "#1f2937" : "#fff1f2" }]}>{L("Kayıtlı Numara", "Registered Number")}</Text>
            <Text style={[s.phoneVerifyCardPhone, { color: lightMode ? "#0f172a" : "#fff1f2" }]}>{maskedPhone}</Text>
          </View>
        </View>

        <TouchableOpacity style={[s.phoneVerifySendBtn, (sending || verifying) && { opacity: 0.75 }]} onPress={sendCode} disabled={sending || verifying}>
          <Text style={s.phoneVerifySendBtnText}>
            {resendCooldownSec > 0
              ? L(`YENİDEN GÖNDER (${resendCooldownSec}s)`, `RESEND (${resendCooldownSec}s)`)
              : sent
                ? L("KODU YENİDEN GÖNDER", "RESEND CODE")
                : L("KOD GÖNDER", "SEND CODE")}
          </Text>
        </TouchableOpacity>
        {sent ? <Text style={[s.phoneVerifyAttemptText, { color: subColor }]}>{L("Yanlış deneme hakkı:", "Remaining attempts:")} {Math.max(0, 3 - failedAttempts)}</Text> : null}

        <View style={s.phoneCodeRow}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={[s.phoneCodeCell, code[i] ? s.phoneCodeCellFilled : null]}>
              <Text style={s.phoneCodeCellText}>{code[i] || ""}</Text>
            </View>
          ))}
        </View>

        <View style={s.phoneNumpad}>
          {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) => (
            <TouchableOpacity
              key={`${k}-${i}`}
              style={[
                s.phonePadKey,
                !k && { opacity: 0 },
                k === "⌫" && s.phonePadKeyAlt,
                !canUseKeypad && s.phonePadKeyDisabled
              ]}
              disabled={!k || !canUseKeypad}
              onPress={() => {
                if (k === "⌫") return setCode((v) => v.slice(0, -1));
                setCode((v) => (v.length >= 6 ? v : `${v}${k}`));
              }}
            >
              <Text style={s.phonePadKeyText}>{k}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={[s.phoneVerifyPrimaryBtn, (verifying || (sent && code.length !== 6)) && s.phoneVerifyPrimaryBtnDisabled]} onPress={verifyCode} disabled={verifying}>
          <Text style={s.phoneVerifyPrimaryBtnText}>
            {verifying ? L("DOĞRULANIYOR...", "VERIFYING...") : L("DOĞRULA VE DEVAM ET", "VERIFY AND CONTINUE")}
          </Text>
        </TouchableOpacity>

        {__DEV__ ? (
          <TouchableOpacity
            onPress={requestDemoCode}
            disabled={verifying}
            style={{
              marginTop: 8,
              marginBottom: 4,
              alignSelf: "center",
              paddingHorizontal: 18,
              paddingVertical: 8,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: lightMode ? "rgba(185,28,28,0.35)" : "rgba(255,255,255,0.2)",
              backgroundColor: lightMode ? "rgba(185,28,28,0.06)" : "rgba(255,255,255,0.06)",
            }}
          >
            <Text style={{ color: lightMode ? "#b91c1c" : "#fecdd3", fontFamily: "Inter", fontSize: 13 }}>
              {L("SMS gelmedi mi? Demo kodu kullan", "SMS not received? Use demo code")}
            </Text>
          </TouchableOpacity>
        ) : null}

        {!!demoCode && (demoRequested || __DEV__) && (
          <Text style={[s.phoneVerifyDevHint, { color: lightMode ? "#475569" : "#fecdd3" }]}>
            {L("Demo kodu:", "Demo code:")} {demoCode}
          </Text>
        )}
        <Text style={[s.phoneVerifyHint, { color: subColor }]}>
          {verificationMode === "real"
            ? L("SMS doğrulama aktif. Kodlar backend üzerinden doğrulanır.", "SMS verification active. Codes are validated by backend.")
            : L("SMS servisi yoksa güvenli demo doğrulama akışı kullanılır.", "If SMS provider is unavailable, secure demo verification is used.")}
        </Text>
      </View>
    </LinearGradient>
  );
};
