export interface TeamTheme {
  primary: string;
  secondary: string;
  accent: string;
  gradient: [string, string, string];
  textOnPrimary: string;
}

function getReadableTextColor(bgColor: string): string {
  const hex = bgColor.replace('#', '');
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? '#1A1A1A' : '#FFFFFF';
}

const TEAM_THEMES: Record<string, TeamTheme> = {
  fla: {
    primary: '#002B5C',
    secondary: '#B9975B',
    accent: '#C8102E',
    gradient: ['#002B5C', '#C8102E', '#B9975B'],
    textOnPrimary: '#FFFFFF',
  },
  chi: {
    primary: '#CF0A2C',
    secondary: '#000000',
    accent: '#FF671F',
    gradient: ['#CF0A2C', '#000000', '#FF671F'],
    textOnPrimary: '#FFFFFF',
  },
  lak: {
    primary: '#111111',
    secondary: '#A2AAAD',
    accent: '#572A84',
    gradient: ['#111111', '#572A84', '#A2AAAD'],
    textOnPrimary: '#FFFFFF',
  },
  bos: {
    primary: '#FFB81C',
    secondary: '#000000',
    accent: '#FFB81C',
    gradient: ['#000000', '#FFB81C', '#000000'],
    textOnPrimary: '#000000',
  },
  tor: {
    primary: '#00205B',
    secondary: '#FFFFFF',
    accent: '#00205B',
    gradient: ['#00205B', '#003E7E', '#00205B'],
    textOnPrimary: '#FFFFFF',
  },
  edm: {
    primary: '#041E42',
    secondary: '#FF4C00',
    accent: '#FF4C00',
    gradient: ['#041E42', '#FF4C00', '#041E42'],
    textOnPrimary: '#FFFFFF',
  },
  tbl: {
    primary: '#002868',
    secondary: '#FFFFFF',
    accent: '#002868',
    gradient: ['#002868', '#1A4B8C', '#002868'],
    textOnPrimary: '#FFFFFF',
  },
  nyr: {
    primary: '#0038A8',
    secondary: '#CE1126',
    accent: '#CE1126',
    gradient: ['#0038A8', '#CE1126', '#0038A8'],
    textOnPrimary: '#FFFFFF',
  },
  mtl: {
    primary: '#AF1E2D',
    secondary: '#192168',
    accent: '#AF1E2D',
    gradient: ['#AF1E2D', '#192168', '#AF1E2D'],
    textOnPrimary: '#FFFFFF',
  },
  col: {
    primary: '#6F263D',
    secondary: '#236192',
    accent: '#236192',
    gradient: ['#6F263D', '#236192', '#6F263D'],
    textOnPrimary: '#FFFFFF',
  },
  vgk: {
    primary: '#B4975A',
    secondary: '#333F42',
    accent: '#B4975A',
    gradient: ['#333F42', '#B4975A', '#333F42'],
    textOnPrimary: '#000000',
  },
  car: {
    primary: '#CC0000',
    secondary: '#000000',
    accent: '#CC0000',
    gradient: ['#CC0000', '#000000', '#CC0000'],
    textOnPrimary: '#FFFFFF',
  },
  wsh: {
    primary: '#041E42',
    secondary: '#C8102E',
    accent: '#C8102E',
    gradient: ['#041E42', '#C8102E', '#041E42'],
    textOnPrimary: '#FFFFFF',
  },
  dal: {
    primary: '#006847',
    secondary: '#8F8F8C',
    accent: '#006847',
    gradient: ['#006847', '#111111', '#8F8F8C'],
    textOnPrimary: '#FFFFFF',
  },
  pit: {
    primary: '#000000',
    secondary: '#FCB514',
    accent: '#FCB514',
    gradient: ['#000000', '#FCB514', '#000000'],
    textOnPrimary: '#FCB514',
  },
  nsh: {
    primary: '#FFB81C',
    secondary: '#041E42',
    accent: '#FFB81C',
    gradient: ['#041E42', '#FFB81C', '#041E42'],
    textOnPrimary: '#041E42',
  },
  det: {
    primary: '#CE1126',
    secondary: '#FFFFFF',
    accent: '#CE1126',
    gradient: ['#CE1126', '#8B0000', '#CE1126'],
    textOnPrimary: '#FFFFFF',
  },
  min: {
    primary: '#154734',
    secondary: '#A6192E',
    accent: '#A6192E',
    gradient: ['#154734', '#A6192E', '#154734'],
    textOnPrimary: '#FFFFFF',
  },
  wpg: {
    primary: '#041E42',
    secondary: '#004C97',
    accent: '#AC162C',
    gradient: ['#041E42', '#004C97', '#AC162C'],
    textOnPrimary: '#FFFFFF',
  },
  sea: {
    primary: '#001628',
    secondary: '#99D9D9',
    accent: '#99D9D9',
    gradient: ['#001628', '#355E3B', '#99D9D9'],
    textOnPrimary: '#99D9D9',
  },
  sjs: {
    primary: '#006D75',
    secondary: '#EA7200',
    accent: '#EA7200',
    gradient: ['#006D75', '#004953', '#EA7200'],
    textOnPrimary: '#FFFFFF',
  },
  ana: {
    primary: '#F47A38',
    secondary: '#B9975B',
    accent: '#F47A38',
    gradient: ['#000000', '#F47A38', '#B9975B'],
    textOnPrimary: '#FFFFFF',
  },
  buf: {
    primary: '#002654',
    secondary: '#FCB514',
    accent: '#FCB514',
    gradient: ['#002654', '#FCB514', '#002654'],
    textOnPrimary: '#FFFFFF',
  },
  cgy: {
    primary: '#C8102E',
    secondary: '#F1BE48',
    accent: '#F1BE48',
    gradient: ['#C8102E', '#111111', '#F1BE48'],
    textOnPrimary: '#FFFFFF',
  },
  cbj: {
    primary: '#002654',
    secondary: '#CE1126',
    accent: '#CE1126',
    gradient: ['#002654', '#CE1126', '#002654'],
    textOnPrimary: '#FFFFFF',
  },
  njd: {
    primary: '#CE1126',
    secondary: '#000000',
    accent: '#CE1126',
    gradient: ['#CE1126', '#000000', '#CE1126'],
    textOnPrimary: '#FFFFFF',
  },
  nyi: {
    primary: '#00539B',
    secondary: '#F47D30',
    accent: '#F47D30',
    gradient: ['#00539B', '#F47D30', '#00539B'],
    textOnPrimary: '#FFFFFF',
  },
  ott: {
    primary: '#C52032',
    secondary: '#C69214',
    accent: '#C69214',
    gradient: ['#C52032', '#000000', '#C69214'],
    textOnPrimary: '#FFFFFF',
  },
  phi: {
    primary: '#F74902',
    secondary: '#000000',
    accent: '#F74902',
    gradient: ['#F74902', '#000000', '#F74902'],
    textOnPrimary: '#FFFFFF',
  },
  stl: {
    primary: '#002F87',
    secondary: '#FCB514',
    accent: '#FCB514',
    gradient: ['#002F87', '#FCB514', '#002F87'],
    textOnPrimary: '#FFFFFF',
  },
  van: {
    primary: '#00205B',
    secondary: '#00843D',
    accent: '#041C2C',
    gradient: ['#00205B', '#00843D', '#041C2C'],
    textOnPrimary: '#FFFFFF',
  },
  ari: {
    primary: '#69B3E7',
    secondary: '#010101',
    accent: '#69B3E7',
    gradient: ['#010101', '#69B3E7', '#010101'],
    textOnPrimary: '#000000',
  },

  // NBA teams
  lal: {
    primary: '#552583',
    secondary: '#FDB927',
    accent: '#FDB927',
    gradient: ['#552583', '#FDB927', '#552583'],
    textOnPrimary: '#FDB927',
  },
  bulls: {
    primary: '#CE1141',
    secondary: '#000000',
    accent: '#CE1141',
    gradient: ['#000000', '#CE1141', '#000000'],
    textOnPrimary: '#FFFFFF',
  },
  gsw: {
    primary: '#1D428A',
    secondary: '#FFC72C',
    accent: '#FFC72C',
    gradient: ['#1D428A', '#FFC72C', '#1D428A'],
    textOnPrimary: '#FFC72C',
  },
  bkn: {
    primary: '#000000',
    secondary: '#FFFFFF',
    accent: '#000000',
    gradient: ['#000000', '#333333', '#000000'],
    textOnPrimary: '#FFFFFF',
  },
  cel: {
    primary: '#007A33',
    secondary: '#BA9653',
    accent: '#BA9653',
    gradient: ['#007A33', '#BA9653', '#007A33'],
    textOnPrimary: '#FFFFFF',
  },
  mia_heat: {
    primary: '#98002E',
    secondary: '#F9A01B',
    accent: '#000000',
    gradient: ['#98002E', '#000000', '#F9A01B'],
    textOnPrimary: '#FFFFFF',
  },
};

const DEFAULT_THEME: TeamTheme = {
  primary: '#002B5C',
  secondary: '#B9975B',
  accent: '#C8102E',
  gradient: ['#002B5C', '#C8102E', '#B9975B'],
  textOnPrimary: '#FFFFFF',
};

export function getTeamTheme(teamId?: string): TeamTheme {
  if (!teamId) return DEFAULT_THEME;
  const id = teamId.toLowerCase();
  return TEAM_THEMES[id] || DEFAULT_THEME;
}

export function buildGradientFromPass(pass: {
  teamId?: string;
  teamPrimaryColor?: string;
  teamSecondaryColor?: string;
} | null | undefined): readonly [string, string, string] {
  if (!pass) return DEFAULT_THEME.gradient as unknown as readonly [string, string, string];
  const theme = pass.teamId ? TEAM_THEMES[pass.teamId.toLowerCase()] : null;
  if (theme) return theme.gradient as unknown as readonly [string, string, string];
  const p = pass.teamPrimaryColor || DEFAULT_THEME.primary;
  const s = pass.teamSecondaryColor || DEFAULT_THEME.secondary;
  return [p, blendColors(p, s), s] as const;
}

function blendColors(c1: string, c2: string): string {
  try {
    const h1 = c1.replace('#', '');
    const h2 = c2.replace('#', '');
    const r = Math.round((parseInt(h1.substring(0, 2), 16) + parseInt(h2.substring(0, 2), 16)) / 2);
    const g = Math.round((parseInt(h1.substring(2, 4), 16) + parseInt(h2.substring(2, 4), 16)) / 2);
    const b = Math.round((parseInt(h1.substring(4, 6), 16) + parseInt(h2.substring(4, 6), 16)) / 2);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  } catch {
    return '#666666';
  }
}

export { getReadableTextColor };
