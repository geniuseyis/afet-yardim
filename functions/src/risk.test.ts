import test from "node:test";
import assert from "node:assert/strict";
import { detectRisk } from "./domain";

test("risk detector should mark high risk words", () => {
  assert.equal(detectRisk("Bilincsiz yarali var"), true);
  assert.equal(detectRisk("Bina enkaz altinda"), true);
});

test("risk detector should not mark normal requests", () => {
  assert.equal(detectRisk("Su yardimi gerekiyor"), false);
  assert.equal(detectRisk("Gida talebi olusturdum"), false);
});
