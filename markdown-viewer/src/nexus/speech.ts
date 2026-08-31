/** Browser text-to-speech voor Nexus-antwoorden (Web Speech API). */

export function stripMarkdownForSpeech(markdown: string): string {
  let text = String(markdown || "");
  text = text.replace(/```[\s\S]*?```/g, " ");
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, " ");
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/[*_~>|]/g, "");
  text = text.replace(/\s+/g, " ").trim();
  return text.slice(0, 8000);
}

function pickDutchVoice(): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const nl = voices.filter((v) => /^nl(-|$)/i.test(v.lang));
  return (
    nl.find((v) => /natural|premium|online/i.test(v.name)) ??
    nl.find((v) => /female|fem/i.test(v.name)) ??
    nl[0] ??
    voices.find((v) => /nl/i.test(v.lang)) ??
    null
  );
}

let activeUtterance: SpeechSynthesisUtterance | null = null;

export function stopNexusSpeech(): void {
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  activeUtterance = null;
}

export function nexusSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

export function speakNexusReply(markdown: string): boolean {
  if (!nexusSpeechSupported()) return false;
  const plain = stripMarkdownForSpeech(markdown);
  if (!plain) return false;
  stopNexusSpeech();
  const utter = new SpeechSynthesisUtterance(plain);
  utter.lang = "nl-NL";
  utter.rate = 1.02;
  utter.pitch = 1;
  const voice = pickDutchVoice();
  if (voice) utter.voice = voice;
  utter.onend = () => {
    if (activeUtterance === utter) activeUtterance = null;
  };
  activeUtterance = utter;
  window.speechSynthesis.speak(utter);
  return true;
}

export function isNexusSpeaking(): boolean {
  return !!activeUtterance && window.speechSynthesis?.speaking;
}
