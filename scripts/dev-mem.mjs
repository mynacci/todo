// Starts an in-memory MongoDB (no mongod/Docker needed) and runs `next dev` against it
// (or `next start` when MEM_NEXT_MODE=start, used by the e2e suite).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { MongoMemoryServer } from "mongodb-memory-server";

const require = createRequire(import.meta.url);
const port = Number(process.env.MEM_MONGO_PORT ?? 27018);

const mongod = await MongoMemoryServer.create({ instance: { port } });
const uri = mongod.getUri("todo");
console.log(`[dev:mem] MongoDB (memory) ready: ${uri}`);

const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, process.env.MEM_NEXT_MODE ?? "dev", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, MONGODB_URI: uri },
});

let stopping = false;
async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await mongod.stop();
  process.exit(code);
}
child.on("exit", (code) => shutdown(code ?? 0));
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
