export interface Sale {
  id: string;
  gameNumber: number | string;
  opponent: string;
  opponentLogo?: string;
  section: string;
  row: string;
  seats: string;
  price: number;
  soldDate: string;
  status: 'Pending' | 'Per Seat' | 'Paid';
}

export interface Game {
  id: string;
  date: string;
  month: string;
  day: string;
  opponent: string;
  opponentLogo?: string;
  venueName?: string;
  time: string;
  ticketStatus: string;
  isPaid: boolean;
  gameNumber?: number | string;
  type: 'Preseason' | 'Regular' | 'Playoff';
  dateTimeISO?: string | null;
}

export interface Event {
  id: string; 
  name: string;
  date: string;
  paid: number;
  sold: number | null;
  status: 'Pending' | 'Sold';
}

export interface MonthlyRevenue {
  month: string;
  revenue: number;
}

export interface League {
  id: string;
  name: string;
  logoUrl: string;
  shortName: string;
}

export interface Team {
  id: string;
  name: string;
  leagueId: string;
  logoUrl: string;
  primaryColor: string;
  secondaryColor: string;
  city: string;
  abbreviation: string;
}

export interface SeatPair {
  id: string;
  section: string;
  row: string;
  seats: string;
  seasonCost: number;
}

export interface SaleRecord {
  id: string;
  gameId: string;
  pairId: string;
  section: string;
  row: string;
  seats: string;
  /** Number of seats represented by this sale (parsed from `seats` string, e.g. "24-25" => 2) */
  seatCount?: number;
  /** Optional opponent/team logo URL or data URI (used for exports/UI) */
  opponentLogo?: string;
  price: number;
  paymentStatus: 'Pending' | 'Per Seat' | 'Paid';
  soldDate: string;
}

export interface SeasonPass {
  id: string;
  leagueId: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
  teamLogoUrl: string;
  teamPrimaryColor: string;
  teamSecondaryColor: string;
  seasonLabel: string;
  seatPairs: SeatPair[];
  salesData: Record<string, Record<string, SaleRecord>>;
  games: Game[];
  events: Event[];
  createdAtISO: string;
}

export interface SetupState {
  step: 'league' | 'team' | 'season' | 'seats' | 'confirm' | 'complete';
  selectedLeague: League | null;
  selectedTeam: Team | null;
  seasonLabel: string;
  seatPairs: SeatPair[];
}
