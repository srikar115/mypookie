import prisma from "../src/lib/db/index.js";
import { generateCompanionAvatar } from "../src/lib/companions/companionService.js";

async function main() {
  const companions = await prisma.companion.findMany({
    where: { isPublic: true, avatarUrl: null },
    select: { id: true, name: true },
  });

  console.log(`Queuing ${companions.length} avatar generation(s)…`);

  const promises = companions.map(async (c) => {
    console.log(` → ${c.name}`);
    try {
      await generateCompanionAvatar(c.id);
      console.log(` ✓ ${c.name} done`);
    } catch (err) {
      console.error(` ✗ ${c.name}:`, (err as Error).message);
    }
  });

  await Promise.all(promises);
  console.log("All avatar generation attempts complete.");
  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
