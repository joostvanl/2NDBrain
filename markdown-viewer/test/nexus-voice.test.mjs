import test from "node:test";
import assert from "node:assert/strict";
import { nexusVoicePromptBlock, stripMarkdownForSpeech } from "../server/nexus/nexus-voice.mjs";

test("nexusVoicePromptBlock includes identity and mode hints", () => {
  const ask = nexusVoicePromptBlock("ask");
  assert.match(ask, /Nexus/);
  assert.match(ask, /Ask-modus/);
  const tool = nexusVoicePromptBlock("tool");
  assert.match(tool, /toolcontext/);
});

test("stripMarkdownForSpeech removes markdown noise", () => {
  const plain = stripMarkdownForSpeech("## Kop\n\n**Bold** en `code`");
  assert.match(plain, /Kop/);
  assert.match(plain, /Bold/);
  assert.doesNotMatch(plain, /##/);
  assert.doesNotMatch(plain, /\*\*/);
});
