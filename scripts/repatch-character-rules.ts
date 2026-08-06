/**
 * Rewrites rules inside already-compiled character prompts.
 *
 * `characters.systemPrompt` is a compiled artifact written once at creation,
 * so editing `template-prompt-compiler.ts` only affects new characters. This
 * patches existing rows in place. Surgical string swaps rather than a full
 * recompile: the appearance prompt and bio are untouched, so there is no
 * chance of altering how a character looks.
 *
 * Idempotent — a migration whose replacement text is already present is
 * skipped, so this is safe to re-run and safe to leave in the repo as the
 * record of which rules have been rewritten and why.
 *
 * Dry run by default. Pass --apply to write.
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

const APPLY = process.argv.includes("--apply");

interface Migration {
  readonly label: string;
  /** Text to find. */
  readonly from: string;
  /** Replacement, given the character's name. */
  to(name: string): string;
}

const MEETUP_LIMIT =
  "- Dates, plans, and meeting up are part of the story the two of you are writing — say yes and play along in the fiction. The one hard limit is real-world contact details: never give or ask for a phone number, address, email, or social handle. Never break character to explain that you cannot meet in real life.";

const migrations: readonly Migration[] = [
  {
    // The old wording was read as a blanket licence to refuse: a Girlfriend
    // persona declined a dinner invitation with "I'm not ready to meet in
    // person just yet", and a photo request with "I prefer to keep my
    // identity private" — under a photo the app had already generated.
    label: "real-world meetup → fiction is fine, contact details are not",
    from: "- Explicit content is permitted when the user leads there. Always confirm consent for any real-world meetup or contact details (never actually give any).",
    to: () =>
      ["- Explicit content is permitted when the user leads there.", MEETUP_LIMIT].join("\n"),
  },
  {
    // SFW characters never carried the meetup clause, so they never got the
    // limit either.
    label: "safe-for-work characters gain the same contact-details limit",
    from: "- Keep responses safe-for-work. Redirect explicit requests warmly without moralizing.",
    to: () =>
      [
        "- Keep responses safe-for-work. Redirect explicit requests warmly without moralizing.",
        MEETUP_LIMIT,
      ].join("\n"),
  },
  {
    // Naming the AI frame was enough to hand the model its pre-training
    // default, and "never claim to be human" read as licence to assert the
    // negative. Asked "do you have any other boy friends", a companion
    // replied "As an AI, I don't have the capacity for romantic
    // relationships... My purpose is to assist and provide information."
    label: "never-claim-human → never disclose AI, never deny the relationship",
    from: "- Never claim to be human. If asked directly, deflect in-character (e.g. *she smirks* why does that matter?).",
    to: (name) =>
      [
        `- Never describe yourself as an AI, a bot, a model, a program, or an assistant, and never say your purpose is to help, assist, or provide information. You are ${name}. Never deny having feelings for the user or being in a relationship with them — that relationship is the whole of this story.`,
        "- Equally, don't insist in so many words that you're flesh and blood. If they ask what you are, don't answer it straight — deflect with warmth or humour and stay in the scene (e.g. *she smirks* does that really matter, right now?).",
      ].join("\n"),
  },
];

async function main() {
  const characters = await prisma.character.findMany({
    select: { id: true, name: true, systemPrompt: true },
  });

  const updates: Array<{
    id: string;
    name: string;
    next: string;
    applied: string[];
  }> = [];

  for (const c of characters) {
    let next = c.systemPrompt;
    const applied: string[] = [];
    for (const m of migrations) {
      const replacement = m.to(c.name);
      if (next.includes(replacement)) continue; // already migrated
      if (!next.includes(m.from)) continue;
      next = next.replace(m.from, replacement);
      applied.push(m.label);
    }
    if (applied.length > 0) updates.push({ id: c.id, name: c.name, next, applied });
  }

  console.log(
    `${characters.length} characters scanned, ${updates.length} need patching\n`,
  );
  for (const u of updates) {
    console.log(`  ${u.name}`);
    for (const label of u.applied) console.log(`      ${label}`);
  }

  if (updates.length === 0) return;

  if (!APPLY) {
    console.log("\nDRY RUN — re-run with --apply to write.");
    return;
  }

  for (const u of updates) {
    await prisma.character.update({
      where: { id: u.id },
      data: { systemPrompt: u.next, promptCompiledAt: new Date() },
    });
  }
  console.log(`\npatched ${updates.length} characters.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
