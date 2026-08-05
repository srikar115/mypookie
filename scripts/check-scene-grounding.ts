/**
 * Exercises the visual scene grounder against real conversations.
 *
 * The case that motivated it: she says she's eating an apple, the user says
 * "share your pic", and the photo has to show her eating an apple rather than
 * a generic portrait.
 *
 * Run: npx tsx --require ./scripts/_stub-server-only.cjs scripts/check-scene-grounding.ts
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { config } from "dotenv";

config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({
  adapter,
} as ConstructorParameters<typeof PrismaClient>[0]);

async function main() {
  const { isVagueScene } = await import("../src/modules/media/domain/scene");
  const { LlmVisualSceneGrounder } = await import(
    "../src/modules/media/infrastructure/prompt/llm-visual-scene.grounder"
  );
  const { OpenRouterChatLlm } = await import(
    "../src/shared/infrastructure/llm/openrouter-chat-llm"
  );
  const { PrismaModelConfigRepository } = await import(
    "../src/shared/infrastructure/model-config/prisma-model-config.repository"
  );

  // ── Part 1: which requests need grounding at all ──────────────────────
  const vagueCases: Array<[string, boolean]> = [
    ["", true],
    ["pic", true],
    ["share your pic", true],
    ["send me a pic", true],
    ["one more", true],
    ["a selfie please", true],
    ["yourself", true],
    ["can i see you", true],
    ["oh share me your pic", true],
    ["aww send one babe", true],
    ["hey gorgeous send a selfie", true],
    ["you at the beach", false],
    ["eating an apple", false],
    ["in a red dress", false],
    ["standing on the balcony at sunset", false],
    ["same outfit but different background", false],
  ];

  let failures = 0;
  console.log("── isVagueScene ──");
  for (const [text, expected] of vagueCases) {
    const got = isVagueScene(text);
    const ok = got === expected;
    if (!ok) failures++;
    console.log(
      `  ${ok ? "PASS" : "FAIL"}  ${got ? "vague   " : "specific"}  ${JSON.stringify(text)}`,
    );
  }

  // ── Part 2: the grounder, against a live model ────────────────────────
  const grounder = new LlmVisualSceneGrounder(
    new OpenRouterChatLlm(),
    new PrismaModelConfigRepository(prisma),
  );

  const threads: Array<{
    label: string;
    turns: Array<{ role: "user" | "assistant"; content: string }>;
    request: string;
    /** Words we expect to survive into the scene. */
    expect: string[];
  }> = [
    {
      label: "the reported case — eating an apple",
      turns: [
        { role: "user", content: "hey what are you doing" },
        {
          role: "assistant",
          content:
            "*stretches out on the couch* just finished my evening session, eating an apple and scrolling through my feed. you?",
        },
      ],
      request: "share your pic",
      expect: ["apple"],
    },
    {
      label: "gym context",
      turns: [
        { role: "user", content: "you free now?" },
        {
          role: "assistant",
          content:
            "*wipes her forehead* still at the gym, just finished deadlifts. give me twenty minutes",
        },
      ],
      request: "pic",
      expect: ["gym"],
    },
    {
      label: "cooking, late evening",
      turns: [
        { role: "user", content: "did you eat?" },
        {
          role: "assistant",
          content:
            "*laughs* making pasta right now, kitchen's a disaster and it's almost midnight",
        },
      ],
      request: "send me a pic",
      expect: ["kitchen", "pasta", "cooking"],
    },
  ];

  console.log("\n── grounded scenes ──");
  for (const t of threads) {
    const scene = await grounder.ground({
      userRequest: t.request,
      characterName: "Banana",
      recentTurns: t.turns,
      kind: "IMAGE",
    });
    const lower = (scene ?? "").toLowerCase();
    const hit = t.expect.some((w) => lower.includes(w));
    if (!hit) failures++;
    console.log(`\n  ${t.label}`);
    console.log(`    asked: ${JSON.stringify(t.request)}`);
    console.log(`    scene: ${scene ?? "(null — fell back to original)"}`);
    console.log(
      `    ${hit ? "PASS" : "FAIL"}  expected one of [${t.expect.join(", ")}]`,
    );
  }

  // Empty history must not invent a conversation.
  const noHistory = await grounder.ground({
    userRequest: "pic",
    characterName: "Banana",
    recentTurns: [],
    kind: "IMAGE",
  });
  console.log(
    `\n  ${noHistory === null ? "PASS" : "FAIL"}  empty history returns null (caller keeps original)`,
  );
  if (noHistory !== null) failures++;

  console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
