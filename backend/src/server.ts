import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const port = Number(process.env.PORT ?? 3001);
serve({ fetch: createApp().fetch, port }, (info) => {
  console.log(`liber-backend listening on :${info.port}`);
});
