/**
 * A photo asked for out loud has to do two things: start a generation, and
 * make the character say yes while it runs. Verified against the real
 * BuildVoiceContextUseCase with stub repositories, so the routing decision
 * and the prompt it produces are the shipped ones.
 */
import { BuildVoiceContextUseCase } from "../src/modules/voice/application/use-cases/build-voice-context.use-case";
import { TemplatePromptComposer } from "../src/modules/chat/infrastructure/template-prompt-composer";
import type { VisualRequestLauncher } from "../src/modules/voice/application/ports/visual-request-launcher";

const CONVERSATION_ID = "conv-1";
const USER_ID = "user-1";

const character = {
  id: "char-1",
  name: "Banana",
  gender: "FEMALE",
  systemPrompt: "<persona>",
  voicePreset: null,
} as never;

function buildUseCase() {
  const started: string[] = [];
  const launcher: VisualRequestLauncher = {
    async start(input) {
      started.push(input.scene);
      return { mediaId: `media-${started.length}` };
    },
  };

  const uc = new BuildVoiceContextUseCase(
    { findById: async () => ({ id: CONVERSATION_ID, userId: USER_ID, characterId: "char-1" }) } as never,
    { getForActor: async () => character } as never,
    {
      findById: async () => ({
        id: "call-1",
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        characterId: "char-1",
      }),
    } as never,
    { listRecent: async () => [] },
    { getMemoryBlock: async () => "<memory>" } as never,
    new TemplatePromptComposer(),
    20,
    { female: "f", male: "m", nonbinary: null },
    launcher,
  );

  return { uc, started };
}

async function contextFor(transcript: string) {
  const { uc, started } = buildUseCase();
  const built = await uc.execute({
    callSessionId: "call-1",
    actorUserId: USER_ID,
    latestUserMessage: transcript,
  });
  return { built, started };
}

let failed = 0;
const check = (name: string, got: boolean, want = true) => {
  if (got !== want) failed++;
  console.log(`  ${got === want ? "PASS" : "FAIL"}  ${name}`);
};

async function main() {
  console.log("photo requests spoken on a call:");
  for (const said of [
    "I hope you're sharing your picture.",
    "Send me a photo.",
    "Can you send me a picture?",
    "Share your picture with me.",
  ]) {
    const { built, started } = await contextFor(said);
    check(`launches a generation — "${said}"`, built.launchedMedia !== null);
    check(`  and only one`, started.length === 1);
  }

  console.log("\nordinary call chatter must not spend credits:");
  for (const said of [
    "How are you doing today?",
    "What are you up to right now?",
    "Are we still on for dinner tonight?",
    "I miss you so much.",
    "Tell me about your day.",
    "Did you see that video I sent?",
  ]) {
    const { built } = await contextFor(said);
    check(`no generation — "${said}"`, built.launchedMedia === null);
  }

  console.log("\ncall opener (empty transcript):");
  {
    const { built, started } = await contextFor("");
    check("no generation", built.launchedMedia === null);
    check("launcher untouched", started.length === 0);
  }

  console.log("\nwhat she is told to say while it generates:");
  {
    const { built } = await contextFor("Send me a photo.");
    // The worker uses ONLY the first system message as the session
    // instructions and discards the rest, so anything the model must see has
    // to be inside that one. This is the assertion that catches a regression
    // where the directive is appended as its own message and silently lost.
    const systemMessages = built.messages.filter((m) => m.role === "system");
    check("exactly one system message", systemMessages.length === 1);

    const instructions = systemMessages[0]!.content;
    check("committed to sending", instructions.includes("YOU ARE SENDING THEM A PHOTO"));
    check("told never to refuse", instructions.includes("Never refuse, deflect, stall, or apologise"));
    check("points them at the chat", instructions.includes("check their chat"));
    // The text directive would have her narrate "*blushes*" down the phone.
    check(
      "no action-beat instruction leaked from the text directive",
      instructions.includes("still exactly one *action beat*"),
      false,
    );
    check("voice output protocol still applies", instructions.includes("VOICE OUTPUT PROTOCOL"));
  }

  console.log("\nnormal turn is unaffected:");
  {
    const { built } = await contextFor("What are you up to right now?");
    const prompt = built.messages.map((m) => m.content).join("\n");
    check("no photo directive", prompt.includes("YOU ARE SENDING THEM A PHOTO"), false);
    check("still one system message", built.messages.filter((m) => m.role === "system").length === 1);
  }

  console.log(failed === 0 ? "\nALL PASS" : `\n${failed} FAILURE(S)`);
  process.exit(failed > 0 ? 1 : 0);
}

void main();
