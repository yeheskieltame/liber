import { Hono } from "hono";
import { cors } from "hono/cors";
import { usersRoute } from "./routes/users.js";
import { balanceRoute } from "./routes/balance.js";
import { historyRoute } from "./routes/history.js";
import { quoteRoute } from "./routes/quote.js";
import { scansRoute } from "./routes/scans.js";
import { topupsRoute } from "./routes/topups.js";

const LOCALHOST_FALLBACK = "http://localhost:3000";

function splitAndCleanOrigins(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function parseFrontendOrigins(raw: string | undefined): string[] {
  const origins = splitAndCleanOrigins(raw);
  return origins.length > 0 ? origins : [LOCALHOST_FALLBACK];
}

export function didFallBackToLocalhost(raw: string | undefined): boolean {
  return splitAndCleanOrigins(raw).length === 0;
}

export function createApp() {
  const app = new Hono();
  const origins = parseFrontendOrigins(process.env.FRONTEND_ORIGINS);
  if (didFallBackToLocalhost(process.env.FRONTEND_ORIGINS)) {
    console.warn(
      `[app] FRONTEND_ORIGINS was empty or unset; falling back to ${LOCALHOST_FALLBACK}. Set FRONTEND_ORIGINS explicitly in production.`
    );
  }
  console.log("[app] CORS allowed origins:", origins.join(", "));

  app.use(
    "*",
    cors({
      origin: origins,
    }),
  );
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", usersRoute);
  app.route("/", balanceRoute);
  app.route("/", historyRoute);
  app.route("/", quoteRoute);
  app.route("/", scansRoute);
  app.route("/", topupsRoute);
  return app;
}
