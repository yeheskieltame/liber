import { Hono } from "hono";
import { ordersRoute } from "./routes/orders.js";

export function createApp() {
  const app = new Hono();
  app.get("/health", (c) => c.json({ status: "ok" }));
  app.route("/", ordersRoute);
  return app;
}
