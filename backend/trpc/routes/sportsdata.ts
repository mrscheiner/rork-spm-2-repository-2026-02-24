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
    .query(async ({ input }) => {
      const key = typeof process !== "undefined" ? process.env.SPORTSDATA_API_KEY : undefined;
      if (!key) {
        console.log("[SD_PROXY] missing SPORTS_DATA_API_KEY");
        return { events: [], error: "API_KEY_MISSING" };
      }

      // parse input and support GET-query patch below
      let patchedInput: any = input;
      if (!input || typeof input !== "object") {
        try {
          if (typeof globalThis !== "undefined" && (globalThis as any).request) {
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
      if (!patchedInput || typeof patchedInput !== "object" || !patchedInput.leagueId || !patchedInput.teamId) {
        console.log("[SD_PROXY] INVALID_INPUT", patchedInput);
        return { events: [], error: "INVALID_INPUT" };
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
        // handle manual GET requests where tRPC input may be undefined
        let patchedInput: any = input;
        if (!input || typeof input !== "object") {
          try {
            if (typeof globalThis !== "undefined" && (globalThis as any).request) {
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
        if (!patchedInput || typeof patchedInput !== "object" || !patchedInput.leagueId || !patchedInput.teamId) {
          console.log("[SD_PROXY] INVALID_INPUT", patchedInput);
          return { events: [], error: "INVALID_INPUT" };
        }
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
