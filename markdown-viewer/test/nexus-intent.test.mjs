import test from "node:test";

import assert from "node:assert/strict";

import {

  assistantSuggestsDocumentEdit,

  inferDocumentChangeIntent,

  inferLikelyDocumentEditIntent,

  inferNexusChatMode,

  shouldOfferDocumentEditMode,

} from "../src/nexus/intent.ts";



const docCtx = { activeView: "documents", hasDocument: true };



test("inferDocumentChangeIntent detects bijwerken document", () => {

  assert.equal(inferDocumentChangeIntent("Kun je het document bijwerken met deze punten?"), true);

});



test("inferNexusChatMode stays ask in documents until Wijzig document is enabled", () => {

  assert.equal(inferNexusChatMode("Kun je het document bijwerken met deze punten?", docCtx), "ask");

  assert.equal(inferNexusChatMode("Pas dit document aan met de nieuwe terminologie.", docCtx), "ask");

});



test("shouldOfferDocumentEditMode offers for explicit document edit without execute toggle", () => {

  const message = "Pas dit document aan met de nieuwe terminologie.";

  assert.equal(inferDocumentChangeIntent(message), true);

  assert.equal(shouldOfferDocumentEditMode(message, docCtx), true);

  assert.equal(shouldOfferDocumentEditMode(message, docCtx, "", { executeOnActive: true }), false);

});



test("shouldOfferDocumentEditMode offers when intent was missed in ask flow", () => {

  const message = "Kun je dit verslag nog wat professioneler formuleren in het document?";

  assert.equal(inferDocumentChangeIntent(message), false);

  assert.equal(shouldOfferDocumentEditMode(message, docCtx), true);

});



test("shouldOfferDocumentEditMode uses assistant reply as signal", () => {

  const message = "Wat denk je van deze tekst?";

  const reply = "Ik heb een reviewvoorstel klaarstaan; keur het goed om het in het document te zetten.";

  assert.equal(shouldOfferDocumentEditMode(message, docCtx, reply), true);

});



test("assistantSuggestsDocumentEdit detects markdown-heavy reply", () => {

  const reply =

    "# Gespreksverslag\n\n## Samenvatting\nLang verslag met meerdere secties en acties voor het team en de opvolging.\n\n## Acties\n- Joost: follow-up voor vrijdag";

  assert.equal(assistantSuggestsDocumentEdit(reply), true);

});



test("inferLikelyDocumentEditIntent catches soft document hints", () => {

  assert.equal(inferLikelyDocumentEditIntent("Kun je de structuur van dit document verbeteren?"), true);

});

