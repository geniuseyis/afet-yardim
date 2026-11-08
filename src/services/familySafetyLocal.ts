import AsyncStorage from "@react-native-async-storage/async-storage";

export type SafeContact = {
  id: string;
  name: string;
  phone: string;
  relation?: string;
  lastSharedAt?: number | null;
  lastStatus?: "safe" | "need_help" | "unknown";
  note?: string;
};

const key = (uid: string) => `family_safety_contacts:${uid}`;

export async function loadSafeContacts(uid: string): Promise<SafeContact[]> {
  if (!uid) return [];
  try {
    const raw = await AsyncStorage.getItem(key(uid));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as SafeContact[];
  } catch {
    return [];
  }
}

export async function saveSafeContacts(uid: string, contacts: SafeContact[]) {
  if (!uid) return;
  await AsyncStorage.setItem(key(uid), JSON.stringify(contacts));
}

