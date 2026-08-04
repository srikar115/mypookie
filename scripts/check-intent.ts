import { classifyIntent, needsCompose } from "../src/modules/media/domain/visual-intent";

type Expect = "chat" | "auto" | "compose" | "clarify";

function route(text: string): Expect {
  const d = classifyIntent(text);
  if (d.intent === "normal_chat") return "chat";
  if (d.intent === "ambiguous_visual_request") return "clarify";
  return needsCompose(d) ? "compose" : "auto";
}

const cases: Array<[string, Expect]> = [
  // Regression: ordinary conversation must never trigger media.
  ["are you coming tonight for dinner", "chat"],
  ["how are you", "chat"],
  ["i miss you", "chat"],
  ["love you", "chat"],
  ["are you free tomorrow", "chat"],
  ["what are you doing", "chat"],
  ["see you tonight", "chat"],
  ["let me see you tomorrow", "chat"],
  ["can you send me the address", "chat"],
  ["wanna watch a movie", "chat"],
  ["im short on time", "chat"],
  ["im moving to a new place", "chat"],
  ["give it a shot", "chat"],
  ["did you see that video", "chat"],
  ["one more drink?", "chat"],
  ["share your thoughts with me", "chat"],
  ["tell me about your day", "chat"],

  // Acceptance tests from the plan.
  ["send me a pic", "auto"],
  ["show yourself", "auto"],
  ["show me your full picture", "compose"],
  ["change the background to a cafe", "compose"],
  ["make a short clip of you dancing", "compose"],

  // Other true positives.
  ["another selfie please", "auto"],
  ["can i see a photo of you", "auto"],
  ["your pic?", "compose"],
  ["send me a video", "compose"],
  ["closer up", "compose"],
  ["what do you look like", "compose"],
  ["dont send me a pic", "chat"],
];

let failed = 0;
for (const [text, want] of cases) {
  const d = classifyIntent(text);
  const got = route(text);
  const ok = got === want;
  if (!ok) failed++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${want.padEnd(8)} got=${got.padEnd(8)} conf=${d.confidence.toFixed(2)} ${d.mediaType ?? "-"}${d.editMode ? " edit" : ""}  "${text}"`,
  );
}
console.log(`\n${cases.length - failed}/${cases.length} passed`);
process.exit(failed > 0 ? 1 : 0);
