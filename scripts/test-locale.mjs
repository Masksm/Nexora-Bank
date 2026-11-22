import test from "node:test";
import assert from "node:assert/strict";
import { resolveLocale } from "../lib/locale.ts";
import { pageText } from "../lib/page-translations.ts";

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

test("settings and common banking labels are translated", () => {
  assert.equal(pageText("es", "Settings"), "Configuración");
  assert.equal(pageText("fr", "Settings"), "Paramètres");
  assert.equal(pageText("de", "Dark mode"), "Dunkler Modus");
});

test("unknown server errors fall back to a localized safe message", () => {
  assert.notEqual(pageText("pt", "Database error saving profile"), "Database error saving profile");
});

test("composite KYC file-check messages are translated", () => {
  const message = pageText("es", "File signature check passed. Your document has been submitted for review. You will receive an update when the review is complete.");
  assert.match(message, /firma del archivo/);
  assert.match(message, /Tu documento se ha enviado/);
});
