import test from "node:test";
import assert from "node:assert/strict";
import { legacyPiiHash, matchesPiiHash, piiHash } from "./pii";

test("ozet istemciyle ayni sabit degeri uretir", () => {
  assert.equal(piiHash("tcNo", "10000000146"), "c2e256ee07d965edb0a3208b1fff25f8");
  assert.equal(piiHash("phone", "05000000000"), "6ca79b142726b19c8c7cfdbaa7be9097");
  assert.equal(piiHash("email", ""), "");
});

test("yeni ve eski ozet eslesir, yanlis deger eslesmez", () => {
  assert.equal(matchesPiiHash(piiHash("phone", "05000000000"), "phone", "05000000000"), true);
  assert.equal(matchesPiiHash(legacyPiiHash("phone", "05000000000"), "phone", "05000000000"), true);
  assert.equal(matchesPiiHash(piiHash("phone", "05000000001"), "phone", "05000000000"), false);
});
