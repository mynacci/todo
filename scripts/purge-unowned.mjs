// One-off migration for the GitHub login feature: deletes todos/weeks/goals that have no userId.
// Dry-run by default (prints counts only). Pass --yes to actually delete.
//
//   npm run migrate:purge-unowned            # dry-run
//   npm run migrate:purge-unowned -- --yes   # delete
//
// Reads MONGODB_URI from the environment (.env / .env.local are loaded by the npm script).
import { pathToFileURL } from "node:url";
import mongoose from "mongoose";

/** Collections in child -> parent order, so children never outlive the run when it is interrupted. */
export const COLLECTIONS = ["todos", "weeks", "goals"];

/** Matches documents whose userId is missing or null. */
export const UNOWNED = { userId: null };

/**
 * Counts (and with `apply: true` deletes) unowned documents.
 * @param {import("mongodb").Db} db
 * @param {{ apply?: boolean }} [options]
 * @returns {Promise<{ apply: boolean, counts: Record<string, number>, deleted: Record<string, number> }>}
 */
export async function purgeUnowned(db, { apply = false } = {}) {
  /** @type {Record<string, number>} */
  const counts = {};
  /** @type {Record<string, number>} */
  const deleted = {};
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    counts[name] = await col.countDocuments(UNOWNED);
    deleted[name] = apply ? (await col.deleteMany(UNOWNED)).deletedCount : 0;
  }
  return { apply, counts, deleted };
}

/**
 * mongodb://user:pass@host/db (everything up to the last @ of the authority) -> mongodb://***@host/db
 * @param {string} uri
 */
export const redactUri = (uri) => uri.replace(/\/\/[^/]*@/, "//***@");

/** @param {string[]} argv */
async function main(argv) {
  const apply = argv.includes("--yes");
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set. Set it in .env.local or the environment.");
    process.exit(1);
  }
  console.log(`[purge-unowned] target: ${redactUri(uri)}`);
  await mongoose.connect(uri);
  try {
    const { counts, deleted } = await purgeUnowned(mongoose.connection.db, { apply });
    for (const name of COLLECTIONS) {
      console.log(
        apply
          ? `  ${name}: ${deleted[name]} deleted`
          : `  ${name}: ${counts[name]} without userId`,
      );
    }
    if (!apply) console.log("[purge-unowned] dry-run only. Re-run with --yes to delete.");
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
