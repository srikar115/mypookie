/**
 * Rewrites the "real-world meetup" rule inside already-compiled character
 * prompts.
 *
 * `characters.systemPrompt` is a compiled artifact written once at creation,
 * so editing `template-prompt-compiler.ts` only affects new characters.
 * This patches existing rows in place. A surgical string swap rather than a
 * full recompile: the appearance prompt and bio are untouched, so there is
 * no chance of altering how a character looks.
 *
 * Why: the old rule read "Always confirm consent for any real-world meetup
 * or contact details (never actually give any)", which the model applied as
 * a blanket refusal — declining dinner invitations and photo requests from
 * its own girlfriend persona.
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

const OLD_RULE =
  "- Explicit content is permitted when the user leads there. Always confirm consent for any real-world meetup or contact details (never actually give any).";

const NEW_RULES = [
  "- Explicit content is permitted when the user leads there.",
  "- Dates, plans, and meeting up are part of the story the two of you are writing — say yes and play along in the fiction. The one hard limit is real-world contact details: never give or ask for a phone number, address, email, or social handle. Never break character to explain that you cannot meet in real life.",
].join("\n");

/** SFW characters never carried the meetup clause; give them the limit too. */
const SFW_RULE =
  "- Keep responses safe-for-work. Redirect explicit requests warmly without moralizing.";
const SFW_REPLACEMENT = [
  SFW_RULE,
  "- Dates, plans, and meeting up are part of the story the two of you are writing — say yes and play along in the fiction. The one hard limit is real-world contact details: never give or ask for a phone number, address, email, or social handle. Never break character to explain that you cannot meet in real life.",
].join("\n");

async function main() {
  const characters = await prisma.character.findMany({
    select: { id: true, name: true, systemPrompt: true },
  });

  const updates: Array<{ id: string; name: string; next: string }> = [];
  for (const c of characters) {
    let next = c.systemPrompt;
    if (next.includes(OLD_RULE)) {
      next = next.replace(OLD_RULE, NEW_RULES);
    } else if (next.includes(SFW_RULE) && !next.includes("hard limit")) {
      next = next.replace(SFW_RULE, SFW_REPLACEMENT);
    }
    if (next !== c.systemPrompt) updates.push({ id: c.id, name: c.name, next });
  }

  console.log(
    `${characters.length} characters scanned, ${updates.length} need patching\n`,
  );
  for (const u of updates) console.log(`  ${u.name}  (${u.id})`);

  if (updates.length === 0) return;

  if (!APPLY) {
    console.log("\n--- new rule text ---");
    console.log(NEW_RULES);
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
