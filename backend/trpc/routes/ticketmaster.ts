import * as z from "zod";
import { createTRPCRouter, publicProcedure } from "../create-context";

const TICKETMASTER_BASE = "https://app.ticketmaster.com/discovery/v2";

function getSeasonDateRange(leagueId: string): { startDateTime: string; endDateTime: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (leagueId.toLowerCase()) {
    case 'nhl':
      // NHL season: October to June (next year)
      // Include preseason starting in September
      if (month >= 6 && month < 9) {
        // July-Sept: upcoming season
        return {
          startDateTime: `${year}-09-01T00:00:00Z`,
          endDateTime: `${year + 1}-06-30T23:59:59Z`,
        };
      } else if (month >= 9) {
        // Oct-Dec: current season
        return {
          startDateTime: `${year}-09-01T00:00:00Z`,
          endDateTime: `${year + 1}-06-30T23:59:59Z`,
        };
      } else {
        // Jan-June: current season (started previous year)
        return {
          startDateTime: `${year - 1}-09-01T00:00:00Z`,
          endDateTime: `${year}-06-30T23:59:59Z`,
        };
      }

    case 'nba':
      // NBA season: October to June (next year)
      if (month >= 6 && month < 9) {
        return {
          startDateTime: `${year}-09-01T00:00:00Z`,
          endDateTime: `${year + 1}-06-30T23:59:59Z`,
        };
      } else if (month >= 9) {
        return {
          startDateTime: `${year}-09-01T00:00:00Z`,
          endDateTime: `${year + 1}-06-30T23:59:59Z`,
        };
      } else {
        return {
          startDateTime: `${year - 1}-09-01T00:00:00Z`,
          endDateTime: `${year}-06-30T23:59:59Z`,
        };
      }

    case 'nfl':
      // NFL season: August (preseason) to February (Super Bowl)
      // CRITICAL: In Jan-Feb, we're still in the previous year's season
      if (month <= 1) {
        // Jan-Feb: playoffs/Super Bowl of previous year's season
        return {
          startDateTime: `${year - 1}-08-01T00:00:00Z`,
          endDateTime: `${year}-02-28T23:59:59Z`,
        };
      } else if (month >= 2 && month < 7) {
        // March-July: off-season, show upcoming season AND previous for reference
        return {
          startDateTime: `${year}-08-01T00:00:00Z`,
          endDateTime: `${year + 1}-02-28T23:59:59Z`,
        };
      } else {
        // Aug-Dec: current season
        return {
          startDateTime: `${year}-08-01T00:00:00Z`,
          endDateTime: `${year + 1}-02-28T23:59:59Z`,
        };
      }

    case 'mlb':
      // MLB season: February (spring training) to November (World Series)
      // In Jan-Feb, show previous year's completed season OR upcoming spring training
      if (month <= 1) {
        // Jan-Feb: off-season - show previous year (completed) and upcoming spring training
        // Ticketmaster typically shows upcoming events, so use current year
        return {
          startDateTime: `${year}-02-01T00:00:00Z`,
          endDateTime: `${year}-11-30T23:59:59Z`,
        };
      } else if (month >= 11) {
        // Nov-Dec: show next season
        return {
          startDateTime: `${year + 1}-02-01T00:00:00Z`,
          endDateTime: `${year + 1}-11-30T23:59:59Z`,
        };
      } else {
        // Mar-Oct: current season
        return {
          startDateTime: `${year}-02-01T00:00:00Z`,
          endDateTime: `${year}-11-30T23:59:59Z`,
        };
      }

    case 'mls':
      // MLS season: February to December
      // In Jan, show upcoming season
      if (month <= 1) {
        // Jan-Feb: show current year's upcoming season
        return {
          startDateTime: `${year}-02-01T00:00:00Z`,
          endDateTime: `${year}-12-31T23:59:59Z`,
        };
      }
      // Mar-Dec: current season
      return {
        startDateTime: `${year}-02-01T00:00:00Z`,
        endDateTime: `${year}-12-31T23:59:59Z`,
      };

    default:
      // Default: 1 year from now
      return {
        startDateTime: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z',
        endDateTime: new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('.')[0] + 'Z',
      };
  }
}

const LEAGUE_SEGMENT_MAP: Record<string, { segmentId: string; genreId?: string }> = {
  nhl: { segmentId: "KZFzniwnSyZfZ7v7nE", genreId: "KnvZfZ7vAdA" },
  nba: { segmentId: "KZFzniwnSyZfZ7v7nE", genreId: "KnvZfZ7vAde" },
  nfl: { segmentId: "KZFzniwnSyZfZ7v7nE", genreId: "KnvZfZ7vAdE" },
  mlb: { segmentId: "KZFzniwnSyZfZ7v7nE", genreId: "KnvZfZ7vAdv" },
  mls: { segmentId: "KZFzniwnSyZfZ7v7nE", genreId: "KnvZfZ7vAAv" },
};

const TEAM_VENUE_MAP: Record<string, { venueKeyword?: string; teamKeyword: string; city?: string }> = {
  // NHL Teams
  "fla": { teamKeyword: "Florida Panthers", venueKeyword: "Amerant Bank Arena", city: "Sunrise" },
  "ana": { teamKeyword: "Anaheim Ducks", venueKeyword: "Honda Center", city: "Anaheim" },
  "ari": { teamKeyword: "Utah Hockey Club", venueKeyword: "Delta Center", city: "Salt Lake City" },
  "bos": { teamKeyword: "Boston Bruins", venueKeyword: "TD Garden", city: "Boston" },
  "buf": { teamKeyword: "Buffalo Sabres", venueKeyword: "KeyBank Center", city: "Buffalo" },
  "cgy": { teamKeyword: "Calgary Flames", venueKeyword: "Scotiabank Saddledome", city: "Calgary" },
  "car": { teamKeyword: "Carolina Hurricanes", venueKeyword: "PNC Arena", city: "Raleigh" },
  "chi": { teamKeyword: "Chicago Blackhawks", venueKeyword: "United Center", city: "Chicago" },
  "col": { teamKeyword: "Colorado Avalanche", venueKeyword: "Ball Arena", city: "Denver" },
  "cbj": { teamKeyword: "Columbus Blue Jackets", venueKeyword: "Nationwide Arena", city: "Columbus" },
  "dal": { teamKeyword: "Dallas Stars", venueKeyword: "American Airlines Center", city: "Dallas" },
  "det": { teamKeyword: "Detroit Red Wings", venueKeyword: "Little Caesars Arena", city: "Detroit" },
  "edm": { teamKeyword: "Edmonton Oilers", venueKeyword: "Rogers Place", city: "Edmonton" },
  "lak": { teamKeyword: "Los Angeles Kings", venueKeyword: "Crypto.com Arena", city: "Los Angeles" },
  "min": { teamKeyword: "Minnesota Wild", venueKeyword: "Xcel Energy Center", city: "Saint Paul" },
  "mtl": { teamKeyword: "Montreal Canadiens", venueKeyword: "Bell Centre", city: "Montreal" },
  "nsh": { teamKeyword: "Nashville Predators", venueKeyword: "Bridgestone Arena", city: "Nashville" },
  "njd": { teamKeyword: "New Jersey Devils", venueKeyword: "Prudential Center", city: "Newark" },
  "nyi": { teamKeyword: "New York Islanders", venueKeyword: "UBS Arena", city: "Elmont" },
  "nyr": { teamKeyword: "New York Rangers", venueKeyword: "Madison Square Garden", city: "New York" },
  "ott": { teamKeyword: "Ottawa Senators", venueKeyword: "Canadian Tire Centre", city: "Ottawa" },
  "phi": { teamKeyword: "Philadelphia Flyers", venueKeyword: "Wells Fargo Center", city: "Philadelphia" },
  "pit": { teamKeyword: "Pittsburgh Penguins", venueKeyword: "PPG Paints Arena", city: "Pittsburgh" },
  "sjs": { teamKeyword: "San Jose Sharks", venueKeyword: "SAP Center", city: "San Jose" },
  "sea": { teamKeyword: "Seattle Kraken", venueKeyword: "Climate Pledge Arena", city: "Seattle" },
  "stl": { teamKeyword: "St. Louis Blues", venueKeyword: "Enterprise Center", city: "St. Louis" },
  "tbl": { teamKeyword: "Tampa Bay Lightning", venueKeyword: "Amalie Arena", city: "Tampa" },
  "tor": { teamKeyword: "Toronto Maple Leafs", venueKeyword: "Scotiabank Arena", city: "Toronto" },
  "van": { teamKeyword: "Vancouver Canucks", venueKeyword: "Rogers Arena", city: "Vancouver" },
  "vgk": { teamKeyword: "Vegas Golden Knights", venueKeyword: "T-Mobile Arena", city: "Las Vegas" },
  "wsh": { teamKeyword: "Washington Capitals", venueKeyword: "Capital One Arena", city: "Washington" },
  "wpg": { teamKeyword: "Winnipeg Jets", venueKeyword: "Canada Life Centre", city: "Winnipeg" },

  // NBA Teams
  "atl": { teamKeyword: "Atlanta Hawks", venueKeyword: "State Farm Arena", city: "Atlanta" },
  "bos-nba": { teamKeyword: "Boston Celtics", venueKeyword: "TD Garden", city: "Boston" },
  "bkn": { teamKeyword: "Brooklyn Nets", venueKeyword: "Barclays Center", city: "Brooklyn" },
  "cha": { teamKeyword: "Charlotte Hornets", venueKeyword: "Spectrum Center", city: "Charlotte" },
  "chi-nba": { teamKeyword: "Chicago Bulls", venueKeyword: "United Center", city: "Chicago" },
  "cle": { teamKeyword: "Cleveland Cavaliers", venueKeyword: "Rocket Mortgage FieldHouse", city: "Cleveland" },
  "dal-nba": { teamKeyword: "Dallas Mavericks", venueKeyword: "American Airlines Center", city: "Dallas" },
  "den": { teamKeyword: "Denver Nuggets", venueKeyword: "Ball Arena", city: "Denver" },
  "det-nba": { teamKeyword: "Detroit Pistons", venueKeyword: "Little Caesars Arena", city: "Detroit" },
  "gsw": { teamKeyword: "Golden State Warriors", venueKeyword: "Chase Center", city: "San Francisco" },
  "hou": { teamKeyword: "Houston Rockets", venueKeyword: "Toyota Center", city: "Houston" },
  "ind": { teamKeyword: "Indiana Pacers", venueKeyword: "Gainbridge Fieldhouse", city: "Indianapolis" },
  "lac": { teamKeyword: "Los Angeles Clippers", venueKeyword: "Intuit Dome", city: "Inglewood" },
  "lal": { teamKeyword: "Los Angeles Lakers", venueKeyword: "Crypto.com Arena", city: "Los Angeles" },
  "mem": { teamKeyword: "Memphis Grizzlies", venueKeyword: "FedExForum", city: "Memphis" },
  "mia": { teamKeyword: "Miami Heat", venueKeyword: "Kaseya Center", city: "Miami" },
  "mil": { teamKeyword: "Milwaukee Bucks", venueKeyword: "Fiserv Forum", city: "Milwaukee" },
  "min-nba": { teamKeyword: "Minnesota Timberwolves", venueKeyword: "Target Center", city: "Minneapolis" },
  "nop": { teamKeyword: "New Orleans Pelicans", venueKeyword: "Smoothie King Center", city: "New Orleans" },
  "nyk": { teamKeyword: "New York Knicks", venueKeyword: "Madison Square Garden", city: "New York" },
  "okc": { teamKeyword: "Oklahoma City Thunder", venueKeyword: "Paycom Center", city: "Oklahoma City" },
  "orl": { teamKeyword: "Orlando Magic", venueKeyword: "Kia Center", city: "Orlando" },
  "phi-nba": { teamKeyword: "Philadelphia 76ers", venueKeyword: "Wells Fargo Center", city: "Philadelphia" },
  "phx": { teamKeyword: "Phoenix Suns", venueKeyword: "Footprint Center", city: "Phoenix" },
  "por": { teamKeyword: "Portland Trail Blazers", venueKeyword: "Moda Center", city: "Portland" },
  "sac": { teamKeyword: "Sacramento Kings", venueKeyword: "Golden 1 Center", city: "Sacramento" },
  "sas": { teamKeyword: "San Antonio Spurs", venueKeyword: "Frost Bank Center", city: "San Antonio" },
  "tor-nba": { teamKeyword: "Toronto Raptors", venueKeyword: "Scotiabank Arena", city: "Toronto" },
  "uta": { teamKeyword: "Utah Jazz", venueKeyword: "Delta Center", city: "Salt Lake City" },
  "was": { teamKeyword: "Washington Wizards", venueKeyword: "Capital One Arena", city: "Washington" },

  // NFL Teams
  "ari-nfl": { teamKeyword: "Arizona Cardinals", venueKeyword: "State Farm Stadium", city: "Glendale" },
  "atl-nfl": { teamKeyword: "Atlanta Falcons", venueKeyword: "Mercedes-Benz Stadium", city: "Atlanta" },
  "bal": { teamKeyword: "Baltimore Ravens", venueKeyword: "M&T Bank Stadium", city: "Baltimore" },
  "buf-nfl": { teamKeyword: "Buffalo Bills", venueKeyword: "Highmark Stadium", city: "Orchard Park" },
  "car-nfl": { teamKeyword: "Carolina Panthers", venueKeyword: "Bank of America Stadium", city: "Charlotte" },
  "chi-nfl": { teamKeyword: "Chicago Bears", venueKeyword: "Soldier Field", city: "Chicago" },
  "cin": { teamKeyword: "Cincinnati Bengals", venueKeyword: "Paycor Stadium", city: "Cincinnati" },
  "cle-nfl": { teamKeyword: "Cleveland Browns", venueKeyword: "Cleveland Browns Stadium", city: "Cleveland" },
  "dal-nfl": { teamKeyword: "Dallas Cowboys", venueKeyword: "AT&T Stadium", city: "Arlington" },
  "den-nfl": { teamKeyword: "Denver Broncos", venueKeyword: "Empower Field", city: "Denver" },
  "det-nfl": { teamKeyword: "Detroit Lions", venueKeyword: "Ford Field", city: "Detroit" },
  "gb": { teamKeyword: "Green Bay Packers", venueKeyword: "Lambeau Field", city: "Green Bay" },
  "hou-nfl": { teamKeyword: "Houston Texans", venueKeyword: "NRG Stadium", city: "Houston" },
  "ind-nfl": { teamKeyword: "Indianapolis Colts", venueKeyword: "Lucas Oil Stadium", city: "Indianapolis" },
  "jax": { teamKeyword: "Jacksonville Jaguars", venueKeyword: "EverBank Stadium", city: "Jacksonville" },
  "kc": { teamKeyword: "Kansas City Chiefs", venueKeyword: "GEHA Field at Arrowhead Stadium", city: "Kansas City" },
  "lv": { teamKeyword: "Las Vegas Raiders", venueKeyword: "Allegiant Stadium", city: "Las Vegas" },
  "lac-nfl": { teamKeyword: "Los Angeles Chargers", venueKeyword: "SoFi Stadium", city: "Inglewood" },
  "lar": { teamKeyword: "Los Angeles Rams", venueKeyword: "SoFi Stadium", city: "Inglewood" },
  "mia-nfl": { teamKeyword: "Miami Dolphins", venueKeyword: "Hard Rock Stadium", city: "Miami Gardens" },
  "min-nfl": { teamKeyword: "Minnesota Vikings", venueKeyword: "U.S. Bank Stadium", city: "Minneapolis" },
  "ne": { teamKeyword: "New England Patriots", venueKeyword: "Gillette Stadium", city: "Foxborough" },
  "no": { teamKeyword: "New Orleans Saints", venueKeyword: "Caesars Superdome", city: "New Orleans" },
  "nyg": { teamKeyword: "New York Giants", venueKeyword: "MetLife Stadium", city: "East Rutherford" },
  "nyj": { teamKeyword: "New York Jets", venueKeyword: "MetLife Stadium", city: "East Rutherford" },
  "phi-nfl": { teamKeyword: "Philadelphia Eagles", venueKeyword: "Lincoln Financial Field", city: "Philadelphia" },
  "pit-nfl": { teamKeyword: "Pittsburgh Steelers", venueKeyword: "Acrisure Stadium", city: "Pittsburgh" },
  "sf": { teamKeyword: "San Francisco 49ers", venueKeyword: "Levi's Stadium", city: "Santa Clara" },
  "sea-nfl": { teamKeyword: "Seattle Seahawks", venueKeyword: "Lumen Field", city: "Seattle" },
  "tb": { teamKeyword: "Tampa Bay Buccaneers", venueKeyword: "Raymond James Stadium", city: "Tampa" },
  "ten": { teamKeyword: "Tennessee Titans", venueKeyword: "Nissan Stadium", city: "Nashville" },
  "was-nfl": { teamKeyword: "Washington Commanders", venueKeyword: "Northwest Stadium", city: "Landover" },

  // MLB Teams
  "ari-mlb": { teamKeyword: "Arizona Diamondbacks", venueKeyword: "Chase Field", city: "Phoenix" },
  "atl-mlb": { teamKeyword: "Atlanta Braves", venueKeyword: "Truist Park", city: "Atlanta" },
  "bal-mlb": { teamKeyword: "Baltimore Orioles", venueKeyword: "Oriole Park at Camden Yards", city: "Baltimore" },
  "bos-mlb": { teamKeyword: "Boston Red Sox", venueKeyword: "Fenway Park", city: "Boston" },
  "chc": { teamKeyword: "Chicago Cubs", venueKeyword: "Wrigley Field", city: "Chicago" },
  "cws": { teamKeyword: "Chicago White Sox", venueKeyword: "Guaranteed Rate Field", city: "Chicago" },
  "cin-mlb": { teamKeyword: "Cincinnati Reds", venueKeyword: "Great American Ball Park", city: "Cincinnati" },
  "cle-mlb": { teamKeyword: "Cleveland Guardians", venueKeyword: "Progressive Field", city: "Cleveland" },
  "col-mlb": { teamKeyword: "Colorado Rockies", venueKeyword: "Coors Field", city: "Denver" },
  "det-mlb": { teamKeyword: "Detroit Tigers", venueKeyword: "Comerica Park", city: "Detroit" },
  "hou-mlb": { teamKeyword: "Houston Astros", venueKeyword: "Minute Maid Park", city: "Houston" },
  "kc-mlb": { teamKeyword: "Kansas City Royals", venueKeyword: "Kauffman Stadium", city: "Kansas City" },
  "laa": { teamKeyword: "Los Angeles Angels", venueKeyword: "Angel Stadium", city: "Anaheim" },
  "lad": { teamKeyword: "Los Angeles Dodgers", venueKeyword: "Dodger Stadium", city: "Los Angeles" },
  "mia-mlb": { teamKeyword: "Miami Marlins", venueKeyword: "loanDepot park", city: "Miami" },
  "mil-mlb": { teamKeyword: "Milwaukee Brewers", venueKeyword: "American Family Field", city: "Milwaukee" },
  "min-mlb": { teamKeyword: "Minnesota Twins", venueKeyword: "Target Field", city: "Minneapolis" },
  "nym": { teamKeyword: "New York Mets", venueKeyword: "Citi Field", city: "New York" },
  "nyy": { teamKeyword: "New York Yankees", venueKeyword: "Yankee Stadium", city: "New York" },
  "oak": { teamKeyword: "Oakland Athletics", venueKeyword: "Oakland Coliseum", city: "Oakland" },
  "phi-mlb": { teamKeyword: "Philadelphia Phillies", venueKeyword: "Citizens Bank Park", city: "Philadelphia" },
  "pit-mlb": { teamKeyword: "Pittsburgh Pirates", venueKeyword: "PNC Park", city: "Pittsburgh" },
  "sd": { teamKeyword: "San Diego Padres", venueKeyword: "Petco Park", city: "San Diego" },
  "sf-mlb": { teamKeyword: "San Francisco Giants", venueKeyword: "Oracle Park", city: "San Francisco" },
  "sea-mlb": { teamKeyword: "Seattle Mariners", venueKeyword: "T-Mobile Park", city: "Seattle" },
  "stl-mlb": { teamKeyword: "St. Louis Cardinals", venueKeyword: "Busch Stadium", city: "St. Louis" },
  "tb-mlb": { teamKeyword: "Tampa Bay Rays", venueKeyword: "Tropicana Field", city: "St. Petersburg" },
  "tex": { teamKeyword: "Texas Rangers", venueKeyword: "Globe Life Field", city: "Arlington" },
  "tor-mlb": { teamKeyword: "Toronto Blue Jays", venueKeyword: "Rogers Centre", city: "Toronto" },
  "was-mlb": { teamKeyword: "Washington Nationals", venueKeyword: "Nationals Park", city: "Washington" },

  // MLS Teams
  "atl-utd": { teamKeyword: "Atlanta United", venueKeyword: "Mercedes-Benz Stadium", city: "Atlanta" },
  "aus-fc": { teamKeyword: "Austin FC", venueKeyword: "Q2 Stadium", city: "Austin" },
  "cha-fc": { teamKeyword: "Charlotte FC", venueKeyword: "Bank of America Stadium", city: "Charlotte" },
  "chi-fire": { teamKeyword: "Chicago Fire", venueKeyword: "Soldier Field", city: "Chicago" },
  "cin-fc": { teamKeyword: "FC Cincinnati", venueKeyword: "TQL Stadium", city: "Cincinnati" },
  "col-rapids": { teamKeyword: "Colorado Rapids", venueKeyword: "Dick's Sporting Goods Park", city: "Commerce City" },
  "cbus-crew": { teamKeyword: "Columbus Crew", venueKeyword: "Lower.com Field", city: "Columbus" },
  "dc-utd": { teamKeyword: "D.C. United", venueKeyword: "Audi Field", city: "Washington" },
  "dal-fc": { teamKeyword: "FC Dallas", venueKeyword: "Toyota Stadium", city: "Frisco" },
  "hou-dynamo": { teamKeyword: "Houston Dynamo", venueKeyword: "Shell Energy Stadium", city: "Houston" },
  "inter-mia": { teamKeyword: "Inter Miami", venueKeyword: "Chase Stadium", city: "Fort Lauderdale" },
  "lafc": { teamKeyword: "Los Angeles FC", venueKeyword: "BMO Stadium", city: "Los Angeles" },
  "la-galaxy": { teamKeyword: "LA Galaxy", venueKeyword: "Dignity Health Sports Park", city: "Carson" },
  "min-utd": { teamKeyword: "Minnesota United", venueKeyword: "Allianz Field", city: "Saint Paul" },
  "mtl-cf": { teamKeyword: "CF Montreal", venueKeyword: "Stade Saputo", city: "Montreal" },
  "nsh-sc": { teamKeyword: "Nashville SC", venueKeyword: "Geodis Park", city: "Nashville" },
  "ne-rev": { teamKeyword: "New England Revolution", venueKeyword: "Gillette Stadium", city: "Foxborough" },
  "nyc-fc": { teamKeyword: "New York City FC", venueKeyword: "Yankee Stadium", city: "New York" },
  "ny-rb": { teamKeyword: "New York Red Bulls", venueKeyword: "Red Bull Arena", city: "Harrison" },
  "orl-city": { teamKeyword: "Orlando City", venueKeyword: "Exploria Stadium", city: "Orlando" },
  "phi-union": { teamKeyword: "Philadelphia Union", venueKeyword: "Subaru Park", city: "Chester" },
  "por-timbers": { teamKeyword: "Portland Timbers", venueKeyword: "Providence Park", city: "Portland" },
  "rsl": { teamKeyword: "Real Salt Lake", venueKeyword: "America First Field", city: "Sandy" },
  "sj-quakes": { teamKeyword: "San Jose Earthquakes", venueKeyword: "PayPal Park", city: "San Jose" },
  "sea-sounders": { teamKeyword: "Seattle Sounders", venueKeyword: "Lumen Field", city: "Seattle" },
  "skc": { teamKeyword: "Sporting Kansas City", venueKeyword: "Children's Mercy Park", city: "Kansas City" },
  "stl-city": { teamKeyword: "St. Louis City SC", venueKeyword: "CityPark", city: "St. Louis" },
  "tor-fc": { teamKeyword: "Toronto FC", venueKeyword: "BMO Field", city: "Toronto" },
  "van-whitecaps": { teamKeyword: "Vancouver Whitecaps", venueKeyword: "BC Place", city: "Vancouver" },
};

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response | null> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ms);

  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[Ticketmaster] Fetch error:", err);
    return null;
  }
}

export const ticketmasterRouter = createTRPCRouter({
  getSchedule: publicProcedure
    .input(
      z.object({
        leagueId: z.string(),
        teamId: z.string(),
        teamName: z.string(),
        teamAbbreviation: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      console.log("[TM_PROXY] ========== getSchedule HIT ==========");
      console.log("[TM_PROXY] Input:", JSON.stringify(input));

      const apiKey = process.env.TICKETMASTER_API_KEY;
      const hasKey = Boolean(apiKey);
      const keyLength = apiKey?.length ?? 0;
      console.log("[TM_PROXY] API Key check: hasKey=", hasKey, "keyLength=", keyLength);
      
      if (!apiKey) {
        console.error("[TM_PROXY] ❌ TICKETMASTER_API_KEY not set in process.env");
        console.error("[TM_PROXY] Available env vars (names only):", Object.keys(process.env).filter(k => !k.startsWith('npm_')).join(', '));
        return { events: [], error: "API_KEY_MISSING" };
      }

      const teamConfig = TEAM_VENUE_MAP[input.teamId];
      const leagueConfig = LEAGUE_SEGMENT_MAP[input.leagueId.toLowerCase()];

      if (!teamConfig) {
        console.log("[TM_PROXY] No team config found for:", input.teamId);
        console.log("[TM_PROXY] Falling back to team name search:", input.teamName);
      }

      const teamKeyword = teamConfig?.teamKeyword || input.teamName;
      const venueKeyword = teamConfig?.venueKeyword;
      const city = teamConfig?.city;

      const dateRange = getSeasonDateRange(input.leagueId);
      console.log("[TM_PROXY] Date range:", dateRange);

      const params = new URLSearchParams({
        apikey: apiKey,
        keyword: teamKeyword,
        size: "200",
        sort: "date,asc",
        startDateTime: dateRange.startDateTime,
        endDateTime: dateRange.endDateTime,
      });

      if (leagueConfig?.segmentId) {
        params.append("segmentId", leagueConfig.segmentId);
      }
      if (leagueConfig?.genreId) {
        params.append("genreId", leagueConfig.genreId);
      }
      if (city) {
        params.append("city", city);
      }

      const url = `${TICKETMASTER_BASE}/events.json?${params.toString()}`;
      console.log("[TM_PROXY] Fetching:", url.replace(apiKey, "***"));

      const res = await fetchWithTimeout(url, 20000);

      if (!res) {
        console.error("[TM_PROXY] ❌ Fetch failed (timeout/network)");
        return { events: [], error: "FETCH_FAILED" };
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[TM_PROXY] ❌ HTTP error:", res.status, errText.substring(0, 200));
        return { events: [], error: `HTTP_${res.status}` };
      }

      try {
        const data: any = await res.json();
        const rawEvents: any[] = data?._embedded?.events || [];
        console.log("[TM_PROXY] Raw events returned:", rawEvents.length);

        const homeVenueNormalized = venueKeyword?.toLowerCase().replace(/[^a-z0-9]/g, "") || "";
        const teamFirstWord = teamKeyword.split(" ")[0].toLowerCase();

        const homeEvents = rawEvents.filter((ev: any) => {
          const eventVenueName = ev?._embedded?.venues?.[0]?.name || "";
          const venueNormalized = eventVenueName.toLowerCase().replace(/[^a-z0-9]/g, "");
          const eventName = (ev.name || "").toLowerCase();
          const eventCity = ev?._embedded?.venues?.[0]?.city?.name?.toLowerCase() || "";
          
          // Check if venue matches (more lenient matching)
          if (homeVenueNormalized) {
            const venueShort = homeVenueNormalized.substring(0, 8);
            if (venueNormalized.includes(venueShort) || venueShort.includes(venueNormalized.substring(0, 8))) {
              return true;
            }
          }
          
          // Check if city matches
          if (city && eventCity) {
            const cityNorm = city.toLowerCase().replace(/[^a-z]/g, "");
            const eventCityNorm = eventCity.replace(/[^a-z]/g, "");
            if (eventCityNorm.includes(cityNorm) || cityNorm.includes(eventCityNorm)) {
              return true;
            }
          }
          
          // Check if event name suggests it's a home game ("Team vs" pattern)
          if (eventName.includes(teamFirstWord + " vs") || eventName.startsWith(teamFirstWord)) {
            return true;
          }
          
          // For events with "at" - the team after "at" is the home team
          // If our team appears before "at", it's an away game
          if (eventName.includes(" at ")) {
            const parts = eventName.split(" at ");
            if (parts.length === 2) {
              const homeTeamPart = parts[1].toLowerCase();
              // If our team is in the second part (after "at"), it's a home game
              if (homeTeamPart.includes(teamFirstWord)) {
                return true;
              }
            }
          }
          
          return false;
        });
        
        console.log("[TM_PROXY] Filtered from", rawEvents.length, "to", homeEvents.length, "home events");

        console.log("[TM_PROXY] Home events after filtering:", homeEvents.length);

        const normalizedEvents = homeEvents.map((ev: any, idx: number) => {
          const eventDate = new Date(ev.dates?.start?.dateTime || ev.dates?.start?.localDate);
          const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

          const attractions: any[] = ev?._embedded?.attractions || [];
          const myTeamNorm = teamKeyword.toLowerCase();
          const opponent = attractions.find((a: any) => {
            const aName = (a.name || "").toLowerCase();
            return !aName.includes(myTeamNorm.split(" ")[0]);
          });

          const opponentName = opponent?.name || ev.name?.replace(teamKeyword, "").replace(" vs ", "").replace(" at ", "").trim() || "TBD";
          const opponentLogo = opponent?.images?.[0]?.url;

          const venue = ev?._embedded?.venues?.[0];
          const venueName = venue?.name || "";

          let gameType: "Preseason" | "Regular" | "Playoff" = "Regular";
          const eventName = (ev.name || "").toLowerCase();
          if (eventName.includes("preseason") || eventName.includes("pre-season")) {
            gameType = "Preseason";
          } else if (eventName.includes("playoff") || eventName.includes("postseason") || eventName.includes("stanley cup") || eventName.includes("nba finals") || eventName.includes("world series") || eventName.includes("super bowl")) {
            gameType = "Playoff";
          }

          return {
            ticketmasterEventId: ev.id,
            id: `tm_${input.leagueId}_${input.teamId}_${ev.id}`,
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

        console.log("[TM_PROXY] ✅ Mapped", normalizedEvents.length, "home games");
        console.log("[TM_PROXY] ========== SUCCESS ==========");

        return { events: normalizedEvents, error: null };
      } catch (e: any) {
        console.error("[TM_PROXY] ❌ Parse error:", e?.message || e);
        return { events: [], error: "PARSE_ERROR" };
      }
    }),
});
