import test from "node:test";
import assert from "node:assert/strict";
import {
  emulatorReady,
  emulatorSkipReason,
  hasFirestoreEmulator,
  invokeCallableRaw
} from "./emulatorTestUtils";

test(
  "[emulator] scaffold should detect firestore emulator environment",
  { skip: !hasFirestoreEmulator() ? emulatorSkipReason() : false },
  () => {
    assert.equal(hasFirestoreEmulator(), true);
  }
);

test(
  "[emulator] callable auth guard should reject unauthenticated requests",
  { skip: !emulatorReady() ? emulatorSkipReason() : false },
  async () => {
    const res = await invokeCallableRaw("createRequest", {
      type: "Saglik",
      urgency: "Acil",
      description: "Test",
      location: { lat: 41, lng: 29 }
    });

    assert.equal(res.ok, false);
    assert.ok(res.status >= 400);

    const serialized = JSON.stringify(res.body || {});
    assert.match(serialized.toLowerCase(), /(unauthenticated|kullanici dogrulanmadi)/);
  }
);

test.skip("[emulator] transitionRequestStatus should enforce volunteer/coordinator permissions", async () => {
  // TODO:
  // 1) users + requests seed et
  // 2) volunteer (assigned / unassigned) ve coordinator senaryolari calistir
  // 3) START_ROUTE / COMPLETE / REOPEN davranislarini dogrula
});

test.skip("[emulator] claimRequest race condition should allow single winner", async () => {
  // TODO:
  // 1) open request seed et
  // 2) iki parallel claimRequest cagrisini ayni request icin gonder
  // 3) sadece birinin basarili oldugunu dogrula
});

test.skip("[emulator] chatWithAi should set escalationFlag for risk keywords", async () => {
  // TODO:
  // 1) knowledge_chunks seed et (opsiyonel)
  // 2) risk kelimeli chat mesaji gonder
  // 3) escalationFlag = true ve chats/{chatId}.escalation alanini dogrula
});
