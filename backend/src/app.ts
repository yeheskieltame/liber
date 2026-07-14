import { Hono } from "hono";
import { ordersRoute } from "./routes/orders.js";
import { webhooksRoute } from "./routes/webhooks.js";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", ordersRoute);
  app.route("/", webhooksRoute);
  return app;
}
