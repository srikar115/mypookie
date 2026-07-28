import "dotenv/config";
import pg from "pg";

const { Client } = pg;

async function probe(label, url) {
  console.log(`\n─── ${label} ───`);
  console.log(`URL: ${url.replace(/:[^@]+@/, ":****@")}`);
  const c = new Client({ connectionString: url, connectionTimeoutMillis: 10000 });
  try {
    await c.connect();
    const v = await c.query("SELECT version()");
    console.log("Connected:", v.rows[0].version.split(",")[0]);

    const ext = await c.query(
      "SELECT name, installed_version FROM pg_available_extensions WHERE name IN ('vector','pg_trgm','pgcrypto','unaccent') ORDER BY name"
    );
    console.log("Extensions:");
    for (const row of ext.rows) {
      const status = row.installed_version ? `INSTALLED @ ${row.installed_version}` : "available (not enabled)";
      console.log(`  - ${row.name}: ${status}`);
    }

    const tables = await c.query(
      "SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema='public'"
    );
    console.log(`Public tables: ${tables.rows[0].n}`);
    return true;
  } catch (e) {
    console.error(`FAIL: ${e.code || ""} ${e.message}`);
    return false;
  } finally {
    try { await c.end(); } catch { /* noop */ }
  }
}

const runtime = process.env.DATABASE_URL;
const direct = process.env.DIRECT_URL;

if (!runtime) console.error("DATABASE_URL not set");
if (!direct) console.error("DIRECT_URL not set");

let ok = true;
if (runtime) ok = (await probe("DATABASE_URL (runtime)", runtime)) && ok;
if (direct)  ok = (await probe("DIRECT_URL (migrations)", direct)) && ok;

process.exit(ok ? 0 : 1);
