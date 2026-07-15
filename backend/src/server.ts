import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

// Fail fast on a misconfigured deploy rather than accepting traffic that
// will error out mid-flow (e.g. leaving orders stuck in "quoted" forever,
// or letting the settle route fail open). These have no working default.
const REQUIRED_ENV_VARS = [
  "DATABASE_URL",
  "STELLAR_NETWORK_PASSPHRASE",
  "USDC_ISSUER",
  "FUNDING_SECRET_KEY",
  "TREASURY_PUBLIC_KEY",
  "ADMIN_SECRET",
];

const missingEnvVars = REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
if (missingEnvVars.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvVars.join(", ")}`);
  process.exit(1);
}

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`liber-backend listening on :${info.port}`);
});
