import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command:
        "/bin/bash -lc 'DMS_DATABASE_URL=sqlite:////tmp/donde_me_siento_playwright_$RANDOM.db .venv/bin/uvicorn backend.app.main:app --host 127.0.0.1 --port 8010'",
      url: "http://127.0.0.1:8010/health",
      cwd: "..",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "/bin/bash -lc 'VITE_API_PROXY_TARGET=http://127.0.0.1:8010 npm run dev -- --host 127.0.0.1 --port 4173'",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
