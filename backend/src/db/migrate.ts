import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function migrate() {
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf-8");
  await getPool().query(sql);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await migrate();
  console.log("migration complete");
  process.exit(0);
}
