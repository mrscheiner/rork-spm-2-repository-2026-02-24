import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { cors } from "hono/cors";

import { appRouter } from "./trpc/app-router";
import { createContext } from "./trpc/create-context";

const app = new Hono();

// Note: Console logs removed for Cloudflare Workers compatibility
// process.env is not available in Workers - use c.env instead if needed

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type", "Authorization"],
}));


app.use(
  "/api/trpc/*",
  trpcServer({
    endpoint: "/api/trpc",
    router: appRouter,
    createContext,
  }),
);

// Custom REST endpoint for ESPN schedule fetch
app.get("/api/espn/schedule", async (c) => {
  try {
    const params = c.req.query();
    // Accept both query and JSON body
    let input = params.input;
    if (!input && c.req.header("content-type") === "application/json") {
      input = (await c.req.json()).input;
    }
    let parsed;
    try {
      parsed = typeof input === "string" ? JSON.parse(input) : input;
    } catch (e) {
      return c.json({ error: "Invalid input format", details: e?.message }, 400);
    }
    // Log input for debugging
    console.log("[REST ESPN schedule] input:", parsed);
    // Import ESPN fetch logic
    const { getFullScheduleREST } = await import("./trpc/routes/espn-rest");
    const result = await getFullScheduleREST(parsed);
    return c.json({ result });
  } catch (err) {
    return c.json({ error: "REST ESPN schedule error", details: err?.message || err }, 500);
  }
});

app.get("/", (c) => {
  return c.json({ status: "ok", message: "API is running", timestamp: new Date().toISOString() });
});

export default app;
