import { createTRPCRouter } from "./create-context";
import { espnRouter } from "./routes/espn";
import { ticketmasterRouter } from "./routes/ticketmaster";

export const appRouter = createTRPCRouter({
  espn: espnRouter,
  ticketmaster: ticketmasterRouter,
});

export type AppRouter = typeof appRouter;
