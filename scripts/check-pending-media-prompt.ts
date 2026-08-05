/**
 * Guards the two prompt behaviours that keep regressing:
 *
 *  1. The "you are sending a photo" directive appears only when the app has
 *     actually committed to generating one.
 *  2. The per-turn guard (no greeting, no repetition) is the LAST thing the
 *     model reads before the user's line. Placement is the whole point — the
 *     same rules sat in the system prompt and lost to the history.
 */
import { TemplatePromptComposer } from "../src/modules/chat/infrastructure/template-prompt-composer";
import { classifyIntent, needsCompose } from "../src/modules/media/domain/visual-intent";
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
  const beforeLast = msgs[msgs.length - 2]!;
  check("conversation ends on the user's turn", last.role === "user");
  check("guard sits immediately before it", beforeLast.role === "system");
  check("guard carries the anti-greeting rule", beforeLast.content.includes(GUARD) && beforeLast.content.includes("Do NOT greet"));
  check("guard forbids repeating an earlier reply", beforeLast.content.includes("Do NOT repeat or rephrase"));
  check(
    "guard is separate from the persona system prompt",
    msgs[0]!.content.includes("<persona>") && !msgs[0]!.content.includes(GUARD),
  );
}

console.log("\nfirst message of a thread:");
{
  const msgs = build({ withHistory: false });
  check(
    "no 'do not greet' guard when there is nothing to continue",
    msgs.some((m) => m.content.includes(GUARD)),
    false,
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

  // It has to ride in the guard, not the system prompt — that move is the fix.
  const msgs = build({ pendingMedia: "image" });
  check(
    "directive rides in the guard, next to the user turn",
    msgs[msgs.length - 2]!.content.includes(SENTINEL),
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
