import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocale } from "../lib/locale.ts";

test("manual language preference overrides country and browser", () => {
  assert.equal(resolveLocale("fr", "de-DE,de;q=0.9", "ES"), "fr");
});

test("automatic language uses country before browser language", () => {
  assert.equal(resolveLocale("auto", "fr-FR,fr;q=0.9", "DE"), "de");
  assert.equal(resolveLocale("auto", "de-DE,de;q=0.9", "ES"), "es");
});

test("automatic language falls back to browser language when country is unsupported", () => {
  assert.equal(resolveLocale("auto", "fr-CA,fr;q=0.9,en;q=0.8", "ZZ"), "fr");
});

test("automatic language falls back to English when no supported signal exists", () => {
  assert.equal(resolveLocale("auto", "ja-JP,ja;q=0.9", "JP"), "en");
});

test("invalid preference does not override valid country detection", () => {
  assert.equal(resolveLocale("xx", "en-US", "PT"), "pt");
});
