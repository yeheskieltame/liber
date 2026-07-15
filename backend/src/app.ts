import { Hono } from "hono";
import { cors } from "hono/cors";
import { usersRoute } from "./routes/users.js";
import { balanceRoute } from "./routes/balance.js";
import { historyRoute } from "./routes/history.js";
import { quoteRoute } from "./routes/quote.js";
import { scansRoute } from "./routes/scans.js";
import { topupsRoute } from "./routes/topups.js";

export function createApp() {
  const app = new Hono();
  app.use(
    "*",
    cors({
      origin: (process.env.FRONTEND_ORIGINS ?? "http://localhost:3000").split(","),
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
