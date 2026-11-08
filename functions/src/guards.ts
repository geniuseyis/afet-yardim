import { HttpsError } from "firebase-functions/v2/https";

export const mustAuth = (auth: any): { uid: string; token: any } => {
  if (!auth?.uid) throw new HttpsError("unauthenticated", "Kullanici dogrulanmadi.");
  return { uid: auth.uid, token: auth.token || {} };
};
