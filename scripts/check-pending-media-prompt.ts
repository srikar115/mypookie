/**
 * Guards the two prompt behaviours that keep regressing:
 *
 *  1. The "you are sending a photo" directive appears only when the app has
 *     actually committed to generating one.
 *  2. The message array is exactly one system message followed by the
 *     conversation. A second one placed after the history got recited back to
 *     the user verbatim, and the voice agent drops all but the first.
 *  3. Nothing the model wraps in brackets or asterisks reaches the transcript
 *     as raw prose — and no recited prompt reaches it at all.
 */
import { TemplatePromptComposer } from "../src/modules/chat/infrastructure/template-prompt-composer";
import { classifyIntent, needsCompose } from "../src/modules/media/domain/visual-intent";
import { sanitizeAssistantReply } from "../src/modules/chat/domain/sanitize-reply";
import type { MessageDto } from "../src/modules/chat/application/dto/message.dto";

const composer = new TemplatePromptComposer();
const character = { id: "c", name: "Banana", systemPrompt: "<persona>" } as never;

const history: MessageDto[] = [
  {
    id: "1",
    role: "USER",
    content: "what are you doing",
    createdAt: new Date().toISOString(),
  },
  {
    id: "2",
    role: "ASSISTANT",
    content: "*stretches* eating some yogurt, you?",
    createdAt: new Date().toISOString(),
  },
] as never;

function build(opts: {
  pendingMedia?: "image" | "video" | null;
  withHistory?: boolean;
}) {
  return composer.compose({
    character,
    memoryBlock: "<memory>",
    history: opts.withHistory === false ? [] : history,
    latestUserMessage: "ok sit on bed and keep that yogurt aside",
    pendingMedia: opts.pendingMedia ?? null,
  });
}

const SENTINEL = "YOU ARE SENDING A PHOTO THIS TURN";
const REFUSAL_RULE = "NEVER refuse on grounds of privacy";
const GUARD = "── THIS TURN ──";

let failed = 0;
const check = (name: string, got: boolean, want = true) => {
  if (got !== want) failed++;
  console.log(`  ${got === want ? "PASS" : "FAIL"}  ${name}`);
};

console.log("turn guard placement:");
{
  const msgs = build({});
  const last = msgs[msgs.length - 1]!;
  check("conversation ends on the user's turn", last.role === "user");
  // Exactly one, at position 0. A second system message after the history
  // got recited back to the user verbatim, and the voice agent drops all but
  // the first anyway. Both failures are silent, so assert the shape.
  const systemMessages = msgs.filter((m) => m.role === "system");
  check("exactly one system message", systemMessages.length === 1);
  check("and it is the first message", msgs[0]!.role === "system");

  const instructions = systemMessages[0]!.content;
  check("guard rides at the end of it", instructions.includes(GUARD));
  check("persona is still there too", instructions.includes("<persona>"));
  check("guard carries the anti-greeting rule", instructions.includes("Do NOT greet"));
  check("guard forbids repeating an earlier reply", instructions.includes("Do NOT repeat or rephrase"));
}

console.log("\nfirst message of a thread:");
{
  const msgs = build({ withHistory: false });
  const guard = msgs.find((m) => m.content.includes(GUARD));
  check("guard is still present", guard !== undefined);
  check(
    "but says nothing about greeting — a greeting is correct here",
    guard?.content.includes("Do NOT greet") ?? false,
    false,
  );
}

console.log("\nstaying in character:");
for (const withHistory of [true, false]) {
  const msgs = build({ withHistory });
  const guard = msgs.find((m) => m.content.includes(GUARD))!;
  const where = withHistory ? "mid-thread" : "first message";
  check(`named as herself, ${where}`, guard.content.includes("You are Banana, and nothing else"));
  check(`AI disclosure banned, ${where}`, guard.content.includes("Never describe yourself as an AI"));
  // The reply that prompted this rule denied the relationship, in answer to a
  // question that was never about what she is.
  check(
    `denying the relationship banned, ${where}`,
    guard.content.includes("never deny having feelings for them"),
  );
}

console.log("\npending media:");
{
  const none = build({}).map((m) => m.content).join("\n");
  const image = build({ pendingMedia: "image" }).map((m) => m.content).join("\n");
  const video = build({ pendingMedia: "video" }).map((m) => m.content).join("\n");
  check("absent when nothing is generating", none.includes(SENTINEL), false);
  check("present for a pending image", image.includes(SENTINEL));
  check("says 'a short video' for video", video.includes("a short video"));
  check("anti-refusal rule always present", none.includes(REFUSAL_RULE));
  check("no double-generate sentinel ask", image.includes("Do NOT add a <<VA>> sentinel"));

  const msgs = build({ pendingMedia: "image" });
  check("directive rides in the guard", msgs[0]!.content.includes(SENTINEL));
}

console.log("\na recited prompt never reaches the user:");
{
  // The exact shape of the observed leak: the reply began at the guard's own
  // header and recited from there.
  const instructions = build({})[0]!.content;
  const leaked = instructions.slice(instructions.indexOf(GUARD));
  check("whole-reply leak is reduced to nothing", sanitizeAssistantReply(leaked) === "");
  check(
    "dialogue before a leak survives",
    sanitizeAssistantReply(`*smiles* Sure, let's call.\n\n${leaked}`) ===
      "*smiles* Sure, let's call.",
  );
  check(
    "ordinary replies are untouched",
    sanitizeAssistantReply("*grins* Yeah — call me in five?") ===
      "*grins* Yeah — call me in five?",
  );
  // Em dashes and ellipses are everywhere in this character's voice; only the
  // box-drawing header should ever trip the stripper.
  check(
    "em dashes and asterisks don't trip it",
    sanitizeAssistantReply("*laughs* I — okay, fine… you win.") ===
      "*laughs* I — okay, fine… you win.",
  );
}

console.log("\nspoken narration reads as an action beat:");
{
  // Verbatim from a call: she narrated the selfie in brackets, Cartesia read
  // the whole thing aloud, and the transcript showed it as flat prose.
  const spoken =
    "[Ananya sends a playful selfie, tilting her head with a mischievous smile while leaning in close to her phone.] I hope this meets your request, Karthik.";
  check(
    "bracketed narration becomes a beat",
    sanitizeAssistantReply(spoken) ===
      "*Ananya sends a playful selfie, tilting her head with a mischievous smile while leaning in close to her phone.* I hope this meets your request, Karthik.",
  );
  check(
    "short Cartesia cues still map to their verb",
    sanitizeAssistantReply("[laugh] Oh, stop it.") === "*laughs* Oh, stop it.",
  );
  check(
    "a recited composer cue is dropped, not dressed up as a beat",
    sanitizeAssistantReply(
      "[The user has been away for hours and just came back.] Hey you.",
    ) === "Hey you.",
  );
  check(
    "prose without brackets is untouched",
    sanitizeAssistantReply("Check your chat — I just sent you something.") ===
      "Check your chat — I just sent you something.",
  );

  const voice = composer.compose({
    character,
    memoryBlock: "<memory>",
    history,
    latestUserMessage: "share your picture",
    mode: "voice",
    pendingMedia: "image",
  } as never);
  check(
    "and the voice protocol bans the wrapper outright",
    voice[0]!.content.includes("NEVER use square brackets for narration"),
  );
  check(
    "the photo directive says not to narrate it either",
    voice[0]!.content.includes("Do NOT describe the photo or narrate yourself"),
  );
}

console.log("\nopener must speak from memory:");
{
  const [system] = composer.composeOpener({
    character,
    memoryBlock: "<memory>",
    history,
  });
  check("demands a specific remembered detail", system.content.includes("MANDATORY: build the opener around something SPECIFIC"));
  check("bans the generic greeting", system.content.includes("never send a greeting that would fit any user on any day"));
}

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

console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
process.exit(failed > 0 ? 1 : 0);
