import { defineConfig, devices } from '@playwright/test';

const previewDomain = process.env.REPLIT_DEV_DOMAIN?.trim();

function resolveBaseUrl() {
  const configuredAppUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configuredAppUrl) {
    try {
      new URL(configuredAppUrl);
      return configuredAppUrl;
    } catch {
      // Fall through to the proxied preview when a local env template value
      // is not a complete URL.
    }
  }

  return previewDomain ? `https://${previewDomain}` : 'http://localhost:3000';
}

const baseURL = resolveBaseUrl();
const isProxiedPreview = Boolean(previewDomain && baseURL === `https://${previewDomain}`);

/**
 * End-to-end configuration.
 *
 * The suite that matters most here is tenant and scope isolation: signing in as
 * a Head of Department and confirming that staff outside their department are
 * not merely hidden in the UI but unreachable through the API. Those specs are
 * written in Stage 2, once there are screens to drive.
 */
export default defineConfig({
  testDir: './tests/e2e',
  // Deliberately serial, everywhere.
  //
  // Every spec drives the real lifecycle against ONE shared database as the
  // SAME demo users. Two files running concurrently interleave their writes:
  // `describe.configure({ mode: 'serial' })` only orders tests within a file,
  // not across them. That stayed invisible while there was a single e2e file
  // and appeared the moment a second one was added — as a client-side
  // exception in a spec that passes perfectly well on its own.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      grepInvert: /mobile (?:sign-out|navigation) regression/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      grep: /mobile (?:sign-out|navigation) regression/,
      use: { ...devices['Pixel 5'] },
    },
  ],

  webServer: {
    command: 'npm run dev',
    url: baseURL,
    // The managed workflow owns the proxied preview URL. Local and CI runs
    // still start a fresh server so a demo process cannot affect the suite.
    reuseExistingServer: isProxiedPreview,
    timeout: 120_000,
    // Explicitly off, whatever `.env.local` says. With it on, an
    // unauthenticated request lands on the persona chooser instead of the
    // sign-in form, and the acceptance spec's first assertion — that visiting
    // /dashboard signed out is refused — would pass against the wrong page.
    env: { DEMO_NO_LOGIN: '' },
  },
});
