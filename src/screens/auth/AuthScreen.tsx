import {
  React, useEffect, useMemo, useRef, useState,
  Alert, Animated, FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View,
  LinearGradient, Haptics, Location, MapView, Marker, Polyline, QRCode, Ionicons, useNavigation,
  createUserWithEmailAndPassword, sendPasswordResetEmail, signInWithEmailAndPassword, signOut,
  collection, doc, limit, onSnapshot, orderBy, query, serverTimestamp, setDoc, updateDoc, where,
  getDoc, getDocs,
  auth, db, useStore,
  assignVolunteerViaApi, checkRegistrationConflictsViaApi, chatWithAiViaApi, claimRequestViaApi, createRequestViaApi,
  exportUserDataViaApi, publishAnnouncementViaApi, requestDataDeletionViaApi, transitionRequestStatusViaApi,
  C, aidTypes, statusLabel, steps, toMillis, isUrgent, urgencyLabel, requestTypeMeta, kmBetween,
  TopBar, AuthField, RedPattern, s
} from "../shared/ScreenDeps";
import { sendEmailVerification } from "firebase/auth/cordova";
import { httpsCallable } from "firebase/functions";
import { functions } from "../../firebase";
import type { Req, RequestStatus } from "../shared/ScreenDeps";
import { l, t } from "../../services/i18n";
import { upsertUserPublicDoc } from "../../services/userPublic";
import { hashEmail, hashPhone, hashTc, maskEmail, maskPhone, maskTc, normalizePhone, normalizeTc } from "../../utils/privacy";

/**
 * AUTH DOSYA HARITASI
 * - AUTH-DURUM: Bu bolum ilgili kod grubunun uygulamadaki gorevini aciklar.
 * - AUTH-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
 * - AUTH-ARAYUZ: Bu bolumde ekranin yerlesim ve gorsel bilesen yapisi aciklanir.
 */
export const AuthScreen = () => {
  const setAuthHydrationBlocked = useStore((state) => state.setAuthHydrationBlocked);
  const showToast = useStore((state) => state.showToast);
  const locale = useStore((state) => state.locale);
  const amoledMode = useStore((state) => state.amoledMode);
  const lightMode = useStore((state) => state.lightMode);
  const L = (tr: string, en: string) => l(locale, tr, en);
  const [isLogin, setIsLogin] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordAgain, setPasswordAgain] = useState("");
  const [name, setName] = useState("");
  const [tc, setTc] = useState("");
  const [phone, setPhone] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showPasswordAgain, setShowPasswordAgain] = useState(false);

  const onlyDigitsMax11 = (value: string) => value.replace(/\D/g, "").slice(0, 11);
  const onTcChange = (value: string) => setTc(onlyDigitsMax11(value));
  const onPhoneChange = (value: string) => setPhone(onlyDigitsMax11(value));

  const authErrorMessage = (e: any): string => {
    const code = `${e?.code || ""}`.toLowerCase();
    const message = `${e?.message || ""}`;
    if (code.includes("email-already-in-use")) return L("Bu e-posta ile kayıtlı bir hesap var. Giriş yap veya şifremi unuttum seçeneğini kullan.", "An account with this email already exists. Sign in or use forgot password.");
    if (code.includes("invalid-email")) return L("Geçerli bir e-posta adresi girin.", "Please enter a valid email.");
    if (code.includes("weak-password")) return L("Şifre zayıf. En az 6 karakter ve daha güçlü bir şifre kullanın.", "Weak password. Use at least 6 characters and a stronger password.");
    if (code.includes("invalid-credential")) return L("E-posta veya şifre hatalı.", "Email or password is incorrect.");
    if (code.includes("user-not-found")) return L("Bu e-posta ile kayıtlı kullanıcı bulunamadı.", "No user found with this email.");
    if (code.includes("wrong-password")) return L("Şifre hatalı.", "Password is incorrect.");
    if (code.includes("too-many-requests")) return L("Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.", "Too many attempts. Please try again later.");
    if (code.includes("network-request-failed")) return L("İnternet bağlantısını kontrol edip tekrar deneyin.", "Check your internet connection and try again.");
    return message || L("İşlem başarısız.", "Operation failed.");
  };

  const checkDuplicateRegistration = async (tcNo: string, phoneNo: string): Promise<{ tcExists: boolean; phoneExists: boolean }> => {
    try {
      return await checkRegistrationConflictsViaApi({ tcNo, phone: phoneNo });
    } catch (e: any) {
      const code = `${e?.code || ""}`.toLowerCase();
      const msg = `${e?.message || ""}`.toLowerCase();
      const isFunctionUnavailable =
        code.includes("functions/") ||
        code.includes("unavailable") ||
        msg.includes("backend") ||
        msg.includes("not found") ||
        msg.includes("deploy");

      if (!isFunctionUnavailable) throw e;

      try {
        const tcHash = hashTc(tcNo);
        const phoneHash = hashPhone(phoneNo);
        const [tcHashSnap, phoneHashSnap, tcLegacySnap, phoneLegacySnap, tcNestedLegacySnap, phoneNestedLegacySnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("tcNo_hash", "==", tcHash), limit(1))),
          getDocs(query(collection(db, "users"), where("phone_hash", "==", phoneHash), limit(1))),
          // Legacy compatibility: older records may still contain raw tcNo/phone fields.
          getDocs(query(collection(db, "users"), where("tcNo", "==", tcNo), limit(1))),
          getDocs(query(collection(db, "users"), where("phone", "==", phoneNo), limit(1))),
          // Legacy compatibility: old onboarding bug wrote tc/phone under "skills" object.
          getDocs(query(collection(db, "users"), where("skills.tcNo", "==", tcNo), limit(1))),
          getDocs(query(collection(db, "users"), where("skills.phone", "==", phoneNo), limit(1)))
        ]);
        return {
          tcExists: !tcHashSnap.empty || !tcLegacySnap.empty || !tcNestedLegacySnap.empty,
          phoneExists: !phoneHashSnap.empty || !phoneLegacySnap.empty || !phoneNestedLegacySnap.empty
        };
      } catch (fallbackErr: any) {
        const fallbackCode = `${fallbackErr?.code || ""}`.toLowerCase();
        const fallbackMsg = `${fallbackErr?.message || ""}`.toLowerCase();
        const permissionDenied =
          fallbackCode.includes("permission-denied") ||
          fallbackMsg.includes("insufficient permissions") ||
          fallbackMsg.includes("missing or insufficient permissions");
        if (permissionDenied) {
          throw new Error(
            L(
              "Kayıt doğrulama servisine erişilemedi. Lütfen yöneticiye 'checkRegistrationConflicts' fonksiyonunu deploy ettirin.",
              "Registration validation service is unreachable. Ask admin to deploy 'checkRegistrationConflicts'."
            )
          );
        }
        console.warn("[auth register] duplicate check fallback failed", fallbackErr);
        throw new Error(L("Kayıt doğrulaması yapılamadı. İnternet bağlantınızı kontrol edin.", "Registration validation failed. Check internet connection."));
      }
    }
  };

  // AUTH-ISLEM: Bu bolumde butonlari ve kullanici etkilesimlerini calistiran ana fonksiyonlar bulunur.
  const submit = async (): Promise<void> => {
    if (submitting) return;
    setSubmitting(true);
    const em = email.trim().toLowerCase();

    // Boş alan kontrolleri — önce boş mu, sonra format mı
    if (!em) {
      setSubmitting(false);
      return Alert.alert(L("Hata", "Error"), L("E-posta boş bırakılamaz.", "Email cannot be empty."));
    }
    if (!em.includes("@") || em.length < 5) {
      setSubmitting(false);
      return Alert.alert(L("Hata", "Error"), L("Geçerli bir e-posta adresi girin.", "Enter a valid email address."));
    }
    if (!password.trim()) {
      setSubmitting(false);
      return Alert.alert(L("Hata", "Error"), L("Şifre boş bırakılamaz.", "Password cannot be empty."));
    }
    if (password.trim().length < 6) {
      setSubmitting(false);
      return Alert.alert(L("Hata", "Error"), L("Şifre en az 6 karakter olmalıdır.", "Password must be at least 6 characters."));
    }
    try {
      if (isLogin) {
        if (!tc.trim()) return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası boş bırakılamaz.", "National ID cannot be empty."));
        if (tc.trim().length !== 11) return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası 11 hane olmalıdır.", "National ID must be 11 digits."));
        if (!phone.trim()) return Alert.alert(L("Hata", "Error"), L("Telefon numarası boş bırakılamaz.", "Phone number cannot be empty."));
        if (phone.trim().length !== 11) return Alert.alert(L("Hata", "Error"), L("Telefon numarası 11 hane olmalıdır.", "Phone number must be 11 digits."));

        setAuthHydrationBlocked(true);
        const cred = await signInWithEmailAndPassword(auth, em, password);
        try {
          const userSnap = await getDoc(doc(db, "users", cred.user.uid));
          if (!userSnap.exists()) {
            await signOut(auth);
            return Alert.alert(L("Hata", "Error"), L("Kullanıcı profili bulunamadı. Lütfen tekrar kayıt olun.", "User profile not found. Please register again."));
          }
          const data = userSnap.data() as any;
          const inputTc = normalizeTc(tc);
          const inputPhone = normalizePhone(phone);
          const inputTcHash = hashTc(inputTc);
          const inputPhoneHash = hashPhone(inputPhone);
          const dbTcHash = String(data?.tcNo_hash || "");
          const dbPhoneHash = String(data?.phone_hash || "");
          if (!dbTcHash || !dbPhoneHash) {
            await signOut(auth);
            return Alert.alert(L("Hata", "Error"), L("Hesap güvenlik güncellemesi gerekiyor. Lütfen yöneticiye başvurun.", "Account security update required. Contact coordinator."));
          }
          const tcMatches = dbTcHash === inputTcHash;
          const phoneMatches = dbPhoneHash === inputPhoneHash;
          if (!tcMatches || !phoneMatches) {
            await signOut(auth);
            if (!tcMatches && !phoneMatches) {
              return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası ve telefon numarası kayıt bilgileri ile eşleşmiyor.", "National ID and phone do not match registered data."));
            }
            if (!tcMatches) {
              return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası kayıt bilgisi ile eşleşmiyor.", "National ID does not match registered data."));
            }
            return Alert.alert(L("Hata", "Error"), L("Telefon numarası kayıt bilgisi ile eşleşmiyor.", "Phone number does not match registered data."));
          }
        } catch (verifyErr: any) {
          await signOut(auth);
          return Alert.alert(L("Hata", "Error"), verifyErr?.message || L("Kimlik doğrulaması tamamlanamadı.", "Identity verification failed."));
        } finally {
          setAuthHydrationBlocked(false);
        }
      } else {
        if (!name.trim()) return Alert.alert(L("Hata", "Error"), L("Ad soyad boş bırakılamaz.", "Full name cannot be empty."));
        if (!tc.trim()) return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası boş bırakılamaz.", "National ID cannot be empty."));
        if (tc.trim().length !== 11) return Alert.alert(L("Hata", "Error"), L("TC kimlik numarası 11 hane olmalıdır.", "National ID must be 11 digits."));
        if (!phone.trim()) return Alert.alert(L("Hata", "Error"), L("Telefon numarası boş bırakılamaz.", "Phone number cannot be empty."));
        if (phone.trim().length !== 11) return Alert.alert(L("Hata", "Error"), L("Telefon numarası 11 hane olmalıdır.", "Phone number must be 11 digits."));
        if (!passwordAgain.trim()) return Alert.alert(L("Hata", "Error"), L("Şifre tekrar alanı boş bırakılamaz.", "Password confirmation cannot be empty."));
        if (password !== passwordAgain) return Alert.alert(L("Hata", "Error"), L("Şifreler eşleşmiyor.", "Passwords do not match."));
        try {
          const conflict = await checkDuplicateRegistration(tc.trim(), phone.trim());
          if (conflict.tcExists && conflict.phoneExists) {
            return Alert.alert(L("Hata", "Error"), L("Bu TC ve telefon numarası ile kayıtlı hesap var.", "An account exists with this ID and phone."));
          }
          if (conflict.tcExists) {
            return Alert.alert(L("Hata", "Error"), L("Bu TC kimlik numarası ile kayıtlı hesap var.", "An account exists with this ID."));
          }
          if (conflict.phoneExists) {
            return Alert.alert(L("Hata", "Error"), L("Bu telefon numarası ile kayıtlı hesap var.", "An account exists with this phone."));
          }
        } catch (e: any) {
          return Alert.alert(L("Hata", "Error"), e?.message || L("Kayıt doğrulaması yapılamadı.", "Registration validation failed."));
        }
        setAuthHydrationBlocked(true);
        const cred = await createUserWithEmailAndPassword(auth, em, password);
        // Tasarımlı doğrulama maili: Cloud Function → fallback Firebase
        try {
          const fn = httpsCallable(functions, "sendVerificationEmail");
          await fn({ email: em }).catch(() => sendEmailVerification(cred.user));
        } catch {
          // Gönderim hatası kayıt akışını durdurmamalı
        }
        const normalizedTc = normalizeTc(tc);
        const normalizedPhone = normalizePhone(phone);
        const normalizedEmail = em.trim().toLowerCase();
        await setDoc(doc(db, "users", cred.user.uid), {
          fullName: name.trim(),
          email_masked: maskEmail(normalizedEmail),
          phone_masked: maskPhone(normalizedPhone),
          tcNo_masked: maskTc(normalizedTc),
          email_hash: hashEmail(normalizedEmail),
          phone_hash: hashPhone(normalizedPhone),
          tcNo_hash: hashTc(normalizedTc),
          piiVersion: 2,
          role: null,
          isCoordinator: false,
          isApprovedVolunteer: false,
          skills: [],
          availability: "available",
          lastActiveAt: serverTimestamp(),
          createdAt: serverTimestamp()
        });
        await upsertUserPublicDoc(cred.user.uid, {
          fullName: name.trim(),
          email_masked: maskEmail(normalizedEmail),
          tcNo_masked: maskTc(normalizedTc),
          phone_masked: maskPhone(normalizedPhone),
          role: null,
          isCoordinator: false,
          isApprovedVolunteer: false,
          skills: [],
          interests: [],
          availability: "available",
          volunteerStatus: "not_started"
        });
        await signOut(auth);
        setTimeout(() => setAuthHydrationBlocked(false), 250);
        setEmail(em);
        setPassword("");
        setPasswordAgain("");
        setTc("");
        setPhone("");
        setName("");
        setIsLogin(true);
        Alert.alert(
          L("Başarılı", "Success"),
          L(
            "Kayıt oluşturuldu. E-posta adresinize bir doğrulama bağlantısı gönderildi. Bağlantıya tıkladıktan sonra giriş yapabilirsiniz.",
            "Account created. A verification link was sent to your email. Click the link before signing in."
          )
        );
      }
    } catch (e: any) {
      setAuthHydrationBlocked(false);
      Alert.alert(L("Hata", "Error"), authErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const [resetLoading, setResetLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const forgotPassword = async (): Promise<void> => {
    const em = email.trim().toLowerCase();
    if (!em.includes("@")) {
      Alert.alert(L("Bilgi", "Info"), L("Şifre sıfırlama için önce e-posta adresinizi girin.", "Enter your email address first to reset password."));
      return;
    }
    setResetLoading(true);
    try {
      const fn = httpsCallable(functions, "sendCustomPasswordResetEmail");
      await fn({ email: em });
      setResetSent(true);
      Alert.alert(
        L("Başarılı", "Success"),
        L(`${em} adresine şifre sıfırlama bağlantısı gönderildi. Gelen kutunuzu kontrol edin.`, `Password reset link sent to ${em}. Check your inbox.`)
      );
      setTimeout(() => setResetSent(false), 6000);
    } catch {
      // Cloud Function başarısız → Firebase fallback
      try {
        await sendPasswordResetEmail(auth, em);
        setResetSent(true);
        Alert.alert(
          L("Başarılı", "Success"),
          L("Şifre sıfırlama bağlantısı e-postanıza gönderildi.", "Password reset link has been sent to your email.")
        );
        setTimeout(() => setResetSent(false), 6000);
      } catch (e2: any) {
        showToast(authErrorMessage(e2), "error");
      }
    } finally {
      setResetLoading(false);
    }
  };

  const authGradient: [string, string, string] = lightMode
    ? ["#fde4ea", "#fff1f4", "#f8fafc"]
    : amoledMode
      ? ["#120306", "#180408", "#150507"]
      : ["#7a001f", "#9f102f", "#4d0018"];

  return (
    <LinearGradient colors={authGradient} style={s.authRedWrap}>
      <RedPattern />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior="padding"
      >
      <ScrollView
        contentContainerStyle={[s.authScroll, !isLogin && s.authScrollRegister]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Text style={[s.authHeroTitle, lightMode && { color: "#0f172a" }]}>{isLogin ? t(locale, "authLoginTitle") : t(locale, "authRegisterTitle")}</Text>

        {!isLogin && (
          <>
            <Text style={s.authLabel}>{t(locale, "authName")}</Text>
            <AuthField icon="person-outline" placeholder="" value={name} onChangeText={setName} />
          </>
        )}

        <View style={s.authTwoCol}>
          <View style={s.authCol}>
            <Text style={[s.authLabel, s.authTwoColLabel]} numberOfLines={2}>{t(locale, "authTc")}</Text>
            <AuthField icon="card-outline" placeholder="" value={tc} onChangeText={onTcChange} keyboardType="numeric" maxLength={11} />
          </View>
          <View style={s.authCol}>
            <Text style={[s.authLabel, s.authTwoColLabel]} numberOfLines={2}>{t(locale, "authPhone")}</Text>
            <AuthField icon="call-outline" placeholder="" value={phone} onChangeText={onPhoneChange} keyboardType="phone-pad" maxLength={11} />
          </View>
        </View>

        <Text style={s.authLabel}>{t(locale, "authEmail")}</Text>
        <AuthField icon="mail-outline" placeholder="" value={email} onChangeText={setEmail} keyboardType="email-address" />

        <Text style={s.authLabel}>{t(locale, "authPassword")}</Text>
        <AuthField
          icon="lock-closed-outline"
          placeholder=""
          value={password}
          onChangeText={setPassword}
          secureTextEntry={!showPassword}
          rightIcon={showPassword ? "eye-off-outline" : "eye-outline"}
          onRightPress={() => setShowPassword((v) => !v)}
          returnKeyType={isLogin ? "done" : "next"}
          onSubmitEditing={isLogin ? () => { void submit(); } : undefined}
        />

        {!isLogin && (
          <>
            <Text style={s.authLabel}>{t(locale, "authPasswordAgain")}</Text>
            <AuthField
              icon="lock-closed-outline"
              placeholder=""
              value={passwordAgain}
              onChangeText={setPasswordAgain}
              secureTextEntry={!showPasswordAgain}
              rightIcon={showPasswordAgain ? "eye-off-outline" : "eye-outline"}
              onRightPress={() => setShowPasswordAgain((v) => !v)}
              returnKeyType="done"
              onSubmitEditing={() => { void submit(); }}
            />
          </>
        )}

        <TouchableOpacity
          style={[s.authPrimaryBtn, submitting && { opacity: 0.7 }]}
          onPress={() => { void submit(); }}
          disabled={submitting}
        >
          <Text style={s.authPrimaryBtnText}>
            {submitting ? t(locale, "authProcessing") : isLogin ? t(locale, "authLoginTitle") : t(locale, "authRegisterTitle")}
          </Text>
        </TouchableOpacity>

        {isLogin ? (
          <>
            <TouchableOpacity onPress={forgotPassword} disabled={resetLoading}>
              <Text style={s.authForgot}>{t(locale, "authForgotPassword")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setIsLogin(false)}>
              <Text style={[s.authSwitch, s.authSwitchCompact]}>{t(locale, "authNoAccount")} <Text style={s.authSwitchBold}>{t(locale, "authRegisterTitle")}</Text></Text>
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity onPress={() => setIsLogin(true)}>
            <Text style={[s.authSwitch, s.authSwitchCompact]}>{t(locale, "authHaveAccount")} <Text style={s.authSwitchBold}>{t(locale, "authLoginTitle")}</Text></Text>
          </TouchableOpacity>
        )}
      </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
};



