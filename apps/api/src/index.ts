import { serve } from "@hono/node-server";
import { startWorker } from "./agents/creative-direction/index.js";
import { createApp } from "./app.js";
import { env } from "./config/index.js";

const app = createApp();

serve(
  {
    fetch: app.fetch,
    port: env.PORT,
  },
  (info) => {
    console.log(`Server is running on http://localhost:${info.port}`);
  },
);

// F7: in-process background worker advances runs through the pipeline.
startWorker();
