import { Sale, Game, Event, MonthlyRevenue } from '@/constants/types';

export const mockSales: Sale[] = [];

export const mockGames: Game[] = [
  {
    id: '1',
    date: 'Sep 29',
    month: 'Sep',
    day: '29',
    opponent: 'vs Carolina Hurricanes',
    opponentLogo: 'https://a.espncdn.com/i/teamlogos/nhl/500/car.png',
    time: '6:00PM',
    ticketStatus: 'No seats available',
    isPaid: true,
    type: 'Preseason',
  },
  {
    id: '2',
    date: 'Oct 4',
    month: 'Oct',
    day: '4',
    opponent: 'vs Tampa Bay Lightning',
    opponentLogo: 'https://a.espncdn.com/i/teamlogos/nhl/500/tb.png',
    time: '7:00PM',
    ticketStatus: 'No seats available',
    isPaid: true,
    type: 'Regular',
  },
  {
    id: '3',
    date: 'Oct 7',
    month: 'Oct',
    day: '7',
    opponent: 'vs Chicago Blackhawks',
    opponentLogo: 'https://a.espncdn.com/i/teamlogos/nhl/500/chi.png',
    time: '5:00PM',
    ticketStatus: 'No seats available',
    isPaid: true,
    gameNumber: 1,
    type: 'Regular',
  },
  {
    id: '4',
    date: 'Oct 9',
    month: 'Oct',
    day: '9',
    opponent: 'vs Philadelphia Flyers',
    opponentLogo: 'https://a.espncdn.com/i/teamlogos/nhl/500/phi.png',
    time: '7:00PM',
    ticketStatus: 'No seats available',
    isPaid: true,
    gameNumber: 2,
    type: 'Regular',
  },
];

export const mockEvents: Event[] = [
  {
    id: '1',
    name: 'Ariana Grande',
    date: '6/5/2028',
    paid: 856.00,
    sold: null,
    status: 'Pending',
  },
  {
    id: '2',
    name: 'Panthers (Chase) free',
    date: '12/27/2025',
    paid: 149.00,
    sold: null,
    status: 'Pending',
  },
  {
    id: '3',
    name: 'Tame Impala',
    date: '10/26/2025',
    paid: 268.00,
    sold: 376.76,
    status: 'Pending',
  },
];

export const mockMonthlyRevenue: MonthlyRevenue[] = [
  { month: 'Sep', revenue: 0 },
  { month: 'Oct', revenue: 0 },
  { month: 'Nov', revenue: 0 },
  { month: 'Dec', revenue: 0 },
  { month: 'Jan', revenue: 0 },
  { month: 'Feb', revenue: 0 },
  { month: 'Mar', revenue: 0 },
  { month: 'Apr', revenue: 0 },
];
