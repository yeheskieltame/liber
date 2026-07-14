import { Hono } from "hono";
import { ordersRoute } from "./routes/orders.js";
import { webhooksRoute } from "./routes/webhooks.js";
import { usersRoute } from "./routes/users.js";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", ordersRoute);
  app.route("/", webhooksRoute);
  app.route("/", usersRoute);
  return app;
}
