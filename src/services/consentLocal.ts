import AsyncStorage from "@react-native-async-storage/async-storage";

const consentKey = (uid: string) => `consent_accepted:${uid}`;

export const setLocalConsentAccepted = async (uid: string): Promise<void> => {
  await AsyncStorage.setItem(consentKey(uid), "1");
};

export const getLocalConsentAccepted = async (uid: string): Promise<boolean> => {
  const value = await AsyncStorage.getItem(consentKey(uid));
  return value === "1";
};

export const clearLocalConsentAccepted = async (uid: string): Promise<void> => {
  await AsyncStorage.removeItem(consentKey(uid));
};
