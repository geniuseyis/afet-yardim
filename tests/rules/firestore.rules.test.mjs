// firestore ve storage kurallari, emulator ile: npm run test:rules
import { after, before, beforeEach, describe, it } from "node:test";
import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let env;

const users = {
  victim: { role: "victim" },
  stranger: { role: "victim" },
  applicant: { role: "volunteer", volunteerStatus: "submitted" },
  volunteer: { role: "volunteer", volunteerStatus: "approved" },
  coordinator: { role: "coordinator", isCoordinator: true },
};

const db = (uid) => env.authenticatedContext(uid).firestore();
const seed = (fn) => env.withSecurityRulesDisabled((ctx) => fn(ctx.firestore()));

before(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-afet-yardim",
    firestore: { rules: readFileSync("firestore.rules", "utf8") },
    storage: { rules: readFileSync("storage.rules", "utf8") },
  });
});

after(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await seed(async (admin) => {
    for (const [uid, data] of Object.entries(users)) {
      await setDoc(doc(admin, "users", uid), data);
    }
    await setDoc(doc(admin, "requests", "open1"), { userId: "victim", createdBy: "victim", status: "open", contactNote: "gizli" });
    await setDoc(doc(admin, "requests", "taken1"), { userId: "victim", createdBy: "victim", status: "assigned", assignedVolunteerId: "volunteer" });
    await setDoc(doc(admin, "chats", "c1"), { participantIds: ["victim", "volunteer"], requestId: "taken1" });
    await setDoc(doc(admin, "chats/c1/messages/m1"), { senderId: "victim", text: "adresim" });
    await setDoc(doc(admin, "coordinator_invites", "KOD123"), { active: true });
    await setDoc(doc(admin, "phone_verifications", "victim"), { codeHash: "x" });
    await setDoc(doc(admin, "sosVoiceMessages", "v1"), { userId: "victim" });
  });
});

describe("rol yukseltme", () => {
  it("kullanici kendini koordinator yapamaz", async () => {
    await assertFails(updateDoc(doc(db("victim"), "users", "victim"), { isCoordinator: true }));
    await assertFails(updateDoc(doc(db("victim"), "users", "victim"), { role: "coordinator" }));
    await assertFails(updateDoc(doc(db("victim"), "users", "victim"), { role: "admin" }));
  });

  it("yeni hesap ayricalikli alanla acilamaz", async () => {
    await assertFails(setDoc(doc(db("yeni"), "users", "yeni"), { role: "coordinator" }));
    await assertFails(setDoc(doc(db("yeni"), "users", "yeni"), { role: null, isCoordinator: true }));
    await assertFails(setDoc(doc(db("yeni"), "users", "yeni"), { role: "volunteer", volunteerStatus: "approved" }));
    await assertSucceeds(setDoc(doc(db("yeni"), "users", "yeni"), { role: null, isCoordinator: false, isApprovedVolunteer: false, volunteerStatus: "not_started" }));
  });

  it("gonullu kendini onaylayamaz, telefon dogrulamasini elle yazamaz", async () => {
    await assertFails(updateDoc(doc(db("applicant"), "users", "applicant"), { volunteerStatus: "approved" }));
    await assertFails(updateDoc(doc(db("applicant"), "users", "applicant"), { isApprovedVolunteer: true }));
    await assertFails(updateDoc(doc(db("victim"), "users", "victim"), { phoneVerifiedAt: new Date() }));
  });

  it("normal profil guncellemesi ve rol secimi calisir", async () => {
    await assertSucceeds(updateDoc(doc(db("victim"), "users", "victim"), { fullName: "Ada" }));
    await assertSucceeds(updateDoc(doc(db("victim"), "users", "victim"), { role: "volunteer", volunteerStatus: "submitted" }));
  });

  it("koordinator gonulluyu onaylayabilir", async () => {
    await assertSucceeds(updateDoc(doc(db("coordinator"), "users", "applicant"), { volunteerStatus: "approved", isApprovedVolunteer: true }));
  });
});

describe("davet kodlari", () => {
  it("normal kullanici kodlari okuyamaz, listeleyemez, kullanamaz", async () => {
    await assertFails(getDoc(doc(db("victim"), "coordinator_invites", "KOD123")));
    await assertFails(getDocs(collection(db("victim"), "coordinator_invites")));
    await assertFails(updateDoc(doc(db("victim"), "coordinator_invites", "KOD123"), { usedBy: "victim", active: false, usedAt: new Date() }));
  });

  it("koordinator kod yonetebilir", async () => {
    await assertSucceeds(getDocs(collection(db("coordinator"), "coordinator_invites")));
    await assertSucceeds(setDoc(doc(db("coordinator"), "coordinator_invites", "YENI"), { active: true }));
  });
});

describe("yardim talepleri", () => {
  it("baskasinin talebini yabanci okuyamaz, tumunu listeleyemez", async () => {
    await assertFails(getDoc(doc(db("stranger"), "requests", "open1")));
    await assertFails(getDocs(collection(db("stranger"), "requests")));
  });

  it("sahibi kendi taleplerini sorgulayabilir", async () => {
    await assertSucceeds(getDoc(doc(db("victim"), "requests", "open1")));
    await assertSucceeds(getDocs(query(collection(db("victim"), "requests"), where("createdBy", "==", "victim"))));
    await assertSucceeds(getDocs(query(collection(db("victim"), "requests"), where("userId", "==", "victim"))));
  });

  it("onaysiz basvuran talepleri goremez, onayli gonullu gorur", async () => {
    await assertFails(getDocs(query(collection(db("applicant"), "requests"), where("status", "==", "open"))));
    await assertSucceeds(getDocs(query(collection(db("volunteer"), "requests"), where("status", "==", "open"))));
  });

  it("kimse talebi baskasina atayamaz", async () => {
    const hijack = { status: "assigned", assignedVolunteerId: "stranger", updatedAt: new Date() };
    await assertFails(updateDoc(doc(db("stranger"), "requests", "open1"), hijack));
    await assertFails(updateDoc(doc(db("volunteer"), "requests", "open1"), hijack));
  });

  it("onayli gonullu bos talebi kendine alabilir, doluyu alamaz", async () => {
    const claim = { status: "assigned", assignedVolunteerId: "volunteer", updatedAt: new Date() };
    await assertSucceeds(updateDoc(doc(db("volunteer"), "requests", "open1"), claim));
    await seed((admin) => setDoc(doc(admin, "users", "v2"), { role: "volunteer", volunteerStatus: "approved" }));
    await assertFails(updateDoc(doc(db("v2"), "requests", "taken1"), { status: "assigned", assignedVolunteerId: "v2", updatedAt: new Date() }));
  });
});

describe("sohbetler", () => {
  it("yabanci sohbeti ve mesajlari okuyamaz, yazamaz", async () => {
    await assertFails(getDoc(doc(db("stranger"), "chats", "c1")));
    await assertFails(getDocs(collection(db("stranger"), "chats")));
    await assertFails(getDocs(collection(db("stranger"), "chats/c1/messages")));
    await assertFails(setDoc(doc(db("stranger"), "chats/c1/messages/m2"), { senderId: "stranger", text: "x" }));
  });

  it("yabanci kendini katilimci olarak ekleyemez", async () => {
    await assertFails(updateDoc(doc(db("stranger"), "chats", "c1"), { participantIds: ["victim", "volunteer", "stranger"] }));
  });

  it("katilimci kendi sohbetlerini okur ve yazar", async () => {
    await assertSucceeds(getDocs(query(collection(db("victim"), "chats"), where("participantIds", "array-contains", "victim"))));
    await assertSucceeds(getDocs(collection(db("volunteer"), "chats/c1/messages")));
    await assertSucceeds(setDoc(doc(db("volunteer"), "chats/c1/messages/m3"), { senderId: "volunteer", text: "yoldayim" }));
    await assertFails(setDoc(doc(db("volunteer"), "chats/c1/messages/m4"), { senderId: "victim", text: "sahte" }));
  });

  it("yeni kanal acilabilir, olusmadan once dinlemek hata vermez", async () => {
    await assertSucceeds(getDocs(collection(db("stranger"), "chats/yeni/messages")));
    await assertSucceeds(setDoc(doc(db("stranger"), "chats", "yeni"), { participantIds: ["stranger"] }));
    await assertFails(setDoc(doc(db("stranger"), "chats", "baskasi"), { participantIds: ["victim"] }));
  });

  it("koordinator tum sohbetleri gorebilir", async () => {
    await assertSucceeds(getDocs(collection(db("coordinator"), "chats")));
  });
});

describe("hassas koleksiyonlar", () => {
  it("telefon kod ozeti sahibine bile kapali", async () => {
    await assertFails(getDoc(doc(db("victim"), "phone_verifications", "victim")));
    await assertFails(getDoc(doc(db("victim"), "rate_limits", "x")));
  });

  it("sesli sos yalnizca sahibi ve gorevliler icin", async () => {
    await assertFails(getDoc(doc(db("stranger"), "sosVoiceMessages", "v1")));
    await assertSucceeds(getDoc(doc(db("victim"), "sosVoiceMessages", "v1")));
    await assertSucceeds(getDoc(doc(db("volunteer"), "sosVoiceMessages", "v1")));
  });

  it("baskasinin profili okunamaz, kopyaya ham alan eklenemez", async () => {
    await assertFails(getDoc(doc(db("stranger"), "users", "victim")));
    await assertFails(getDoc(doc(db("stranger"), "users_public", "victim")));
    await assertFails(setDoc(doc(db("stranger"), "users_public", "stranger"), { password: "x" }));
    await assertSucceeds(setDoc(doc(db("stranger"), "users_public", "stranger"), { fullName: "S", role: "victim" }));
  });
});

describe("storage", () => {
  const png = new Uint8Array([137, 80, 78, 71]);
  const storageOf = (uid, claims = {}) => env.authenticatedContext(uid, claims).storage();

  it("yalnizca sahibi yazar, sinir asilamaz", async () => {
    await assertSucceeds(uploadBytes(ref(storageOf("victim"), "request-photos/victim/a.jpg"), png, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageOf("stranger"), "request-photos/victim/b.jpg"), png, { contentType: "image/jpeg" }));
    await assertFails(uploadBytes(ref(storageOf("victim"), "request-photos/victim/c.html"), png, { contentType: "text/html" }));
    await assertFails(uploadBytes(ref(storageOf("victim"), "request-photos/victim/d.jpg"), new Uint8Array(11 * 1024 * 1024), { contentType: "image/jpeg" }));
  });

  it("baskasi okuyamaz, gorevli okur", async () => {
    await uploadBytes(ref(storageOf("victim"), "sos-voice/victim/s.m4a"), png, { contentType: "audio/mp4" });
    await assertFails(getBytes(ref(storageOf("stranger"), "sos-voice/victim/s.m4a")));
    await assertSucceeds(getBytes(ref(storageOf("victim"), "sos-voice/victim/s.m4a")));
    await assertSucceeds(getBytes(ref(storageOf("volunteer", { volunteer: true }), "sos-voice/victim/s.m4a")));
  });
});
