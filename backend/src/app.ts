import { Hono } from "hono";
import { ordersRoute } from "./routes/orders.js";
import { webhooksRoute } from "./routes/webhooks.js";
import { usersRoute } from "./routes/users.js";
import { balanceRoute } from "./routes/balance.js";
import { historyRoute } from "./routes/history.js";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", ordersRoute);
  app.route("/", webhooksRoute);
  app.route("/", usersRoute);
  app.route("/", balanceRoute);
  app.route("/", historyRoute);
  return app;
}
