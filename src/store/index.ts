import { create } from "zustand";
import type { User } from "firebase/auth/cordova";

/**
 * STORE FILE MAP
 * - STORE-STATE: auth, role, theme, locale, offline, toast global state alanları
 * - STORE-ACTION: setUser/setUserData ve UI ayar setter fonksiyonları
 * - STORE-THEME: red/amoled/light mod geçiş kuralları (tek merkez)
 * - STORE-TOAST: global üst bar bildiriminin göster/gizle akışı
 */

export type UserRole = "victim" | "volunteer" | "coordinator" | null;

export type UserData = {
  fullName?: string;
  email?: string;
  tcNo?: string;
  phone?: string;
  email_masked?: string;
  phone_masked?: string;
  tcNo_masked?: string;
  email_hash?: string;
  phone_hash?: string;
  tcNo_hash?: string;
  piiVersion?: number;
  role?: UserRole;
  volunteerStatus?: "not_started" | "draft" | "submitted" | "approved" | "rejected";
  isCoordinator?: boolean;
  isApprovedVolunteer?: boolean;
  interests?: string[];
  skills?: string[];
  skillLevel?: "beginner" | "intermediate" | "expert";
  availability?: "available" | "busy" | "offline";
  regionId?: string;
  city?: string;
  district?: string;
  motivation?: string;
  volunteerTermsAccepted?: boolean;
  onboardingCompletedAt?: any;
  lastActiveAt?: any;
  createdAt?: any;
};

export type AppToastTone = "success" | "error" | "info";
export type AppToast = {
  visible?: boolean;
  message: string;
  tone: AppToastTone;
  id: number;
};

export type AppLocale = "tr" | "en";
export type ThemeMode = "red" | "amoled" | "light";

type AppState = {
  user: User | null;
  userData: UserData | null;
  sessionPhoneVerified: boolean;
  authHydrationBlocked: boolean;
  amoledMode: boolean;
  lightMode: boolean;
  themeMode: ThemeMode;
  locale: AppLocale;
  offlineMode: boolean;
  lastSyncAt: number | null;
  toasts: AppToast[];
  unreadMsgCount: number;
  setUser: (user: User | null) => void;
  setUserData: (data: UserData | null) => void;
  setSessionPhoneVerified: (value: boolean) => void;
  setAuthHydrationBlocked: (value: boolean) => void;
  setAmoledMode: (value: boolean) => void;
  setLightMode: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  setLocale: (value: AppLocale) => void;
  setOfflineMode: (value: boolean) => void;
  setLastSyncAt: (value: number | null) => void;
  showToast: (message: string, tone?: AppToastTone) => void;
  hideToast: (id?: number) => void;
  setUnreadMsgCount: (count: number) => void;
};

export const useStore = create<AppState>((set) => ({
  user: null,
  userData: null,
  sessionPhoneVerified: false,
  authHydrationBlocked: false,
  amoledMode: false,
  lightMode: false,
  themeMode: "red",
  locale: "tr",
  offlineMode: false,
  lastSyncAt: null,
  toasts: [],
  unreadMsgCount: 0,
  setUnreadMsgCount: (unreadMsgCount) => set({ unreadMsgCount }),
  setUser: (user) => set({ user }),
  setUserData: (userData) => set({ userData }),
  setSessionPhoneVerified: (sessionPhoneVerified) => set({ sessionPhoneVerified }),
  setAuthHydrationBlocked: (authHydrationBlocked) => set({ authHydrationBlocked }),
  setAmoledMode: (amoledMode) => set((state) => ({
    ...state,
    amoledMode,
    lightMode: amoledMode ? false : state.lightMode,
    themeMode: amoledMode ? "amoled" : (state.lightMode ? "light" : "red")
  })),
  setLightMode: (lightMode) => set((state) => ({
    ...state,
    lightMode,
    amoledMode: lightMode ? false : state.amoledMode,
    themeMode: lightMode ? "light" : (state.amoledMode ? "amoled" : "red")
  })),
  setThemeMode: (themeMode) =>
    set((state) => ({
      ...state,
      themeMode,
      amoledMode: themeMode === "amoled",
      lightMode: themeMode === "light"
    })),
  setLocale: (locale) => set({ locale }),
  setOfflineMode: (offlineMode) => set({ offlineMode }),
  setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
  showToast: (message, tone = "info") =>
    set((state) => ({
      toasts: [
        ...state.toasts,
        { message, tone, id: Date.now() + Math.floor(Math.random() * 1000) }
      ].slice(-6)
    })),
  hideToast: (id) =>
    set((state) => ({
      toasts: typeof id === "number" ? state.toasts.filter((t) => t.id !== id) : state.toasts.slice(1)
    }))
}));
