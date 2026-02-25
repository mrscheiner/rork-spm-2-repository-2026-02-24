import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

// map our league ids to sportsdata API path segment
const SPORTSDATA_PATH: Record<string, string> = {
  nba: "nba",
  nhl: "nhl",
  nfl: "nfl",
  mlb: "mlb",
  mls: "mls",
};

// season computation reused from espn.ts? we can import or duplicate minimal logic
function getSeasonForLeague(leagueId: string): number {
  // very simple: use current year or year+1 for two-year seasons
  const now = new Date();
  const year = now.getFullYear();
  switch (leagueId.toLowerCase()) {
    case "nba":
    case "nhl":
      // if current month >= 6, season is next calendar year
      return now.getMonth() >= 6 ? year + 1 : year;
    case "nfl":
      // nfl uses start year
      return year;
    default:
      return year;
  }
}

export const sportsdataRouter = createTRPCRouter({
  // returns league-wide games filtered to the given team
  getSchedule: publicProcedure
    .input(
      z.object({
        leagueId: z.string(),
        teamId: z.string(), // abbreviation, e.g. mil, bos
      }).optional()
    )
    .query(async ({ input, ctx }) => {
      console.log("[SD_PROXY] handler invoked", { input, hasCtx: !!ctx });
      // if the input object is empty we still need to attempt to patch from URL
      if (input && typeof input === 'object' && Object.keys(input).length === 0) {
        console.log('[SD_PROXY] received empty input object, will try to patch from URL');
      }
      if (typeof globalThis !== "undefined") {
        console.log("[SD_PROXY] globalThis.request exists?", !!(globalThis as any).request);
        if ((globalThis as any).request) {
          console.log("[SD_PROXY] globalThis.request.url", (globalThis as any).request.url);
        }
      }
      // first try to read from context env (Cloudflare binding)
      let key: string | undefined;
      if (ctx?.env && ctx.env.SPORTSDATA_API_KEY) {
        key = ctx.env.SPORTSDATA_API_KEY;
        console.log("[SD_PROXY] using key from ctx.env");
      } else if (typeof process !== "undefined" && process.env.SPORTSDATA_API_KEY) {
        key = process.env.SPORTSDATA_API_KEY;
        console.log("[SD_PROXY] using key from process.env");
      } else if (typeof globalThis !== "undefined" && (globalThis as any).SPORTSDATA_API_KEY) {
        key = (globalThis as any).SPORTSDATA_API_KEY;
        console.log("[SD_PROXY] using key from globalThis");
      }
      console.log("[SD_PROXY] key lookup", { fromCtx: !!(ctx?.env && ctx.env.SPORTSDATA_API_KEY), fromProcess: !!(typeof process !== "undefined" && process.env.SPORTSDATA_API_KEY), fromGlobal: !!(typeof globalThis !== "undefined" && (globalThis as any).SPORTSDATA_API_KEY) });
      if (!key) {
        console.log("[SD_PROXY] missing SPORTS_DATA_API_KEY");
        return { events: [], error: "API_KEY_MISSING" };
      }

      // parse input from either the supplied object or the raw request URL
      let patchedInput: any = input;
      // sometimes tRPC passes the JSON string itself instead of parsing it
      // (especially on GET).  Try to coerce before doing anything else.
      if (typeof patchedInput === 'string') {
        try {
          patchedInput = JSON.parse(patchedInput);
          console.log('[SD_PROXY] parsed input string into object');
        } catch {
          // keep original value if parsing fails
        }
      }
      // if input object is missing, non-object, or empty, attempt to read query
      // string ourselves.  tRPC occasionally supplies {} for GET, so we can't
      // rely solely on !patchedInput.
      const needsPatch =
        !patchedInput ||
        typeof patchedInput !== "object" ||
        Object.keys(patchedInput).length === 0 ||
        !patchedInput.leagueId ||
        !patchedInput.teamId;
      if (needsPatch) {
        try {
          // first try context request URL (tRPC attaches req to ctx)
          if (ctx && ctx.req && (ctx.req as any).url) {
            console.log("[SD_PROXY] parsing input from ctx.req.url", (ctx.req as any).url);
            const url = new URL((ctx.req as any).url);
            const inp = url.searchParams.get("input");
            if (inp) {
              patchedInput = JSON.parse(inp);
            }
          } else if (typeof globalThis !== "undefined" && (globalThis as any).request) {
            // fallback to globalThis.request for other environments
            const url = new URL((globalThis as any).request.url);
            const inp = url.searchParams.get("input");
            if (inp) {
              patchedInput = JSON.parse(inp);
            }
          }
        } catch (e) {
          console.log("[SD_PROXY] PATCH input parse error", e);
        }
      }
      console.log('[SD_PROXY] patchedInput after parse', patchedInput);
      if (!patchedInput || typeof patchedInput !== "object" || !patchedInput.leagueId || !patchedInput.teamId) {
        console.log("[SD_PROXY] INVALID_INPUT", patchedInput);
        const globalInfo: any = { globalThis: typeof globalThis !== 'undefined' };
        if (typeof globalThis !== 'undefined' && (globalThis as any).request) {
          globalInfo.requestUrl = (globalThis as any).request.url;
        }
        const ctxInfo: any = {};
        if (ctx && ctx.req) {
          ctxInfo.url = (ctx.req as any).url || null;
          ctxInfo.headers = (ctx.req as any).headers ? [...(ctx.req as any).headers] : null;
        }
        return { events: [], error: "INVALID_INPUT", debug: { patchedInput, globalInfo, ctxInfo } } as any;
      }

      const leagueKey = patchedInput.leagueId.toLowerCase();
      const path = SPORTSDATA_PATH[leagueKey];
      if (!path) {
        console.log("[SD_PROXY] unsupported league", leagueKey);
        return { events: [], error: "UNSUPPORTED_LEAGUE" };
      }

      const season = getSeasonForLeague(leagueKey);
      const url = `https://api.sportsdata.io/v3/${path}/scores/json/Games/${season}?key=${key}`;
      console.log("[SD_PROXY] Fetching", url);
      let res: Response;
      try {
        res = await fetch(url);
      } catch (e: any) {
        console.error("[SD_PROXY] fetch failed", e);
        return { events: [], error: "NETWORK" };
      }
      if (!res.ok) {
        console.error("[SD_PROXY] HTTP", res.status);
        return { events: [], error: `HTTP_${res.status}` };
      }

      try {
        const data: any[] = await res.json();
        // we've already parsed and validated `patchedInput` above, so reuse it
        const abbrev = patchedInput.teamId.toUpperCase();
        // only keep home games; away games are irrelevant for season passes
        const games = data
          .filter(g => g.HomeTeam === abbrev)
          .map((g, idx) => {
            const eventDate = new Date(g.DateTime || g.Day);
            const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
            const opponent = g.HomeTeam === abbrev ? g.AwayTeam : g.HomeTeam;
            const isHome = g.HomeTeam === abbrev;
            let type: "Preseason" | "Regular" | "Playoff" = "Regular";
            if (g.SeasonType === 0) type = "Preseason";
            else if (g.SeasonType === 2) type = "Playoff";

            return {
              id: `sd_${leagueKey}_${abbrev}_${g.GameID}`,
              date: `${monthNames[eventDate.getMonth()]} ${eventDate.getDate()}`,
              month: monthNames[eventDate.getMonth()],
              day: String(eventDate.getDate()),
              opponent,
              opponentLogo: undefined,
              venueName: g.Stadium || undefined,
              time: eventDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
              ticketStatus: "Available",
              isPaid: false,
              gameNumber: idx + 1,
              type,
              dateTimeISO: eventDate.toISOString(),
              isHome,
            };
          });
        console.log("[SD_PROXY] mapped", games.length, "home games (away games discarded)");
        return { events: games, error: null };
      } catch (e: any) {
        console.error("[SD_PROXY] parse error", e);
        return { events: [], error: "PARSE_ERROR" };
      }
    }),
});
