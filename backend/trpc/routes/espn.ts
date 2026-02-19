import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

const ESPN_LEAGUE_CONFIG: Record<string, { sport: string; league: string }> = {
  nba: { sport: "basketball", league: "nba" },
  nhl: { sport: "hockey", league: "nhl" },
  nfl: { sport: "football", league: "nfl" },
  mlb: { sport: "baseball", league: "mlb" },
  mls: { sport: "soccer", league: "usa.1" },
  wnba: { sport: "basketball", league: "wnba" },
  epl: { sport: "soccer", league: "eng.1" },
  ipl: { sport: "cricket", league: "ipl" },
};

const ESPN_SITE_BASE = "https://site.api.espn.com/apis/site/v2";

const TEAM_LOGO_FALLBACKS: Record<string, string> = {
  "boston bruins": "https://a.espncdn.com/i/teamlogos/nhl/500/bos.png",
  "florida panthers": "https://a.espncdn.com/i/teamlogos/nhl/500/fla.png",
  "toronto maple leafs": "https://a.espncdn.com/i/teamlogos/nhl/500/tor.png",
  "montreal canadiens": "https://a.espncdn.com/i/teamlogos/nhl/500/mtl.png",
  "tampa bay lightning": "https://a.espncdn.com/i/teamlogos/nhl/500/tb.png",
  "detroit red wings": "https://a.espncdn.com/i/teamlogos/nhl/500/det.png",
  "buffalo sabres": "https://a.espncdn.com/i/teamlogos/nhl/500/buf.png",
  "ottawa senators": "https://a.espncdn.com/i/teamlogos/nhl/500/ott.png",
  "new york rangers": "https://a.espncdn.com/i/teamlogos/nhl/500/nyr.png",
  "new york islanders": "https://a.espncdn.com/i/teamlogos/nhl/500/nyi.png",
  "new jersey devils": "https://a.espncdn.com/i/teamlogos/nhl/500/njd.png",
  "philadelphia flyers": "https://a.espncdn.com/i/teamlogos/nhl/500/phi.png",
  "pittsburgh penguins": "https://a.espncdn.com/i/teamlogos/nhl/500/pit.png",
  "washington capitals": "https://a.espncdn.com/i/teamlogos/nhl/500/wsh.png",
  "carolina hurricanes": "https://a.espncdn.com/i/teamlogos/nhl/500/car.png",
  "columbus blue jackets": "https://a.espncdn.com/i/teamlogos/nhl/500/cbj.png",
  "chicago blackhawks": "https://a.espncdn.com/i/teamlogos/nhl/500/chi.png",
  "st. louis blues": "https://a.espncdn.com/i/teamlogos/nhl/500/stl.png",
  "nashville predators": "https://a.espncdn.com/i/teamlogos/nhl/500/nsh.png",
  "dallas stars": "https://a.espncdn.com/i/teamlogos/nhl/500/dal.png",
  "minnesota wild": "https://a.espncdn.com/i/teamlogos/nhl/500/min.png",
  "winnipeg jets": "https://a.espncdn.com/i/teamlogos/nhl/500/wpg.png",
  "colorado avalanche": "https://a.espncdn.com/i/teamlogos/nhl/500/col.png",
  "arizona coyotes": "https://a.espncdn.com/i/teamlogos/nhl/500/ari.png",
  "utah hockey club": "https://a.espncdn.com/i/teamlogos/nhl/500/uta.png",
  "vegas golden knights": "https://a.espncdn.com/i/teamlogos/nhl/500/vgk.png",
  "seattle kraken": "https://a.espncdn.com/i/teamlogos/nhl/500/sea.png",
  "los angeles kings": "https://a.espncdn.com/i/teamlogos/nhl/500/la.png",
  "san jose sharks": "https://a.espncdn.com/i/teamlogos/nhl/500/sj.png",
  "anaheim ducks": "https://a.espncdn.com/i/teamlogos/nhl/500/ana.png",
  "calgary flames": "https://a.espncdn.com/i/teamlogos/nhl/500/cgy.png",
  "edmonton oilers": "https://a.espncdn.com/i/teamlogos/nhl/500/edm.png",
  "vancouver canucks": "https://a.espncdn.com/i/teamlogos/nhl/500/van.png",
};

function getESPNTeamLogoUrl(leagueId: string, teamAbbr: string): string {
  const abbr = teamAbbr.toLowerCase();
  switch (leagueId.toLowerCase()) {
    case 'nhl':
      return `https://a.espncdn.com/i/teamlogos/nhl/500/${abbr}.png`;
    case 'nba':
      return `https://a.espncdn.com/i/teamlogos/nba/500/${abbr}.png`;
    case 'nfl':
      return `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr}.png`;
    case 'mlb':
      return `https://a.espncdn.com/i/teamlogos/mlb/500/${abbr}.png`;
    case 'mls':
      return `https://a.espncdn.com/i/teamlogos/soccer/500/${abbr}.png`;
    default:
      return `https://a.espncdn.com/i/teamlogos/${leagueId.toLowerCase()}/500/${abbr}.png`;
  }
}

function getSeasonYears(leagueId: string): { season: number; seasonType?: number; altSeason?: number; additionalSeasons?: number[] } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (leagueId.toLowerCase()) {
    case 'nhl':
    case 'nba':
      // Season spans two calendar years (Oct-June)
      // ESPN uses the END year for the season parameter
      // e.g., 2025-2026 season = season=2026
      if (month >= 6) {
        // July-Dec: upcoming season (next year)
        return { season: year + 1, altSeason: year };
      }
      // Jan-June: current season (this year)
      return { season: year, altSeason: year + 1 };

    case 'nfl':
      // NFL season: Aug-Feb (Super Bowl in Feb)
      // ESPN uses the START year for NFL season parameter
      // e.g., 2025-2026 season (Aug 2025 - Feb 2026) = season=2025
      // CRITICAL: Always provide altSeason for NFL to ensure schedule is found
      if (month <= 1) {
        // Jan-Feb: playoffs/Super Bowl - try previous year first, then current
        // Also try without season param as additional fallback
        return { season: year - 1, altSeason: year, additionalSeasons: [year - 2] };
      }
      if (month >= 2 && month <= 7) {
        // March-July: off-season, show upcoming season
        return { season: year, altSeason: year - 1 };
      }
      // Aug-Dec: current season, with previous year as fallback
      return { season: year, altSeason: year - 1 };

    case 'mlb':
      // MLB: Spring Training Feb, Regular Season Apr-Oct, Postseason Oct-Nov
      // Single calendar year season
      if (month <= 1) {
        // Jan-Feb: off-season, but spring training may start
        // Try current year first (spring training), fallback to previous year
        return { season: year, altSeason: year - 1 };
      }
      if (month >= 11) {
        // Dec: off-season, show next year's upcoming schedule if available
        return { season: year + 1, altSeason: year };
      }
      // Mar-Nov: current season
      return { season: year, altSeason: year - 1 };

    case 'mls':
      // MLS: Feb-Dec
      // Single calendar year season
      if (month <= 1) {
        // Jan-Feb: off-season or preseason
        // Try current year first, fallback to previous year
        return { season: year, altSeason: year - 1 };
      }
      // Mar-Dec: current season
      return { season: year, altSeason: year - 1 };

    default:
      return { season: year, altSeason: year - 1 };
  }
}

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[ESPN Proxy] Fetch error:", err);
    return null;
  }
}

export const espnRouter = createTRPCRouter({
  getTeams: publicProcedure
    .input(z.object({ leagueId: z.string() }))
    .query(async ({ input }) => {
      console.log('[ESPN_PROXY] getTeams HIT - input:', JSON.stringify(input));
      const leagueKey = input.leagueId === "usa.1" ? "mls" : input.leagueId.toLowerCase();
      const cfg = ESPN_LEAGUE_CONFIG[leagueKey];

      if (!cfg) {
        console.log("[ESPN Proxy] No config for league:", input.leagueId);
        return { teams: [], error: "INVALID_LEAGUE" };
      }

      const teamsUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams`;
      console.log("[ESPN Proxy] Fetching teams:", teamsUrl);

      const res = await fetchWithTimeout(teamsUrl, 12000);

      if (!res) {
        return { teams: [], error: "FETCH_FAILED" };
      }

      if (!res.ok) {
        console.log("[ESPN Proxy] Teams fetch failed:", res.status);
        return { teams: [], error: "HTTP_ERROR" };
      }

      try {
        const data: any = await res.json();

        let teams: any[] = [];
        if (data?.sports?.[0]?.leagues?.[0]?.teams) {
          teams = data.sports[0].leagues[0].teams.map((t: any) => t.team).filter(Boolean);
        } else if (data?.teams) {
          teams = data.teams.map((t: any) => t.team).filter(Boolean);
        }

        console.log("[ESPN Proxy] Found", teams.length, "teams");

        const simplifiedTeams = teams.map((t) => ({
          id: String(t.id),
          abbreviation: t.abbreviation,
          displayName: t.displayName,
          shortDisplayName: t.shortDisplayName,
          name: t.name,
        }));

        return { teams: simplifiedTeams, error: null };
      } catch (e) {
        console.error("[ESPN Proxy] JSON parse error:", e);
        return { teams: [], error: "PARSE_ERROR" };
      }
    }),

  getSchedule: publicProcedure
    .input(
      z.object({
        leagueId: z.string(),
        espnTeamId: z.string(),
      })
    )
    .query(async ({ input }) => {
      const leagueKey = input.leagueId === "usa.1" ? "mls" : input.leagueId.toLowerCase();
      const cfg = ESPN_LEAGUE_CONFIG[leagueKey];

      if (!cfg) {
        console.log("[ESPN Proxy] No config for league:", input.leagueId);
        return { schedule: null, error: "INVALID_LEAGUE" };
      }

      const url = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams/${input.espnTeamId}/schedule`;
      console.log("[ESPN Proxy] Fetching schedule:", url);

      const res = await fetchWithTimeout(url, 15000);

      if (!res) {
        return { schedule: null, error: "FETCH_FAILED" };
      }

      if (!res.ok) {
        console.log("[ESPN Proxy] Schedule fetch failed:", res.status);
        return { schedule: null, error: "HTTP_ERROR" };
      }

      try {
        const data = await res.json();
        const eventCount = (data as any)?.events?.length ?? 0;
        console.log("[ESPN Proxy] Schedule fetched - events:", eventCount);
        return { schedule: data, error: null };
      } catch (e) {
        console.error("[ESPN Proxy] JSON parse error:", e);
        return { schedule: null, error: "PARSE_ERROR" };
      }
    }),

  resolveTeamAndGetSchedule: publicProcedure
    .input(
      z.object({
        leagueId: z.string(),
        teamAbbr: z.string().optional(),
        teamName: z.string().optional(),
        storedTeamId: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const { leagueId, teamAbbr, teamName, storedTeamId } = input;
      console.log('[ESPN_PROXY] ========== resolveTeamAndGetSchedule HIT ==========');
      console.log('[ESPN_PROXY] Input:', JSON.stringify(input));
      console.log("[ESPN Proxy] resolveTeamAndGetSchedule:", input);

      if (storedTeamId && /^\d+$/.test(storedTeamId)) {
        console.log("[ESPN Proxy] storedTeamId is numeric:", storedTeamId);
        const leagueKey = leagueId === "usa.1" ? "mls" : leagueId.toLowerCase();
        const cfg = ESPN_LEAGUE_CONFIG[leagueKey];
        console.log('[ESPN_PROXY] leagueKey:', leagueKey, 'cfg:', JSON.stringify(cfg));

        if (!cfg) {
          console.log('[ESPN_PROXY] INVALID_LEAGUE - no config found');
          return { espnTeamId: null, schedule: null, error: "INVALID_LEAGUE" };
        }

        const url = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams/${storedTeamId}/schedule`;
        console.log('[ESPN_PROXY] Fetching schedule URL:', url);
        const res = await fetchWithTimeout(url, 15000);
        console.log('[ESPN_PROXY] Fetch response:', res ? `status=${res.status}` : 'null (timeout/error)');

        if (!res || !res.ok) {
          console.log('[ESPN_PROXY] SCHEDULE_FETCH_FAILED');
          return { espnTeamId: storedTeamId, schedule: null, error: "SCHEDULE_FETCH_FAILED" };
        }

        try {
          const data = await res.json();
          const eventCount = (data as any)?.events?.length ?? 0;
          console.log('[ESPN_PROXY] Schedule parsed successfully - events:', eventCount);
          return { espnTeamId: storedTeamId, schedule: data, error: null };
        } catch (e) {
          console.log('[ESPN_PROXY] PARSE_ERROR:', e);
          return { espnTeamId: storedTeamId, schedule: null, error: "PARSE_ERROR" };
        }
      }

      console.log('[ESPN_PROXY] storedTeamId is not numeric, need to resolve team...');
      const leagueKey = leagueId === "usa.1" ? "mls" : leagueId.toLowerCase();
      const cfg = ESPN_LEAGUE_CONFIG[leagueKey];
      console.log('[ESPN_PROXY] leagueKey:', leagueKey, 'cfg:', JSON.stringify(cfg));

      if (!cfg) {
        console.log('[ESPN_PROXY] INVALID_LEAGUE - no config found');
        return { espnTeamId: null, schedule: null, error: "INVALID_LEAGUE" };
      }

      const teamsUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams`;
      console.log("[ESPN Proxy] Fetching teams to resolve:", teamsUrl);

      const teamsRes = await fetchWithTimeout(teamsUrl, 12000);
      console.log('[ESPN_PROXY] Teams fetch response:', teamsRes ? `status=${teamsRes.status}` : 'null (timeout/error)');

      if (!teamsRes || !teamsRes.ok) {
        console.log('[ESPN_PROXY] TEAMS_FETCH_FAILED');
        return { espnTeamId: null, schedule: null, error: "TEAMS_FETCH_FAILED" };
      }

      let teams: any[] = [];
      try {
        const data: any = await teamsRes.json();
        if (data?.sports?.[0]?.leagues?.[0]?.teams) {
          teams = data.sports[0].leagues[0].teams.map((t: any) => t.team).filter(Boolean);
        } else if (data?.teams) {
          teams = data.teams.map((t: any) => t.team).filter(Boolean);
        }
      } catch {
        return { espnTeamId: null, schedule: null, error: "TEAMS_PARSE_ERROR" };
      }

      console.log("[ESPN Proxy] Teams found:", teams.length);

      const norm = (s?: string) => (s ?? "").trim().toLowerCase();
      const wantedAbbr = norm(teamAbbr);
      const wantedName = norm(teamName);

      console.log('[ESPN_PROXY] Looking for team - abbr:', wantedAbbr, 'name:', wantedName);
      const match =
        teams.find((t) => norm(t?.abbreviation) === wantedAbbr) ||
        teams.find((t) => norm(t?.shortDisplayName) === wantedName) ||
        teams.find((t) => norm(t?.displayName) === wantedName) ||
        teams.find((t) => norm(t?.name) === wantedName) ||
        null;

      if (!match?.id) {
        console.log("[ESPN Proxy] Team not found:", { wantedAbbr, wantedName });
        console.log('[ESPN_PROXY] Available teams:', teams.slice(0, 5).map(t => ({ abbr: t.abbreviation, name: t.displayName })));
        return { espnTeamId: null, schedule: null, error: "TEAM_NOT_FOUND" };
      }
      console.log('[ESPN_PROXY] Team matched:', match.id, match.abbreviation, match.displayName);

      const espnTeamId = String(match.id);
      console.log("[ESPN Proxy] Resolved ESPN team ID:", espnTeamId);

      const scheduleUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams/${espnTeamId}/schedule`;
      console.log('[ESPN_PROXY] Fetching schedule URL:', scheduleUrl);
      const scheduleRes = await fetchWithTimeout(scheduleUrl, 15000);
      console.log('[ESPN_PROXY] Schedule fetch response:', scheduleRes ? `status=${scheduleRes.status}` : 'null (timeout/error)');

      if (!scheduleRes || !scheduleRes.ok) {
        console.log('[ESPN_PROXY] SCHEDULE_FETCH_FAILED');
        return { espnTeamId, schedule: null, error: "SCHEDULE_FETCH_FAILED" };
      }

      try {
        const scheduleData = await scheduleRes.json();
        const eventCount = (scheduleData as any)?.events?.length ?? 0;
        console.log("[ESPN Proxy] Schedule fetched - events:", eventCount);
        console.log('[ESPN_PROXY] ========== SUCCESS ==========');
        return { espnTeamId, schedule: scheduleData, error: null };
      } catch (e) {
        console.log('[ESPN_PROXY] SCHEDULE_PARSE_ERROR:', e);
        return { espnTeamId, schedule: null, error: "SCHEDULE_PARSE_ERROR" };
      }
    }),

  getFullSchedule: publicProcedure
    .input(
      z.object({
        leagueId: z.string(),
        teamId: z.string(),
        teamName: z.string(),
        teamAbbreviation: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      console.log('[ESPN_FULL] ========== getFullSchedule START ==========');
      console.log('[ESPN_FULL] Input:', JSON.stringify(input));

      const leagueKey = input.leagueId === "usa.1" ? "mls" : input.leagueId.toLowerCase();
      const cfg = ESPN_LEAGUE_CONFIG[leagueKey];

      if (!cfg) {
        console.log('[ESPN_FULL] INVALID_LEAGUE - no config for:', input.leagueId);
        return { events: [], error: "INVALID_LEAGUE" };
      }

      // First resolve the ESPN team ID
      const teamsUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams`;
      console.log('[ESPN_FULL] Fetching teams from:', teamsUrl);

      const teamsRes = await fetchWithTimeout(teamsUrl, 15000);
      if (!teamsRes || !teamsRes.ok) {
        console.log('[ESPN_FULL] Teams fetch failed');
        return { events: [], error: "TEAMS_FETCH_FAILED" };
      }

      let teams: any[] = [];
      try {
        const data: any = await teamsRes.json();
        if (data?.sports?.[0]?.leagues?.[0]?.teams) {
          teams = data.sports[0].leagues[0].teams.map((t: any) => t.team).filter(Boolean);
        } else if (data?.teams) {
          teams = data.teams.map((t: any) => t.team).filter(Boolean);
        }
      } catch {
        return { events: [], error: "TEAMS_PARSE_ERROR" };
      }

      console.log('[ESPN_FULL] Found', teams.length, 'teams');

      // Find the team - use multiple matching strategies for robustness
      const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      const normSpaces = (s?: string) => (s ?? "").trim().toLowerCase();
      const wantedAbbr = norm(input.teamAbbreviation);
      const wantedName = norm(input.teamName);
      const wantedNameSpaces = normSpaces(input.teamName);
      const wantedTeamId = norm(input.teamId);

      console.log('[ESPN_FULL] Looking for:', { wantedAbbr, wantedName, wantedTeamId });
      console.log('[ESPN_FULL] Available teams sample:', teams.slice(0, 5).map(t => ({
        abbr: t.abbreviation,
        displayName: t.displayName,
        name: t.name
      })));

      // Extract key words from team name for fuzzy matching
      // e.g., "Baltimore Ravens" -> ["baltimore", "ravens"]
      const teamNameWords = wantedNameSpaces.split(/\s+/).filter(w => w.length > 2);
      console.log('[ESPN_FULL] Team name words for fuzzy match:', teamNameWords);

      let match =
        // Exact abbreviation match
        teams.find((t) => norm(t?.abbreviation) === wantedAbbr) ||
        // Exact display name match
        teams.find((t) => norm(t?.displayName) === wantedName) ||
        // Exact short name match
        teams.find((t) => norm(t?.shortDisplayName) === wantedName) ||
        // Exact name match
        teams.find((t) => norm(t?.name) === wantedName) ||
        // Display name contains our name
        teams.find((t) => norm(t?.displayName)?.includes(wantedName)) ||
        // Our name contains their name
        teams.find((t) => wantedName?.includes(norm(t?.name))) ||
        // Fuzzy: any key word from team name matches
        teams.find((t) => {
          const tName = norm(t?.displayName || t?.name || '');
          return teamNameWords.some(word => tName.includes(word));
        }) ||
        // Last resort: city name match (first word of team name often is city)
        teams.find((t) => {
          const tCity = norm(t?.location || '');
          const ourCity = teamNameWords[0] || '';
          return tCity && ourCity && (tCity.includes(ourCity) || ourCity.includes(tCity));
        }) ||
        null;
      
      // Additional NFL-specific matching
      if (!match && leagueKey === 'nfl') {
        console.log('[ESPN_FULL] NFL team not found with standard matching, trying NFL-specific...');
        // Try matching just the team nickname (e.g., "Ravens" from "Baltimore Ravens")
        const nickname = teamNameWords[teamNameWords.length - 1]; // Last word is usually nickname
        match = teams.find((t) => {
          const tName = normSpaces(t?.displayName || t?.name || '');
          return tName.includes(nickname);
        });
        if (match) {
          console.log('[ESPN_FULL] NFL nickname match found:', match.displayName);
        }
      }

      if (!match?.id) {
        console.log('[ESPN_FULL] Team not found. Available:', teams.slice(0, 10).map(t => t.abbreviation));
        return { events: [], error: "TEAM_NOT_FOUND" };
      }

      const espnTeamId = String(match.id);
      const teamAbbr = match.abbreviation || input.teamAbbreviation || '';
      const teamDisplayName = match.displayName || input.teamName;
      console.log('[ESPN_FULL] Matched team:', espnTeamId, teamAbbr, teamDisplayName);

      // Fetch the schedule - try multiple season years to ensure we get data
      const seasonInfo = getSeasonYears(leagueKey);
      console.log('[ESPN_FULL] Season info:', JSON.stringify(seasonInfo));
      console.log('[ESPN_FULL] League:', leagueKey, 'Team:', teamDisplayName, 'ESPN ID:', espnTeamId);
      
      let rawEvents: any[] = [];
      
      // Build list of seasons to try in order
      const seasonsToTry: (number | 'default')[] = [seasonInfo.season];
      if (seasonInfo.altSeason) seasonsToTry.push(seasonInfo.altSeason);
      if (seasonInfo.additionalSeasons) seasonsToTry.push(...seasonInfo.additionalSeasons);
      seasonsToTry.push('default'); // Always try without season param as last resort
      
      console.log('[ESPN_FULL] Seasons to try:', seasonsToTry);
      
      for (const seasonYear of seasonsToTry) {
        if (rawEvents.length > 0) break; // Found events, stop trying
        
        let scheduleUrl: string;
        if (seasonYear === 'default') {
          scheduleUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams/${espnTeamId}/schedule`;
        } else {
          scheduleUrl = `${ESPN_SITE_BASE}/sports/${cfg.sport}/${cfg.league}/teams/${espnTeamId}/schedule?season=${seasonYear}`;
        }
        
        console.log(`[ESPN_FULL] Trying season ${seasonYear}:`, scheduleUrl);
        
        const scheduleRes = await fetchWithTimeout(scheduleUrl, 20000);
        if (scheduleRes && scheduleRes.ok) {
          try {
            const scheduleData = await scheduleRes.json();
            rawEvents = scheduleData?.events || [];
            console.log(`[ESPN_FULL] Season ${seasonYear} returned`, rawEvents.length, 'events');
          } catch (parseErr) {
            console.log(`[ESPN_FULL] Season ${seasonYear} parse failed:`, parseErr);
          }
        } else {
          console.log(`[ESPN_FULL] Season ${seasonYear} fetch failed, status:`, scheduleRes?.status);
        }
      }
      
      if (rawEvents.length === 0) {
        console.log('[ESPN_FULL] No events found after trying all season options');
        return { events: [], error: "NO_SCHEDULE" };
      }
      
      console.log('[ESPN_FULL] Total raw events:', rawEvents.length);

      // Filter to home games only
      const homeEvents = rawEvents.filter((ev: any) => {
        const competitions = ev?.competitions || [];
        if (competitions.length === 0) return true; // Include if no competition data
        
        const comp = competitions[0];
        const competitors = comp?.competitors || [];
        
        // Find our team in competitors
        const ourTeam = competitors.find((c: any) => 
          String(c?.team?.id) === espnTeamId ||
          norm(c?.team?.abbreviation) === norm(teamAbbr)
        );
        
        // Home team has homeAway: "home"
        return ourTeam?.homeAway === 'home';
      });

      console.log('[ESPN_FULL] Filtered to', homeEvents.length, 'home games');

      // Map to our event format
      const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      
      const mappedEvents = homeEvents.map((ev: any, idx: number) => {
        const eventDate = new Date(ev.date);
        const competitions = ev?.competitions || [];
        const comp = competitions[0] || {};
        const competitors = comp?.competitors || [];
        
        // Find opponent (the team that's not us)
        const opponent = competitors.find((c: any) => 
          String(c?.team?.id) !== espnTeamId &&
          norm(c?.team?.abbreviation) !== norm(teamAbbr)
        );
        
        const opponentName = opponent?.team?.displayName || opponent?.team?.shortDisplayName || opponent?.team?.name || ev.name || 'TBD';
        const opponentAbbr = opponent?.team?.abbreviation || '';
        let opponentLogo = opponent?.team?.logo || opponent?.team?.logos?.[0]?.href;
        
        // Fallback logo from ESPN CDN
        if (!opponentLogo && opponentAbbr) {
          opponentLogo = getESPNTeamLogoUrl(leagueKey, opponentAbbr);
        }
        // Additional fallback for known teams
        if (!opponentLogo) {
          const lowerName = opponentName.toLowerCase();
          if (TEAM_LOGO_FALLBACKS[lowerName]) {
            opponentLogo = TEAM_LOGO_FALLBACKS[lowerName];
          }
        }

        const venue = comp?.venue || ev?.venue;
        const venueName = venue?.fullName || venue?.name || '';

        // Determine game type
        let gameType: "Preseason" | "Regular" | "Playoff" = "Regular";
        const seasonType = ev?.seasonType?.type || ev?.season?.type || comp?.seasonType?.type;
        const eventName = (ev.name || ev.shortName || '').toLowerCase();
        
        if (seasonType === 1 || eventName.includes('preseason') || eventName.includes('pre-season') || eventName.includes('exhibition')) {
          gameType = "Preseason";
        } else if (seasonType === 3 || eventName.includes('playoff') || eventName.includes('postseason') || 
                   eventName.includes('stanley cup') || eventName.includes('nba finals') || 
                   eventName.includes('world series') || eventName.includes('super bowl') ||
                   eventName.includes('wild card') || eventName.includes('divisional') ||
                   eventName.includes('conference') || eventName.includes('championship')) {
          gameType = "Playoff";
        }

        return {
          id: `espn_${leagueKey}_${espnTeamId}_${ev.id || idx}`,
          date: `${monthNames[eventDate.getMonth()]} ${eventDate.getDate()}`,
          month: monthNames[eventDate.getMonth()],
          day: String(eventDate.getDate()),
          opponent: opponentName,
          opponentLogo: opponentLogo || undefined,
          venueName: venueName || undefined,
          time: eventDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
          ticketStatus: "Available",
          isPaid: false,
          gameNumber: idx + 1,
          type: gameType,
          dateTimeISO: eventDate.toISOString(),
        };
      });

      // Sort by date
      mappedEvents.sort((a, b) => new Date(a.dateTimeISO).getTime() - new Date(b.dateTimeISO).getTime());
      
      // Re-number after sorting
      mappedEvents.forEach((ev, idx) => {
        ev.gameNumber = idx + 1;
      });

      console.log('[ESPN_FULL] ✅ Returning', mappedEvents.length, 'home games');
      console.log('[ESPN_FULL] ========== SUCCESS ==========');

      return { events: mappedEvents, error: null };
    }),
});
