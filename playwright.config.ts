import { defineConfig } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  workers: 1,
  use: { baseURL: `http://localhost:${port}` },
  webServer: {
    // Production build, not `next dev`: the dev server's Turbopack HMR keeps announcing "server-component-changes"
    // right after cold route compiles, so open pages get soft-refreshed/navigated mid-test
    // (net::ERR_ABORTED on goto, drag state lost before the PATCH). A built server has no HMR.
    command: `npm run build && npm run dev:mem -- -p ${port}`,
    url: `http://localhost:${port}/api/goals`,
    env: { APP_URL: `http://localhost:${port}`, MEM_NEXT_MODE: "start", MEM_MONGO_PORT: String(Number(process.env.E2E_MONGO_PORT ?? 27118)) },
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
