/**
 * The reply prompt must gain the "you are sending a photo" directive only
 * when the app has actually committed to generating one.
 */
import { TemplatePromptComposer } from "../src/modules/chat/infrastructure/template-prompt-composer";
import { classifyIntent, needsCompose } from "../src/modules/media/domain/visual-intent";

const composer = new TemplatePromptComposer();
const character = { id: "c", name: "Banana", systemPrompt: "<persona>" } as never;

function systemFor(pendingMedia: "image" | "video" | null): string {
  const [msg] = composer.compose({
    character,
    memoryBlock: "<memory>",
    history: [],
    latestUserMessage: "show me your photo how you are at this moment",
    pendingMedia,
  });
  return msg.content;
}

const SENTINEL = "YOU ARE SENDING A PHOTO THIS TURN";
const REFUSAL_RULE = "NEVER refuse on grounds of privacy";

let failed = 0;
const check = (name: string, got: boolean, want: boolean) => {
  if (got !== want) failed++;
  console.log(`  ${got === want ? "PASS" : "FAIL"}  ${name}`);
};

console.log("system prompt contents:");
check("no directive when nothing is generating", systemFor(null).includes(SENTINEL), false);
check("directive present for a pending image", systemFor("image").includes(SENTINEL), true);
check("directive says 'a short video' for video", systemFor("video").includes("a short video"), true);
check("anti-refusal rule always present", systemFor(null).includes(REFUSAL_RULE), true);
check("no double-generate sentinel ask", systemFor("image").includes("Do NOT add a <<VA>> sentinel"), true);

// The client only flags pendingMedia on the auto-generate path. Confirm the
// message from the screenshot takes it.
console.log("\nrouting for the reported message:");
for (const text of [
  "ok show me your photo how you are at this moment",
  "send me a pic",
  "are you free tonight",
]) {
  const d = classifyIntent(text);
  const auto =
    d.intent !== "normal_chat" &&
    d.intent !== "ambiguous_visual_request" &&
    d.mediaType === "image" &&
    !needsCompose(d);
  console.log(
    `  pendingMedia=${String(auto ? "image" : null).padEnd(5)} conf=${d.confidence.toFixed(2)}  "${text}"`,
  );
}

process.exit(failed > 0 ? 1 : 0);
