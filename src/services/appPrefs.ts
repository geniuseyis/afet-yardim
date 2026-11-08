import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AppLocale } from "../store";
import type { ThemeMode } from "../store";

/**
 * APP PREFS STORAGE
 * Persists UX preferences shared across sessions.
 */
const PREFS_KEY = "afetyardim:prefs:v1";

export type AppPrefs = {
  amoledMode: boolean;
  lightMode: boolean;
  themeMode: ThemeMode;
  locale: AppLocale;
};

const DEFAULT_PREFS: AppPrefs = {
  amoledMode: false,
  lightMode: false,
  themeMode: "red",
  locale: "tr"
};

export const loadAppPrefs = async (): Promise<AppPrefs> => {
  try {
    const raw = await AsyncStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw || "{}");
    return {
      amoledMode: parsed?.themeMode ? parsed?.themeMode === "amoled" : Boolean(parsed?.amoledMode),
      lightMode: parsed?.themeMode ? parsed?.themeMode === "light" : Boolean(parsed?.lightMode),
      themeMode: parsed?.themeMode === "amoled" || parsed?.themeMode === "light" || parsed?.themeMode === "red"
        ? parsed.themeMode
        : (Boolean(parsed?.amoledMode) ? "amoled" : Boolean(parsed?.lightMode) ? "light" : "red"),
      locale: parsed?.locale === "en" ? "en" : "tr"
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

export const saveAppPrefs = async (prefs: AppPrefs): Promise<void> => {
  try {
    await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // best effort persistence
  }
};
