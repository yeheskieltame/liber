import { Hono } from "hono";
import { cors } from "hono/cors";
import { usersRoute } from "./routes/users.js";
import { balanceRoute } from "./routes/balance.js";
import { historyRoute } from "./routes/history.js";
import { quoteRoute } from "./routes/quote.js";
import { scansRoute } from "./routes/scans.js";
import { topupsRoute } from "./routes/topups.js";

const LOCALHOST_FALLBACK = "http://localhost:3000";

export function parseFrontendOrigins(raw: string | undefined): string[] {
  const origins = (raw ?? "")
    .split(",")
    .map((entry) => entry.trim().replace(/\/$/, ""))
    .filter(Boolean);
  return origins.length > 0 ? origins : [LOCALHOST_FALLBACK];
}

export function createApp() {
  const app = new Hono();
  const origins = parseFrontendOrigins(process.env.FRONTEND_ORIGINS);
  if (origins.length === 1 && origins[0] === LOCALHOST_FALLBACK && process.env.FRONTEND_ORIGINS !== LOCALHOST_FALLBACK) {
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
