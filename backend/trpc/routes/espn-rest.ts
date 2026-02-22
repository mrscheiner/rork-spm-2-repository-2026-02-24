// Custom REST ESPN schedule fetch logic
import { ESPN_LEAGUE_CONFIG } from "./espn";

export async function getFullScheduleREST(input: any) {
  // Accepts input: { leagueId, teamId, teamName, teamAbbreviation }
  const { leagueId, teamId, teamName, teamAbbreviation } = input || {};
  if (!leagueId || !teamId) {
    return { error: "Missing leagueId or teamId" };
  }
  const config = ESPN_LEAGUE_CONFIG[leagueId];
  if (!config) {
    return { error: "Unknown leagueId" };
  }
  // Build ESPN API URL
  const url = `https://site.api.espn.com/apis/site/v2/sports/${config.sport}/${config.league}/teams/${teamId}/schedule`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      return { error: `ESPN API error: ${resp.status}` };
    }
    const data = await resp.json();
    return { schedule: data }; // Return full ESPN response
  } catch (err) {
    return { error: "Fetch error", details: err?.message || err };
  }
}
