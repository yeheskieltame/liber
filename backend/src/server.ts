import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { pollBridgingOrders } from "./bridge/poller.js";

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`liber-backend listening on :${info.port}`);
});

setInterval(() => {
  pollBridgingOrders().catch((err) => console.error("bridge poll failed", err));
}, 60_000);
