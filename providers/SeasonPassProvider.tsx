import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import createContextHook from '@nkzw/create-context-hook';
import { SeasonPass, SeatPair, SaleRecord, Game, Event, League, Team } from '@/constants/types';
import { LEAGUES, getTeamsByLeague, NHL_TEAMS } from '@/constants/leagues';
import { PANTHERS_20252026_SCHEDULE } from '@/constants/panthersSchedule';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { AppColors } from '@/constants/appColors';

import * as Clipboard from 'expo-clipboard';
import LZString from 'lz-string';
// xlsx is lazy-loaded in exportAsExcel to avoid bloating the initial bundle
import { Platform, Alert } from 'react-native';
import { trpcClient } from '@/lib/trpc';
import { parseSeatsCount } from '@/lib/seats';

const BACKUP_VERSION = '1.0';

async function withMasterTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  const timeoutPromise = new Promise<T>((resolve) => {
    timeoutId = setTimeout(() => {
      console.log('[MasterTimeout] Operation timed out after', ms, 'ms - returning fallback');
      resolve(fallback);
    }, ms);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

type ScheduleFetchResult = { 
  games: Game[]; 
  error?: 'CORS' | 'TIMEOUT' | 'NETWORK' | 'NO_TEAM' | 'NO_SCHEDULE' | 'API_KEY_MISSING' | null;
};

async function fetchScheduleViaESPN(pass: {
  leagueId: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
}): Promise<ScheduleFetchResult> {
  const leagueIdRaw = String(pass.leagueId || '').toLowerCase();

  console.log('[ScheduleFetch] ========== ESPN FETCH START ==========');
  console.log('[ScheduleFetch] Platform.OS:', Platform.OS);
  console.log('[ScheduleFetch] League:', leagueIdRaw);
  console.log('[ScheduleFetch] Team name:', pass.teamName);
  console.log('[ScheduleFetch] Team ID:', pass.teamId);
  console.log('[ScheduleFetch] Team abbreviation:', pass.teamAbbreviation);
  
  const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  console.log('[ScheduleFetch] EXPO_PUBLIC_RORK_API_BASE_URL:', baseUrl);
  
  if (!baseUrl) {
    console.error('[ScheduleFetch] ❌ EXPO_PUBLIC_RORK_API_BASE_URL is undefined!');
    return { games: [], error: 'NETWORK' };
  }

  try {
    console.log('[ScheduleFetch] Calling tRPC espn.getFullSchedule...');
    const trpcInput = {
      leagueId: leagueIdRaw,
      teamId: pass.teamId,
      teamName: pass.teamName,
      teamAbbreviation: pass.teamAbbreviation,
    };
    console.log('[ScheduleFetch] tRPC input:', JSON.stringify(trpcInput));
    
    const startTime = Date.now();
    let result;
    try {
      result = await trpcClient.espn.getFullSchedule.query(trpcInput);
    } catch (fetchErr: any) {
      console.log('[ScheduleFetch] ESPN backend unavailable:', fetchErr?.message || 'Network error');
      return { games: [], error: 'NETWORK' };
    }
    const elapsed = Date.now() - startTime;
    console.log('[ScheduleFetch] ✅ ESPN tRPC call completed in', elapsed, 'ms');
    console.log('[ScheduleFetch] error:', result.error);
    console.log('[ScheduleFetch] events count:', result.events?.length || 0);

    if (result.error || !result.events || result.events.length === 0) {
      console.warn('[ScheduleFetch] ESPN returned error or no events:', result.error);
      return { games: [], error: 'NO_SCHEDULE' };
    }

    const games: Game[] = (result.events || []).map((ev: any) => ({
      id: ev.id,
      date: ev.date,
      month: ev.month,
      day: ev.day,
      opponent: ev.opponent,
      opponentLogo: ev.opponentLogo,
      venueName: ev.venueName,
      time: ev.time,
      ticketStatus: ev.ticketStatus || 'Available',
      isPaid: ev.isPaid || false,
      gameNumber: ev.gameNumber,
      type: ev.type,
      dateTimeISO: ev.dateTimeISO,
    }));

    console.log('[ScheduleFetch] ✅ ESPN Mapped', games.length, 'HOME games');
    console.log('[ScheduleFetch] ========== ESPN FETCH SUCCESS ==========');
    return { games, error: null };
  } catch (error: any) {
    const errorStr = String(error?.message || error || '').toLowerCase();
    console.log('[ScheduleFetch] ESPN Fetch error:', error?.message || String(error));
    
    if (errorStr.includes('cors')) {
      return { games: [], error: 'CORS' };
    }
    if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
      return { games: [], error: 'TIMEOUT' };
    }
    return { games: [], error: 'NETWORK' };
  }
}

async function fetchScheduleViaTicketmaster(pass: {
  leagueId: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
}): Promise<ScheduleFetchResult> {
  const leagueIdRaw = String(pass.leagueId || '').toLowerCase();

  console.log('[ScheduleFetch] ========== TICKETMASTER FETCH START ==========');
  
  const baseUrl = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;
  if (!baseUrl) {
    return { games: [], error: 'NETWORK' };
  }

  try {
    console.log('[ScheduleFetch] Calling tRPC ticketmaster.getSchedule...');
    const trpcInput = {
      leagueId: leagueIdRaw,
      teamId: pass.teamId,
      teamName: pass.teamName,
      teamAbbreviation: pass.teamAbbreviation,
    };
    
    const startTime = Date.now();
    let result;
    try {
      result = await trpcClient.ticketmaster.getSchedule.query(trpcInput);
    } catch (fetchErr: any) {
      console.log('[ScheduleFetch] Ticketmaster backend unavailable:', fetchErr?.message || 'Network error');
      return { games: [], error: 'NETWORK' };
    }
    const elapsed = Date.now() - startTime;
    console.log('[ScheduleFetch] ✅ Ticketmaster tRPC call completed in', elapsed, 'ms');

    if (result.error) {
      console.warn('[ScheduleFetch] Ticketmaster returned error:', result.error);
      let mappedError: ScheduleFetchResult['error'] = 'NO_SCHEDULE';
      if (result.error === 'API_KEY_MISSING') {
        mappedError = 'API_KEY_MISSING';
      } else if (result.error === 'FETCH_FAILED') {
        mappedError = 'NETWORK';
      } else if (result.error.startsWith('HTTP_')) {
        mappedError = 'NETWORK';
      }
      return { games: [], error: mappedError };
    }

    const games: Game[] = (result.events || []).map((ev: any) => ({
      id: ev.id,
      date: ev.date,
      month: ev.month,
      day: ev.day,
      opponent: ev.opponent,
      opponentLogo: ev.opponentLogo,
      venueName: ev.venueName,
      time: ev.time,
      ticketStatus: ev.ticketStatus || 'Available',
      isPaid: ev.isPaid || false,
      gameNumber: ev.gameNumber,
      type: ev.type,
      dateTimeISO: ev.dateTimeISO,
    }));

    console.log('[ScheduleFetch] ✅ Ticketmaster Mapped', games.length, 'HOME games');
    console.log('[ScheduleFetch] ========== TICKETMASTER FETCH SUCCESS ==========');
    return { games, error: null };
  } catch (error: any) {
    const errorStr = String(error?.message || error || '').toLowerCase();
    console.log('[ScheduleFetch] Ticketmaster Fetch error:', error?.message || String(error));
    
    if (errorStr.includes('cors')) {
      return { games: [], error: 'CORS' };
    }
    if (errorStr.includes('timeout') || errorStr.includes('aborted')) {
      return { games: [], error: 'TIMEOUT' };
    }
    return { games: [], error: 'NETWORK' };
  }
}

async function fetchScheduleViaBackend(pass: {
  leagueId: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
}): Promise<ScheduleFetchResult> {
  console.log('[ScheduleFetch] ========== COMBINED FETCH START ==========');
  console.log('[ScheduleFetch] Trying ESPN first (primary source)...');
  
  // Try ESPN first (free, reliable)
  const espnResult = await fetchScheduleViaESPN(pass);
  
  if (!espnResult.error && espnResult.games.length > 0) {
    console.log('[ScheduleFetch] ✅ ESPN succeeded with', espnResult.games.length, 'games');
    return espnResult;
  }
  
  console.log('[ScheduleFetch] ESPN failed or returned 0 games, trying Ticketmaster as fallback...');
  
  // Fallback to Ticketmaster
  const tmResult = await fetchScheduleViaTicketmaster(pass);
  
  if (!tmResult.error && tmResult.games.length > 0) {
    console.log('[ScheduleFetch] ✅ Ticketmaster fallback succeeded with', tmResult.games.length, 'games');
    return tmResult;
  }
  
  console.log('[ScheduleFetch] ❌ Both ESPN and Ticketmaster failed');
  
  // Return ESPN error if both failed (ESPN is more likely to have useful error info)
  return espnResult.error ? espnResult : tmResult;
}

async function fetchScheduleWithMasterTimeout(pass: {
  leagueId: string;
  teamId: string;
  teamName: string;
  teamAbbreviation?: string;
}): Promise<ScheduleFetchResult> {
  return withMasterTimeout(
    fetchScheduleViaBackend(pass),
    30000,
    { games: [], error: 'TIMEOUT' }
  );
}

export interface BackupData {
  version: string;
  createdAtISO: string;
  activeSeasonPassId: string | null;
  seasonPasses: SeasonPass[];
  // raw storage flags (kept for exact restore)
  dataImportedRaw?: string | null;
  // snapshot of app theme/colors so restore can re-apply UI constants
  appTheme?: Record<string, string> | null;
}

function generateRecoveryCode(data: BackupData): string {
  const jsonString = JSON.stringify(data);
  const compressed = LZString.compressToEncodedURIComponent(jsonString);
  return compressed;
}

function convertRecoveryContextToBackup(raw: any): BackupData | null {
  if (raw && raw.recoveryData && (raw.recoveryData.salesData || raw.recoveryData.seatPairs)) {
    try {
      const rd = raw.recoveryData;
      const createdAtISO = rd.timestamp || rd.lastBackup || new Date().toISOString();
      const seatPairs = rd.seatPairs || rd.seat_pairs || [];
      const salesRaw = rd.salesData || rd.sales_data || {};

      const passId = 'panthers-2025-2026';
      const seasonPass: any = {
        id: passId,
        leagueId: 'nhl',
        teamId: 'fla',
        teamName: 'Florida Panthers',
        teamAbbreviation: 'FLA',
        teamLogoUrl: rd.teamLogoUrl || '',
        teamPrimaryColor: rd.teamPrimaryColor || '#041E42',
        teamSecondaryColor: rd.teamSecondaryColor || '#A5ACAF',
        seasonLabel: rd.appConfig?.season || '2025-2026',
        seatPairs: seatPairs,
        salesData: transformSalesData(salesRaw),
        games: PANTHERS_20252026_SCHEDULE,
        events: [],
        createdAtISO,
      };

      return {
        version: rd.version || raw.version || '1.0',
        createdAtISO,
        activeSeasonPassId: passId,
        seasonPasses: [seasonPass],
      };
    } catch (inner) {
      console.warn('[SeasonPass] convertRecoveryContextToBackup failed:', inner);
      return null;
    }
  }
  return null;
}

function tryParseJsonBackup(jsonStr: string): BackupData | null {
  try {
    const raw = JSON.parse(jsonStr) as any;
    if (raw && raw.version && Array.isArray(raw.seasonPasses)) {
      console.log('[SeasonPass] parseRecoveryCode: matched BackupData shape, passes:', raw.seasonPasses.length);
      return raw as BackupData;
    }
    const fromCtx = convertRecoveryContextToBackup(raw);
    if (fromCtx) {
      console.log('[SeasonPass] parseRecoveryCode: converted recoveryData context');
      return fromCtx;
    }
    if (raw && Array.isArray(raw)) {
      console.log('[SeasonPass] parseRecoveryCode: input is array, wrapping as seasonPasses');
      return {
        version: '1.0',
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: raw[0]?.id || null,
        seasonPasses: raw,
      };
    }
    console.warn('[SeasonPass] parseRecoveryCode: JSON parsed but no recognized shape. Keys:', Object.keys(raw || {}));
    return null;
  } catch {
    return null;
  }
}

function tryDecompress(input: string): string | null {
  const methods = [
    { name: 'EncodedURIComponent', fn: () => LZString.decompressFromEncodedURIComponent(input) },
    { name: 'Base64', fn: () => LZString.decompressFromBase64(input) },
    { name: 'UTF16', fn: () => LZString.decompressFromUTF16(input) },
    { name: 'Raw', fn: () => LZString.decompress(input) },
  ];
  for (const m of methods) {
    try {
      const result = m.fn();
      if (result && result.trim().length > 2) {
        console.log('[SeasonPass] parseRecoveryCode: decompressed via', m.name, 'length:', result.length);
        return result;
      }
    } catch {
      // continue
    }
  }
  return null;
}

function parseRecoveryCode(codeOrJson: string): BackupData | null {
  try {
    let trimmed = codeOrJson.trim();
    if (!trimmed) {
      console.warn('[SeasonPass] parseRecoveryCode called with empty input');
      return null;
    }

    trimmed = trimmed.replace(/^\uFEFF/, '');

    console.log('[SeasonPass] parseRecoveryCode: input length:', trimmed.length, 'starts with:', JSON.stringify(trimmed.substring(0, 40)));

    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      const result = tryParseJsonBackup(trimmed);
      if (result) return result;
      console.warn('[SeasonPass] parseRecoveryCode: looks like JSON but failed to match any shape');
    }

    const decompressed = tryDecompress(trimmed);
    if (decompressed) {
      const result = tryParseJsonBackup(decompressed);
      if (result) return result;
      console.warn('[SeasonPass] parseRecoveryCode: decompressed but JSON did not match. Preview:', decompressed.substring(0, 100));
    }

    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      try {
        const decoded = decodeURIComponent(trimmed);
        if (decoded !== trimmed && (decoded.startsWith('{') || decoded.startsWith('['))) {
          const result = tryParseJsonBackup(decoded);
          if (result) return result;
        }
      } catch {
        // not URI encoded
      }

      try {
        const b64decoded = atob(trimmed);
        if (b64decoded && (b64decoded.startsWith('{') || b64decoded.startsWith('['))) {
          const result = tryParseJsonBackup(b64decoded);
          if (result) return result;
        }
      } catch {
        // not base64
      }
    }

    console.error('[SeasonPass] parseRecoveryCode: all parsing strategies failed for input length:', trimmed.length);
    return null;
  } catch (e: any) {
    console.error('[SeasonPass] Failed to parse recovery code or JSON:', e);
    return null;
  }
}

const SEASON_PASSES_KEY = 'season_passes';
const ACTIVE_PASS_KEY = 'active_season_pass_id';
const DATA_IMPORTED_KEY = 'data_imported_v1';
const MASTER_BACKUP_KEY = 'master_backup_v1';
const ALL_PASSES_BACKUP_KEY = 'all_passes_backup_v1';


const INITIAL_BACKUP_DATA = {
  salesData: {
    "1": {
      "pair1": {"gameId":"1","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":234,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:21.793Z"},
      "pair2": {"gameId":"1","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":124.2,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:27.544Z"},
      "pair3": {"gameId":"1","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":138.6,"paymentStatus":"paid","soldDate":"2025-10-15T02:15:55.784Z"}
    },
    "2": {
      "pair1": {"gameId":"2","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":59.17,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:34.487Z"},
      "pair2": {"gameId":"2","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":23.4,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:38.571Z"},
      "pair3": {"gameId":"2","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":27.2,"paymentStatus":"paid","soldDate":"2025-10-15T02:16:08.870Z"}
    },
    "3": {
      "pair1": {"gameId":"3","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":128,"paymentStatus":"paid","soldDate":"2025-10-29T15:51:27.650Z"},
      "pair2": {"gameId":"3","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":45.76,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:52.048Z"},
      "pair3": {"gameId":"3","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":54,"paymentStatus":"paid","soldDate":"2025-10-15T02:16:18.821Z"}
    },
    "4": {
      "pair1": {"gameId":"4","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":103.57,"paymentStatus":"paid","soldDate":"2025-10-29T15:50:29.530Z"},
      "pair2": {"gameId":"4","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":36.5,"paymentStatus":"paid","soldDate":"2025-10-29T15:50:24.596Z"},
      "pair3": {"gameId":"4","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":41.54,"paymentStatus":"paid","soldDate":"2025-10-29T15:47:30.524Z"}
    },
    "5": {
      "pair1": {"gameId":"5","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":153,"paymentStatus":"paid","soldDate":"2025-10-29T15:50:46.000Z"},
      "pair2": {"gameId":"5","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":52.2,"paymentStatus":"paid","soldDate":"2025-10-29T15:50:48.484Z"},
      "pair3": {"gameId":"5","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":72,"paymentStatus":"paid","soldDate":"2025-10-29T15:48:14.370Z"}
    },
    "6": {
      "pair1": {"gameId":"6","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":37.8,"paymentStatus":"paid","soldDate":"2025-11-05T18:19:48.742Z"},
      "pair2": {"gameId":"6","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":27,"paymentStatus":"paid","soldDate":"2025-11-05T18:19:49.976Z"},
      "pair3": {"gameId":"6","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":39.22,"paymentStatus":"paid","soldDate":"2025-11-05T18:19:58.077Z"}
    },
    "7": {
      "pair1": {"gameId":"7","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":118.8,"paymentStatus":"paid","soldDate":"2025-11-05T18:20:22.685Z"},
      "pair2": {"gameId":"7","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":36,"paymentStatus":"paid","soldDate":"2025-11-05T18:20:24.061Z"},
      "pair3": {"gameId":"7","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":54,"paymentStatus":"paid","soldDate":"2025-11-05T18:20:25.462Z"}
    },
    "8": {
      "pair1": {"gameId":"8","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":83.65,"paymentStatus":"paid","soldDate":"2025-11-19T20:24:52.442Z"},
      "pair2": {"gameId":"8","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":25.83,"paymentStatus":"paid","soldDate":"2025-11-19T20:24:56.259Z"},
      "pair3": {"gameId":"8","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":30.6,"paymentStatus":"paid","soldDate":"2025-11-19T20:20:32.314Z"}
    },
    "9": {
      "pair1": {"gameId":"9","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":197.66,"paymentStatus":"paid","soldDate":"2025-11-19T20:24:36.476Z"},
      "pair2": {"gameId":"9","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":107.32,"paymentStatus":"paid","soldDate":"2025-11-19T20:24:42.277Z"},
      "pair3": {"gameId":"9","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":71.01,"paymentStatus":"paid","soldDate":"2025-11-19T20:20:41.857Z"}
    },
    "10": {
      "pair1": {"gameId":"10","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":59.4,"paymentStatus":"paid","soldDate":"2026-01-16T16:20:12.299Z"},
      "pair2": {"gameId":"10","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":19.96,"paymentStatus":"paid","soldDate":"2026-01-16T16:20:32.374Z"},
      "pair3": {"gameId":"10","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":21.87,"paymentStatus":"paid","soldDate":"2026-01-16T16:32:01.650Z"}
    },
    "11": {
      "pair1": {"gameId":"11","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":48.94,"paymentStatus":"paid","soldDate":"2026-01-16T16:21:19.116Z"},
      "pair2": {"gameId":"11","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":26.69,"paymentStatus":"paid","soldDate":"2026-01-16T16:21:31.514Z"},
      "pair3": {"gameId":"11","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":13.5,"paymentStatus":"paid","soldDate":"2026-01-16T16:32:13.806Z"}
    },
    "12": {
      "pair1": {"gameId":"12","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":162,"paymentStatus":"paid","soldDate":"2026-01-16T16:22:32.038Z"},
      "pair2": {"gameId":"12","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":74.61,"paymentStatus":"paid","soldDate":"2026-01-16T16:22:48.912Z"},
      "pair3": {"gameId":"12","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":108.27,"paymentStatus":"paid","soldDate":"2026-01-16T16:32:37.861Z"}
    },
    "13": {
      "pair1": {"gameId":"13","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":113.58,"paymentStatus":"paid","soldDate":"2026-01-16T16:24:06.664Z"},
      "pair2": {"gameId":"13","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":35.28,"paymentStatus":"paid","soldDate":"2026-01-16T16:24:07.365Z"},
      "pair3": {"gameId":"13","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":37.98,"paymentStatus":"paid","soldDate":"2026-01-16T16:32:51.942Z"}
    },
    "14": {
      "pair1": {"gameId":"14","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":138.6,"paymentStatus":"paid","soldDate":"2026-01-16T16:24:44.905Z"},
      "pair2": {"gameId":"14","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":48.6,"paymentStatus":"paid","soldDate":"2026-01-16T16:24:59.725Z"},
      "pair3": {"gameId":"14","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":47.77,"paymentStatus":"paid","soldDate":"2026-01-16T16:33:10.588Z"}
    },
    "15": {
      "pair1": {"gameId":"15","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":127.35,"paymentStatus":"paid","soldDate":"2026-01-16T16:25:20.516Z"},
      "pair2": {"gameId":"15","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":54,"paymentStatus":"paid","soldDate":"2026-01-16T16:25:43.987Z"},
      "pair3": {"gameId":"15","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":41.4,"paymentStatus":"paid","soldDate":"2026-01-16T16:33:25.211Z"}
    },
    "16": {
      "pair1": {"gameId":"16","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":55.8,"paymentStatus":"paid","soldDate":"2026-01-16T16:26:00.315Z"},
      "pair2": {"gameId":"16","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":32.13,"paymentStatus":"paid","soldDate":"2026-01-16T16:26:09.659Z"},
      "pair3": {"gameId":"16","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":29.99,"paymentStatus":"paid","soldDate":"2026-01-16T16:33:38.805Z"}
    },
    "17": {
      "pair1": {"gameId":"17","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":72.09,"paymentStatus":"paid","soldDate":"2026-01-16T16:26:48.587Z"},
      "pair2": {"gameId":"17","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":16.18,"paymentStatus":"paid","soldDate":"2026-01-16T16:39:56.584Z"},
      "pair3": {"gameId":"17","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":12.6,"paymentStatus":"paid","soldDate":"2026-01-16T16:33:57.967Z"}
    },
    "18": {
      "pair1": {"gameId":"18","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":86.94,"paymentStatus":"paid","soldDate":"2026-01-16T16:27:17.967Z"},
      "pair2": {"gameId":"18","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":27.67,"paymentStatus":"paid","soldDate":"2026-01-16T16:27:26.752Z"},
      "pair3": {"gameId":"18","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":43.2,"paymentStatus":"paid","soldDate":"2026-01-16T16:34:15.416Z"}
    },
    "19": {
      "pair1": {"gameId":"19","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":1,"paymentStatus":"paid","soldDate":"2026-01-16T00:00:00.000Z"},
      "pair2": {"gameId":"19","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":28.62,"paymentStatus":"paid","soldDate":"2026-01-16T16:28:07.418Z"},
      "pair3": {"gameId":"19","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":45,"paymentStatus":"paid","soldDate":"2026-01-16T16:35:13.477Z"}
    },
    "20": {
      "pair1": {"gameId":"20","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":1,"paymentStatus":"paid","soldDate":"2026-01-16T00:00:00.000Z"},
      "pair2": {"gameId":"20","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":31.39,"paymentStatus":"paid","soldDate":"2026-01-16T16:28:38.524Z"},
      "pair3": {"gameId":"20","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":34.2,"paymentStatus":"paid","soldDate":"2026-01-16T16:35:29.409Z"}
    },
    "21": {
      "pair1": {"gameId":"21","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":75.6,"paymentStatus":"paid","soldDate":"2026-01-16T16:28:26.372Z"},
      "pair2": {"gameId":"21","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":54.41,"paymentStatus":"paid","soldDate":"2026-01-16T16:29:05.538Z"},
      "pair3": {"gameId":"21","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":68.4,"paymentStatus":"paid","soldDate":"2026-01-16T16:35:42.116Z"}
    },
    "22": {
      "pair1": {"gameId":"22","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":144.18,"paymentStatus":"paid","soldDate":"2026-01-16T16:28:54.302Z"},
      "pair2": {"gameId":"22","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":301.72,"paymentStatus":"paid","soldDate":"2026-01-16T16:29:34.251Z"},
      "pair3": {"gameId":"22","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":145.8,"paymentStatus":"paid","soldDate":"2026-01-16T16:36:08.116Z"}
    },
    "23": {
      "pair1": {"gameId":"23","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":138.6,"paymentStatus":"paid","soldDate":"2026-01-16T16:29:22.912Z"},
      "pair2": {"gameId":"23","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":121.05,"paymentStatus":"paid","soldDate":"2026-01-16T16:29:58.485Z"},
      "pair3": {"gameId":"23","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":108,"paymentStatus":"paid","soldDate":"2026-01-16T16:36:23.173Z"}
    },
    "24": {
      "pair1": {"gameId":"24","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":232.96,"paymentStatus":"paid","soldDate":"2026-01-16T16:29:47.850Z"},
      "pair2": {"gameId":"24","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":154.03,"paymentStatus":"paid","soldDate":"2026-01-16T16:30:31.704Z"},
      "pair3": {"gameId":"24","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":144.13,"paymentStatus":"paid","soldDate":"2026-01-16T16:36:48.886Z"}
    },
    "25": {
      "pair1": {"gameId":"25","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":298.26,"paymentStatus":"paid","soldDate":"2026-01-16T16:30:17.284Z"},
      "pair2": {"gameId":"25","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":92.39,"paymentStatus":"paid","soldDate":"2026-01-16T16:30:58.249Z"},
      "pair3": {"gameId":"25","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":81.81,"paymentStatus":"paid","soldDate":"2026-01-16T16:37:18.229Z"}
    },
    "26": {
      "pair1": {"gameId":"26","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":200.25,"paymentStatus":"paid","soldDate":"2026-01-16T16:30:46.716Z"},
      "pair2": {"gameId":"26","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":33.73,"paymentStatus":"pending","soldDate":"2026-01-16T15:59:24.462Z"}
    },
    "27": {
      "pair1": {"gameId":"27","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":99,"paymentStatus":"pending","soldDate":"2026-01-15T15:33:42.803Z"},
      "pair2": {"gameId":"27","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":99,"paymentStatus":"pending","soldDate":"2026-01-21T08:05:37.979Z"},
      "pair3": {"gameId":"27","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":36.2,"paymentStatus":"pending","soldDate":"2026-01-21T08:05:43.591Z"}
    },
    "28": {
      "pair1": {"gameId":"28","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":34.9,"paymentStatus":"pending","soldDate":"2026-01-21T08:05:02.348Z"},
      "pair2": {"gameId":"28","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":120.6,"paymentStatus":"pending","soldDate":"2026-01-16T14:29:30.101Z"}
    },
    "29": {
      "pair1": {"gameId":"29","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":230.4,"paymentStatus":"pending","soldDate":"2026-01-16T15:51:18.763Z"}
    },
    "30": {
      "pair1": {"gameId":"30","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":130.36,"paymentStatus":"pending","soldDate":"2025-12-19T03:34:51.167Z"}
    },
    "p1": {
      "pair1": {"gameId":"p1","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":33.77,"paymentStatus":"paid","soldDate":"2025-10-15T02:12:54.008Z"},
      "pair2": {"gameId":"p1","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":18.2,"paymentStatus":"paid","soldDate":"2025-10-15T02:12:56.909Z"},
      "pair3": {"gameId":"p1","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":16.61,"paymentStatus":"paid","soldDate":"2025-10-15T02:15:40.189Z"}
    },
    "p2": {
      "pair1": {"gameId":"p2","pairId":"pair1","section":"129","row":"26","seats":"24-25","price":37.48,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:07.248Z"},
      "pair2": {"gameId":"p2","pairId":"pair2","section":"308","row":"8","seats":"1-2","price":14.31,"paymentStatus":"paid","soldDate":"2025-10-15T02:13:10.899Z"},
      "pair3": {"gameId":"p2","pairId":"pair3","section":"325","row":"5","seats":"6-7","price":21.6,"paymentStatus":"paid","soldDate":"2025-10-15T02:15:46.615Z"}
    }
  },
  seatPairs: [
    { id: "pair1", section: "129", row: "26", seats: "24-25", seasonCost: 6651.12 },
    { id: "pair2", section: "308", row: "8", seats: "1-2", seasonCost: 3505.32 },
    { id: "pair3", section: "325", row: "5", seats: "6-7", seasonCost: 3505.32 }
  ]
};

function normalizePaymentStatus(status: string): 'Pending' | 'Per Seat' | 'Paid' {
  const lower = status.toLowerCase();
  if (lower === 'pending') return 'Pending';
  if (lower === 'per seat') return 'Per Seat';
  return 'Paid';
}

function transformSalesData(rawSalesData: Record<string, Record<string, any>>): Record<string, Record<string, SaleRecord>> {
  const transformed: Record<string, Record<string, SaleRecord>> = {};

  Object.entries(rawSalesData).forEach(([gameId, gameSales]) => {
    transformed[gameId] = {};
    Object.entries(gameSales).forEach(([pairId, sale]) => {
      const seatsStr = sale?.seats || '';
      const seatCount = parseSeatsCount(seatsStr);

      transformed[gameId][pairId] = {
        id: `${gameId}_${pairId}`,
        gameId: sale.gameId,
        pairId: sale.pairId,
        section: sale.section,
        row: sale.row,
        seats: seatsStr,
        seatCount,
        price: sale.price,
        paymentStatus: normalizePaymentStatus(sale.paymentStatus),
        soldDate: sale.soldDate,
      };
    });
  });

  return transformed;
}

type TicketSaleSeedRow = {
  totalPrice: number;
  eventName: string;
  eventStartTime: string;
  tickets: { section: string; row: string; seat_number: number }[];
};

const PANTHERS_TICKET_SALES_SEED: TicketSaleSeedRow[] = [
  { totalPrice: 120.58, eventName: 'Boston Bruins at Florida Panthers', eventStartTime: '2026-02-05T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 73.64, eventName: 'Utah Mammoth at Florida Panthers', eventStartTime: '2026-01-28T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 40, eventName: 'Buffalo Sabres at Florida Panthers', eventStartTime: '2026-02-03T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 142.5, eventName: 'Winnipeg Jets at Florida Panthers', eventStartTime: '2026-01-31T21:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 41, eventName: 'San Jose Sharks at Florida Panthers', eventStartTime: '2026-01-19T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 160.14, eventName: 'Montreal Canadiens at Florida Panthers', eventStartTime: '2025-12-31T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 90.9, eventName: 'Colorado Avalanche at Florida Panthers', eventStartTime: '2026-01-04T22:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 38, eventName: 'Carolina Hurricanes at Florida Panthers', eventStartTime: '2025-12-20T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 120, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-12-30T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 50, eventName: 'Los Angeles Kings at Florida Panthers', eventStartTime: '2025-12-18T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 162, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-12-28T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 76, eventName: 'St. Louis Blues at Florida Panthers', eventStartTime: '2025-12-20T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 14, eventName: 'Columbus Blue Jackets at Florida Panthers', eventStartTime: '2025-12-06T20:30:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 48, eventName: 'New York Islanders at Florida Panthers', eventStartTime: '2025-12-07T22:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 33.32, eventName: 'Nashville Predators at Florida Panthers', eventStartTime: '2025-12-05T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 46, eventName: 'Toronto Maple Leafs at Florida Panthers', eventStartTime: '2025-12-03T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 42.2, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-11-27T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 53.08, eventName: 'Calgary Flames at Florida Panthers', eventStartTime: '2025-11-28T21:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 15, eventName: 'New Jersey Devils at Florida Panthers', eventStartTime: '2025-11-21T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 120.3, eventName: 'Edmonton Oilers at Florida Panthers', eventStartTime: '2025-11-23T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 24.3, eventName: 'Vancouver Canucks at Florida Panthers', eventStartTime: '2025-11-18T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 34, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-11-14T00:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 78.9, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-11-15T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 60, eventName: 'Dallas Stars at Florida Panthers', eventStartTime: '2025-11-01T22:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 44.02, eventName: 'Anaheim Ducks at Florida Panthers', eventStartTime: '2025-10-28T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 80, eventName: 'Vegas Golden Knights at Florida Panthers', eventStartTime: '2025-10-25T22:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 46.16, eventName: 'Pittsburgh Penguins at Florida Panthers', eventStartTime: '2025-10-23T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 60, eventName: 'Ottawa Senators at Florida Panthers', eventStartTime: '2025-10-11T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 30.22, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-10-09T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 154, eventName: 'Chicago Blackhawks at Florida Panthers', eventStartTime: '2025-10-07T21:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 24, eventName: 'NHL Preseason - Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-10-04T23:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },
  { totalPrice: 18.46, eventName: 'NHL Preseason - Carolina Hurricanes at Florida Panthers', eventStartTime: '2025-09-29T22:00:00.000Z', tickets: [{ section: '325', row: '5', seat_number: 6 }, { section: '325', row: '5', seat_number: 7 }] },

  { totalPrice: 108.72, eventName: 'Boston Bruins at Florida Panthers', eventStartTime: '2026-02-05T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 33, eventName: 'Buffalo Sabres at Florida Panthers', eventStartTime: '2026-02-03T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 38, eventName: 'San Jose Sharks at Florida Panthers', eventStartTime: '2026-01-19T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 37.48, eventName: 'Utah Mammoth at Florida Panthers', eventStartTime: '2026-01-28T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 134, eventName: 'Winnipeg Jets at Florida Panthers', eventStartTime: '2026-01-31T21:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 116, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-12-30T00:00:00.000Z', tickets: [{ section: '326', row: '9', seat_number: 3 }, { section: '326', row: '9', seat_number: 4 }] },
  { totalPrice: 31.8, eventName: 'Los Angeles Kings at Florida Panthers', eventStartTime: '2025-12-18T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 134.5, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-12-30T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 60.46, eventName: 'St. Louis Blues at Florida Panthers', eventStartTime: '2025-12-20T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 171.14, eventName: 'Montreal Canadiens at Florida Panthers', eventStartTime: '2025-12-31T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 154, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-12-28T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 17.98, eventName: 'Columbus Blue Jackets at Florida Panthers', eventStartTime: '2025-12-06T20:30:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 30.74, eventName: 'New York Islanders at Florida Panthers', eventStartTime: '2025-12-07T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 35.7, eventName: 'Nashville Predators at Florida Panthers', eventStartTime: '2025-12-05T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 39.2, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-11-27T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 54, eventName: 'Calgary Flames at Florida Panthers', eventStartTime: '2025-11-28T21:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 29.66, eventName: 'New Jersey Devils at Florida Panthers', eventStartTime: '2025-11-21T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 60, eventName: 'Toronto Maple Leafs at Florida Panthers', eventStartTime: '2025-12-03T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 82.9, eventName: 'Edmonton Oilers at Florida Panthers', eventStartTime: '2025-11-23T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 22.18, eventName: 'Vancouver Canucks at Florida Panthers', eventStartTime: '2025-11-18T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 28.7, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-11-14T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 119.24, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-11-15T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 40, eventName: 'Dallas Stars at Florida Panthers', eventStartTime: '2025-11-01T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 30, eventName: 'Anaheim Ducks at Florida Panthers', eventStartTime: '2025-10-28T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 40.56, eventName: 'Pittsburgh Penguins at Florida Panthers', eventStartTime: '2025-10-23T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 58, eventName: 'Vegas Golden Knights at Florida Panthers', eventStartTime: '2025-10-25T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 26, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-10-09T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 138, eventName: 'Chicago Blackhawks at Florida Panthers', eventStartTime: '2025-10-07T21:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 15.9, eventName: 'NHL Preseason - Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-10-04T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },
  { totalPrice: 20.22, eventName: 'NHL Preseason - Carolina Hurricanes at Florida Panthers', eventStartTime: '2025-09-29T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 1 }, { section: '308', row: '8', seat_number: 2 }] },

  { totalPrice: 105.18, eventName: 'Utah Mammoth at Florida Panthers', eventStartTime: '2026-01-28T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 256, eventName: 'Winnipeg Jets at Florida Panthers', eventStartTime: '2026-01-31T21:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 110, eventName: 'San Jose Sharks at Florida Panthers', eventStartTime: '2026-01-19T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 84, eventName: 'Carolina Hurricanes at Florida Panthers', eventStartTime: '2025-12-20T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 144.84, eventName: 'Buffalo Sabres at Florida Panthers', eventStartTime: '2026-02-03T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 222.5, eventName: 'Colorado Avalanche at Florida Panthers', eventStartTime: '2026-01-04T22:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 331.4, eventName: 'Montreal Canadiens at Florida Panthers', eventStartTime: '2025-12-31T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 258.84, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-12-30T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 335.24, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-12-28T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 160.2, eventName: 'St. Louis Blues at Florida Panthers', eventStartTime: '2025-12-20T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 96.6, eventName: 'New York Islanders at Florida Panthers', eventStartTime: '2025-12-07T22:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 80.1, eventName: 'Columbus Blue Jackets at Florida Panthers', eventStartTime: '2025-12-06T20:30:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 62, eventName: 'Nashville Predators at Florida Panthers', eventStartTime: '2025-12-05T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 126.2, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-11-27T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 154, eventName: 'Calgary Flames at Florida Panthers', eventStartTime: '2025-11-28T21:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 141.5, eventName: 'Toronto Maple Leafs at Florida Panthers', eventStartTime: '2025-12-03T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 54.38, eventName: 'New Jersey Devils at Florida Panthers', eventStartTime: '2025-11-21T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 180, eventName: 'Edmonton Oilers at Florida Panthers', eventStartTime: '2025-11-23T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 66, eventName: 'Vancouver Canucks at Florida Panthers', eventStartTime: '2025-11-18T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 92.94, eventName: 'Washington Capitals at Florida Panthers', eventStartTime: '2025-11-14T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 219.62, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-11-15T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 132, eventName: 'Dallas Stars at Florida Panthers', eventStartTime: '2025-11-01T22:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 42, eventName: 'Anaheim Ducks at Florida Panthers', eventStartTime: '2025-10-28T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 115.08, eventName: 'Pittsburgh Penguins at Florida Panthers', eventStartTime: '2025-10-23T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 65.74, eventName: 'Philadelphia Flyers at Florida Panthers', eventStartTime: '2025-10-09T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 142.22, eventName: 'Ottawa Senators at Florida Panthers', eventStartTime: '2025-10-11T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 260, eventName: 'Chicago Blackhawks at Florida Panthers', eventStartTime: '2025-10-07T21:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 37.52, eventName: 'NHL Preseason - Carolina Hurricanes at Florida Panthers', eventStartTime: '2025-09-29T22:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 44.1, eventName: 'NHL Preseason - Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-10-04T23:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },

  { totalPrice: 448, eventName: 'Boston Bruins at Florida Panthers', eventStartTime: '2026-02-05T00:00:00.000Z', tickets: [{ section: '129', row: '26', seat_number: 23 }, { section: '129', row: '26', seat_number: 24 }] },
  { totalPrice: 556.2, eventName: 'Tame Impala', eventStartTime: '2025-11-18T04:00:00.000Z', tickets: [{ section: '208', row: '19', seat_number: 5 }, { section: '208', row: '19', seat_number: 6 }] },
  { totalPrice: 330.62, eventName: 'Tame Impala', eventStartTime: '2025-10-28T00:00:00.000Z', tickets: [{ section: '117', row: '4', seat_number: 13 }, { section: '117', row: '4', seat_number: 14 }] },
  { totalPrice: 88, eventName: 'Mississippi State Bulldogs at Florida Gators Football', eventStartTime: '2025-10-18T04:00:00.000Z', tickets: [{ section: '57', row: '85', seat_number: 28 }, { section: '57', row: '85', seat_number: 29 }] },

  { totalPrice: 670.2, eventName: 'NHL Stanley Cup Finals: Edmonton Oilers at Florida Panthers (Game 3, Home Game 1)', eventStartTime: '2025-06-10T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 335.78, eventName: 'NHL Eastern Conference Finals: Carolina Hurricanes at Florida Panthers (Game 3, Home Game 1)', eventStartTime: '2025-05-25T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 260.02, eventName: 'NHL Eastern Conference Semifinals: Toronto Maple Leafs at Florida Panthers (Game 6, Home Game 3)', eventStartTime: '2025-05-17T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 188.74, eventName: 'NHL Eastern Conference Quarterfinals: Tampa Bay Lightning at Florida Panthers (Game 4, Home Game 2)', eventStartTime: '2025-04-28T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 214.64, eventName: 'NHL Eastern Conference Quarterfinals: Tampa Bay Lightning at Florida Panthers (Game 3, Home Game 1)', eventStartTime: '2025-04-26T17:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 124.3, eventName: 'New York Rangers at Florida Panthers', eventStartTime: '2025-04-14T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 43.16, eventName: 'Detroit Red Wings at Florida Panthers', eventStartTime: '2025-04-10T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 80.22, eventName: 'Buffalo Sabres at Florida Panthers', eventStartTime: '2025-04-12T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 79.84, eventName: 'Toronto Maple Leafs at Florida Panthers', eventStartTime: '2025-04-08T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 110.22, eventName: 'Montreal Canadiens at Florida Panthers', eventStartTime: '2025-03-30T17:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 54.62, eventName: 'Utah Hockey Club at Florida Panthers', eventStartTime: '2025-03-28T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 78.56, eventName: 'Pittsburgh Penguins at Florida Panthers', eventStartTime: '2025-03-23T22:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 62.78, eventName: 'Buffalo Sabres at Florida Panthers', eventStartTime: '2025-03-08T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 36.04, eventName: 'Columbus Blue Jackets at Florida Panthers', eventStartTime: '2025-03-07T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 60.54, eventName: 'Tampa Bay Lightning at Florida Panthers', eventStartTime: '2025-03-04T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 92.44, eventName: 'Seattle Kraken at Florida Panthers', eventStartTime: '2025-02-22T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 70.4, eventName: 'Calgary Flames at Florida Panthers', eventStartTime: '2025-03-01T20:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 85.96, eventName: 'Edmonton Oilers at Florida Panthers', eventStartTime: '2025-02-28T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 64.4, eventName: 'Ottawa Senators at Florida Panthers', eventStartTime: '2025-02-09T00:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 45, eventName: 'New York Islanders at Florida Panthers', eventStartTime: '2025-02-02T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
  { totalPrice: 94, eventName: 'Anaheim Ducks at Florida Panthers', eventStartTime: '2025-01-18T23:00:00.000Z', tickets: [{ section: '308', row: '8', seat_number: 19 }, { section: '308', row: '8', seat_number: 20 }] },
];

function buildSalesDataFromTicketSaleSeedRows(
  seedRows: TicketSaleSeedRow[],
  games: Game[],
  seatPairs: SeatPair[],
): Record<string, Record<string, SaleRecord>> {
  const salesData: Record<string, Record<string, SaleRecord>> = {};

  const normalizeOpponent = (name: string): string => {
    return String(name || '')
      .replace(/^nhl\s+preseason\s+-\s+/i, '')
      .replace(/\s+at\s+florida\s+panthers\s*$/i, '')
      .replace(/^vs\s+/i, '')
      .trim()
      .toLowerCase();
  };

  const cleanDateKey = (iso: string | undefined | null): string | null => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  };

  const seatPairBySectionRow: Record<string, SeatPair> = {};
  (seatPairs || []).forEach((p) => {
    const key = `${String(p.section)}|${String(p.row)}`;
    seatPairBySectionRow[key] = p;
  });

  const gameByDateOpponent: Record<string, Game> = {};
  (games || []).forEach((g) => {
    const dateKey = cleanDateKey(g.dateTimeISO || g.date);
    if (!dateKey) return;
    const opp = normalizeOpponent(g.opponent);
    if (!opp) return;
    gameByDateOpponent[`${dateKey}|${opp}`] = g;
  });

  let kept = 0;
  let discarded = 0;

  for (const row of seedRows) {
    const dateKey = cleanDateKey(row.eventStartTime);
    const opp = normalizeOpponent(row.eventName);
    if (!dateKey || !opp) {
      discarded += 1;
      continue;
    }

    const game = gameByDateOpponent[`${dateKey}|${opp}`];
    if (!game) {
      console.log('[TicketSalesSeed] No matching game for seed row:', { dateKey, opp, eventName: row.eventName, eventStartTime: row.eventStartTime });
      discarded += 1;
      continue;
    }

    const firstTicket = row.tickets?.[0];
    if (!firstTicket) {
      discarded += 1;
      continue;
    }

    const section = String(firstTicket.section ?? '').trim();
    const rowStr = String(firstTicket.row ?? '').trim();
    const pairKey = `${section}|${rowStr}`;
    const seatPair = seatPairBySectionRow[pairKey];
    if (!seatPair) {
      discarded += 1;
      continue;
    }

    const seatNums = (row.tickets || [])
      .filter((t) => String(t.section ?? '').trim() === section && String(t.row ?? '').trim() === rowStr)
      .map((t) => Number(t.seat_number))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    if (seatNums.length === 0) {
      discarded += 1;
      continue;
    }

    let seatsStr = '';
    if (seatNums.length === 2 && seatNums[1] === seatNums[0] + 1) {
      seatsStr = `${seatNums[0]}-${seatNums[1]}`;
    } else {
      seatsStr = seatNums.join(',');
    }

    const sale: SaleRecord = {
      id: `${game.id}_${seatPair.id}`,
      gameId: game.id,
      pairId: seatPair.id,
      section,
      row: rowStr,
      seats: seatsStr,
      seatCount: parseSeatsCount(seatsStr),
      opponentLogo: game.opponentLogo,
      price: Number(row.totalPrice) || 0,
      paymentStatus: 'Paid',
      soldDate: row.eventStartTime,
    };

    if (!salesData[game.id]) salesData[game.id] = {};
    salesData[game.id][seatPair.id] = sale;
    kept += 1;
  }

  console.log('[TicketSalesSeed] Built canonical salesData from seed:', {
    kept,
    discarded,
    gameCount: Object.keys(salesData).length,
  });

  return salesData;
}

function buildCanonicalPanthersSalesData(games: Game[], seatPairs: SeatPair[]): Record<string, Record<string, SaleRecord>> {
  return buildSalesDataFromTicketSaleSeedRows(PANTHERS_TICKET_SALES_SEED, games, seatPairs);
}

function parseTicketSaleSeedText(raw: string): TicketSaleSeedRow[] {
  const lines = String(raw || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: TicketSaleSeedRow[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.startsWith('total_price') || lower.startsWith('totalprice')) {
      continue;
    }

    const jsonStart = line.indexOf('[');
    if (jsonStart < 0) {
      console.log('[TicketSalesSeed] Skipping line (no tickets JSON):', line.slice(0, 120));
      continue;
    }

    const left = line.slice(0, jsonStart).trim();
    const json = line.slice(jsonStart).trim();

    const parts = left.split(/\t+/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) {
      const csvParts = left
        .split(/\s{2,}|,(?=(?:[^\"]*\"[^\"]*\")*[^\"]*$)/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (csvParts.length >= 3) {
        parts.splice(0, parts.length, ...csvParts.slice(0, 3));
      }
    }

    const totalPriceRaw = parts[0];
    const eventName = parts[1] || '';
    const eventStartTime = parts[2] || '';

    const totalPrice = Number(String(totalPriceRaw).replace(/[^0-9.\-]/g, ''));
    if (!Number.isFinite(totalPrice) || !eventName || !eventStartTime) {
      console.log('[TicketSalesSeed] Skipping line (missing fields):', { totalPriceRaw, eventName, eventStartTime });
      continue;
    }

    let tickets: TicketSaleSeedRow['tickets'] = [];
    try {
      const parsed = JSON.parse(json);
      if (Array.isArray(parsed)) {
        tickets = parsed as TicketSaleSeedRow['tickets'];
      }
    } catch (e) {
      console.log('[TicketSalesSeed] Skipping line (bad tickets JSON):', e);
      continue;
    }

    rows.push({ totalPrice, eventName, eventStartTime: new Date(eventStartTime).toISOString(), tickets });
  }

  console.log('[TicketSalesSeed] Parsed seed text rows:', rows.length);
  return rows;
}

async function runDiagnostics(): Promise<{
  dataImportedRaw: string | null;
  passesRaw: string | null;
  passesLength: number;
  parseSuccess: boolean;
  parseError: string | null;
  parsedPasses: SeasonPass[];
  activeIdRaw: string | null;
  activeIdParsed: string | null;
}> {
  console.log('\n========== DIAGNOSTICS (READ-ONLY) ==========');
  console.log('[Diag] Platform.OS =', Platform.OS);
  
  const dataImportedRaw = await AsyncStorage.getItem(DATA_IMPORTED_KEY);
  console.log('[Diag] DATA_IMPORTED_KEY raw value:', JSON.stringify(dataImportedRaw));
  
  const passesRaw = await AsyncStorage.getItem(SEASON_PASSES_KEY);
  const passesLength = passesRaw?.length ?? 0;
  console.log('[Diag] SEASON_PASSES_KEY raw length:', passesLength);
  
  let parseSuccess = false;
  let parseError: string | null = null;
  let parsedPasses: SeasonPass[] = [];
  
  if (passesRaw) {
    try {
      const parsed = JSON.parse(passesRaw);
      if (Array.isArray(parsed)) {
        parsedPasses = parsed;
        parseSuccess = true;
        console.log('[Diag] ✅ Parse SUCCESS - passes count:', parsedPasses.length);
        parsedPasses.forEach((p, i) => {
          console.log(`[Diag]   Pass[${i}]: id=${p.id}, team=${p.teamName}, league=${p.leagueId}`);
        });
      } else {
        parseError = 'Parsed value is not an array';
        console.log('[Diag] ❌ Parse FAILED:', parseError);
      }
    } catch (e: any) {
      parseError = e?.message || String(e);
      console.log('[Diag] ❌ JSON.parse FAILED:', parseError);
      console.log('[Diag] First 200 chars of raw:', passesRaw.substring(0, 200));
    }
  } else {
    console.log('[Diag] SEASON_PASSES_KEY is null/empty (no data stored)');
    parseSuccess = true;
  }
  
  const activeIdRaw = await AsyncStorage.getItem(ACTIVE_PASS_KEY);
  let activeIdParsed: string | null = null;
  console.log('[Diag] ACTIVE_PASS_KEY raw value:', JSON.stringify(activeIdRaw));
  
  if (activeIdRaw) {
    try {
      activeIdParsed = JSON.parse(activeIdRaw);
      const existsInPasses = parsedPasses.some(p => p.id === activeIdParsed);
      console.log('[Diag] activeSeasonPassId parsed:', activeIdParsed, '- exists in passes:', existsInPasses);
    } catch {
      console.log('[Diag] activeSeasonPassId parse failed, raw:', activeIdRaw);
    }
  }
  
  console.log('========== END DIAGNOSTICS ==========\n');
  
  return {
    dataImportedRaw,
    passesRaw,
    passesLength,
    parseSuccess,
    parseError,
    parsedPasses,
    activeIdRaw,
    activeIdParsed,
  };
}

async function saveAllPassesBackup(passes: SeasonPass[]): Promise<void> {
  try {
    if (!passes || passes.length === 0) {
      console.log('[Backup] Skipping all-passes backup - no passes to save');
      return;
    }
    const backupData = {
      timestamp: new Date().toISOString(),
      passCount: passes.length,
      passes: passes,
    };
    await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));
    console.log('[Backup] ✅ Saved all-passes backup with', passes.length, 'passes');
  } catch (error) {
    console.error('[Backup] Failed to save all-passes backup:', error);
  }
}

async function recoverFromAllPassesBackup(): Promise<SeasonPass[] | null> {
  try {
    const backupRaw = await AsyncStorage.getItem(ALL_PASSES_BACKUP_KEY);
    if (!backupRaw) {
      console.log('[Recovery] No all-passes backup found');
      
      // Try master backup as fallback
      const masterBackupRaw = await AsyncStorage.getItem(MASTER_BACKUP_KEY);
      if (masterBackupRaw) {
        try {
          const masterBackup = JSON.parse(masterBackupRaw);
          if (masterBackup.seasonPasses && Array.isArray(masterBackup.seasonPasses) && masterBackup.seasonPasses.length > 0) {
            console.log('[Recovery] ✅ Found', masterBackup.seasonPasses.length, 'passes in master backup');
            return masterBackup.seasonPasses;
          }
        } catch (e: any) {
          console.warn('[Recovery] Failed to parse master backup:', e);
        }
      }
      
      return null;
    }
    
    const backupData = JSON.parse(backupRaw);
    if (backupData.passes && Array.isArray(backupData.passes) && backupData.passes.length > 0) {
      console.log('[Recovery] ✅ Found', backupData.passes.length, 'passes in all-passes backup from', backupData.timestamp);
      return backupData.passes;
    }
    
    return null;
  } catch (error) {
    console.error('[Recovery] Failed to recover from all-passes backup:', error);
    return null;
  }
}

async function safeSeedPanthersIfEmpty(): Promise<SeasonPass | null> {
  console.log('[Seed] Checking if Panthers seed is needed...');
  
  const panthersTeam = NHL_TEAMS.find(t => t.id === 'fla');
  const nhlLeague = LEAGUES.find(l => l.id === 'nhl');
  
  if (!panthersTeam || !nhlLeague) {
    console.error('[Seed] Could not find Florida Panthers or NHL league');
    return null;
  }
  
  const games = PANTHERS_20252026_SCHEDULE;
  const canonicalSalesData = buildCanonicalPanthersSalesData(games, INITIAL_BACKUP_DATA.seatPairs);
  console.log('[Seed] Built canonical sales data from PANTHERS_TICKET_SALES_SEED');

  const seasonPass: SeasonPass = {
    id: 'sp_imported_panthers_2025',
    leagueId: 'nhl',
    teamId: 'fla',
    teamName: 'Florida Panthers',
    teamLogoUrl: panthersTeam.logoUrl,
    teamPrimaryColor: panthersTeam.primaryColor,
    teamSecondaryColor: panthersTeam.secondaryColor,
    seasonLabel: '2025-2026',
    seatPairs: INITIAL_BACKUP_DATA.seatPairs,
    salesData: canonicalSalesData,
    games,
    events: [],
    createdAtISO: new Date().toISOString(),
  };
  
  console.log('[Seed] ✅ Created Panthers pass:', seasonPass.id);
  return seasonPass;
}

export const [SeasonPassProvider, useSeasonPass] = createContextHook(() => {
  const [seasonPasses, setSeasonPasses] = useState<SeasonPass[]>([]);
  const [activeSeasonPassId, setActiveSeasonPassId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [lastScheduleError, setLastScheduleError] = useState<string | null>(null);
  
  const [lastBackupTime, setLastBackupTime] = useState<string | null>(null);
  const [lastBackupStatus, setLastBackupStatus] = useState<'success' | 'failed' | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupConfirmationMessage, setBackupConfirmationMessage] = useState<string | null>(null);
  
  // Version counter to force recalculation of stats when sales data changes
  const [salesDataVersion, setSalesDataVersion] = useState(0);
  
  const fetchAttemptedRef = useRef<Set<string>>(new Set());
  const isInitialLoad = useRef(true);
  const isIntentionalClear = useRef(false);

  const activeSeasonPass = useMemo(() => {
    if (!activeSeasonPassId) return null;
    return seasonPasses.find(sp => sp.id === activeSeasonPassId) || null;
  }, [seasonPasses, activeSeasonPassId]);

  // Ensure a SeasonPass has the minimal required fields to avoid runtime errors
  function normalizeSeasonPass(p: any): SeasonPass {
    return {
      id: p.id,
      leagueId: p.leagueId,
      teamId: p.teamId,
      teamName: p.teamName,
      teamAbbreviation: p.teamAbbreviation,
      teamLogoUrl: p.teamLogoUrl || undefined,
      teamPrimaryColor: p.teamPrimaryColor || AppColors.primary,
      teamSecondaryColor: p.teamSecondaryColor || AppColors.gold,
      seasonLabel: p.seasonLabel || '',
      seatPairs: Array.isArray(p.seatPairs) ? p.seatPairs : [],
      salesData: p.salesData || {},
      games: Array.isArray(p.games) ? p.games : [],
      events: Array.isArray(p.events) ? p.events : [],
      createdAtISO: p.createdAtISO || new Date().toISOString(),
    } as SeasonPass;
  }

  // Helper to write a backup folder with JSON, asset files (from embedded data URIs),
  // links.txt for remote logos, and a README with restore instructions.
  async function writeBackupFolder(backupObj: BackupData, folderBaseName: string, embedAssets: boolean, fileName: string) {
    if (Platform.OS === 'web') {
      // On web we can't create a folder on disk; instead trigger downloads for JSON and README
      const filesToDownload: { name: string; blob: Blob }[] = [];
      filesToDownload.push({ name: fileName, blob: new Blob([JSON.stringify(backupObj, null, 2)], { type: 'application/json' }) });
      // Prepare README
      const readme = `Season Pass Backup (${folderBaseName})\n\nRestore instructions:\n1) Open the app -> Settings -> Restore from File\n2) Select the downloaded JSON file (${fileName})\n\nIf logos are included as data URIs they will render in the browser.\n`;
      filesToDownload.push({ name: 'README.txt', blob: new Blob([readme], { type: 'text/plain' }) });

      for (const f of filesToDownload) {
        const url = URL.createObjectURL(f.blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = f.name;
        a.click();
        URL.revokeObjectURL(url);
      }
      return { folderUri: 'WEB:downloads', writtenFiles: filesToDownload.map(f => f.name) };
    }

    // Native: create a directory under documentDirectory
    const folderName = `${folderBaseName}`;
    const dirUri = FileSystem.documentDirectory + folderName + '/';
    try {
      const info = await FileSystem.getInfoAsync(dirUri);
      if (!info.exists) {
        await FileSystem.makeDirectoryAsync(dirUri, { intermediates: true });
      }
    } catch (mkErr) {
      console.warn('[Backup] Could not create folder, falling back to documentDirectory root', mkErr);
    }

    const written: string[] = [];

    // If embedAssets is true and logos are data URIs, extract them into files and update JSON refs
    const passesClone: any = JSON.parse(JSON.stringify(backupObj.seasonPasses || []));

    for (const p of passesClone) {
      if (p.teamLogoUrl && typeof p.teamLogoUrl === 'string' && p.teamLogoUrl.startsWith('data:') && embedAssets) {
        const match = p.teamLogoUrl.match(/^data:(.+?);base64,(.*)$/);
        if (match) {
          const mime = match[1];
          const b64 = match[2];
          const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1] || 'png';
          const fn = `team_${p.id}.${ext}`;
          const dest = dirUri + fn;
          try {
            await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
            p.teamLogoUrl = dest;
            written.push(fn);
          } catch (we) {
            console.warn('[Backup] Failed to write embedded team logo file', fn, we);
          }
        }
      }

      if (Array.isArray(p.games)) {
        for (const g of p.games) {
          if (g.opponentLogo && typeof g.opponentLogo === 'string' && g.opponentLogo.startsWith('data:') && embedAssets) {
            const match = g.opponentLogo.match(/^data:(.+?);base64,(.*)$/);
            if (match) {
              const mime = match[1];
              const b64 = match[2];
              const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1] || 'png';
              const fn = `opp_${p.id}_${g.id}.${ext}`;
              const dest = dirUri + fn;
              try {
                await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
                g.opponentLogo = dest;
                written.push(fn);
              } catch (we) {
                console.warn('[Backup] Failed to write embedded opponent logo file', fn, we);
              }
            }
          }
        }
      }
    }

    // Now write the updated JSON to folder
    const jsonPath = dirUri + fileName;
    try {
      await FileSystem.writeAsStringAsync(jsonPath, JSON.stringify({ ...backupObj, seasonPasses: passesClone }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      written.push(fileName);
    } catch (jw) {
      console.error('[Backup] Failed to write backup JSON to folder', jw);
      // fallback: write to documentDirectory root
      const fallbackPath = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fallbackPath, JSON.stringify({ ...backupObj, seasonPasses: passesClone }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      written.push(fileName);
    }

    // If there are non-embedded logo URLs, write a links.txt listing them
    const links: string[] = [];
    for (const p of passesClone) {
      if (p.teamLogoUrl && typeof p.teamLogoUrl === 'string' && !p.teamLogoUrl.startsWith('data:') && !p.teamLogoUrl.startsWith(FileSystem.documentDirectory) && !p.teamLogoUrl.startsWith('file:')) {
        links.push(`team:${p.teamName}:${p.teamLogoUrl}`);
      }
      if (Array.isArray(p.games)) {
        for (const g of p.games) {
          if (g.opponentLogo && typeof g.opponentLogo === 'string' && !g.opponentLogo.startsWith('data:') && !g.opponentLogo.startsWith(FileSystem.documentDirectory) && !g.opponentLogo.startsWith('file:')) {
            links.push(`game:${p.teamName}:${g.id}:${g.opponent}:${g.opponentLogo}`);
          }
        }
      }
    }

    if (links.length > 0) {
      const linksPath = dirUri + 'links.txt';
      try {
        await FileSystem.writeAsStringAsync(linksPath, links.join('\n'), { encoding: FileSystem.EncodingType.UTF8 });
        written.push('links.txt');
      } catch (le) {
        console.warn('[Backup] Failed to write links.txt', le);
      }
    }

    // README with restore instructions
    const readme = `Season Pass Backup Folder: ${folderName}\n\nFiles included:\n${written.join('\n')}\n\nRestore instructions:\n- In the app: Settings -> Restore from File -> select ${fileName}\n- Or open app and paste the recovery code if you generated one.\n\nNotes:\n- Files named like team_<id>.<ext> and opp_<passId>_<gameId>.<ext> are included for offline logos.\n- If logos are not embedded, check links.txt for remote URLs.\n`;
    try {
      await FileSystem.writeAsStringAsync(dirUri + 'README.txt', readme, { encoding: FileSystem.EncodingType.UTF8 });
      written.push('README.txt');
    } catch (re) {
      console.warn('[Backup] Failed to write README.txt', re);
    }

    return { folderUri: dirUri, writtenFiles: written };
  }

  

  const loadData = useCallback(async () => {
    try {
      console.log('[SeasonPass] Loading data from storage...');
      
      const diag = await runDiagnostics();
      
      if (!diag.parseSuccess) {
        console.error('[SeasonPass] ❌ CRITICAL: Parse failed, attempting recovery from backup...');
        console.error('[SeasonPass] Parse error:', diag.parseError);
        
        // Try to recover from ALL_PASSES_BACKUP_KEY first
        const recoveredPasses = await recoverFromAllPassesBackup();
        if (recoveredPasses && recoveredPasses.length > 0) {
          console.log('[SeasonPass] ✅ Recovered', recoveredPasses.length, 'passes from all-passes backup');
          setSeasonPasses(recoveredPasses);
          setActiveSeasonPassId(recoveredPasses[0].id);
          setNeedsSetup(false);
          // Re-save to primary storage
          await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(recoveredPasses));
          await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(recoveredPasses[0].id));
          return;
        }
        
        setSeasonPasses([]);
        setActiveSeasonPassId(null);
        setNeedsSetup(true);
        return;
      }
      
      let passes = diag.parsedPasses;
      let activeId = diag.activeIdParsed;

      // CRITICAL: If passes array is empty, try to recover from backup FIRST
      if (passes.length === 0) {
        console.log('[SeasonPass] No passes in primary storage, checking backup...');
        const recoveredPasses = await recoverFromAllPassesBackup();
        if (recoveredPasses && recoveredPasses.length > 0) {
          console.log('[SeasonPass] ✅ Recovered', recoveredPasses.length, 'passes from backup');
          passes = recoveredPasses;
          activeId = recoveredPasses[0].id;
          // Re-save to primary storage immediately
          await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
          await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(activeId));
          await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');
        }
      }
      
      if (passes.length > 0) {
        console.log('[SeasonPass] ✅ Existing passes found:', passes.length);
        passes.forEach((p, i) => console.log(`[SeasonPass]   Pass[${i}]: ${p.id} - ${p.teamName}`));
        
        // CRITICAL: Only recover MISSING PASSES from backup, do NOT merge sales data
        // Sales data merging was causing old/deleted sales to reappear after wipe+replace
        const backupPasses = await recoverFromAllPassesBackup();
        if (backupPasses && backupPasses.length > passes.length) {
          console.log('[SeasonPass] ⚠️ Backup has MORE passes than primary storage!');
          console.log('[SeasonPass] Primary:', passes.length, 'Backup:', backupPasses.length);
          
          // Merge: add any passes from backup that aren't in primary (but DO NOT merge sales)
          const primaryIds = new Set(passes.map(p => p.id));
          const missingPasses = backupPasses.filter(p => !primaryIds.has(p.id));
          
          if (missingPasses.length > 0) {
            console.log('[SeasonPass] ✅ Recovering', missingPasses.length, 'missing passes from backup');
            missingPasses.forEach(p => console.log(`[SeasonPass]   Recovering: ${p.id} - ${p.teamName}`));
            
            // Add the missing passes (without merging sales data into existing passes)
            passes = [...passes, ...missingPasses];
            
            // Persist the merged data immediately
            await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
            console.log('[SeasonPass] ✅ Merged passes saved to primary storage (sales data preserved as-is)');
          }
        }
        // NOTE: Removed automatic sales data merging - this was causing old sales to reappear
        
        if (!diag.dataImportedRaw) {
          console.log('[SeasonPass] DATA_IMPORTED_KEY missing but passes exist - setting flag only');
          await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');
        }
        
        const activeExists = passes.some(p => p.id === activeId);
        if (!activeId || !activeExists) {
          console.log('[SeasonPass] activeSeasonPassId missing/invalid - setting to first pass');
          activeId = passes[0].id;
          await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(activeId));
        }
        
        // CRITICAL: Save to backup immediately to ensure we have all passes backed up
        await saveAllPassesBackup(passes);
      } else {
        console.log('[SeasonPass] No existing passes found');
        
        if (!diag.dataImportedRaw) {
          console.log('[SeasonPass] First run - seeding Panthers...');
          const panthersPass = await safeSeedPanthersIfEmpty();
          
          if (panthersPass) {
            passes = [panthersPass];
            activeId = panthersPass.id;
            
            await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
            await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(activeId));
            await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');
            await saveAllPassesBackup(passes);
            console.log('[SeasonPass] ✅ Seeded Panthers pass');
          } else {
            await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');
          }
        }
      }

      console.log('[SeasonPass] Final state - passes:', passes.length, 'activeId:', activeId);

  // Normalize passes to ensure `games` and related fields always exist
  passes = passes.map(normalizeSeasonPass);

  // Helper: robustly find a team logo URL for a given opponent string and league
  const findLogoForOpponent = (opponentText: string | undefined, leagueId?: string): string | undefined => {
    if (!opponentText) return undefined;
    try {
      const txt = opponentText.toLowerCase();
      const teams = leagueId ? (getTeamsByLeague(leagueId) || []) : ([] as any[]);
      // Try direct inclusion of full name/city/abbreviation
      for (const t of teams) {
        const name = (t.name || '').toLowerCase();
        const city = (t.city || '').toLowerCase();
        const abbr = (t.abbreviation || '').toLowerCase();
        if ((name && txt.includes(name)) || (city && txt.includes(city)) || (abbr && txt.includes(abbr))) {
          return t.logoUrl;
        }
      }

      // Token-based fallback: split opponent text and try each token against team names
  const tokens: string[] = txt.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      for (const t of teams) {
        const name = (t.name || '').toLowerCase();
        const city = (t.city || '').toLowerCase();
        for (const token of tokens) {
          if (name.includes(token) || city.includes(token) || (t.abbreviation || '').toLowerCase() === token) {
            return t.logoUrl;
          }
        }
      }
    } catch {
      // ignore
    }
    return undefined;
  };
  
  // Migration: ensure all SaleRecord entries include a seatCount.
  const migrateSeatCounts = (passList: SeasonPass[]) => {
    let changed = false;
    const migrated = passList.map(p => {
      const pClone: any = JSON.parse(JSON.stringify(p));
      const seatPairsMap: Record<string, string> = {};
      (pClone.seatPairs || []).forEach((sp: any) => { seatPairsMap[sp.id] = sp.seats; });

      const sales = pClone.salesData || {};
      Object.entries(sales).forEach(([gameId, gameSales]: any) => {
        Object.entries(gameSales).forEach(([pairId, sale]: any) => {
          if (!sale) return;
          // If seatCount is missing or falsy, try to infer
          if (typeof sale.seatCount !== 'number' || sale.seatCount <= 0) {
            let sc = parseSeatsCount(sale.seats);
            if (!sc || sc <= 0) {
              const pairSeats = seatPairsMap[pairId];
              sc = parseSeatsCount(pairSeats);
            }
            // Fallback to 2 seats per pair to preserve previous behavior
            if (!sc || sc <= 0) sc = 2;
            sale.seatCount = sc;
            changed = true;
          }
        });
      });

      return pClone as SeasonPass;
    });

    return { migrated, changed };
  };

  const migration = migrateSeatCounts(passes);
  if (migration.changed) {
    console.log('[SeasonPass] Migration applied: populated seatCount for stored sale records');
    passes = migration.migrated;
    // persist migrated passes
    try {
      await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
      console.log('[SeasonPass] Migrated season passes saved to storage');
    } catch (e: any) {
      console.warn('[SeasonPass] Failed to persist migrated season passes', e);
    }
  }
  setSeasonPasses(passes);
      setActiveSeasonPassId(activeId);
      setNeedsSetup(passes.length === 0);
      // First ensure games themselves have opponentLogo where possible, then
      // backfill opponentLogo into any existing sale records from the game's opponentLogo
      // This helps ensure logos show up in the Sales UI and in exports for older data
      try {
            // Fill missing game opponent logos using heuristics
            const fillGameLogos = (list: SeasonPass[]) => {
              let changed = false;
              const migrated = list.map(p => {
                const gamesClone: Game[] = JSON.parse(JSON.stringify(p.games || []));
                gamesClone.forEach((g: any) => {
                  if (!g.opponentLogo) {
                    const found = findLogoForOpponent(g.opponent, p.leagueId);
                    if (found) {
                      g.opponentLogo = found;
                      changed = true;
                    }
                  }
                });
                return { ...p, games: gamesClone } as SeasonPass;
              });
              return { migrated, changed };
            };

            const gameFill = fillGameLogos(passes);
            if (gameFill.changed) {
              console.log('[SeasonPass] Populated missing game opponent logos using heuristics');
              await saveSeasonPasses(gameFill.migrated);
              passes = gameFill.migrated;
              setSeasonPasses(gameFill.migrated);
            }

            const backfill = (list: SeasonPass[]) => {
          let changed = false;
          const migrated = list.map(p => {
            const salesClone: any = JSON.parse(JSON.stringify(p.salesData || {}));
            const gamesById: Record<string, Game> = {};
            (p.games || []).forEach(g => { gamesById[g.id] = g; });

            Object.entries(salesClone).forEach(([gameId, gameSales]: any) => {
              const game = gamesById[gameId];
              if (!game) return;
              Object.entries(gameSales).forEach(([pairId, sale]: any) => {
                if (!sale) return;
                if (!sale.opponentLogo && game.opponentLogo) {
                  sale.opponentLogo = game.opponentLogo;
                  changed = true;
                }
              });
            });

            return { ...p, salesData: salesClone } as SeasonPass;
          });

          return { migrated, changed };
        };

        const bf = backfill(passes);
        if (bf.changed) {
          console.log('[SeasonPass] Backfilled opponent logos into sales for existing passes');
          // Persist the updated passes and update state
          await saveSeasonPasses(bf.migrated);
          setSeasonPasses(bf.migrated);
        }
      } catch (backfillError) {
        console.warn('[SeasonPass] Backfill failed:', backfillError);
      }
    } catch (error) {
      console.error('[SeasonPass] Error loading data:', error);
      setNeedsSetup(true);
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Helper available to the provider: fill missing opponent logos for a games array
  const fillOpponentLogosForLeague = (games: Game[], leagueId?: string): Game[] => {
    if (!Array.isArray(games) || !leagueId) return games;
    try {
      const teams = getTeamsByLeague(leagueId) || [];
      return games.map(g => {
        if (g.opponentLogo) return g;
        const opp = (g.opponent || '') || '';

        const direct = teams.find(t => {
          const name = (t.name || '').toLowerCase();
          const city = (t.city || '').toLowerCase();
          const abbr = (t.abbreviation || '').toLowerCase();
          const txt = opp.toLowerCase();
          return (name && txt.includes(name)) || (city && txt.includes(city)) || (abbr && txt.includes(abbr));
        });
        if (direct && direct.logoUrl) return { ...g, opponentLogo: direct.logoUrl };

        const txt = opp.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
  const tokens: string[] = txt.split(/\s+/).filter(Boolean);
        for (const t of teams) {
          const name = (t.name || '').toLowerCase();
          const city = (t.city || '').toLowerCase();
          for (const token of tokens) {
            if (name.includes(token) || city.includes(token) || (t.abbreviation || '').toLowerCase() === token) {
              return { ...g, opponentLogo: t.logoUrl };
            }
          }
        }

        return g;
      });
    } catch {
      return games;
    }
  };

  const saveSeasonPasses = useCallback(async (passes: SeasonPass[]) => {
    try {
      if (!Array.isArray(passes)) {
        console.error('[SeasonPass] ❌ BLOCKED: Attempted to save non-array as passes');
        return;
      }
      if (passes.length === 0) {
        const existingRaw = await AsyncStorage.getItem(SEASON_PASSES_KEY);
        if (existingRaw) {
          try {
            const existing = JSON.parse(existingRaw);
            if (Array.isArray(existing) && existing.length > 0) {
              console.error('[SeasonPass] ❌ BLOCKED: Attempted to overwrite', existing.length, 'passes with empty array!');
              return;
            }
          } catch {
            // parse failed, allow write
          }
        }
      }
      
      // CRITICAL: Check if we're about to lose passes - compare with backup
      if (passes.length > 0) {
        const backupRaw = await AsyncStorage.getItem(ALL_PASSES_BACKUP_KEY);
        if (backupRaw) {
          try {
            const backup = JSON.parse(backupRaw);
            if (backup.passes && Array.isArray(backup.passes) && backup.passes.length > passes.length) {
              console.warn('[SeasonPass] ⚠️ WARNING: About to save fewer passes than backup has!');
              console.warn('[SeasonPass] Current save:', passes.length, 'Backup has:', backup.passes.length);
              // Merge missing passes from backup before saving
              const currentIds = new Set(passes.map(p => p.id));
              const missingFromBackup = backup.passes.filter((p: SeasonPass) => !currentIds.has(p.id));
              if (missingFromBackup.length > 0) {
                console.log('[SeasonPass] ✅ Recovering', missingFromBackup.length, 'passes that would have been lost');
                passes = [...passes, ...missingFromBackup];
              }
            }
          } catch {
            // backup parse failed, continue with save
          }
        }
      }
      
      // Save to primary storage
      await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
      console.log('[SeasonPass] Saved', passes.length, 'season passes to primary storage');
      
      // CRITICAL: Also save to backup immediately to prevent data loss
      if (passes.length > 0) {
        await saveAllPassesBackup(passes);
      }
    } catch (error) {
      console.error('[SeasonPass] Error saving passes:', error);
    }
  }, []);

  const saveActiveId = useCallback(async (id: string | null) => {
    try {
      if (id) {
        await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(id));
      } else {
        await AsyncStorage.removeItem(ACTIVE_PASS_KEY);
      }
      console.log('[SeasonPass] Saved active ID:', id);
    } catch (error) {
      console.error('[SeasonPass] Error saving active ID:', error);
    }
  }, []);

  const performAutoBackup = useCallback(async (passes: SeasonPass[], activeId: string | null): Promise<{ success: boolean; error?: string }> => {
    console.log('[AutoBackup] Starting automatic backup...');
    const backupStartTime = Date.now();
    
    try {
      if (!passes || passes.length === 0) {
        console.log('[AutoBackup] Skipping - no passes to backup');
        return { success: true };
      }
      
      await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(passes));
      console.log('[AutoBackup] Primary storage saved');
      
      const backupData = {
        timestamp: new Date().toISOString(),
        passCount: passes.length,
        passes: passes,
      };
      await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));
      console.log('[AutoBackup] All-passes backup saved');
      
      const masterBackup: BackupData = {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: activeId,
        seasonPasses: passes,
      };
      await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));
      console.log('[AutoBackup] Master backup saved');
      
      const elapsed = Date.now() - backupStartTime;
      const timeStr = new Date().toLocaleString();
      
      setLastBackupTime(timeStr);
      setLastBackupStatus('success');
      setBackupError(null);
      // Include timestamp to ensure React detects change for each backup
      setBackupConfirmationMessage(`Backup updated ✅ ${Date.now()}`);
      
      // Auto-clear confirmation message after 3 seconds
      setTimeout(() => {
        setBackupConfirmationMessage(null);
      }, 3000);
      
      console.log('[AutoBackup] ✅ Backup completed successfully in', elapsed, 'ms at', timeStr);
      return { success: true };
    } catch (error: any) {
      const errorMsg = error?.message || 'Unknown backup error';
      console.error('[AutoBackup] ❌ Backup FAILED:', errorMsg);
      
      setLastBackupStatus('failed');
      setBackupError(errorMsg);
      // Include timestamp to ensure React detects change for each backup attempt
      setBackupConfirmationMessage(`Backup failed ❌ ${Date.now()}`);
      
      // Auto-clear confirmation message after 5 seconds
      setTimeout(() => {
        setBackupConfirmationMessage(null);
      }, 5000);
      
      return { success: false, error: errorMsg };
    }
  }, []);

  const retryBackup = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    console.log('[RetryBackup] Retrying backup...');
    return performAutoBackup(seasonPasses, activeSeasonPassId);
  }, [seasonPasses, activeSeasonPassId, performAutoBackup]);

  const createSeasonPass = useCallback(async (
    league: League,
    team: Team,
    seasonLabel: string,
    seatPairs: SeatPair[]
  ): Promise<SeasonPass> => {
    console.log('\n========== CREATE SEASON PASS ==========');
    console.log('[CreatePass] Platform.OS =', Platform.OS);
    console.log('[CreatePass] Input league:', league.id, league.name);
    console.log('[CreatePass] Input team.id:', team.id);
    console.log('[CreatePass] Input team.name:', team.name);
    console.log('[CreatePass] Input team.abbreviation:', team.abbreviation);
    console.log('[CreatePass] Season label:', seasonLabel);
    console.log('[CreatePass] Seat pairs count:', seatPairs.length);
    console.log('[CreatePass] Using ESPN/Ticketmaster backend for schedule');

    let games: Game[] = [];
    let scheduleError: string | null = null;

    // Check if this is a Florida Panthers (NHL) pass - use bundled schedule
    const isFlaPanthers = String(league.id).toLowerCase() === 'nhl' && String(team.id).toLowerCase() === 'fla';
    
    if (isFlaPanthers) {
      console.log('[CreatePass] Using bundled Panthers schedule for teamId=fla');
      games = PANTHERS_20252026_SCHEDULE;
      console.log('[CreatePass] Loaded', games.length, 'games from bundled schedule');
    } else {
      try {
        console.log('[CreatePass] Fetching schedule via backend proxy...');
        const result = await fetchScheduleWithMasterTimeout({
          leagueId: league.id,
          teamId: team.id,
          teamName: team.name,
          teamAbbreviation: team.abbreviation,
        });
  games = result.games;
  // Try to populate opponent logos immediately for fetched schedules
  games = fillOpponentLogosForLeague(games, league.id);
        
        if (result.error && games.length === 0) {
          if (result.error === 'NETWORK') {
            scheduleError = 'Backend unreachable. Schedule will load when available.';
          } else {
            scheduleError = 'Could not fetch schedule. Tap Resync in Settings to retry.';
          }
        }
        
        console.log('[CreatePass] Schedule fetch completed - games:', games.length, 'error:', result.error);
      } catch (e: any) {
        console.warn('[CreatePass] Schedule fetch failed:', e?.message || e);
        scheduleError = 'Schedule fetch failed. Tap Resync in Settings to retry.';
      }
    }
    
    if (scheduleError) {
      setLastScheduleError(scheduleError);
    }

    console.log('[CreatePass] Creating new pass object...');
    const newPass: SeasonPass = {
      id: `sp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      leagueId: league.id,
      teamId: team.id,
      teamName: team.name,
      teamAbbreviation: team.abbreviation,
      teamLogoUrl: team.logoUrl,
      teamPrimaryColor: team.primaryColor,
      teamSecondaryColor: team.secondaryColor,
      seasonLabel,
      seatPairs,
      salesData: {},
  games,
      events: [],
      createdAtISO: new Date().toISOString(),
    };
    console.log('[CreatePass] Stored teamAbbreviation:', newPass.teamAbbreviation);

    // CRITICAL: Read existing passes from ALL storage locations to avoid losing data
    let existingPasses: SeasonPass[] = [];
    try {
      const existingRaw = await AsyncStorage.getItem(SEASON_PASSES_KEY);
      if (existingRaw) {
        const parsed = JSON.parse(existingRaw);
        if (Array.isArray(parsed)) {
          existingPasses = parsed;
          console.log('[CreatePass] Found', existingPasses.length, 'existing passes in primary storage');
        }
      }
    } catch {
      console.warn('[CreatePass] Could not read existing passes from primary, using state');
      existingPasses = seasonPasses;
    }
    
    // Also check backup for any passes that might be missing from primary
    try {
      const backupRaw = await AsyncStorage.getItem(ALL_PASSES_BACKUP_KEY);
      if (backupRaw) {
        const backup = JSON.parse(backupRaw);
        if (backup.passes && Array.isArray(backup.passes)) {
          const existingIds = new Set(existingPasses.map(p => p.id));
          const missingFromBackup = backup.passes.filter((p: SeasonPass) => !existingIds.has(p.id));
          if (missingFromBackup.length > 0) {
            console.log('[CreatePass] Recovering', missingFromBackup.length, 'passes from backup');
            existingPasses = [...existingPasses, ...missingFromBackup];
          }
        }
      }
    } catch {
      // Backup read failed, continue with existing passes
    }
    
    // Merge: use existing from storage if state is behind
    const baseList = existingPasses.length >= seasonPasses.length ? existingPasses : seasonPasses;
    const updatedPasses = [...baseList.filter(p => p.id !== newPass.id), newPass];
    
    // CRITICAL: Save to ALL storage locations BEFORE updating React state
    // This ensures data persists even if the app refreshes immediately
    console.log('[CreatePass] 💾 Saving', updatedPasses.length, 'passes to storage BEFORE state update...');
    
    try {
      // 1. Save to primary storage
      await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
      console.log('[CreatePass] ✅ Primary storage saved');
      
      // 2. Save active ID
      await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(newPass.id));
      console.log('[CreatePass] ✅ Active ID saved');
      
      // 3. Save to all-passes backup
      const backupData = {
        timestamp: new Date().toISOString(),
        passCount: updatedPasses.length,
        passes: updatedPasses,
      };
      await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));
      console.log('[CreatePass] ✅ All-passes backup saved');
      
      // 4. Save to master backup
      const masterBackup: BackupData = {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: newPass.id,
        seasonPasses: updatedPasses,
      };
      await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));
      console.log('[CreatePass] ✅ Master backup saved');
      
      // 5. Mark data as imported
      await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');
      
    } catch (saveError) {
      console.error('[CreatePass] ❌ CRITICAL: Failed to save to storage:', saveError);
    }
    
    // NOW update React state (after storage is confirmed saved)
    setSeasonPasses(updatedPasses);
    console.log('[CreatePass] 🔄 Setting activeSeasonPassId to NEW pass:', newPass.id);
    setActiveSeasonPassId(newPass.id);
    setNeedsSetup(false);
    
    // Update backup status
    setLastBackupTime(new Date().toLocaleString());
    setLastBackupStatus('success');
    setBackupError(null);

    console.log('[CreatePass] ✅ DONE - Created pass:', newPass.id);
    console.log('[CreatePass] ✅ activeSeasonPassId is now:', newPass.id);
    console.log('[CreatePass] ✅ Total passes now:', updatedPasses.length);
    console.log('[CreatePass] ✅ Total games:', games.length);
    console.log('========== END CREATE SEASON PASS ==========\n');
    return newPass;
  }, [seasonPasses]);

  const updateSeasonPass = useCallback(async (passId: string, updates: Partial<SeasonPass>) => {
    // CRITICAL: Read from storage first to avoid race conditions
    let currentPasses: SeasonPass[] = seasonPasses;
    try {
      const storedRaw = await AsyncStorage.getItem(SEASON_PASSES_KEY);
      if (storedRaw) {
        const parsed = JSON.parse(storedRaw);
        if (Array.isArray(parsed) && parsed.length >= seasonPasses.length) {
          currentPasses = parsed;
        }
      }
    } catch {
      console.warn('[SeasonPass] updateSeasonPass - could not read storage, using state');
    }
    
    const updatedPasses = currentPasses.map(sp => 
      sp.id === passId ? { ...sp, ...updates } : sp
    );
    setSeasonPasses(updatedPasses);
    const backupResult = await performAutoBackup(updatedPasses, activeSeasonPassId);
    console.log('[SeasonPass] Updated season pass:', passId, '- Backup:', backupResult.success ? 'SUCCESS' : 'FAILED');
  }, [seasonPasses, activeSeasonPassId, performAutoBackup]);

  // Deletes a season pass after confirming with the user.
  // Returns the new number of season passes after deletion, or null if the user cancelled.
  const deleteSeasonPass = useCallback((passId: string): Promise<number | null> => {
    return new Promise<number | null>((resolve) => {
      const pass = seasonPasses.find(sp => sp.id === passId);
      if (!pass) {
        console.warn('[SeasonPass] deleteSeasonPass called with unknown passId:', passId);
        resolve(null);
        return;
      }

      Alert.alert(
        'Delete Season Pass',
        `Are you sure you want to delete "${pass.teamName} ${pass.seasonLabel}"? This action cannot be undone.`,
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(null) },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                const updatedPasses = seasonPasses.filter(sp => sp.id !== passId);
                setSeasonPasses(updatedPasses);

                let newActiveId = activeSeasonPassId;
                if (activeSeasonPassId === passId) {
                  newActiveId = updatedPasses.length > 0 ? updatedPasses[0].id : null;
                  setActiveSeasonPassId(newActiveId);
                  await saveActiveId(newActiveId);
                  setNeedsSetup(updatedPasses.length === 0);
                }

                const backupResult = await performAutoBackup(updatedPasses, newActiveId);
                console.log('[SeasonPass] Deleted season pass:', passId, '- Backup:', backupResult.success ? 'SUCCESS' : 'FAILED');
                resolve(updatedPasses.length);
              } catch (err) {
                console.error('[SeasonPass] Error deleting pass:', err);
                resolve(null);
              }
            },
          },
        ],
        { cancelable: true }
      );
    });
  }, [seasonPasses, activeSeasonPassId, performAutoBackup, saveActiveId]);

  const switchSeasonPass = useCallback(async (passId: string) => {
    if (seasonPasses.some(sp => sp.id === passId)) {
      setActiveSeasonPassId(passId);
      await saveActiveId(passId);
      console.log('[SeasonPass] Switched to season pass:', passId);
    }
  }, [seasonPasses, saveActiveId]);

  const addSeatPair = useCallback(async (passId: string, seatPair: SeatPair) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (pass) {
      const updatedSeatPairs = [...pass.seatPairs, seatPair];
      await updateSeasonPass(passId, { seatPairs: updatedSeatPairs });
      console.log('[SeasonPass] Added seat pair - auto-backup triggered via updateSeasonPass');
    }
  }, [seasonPasses, updateSeasonPass]);

  const removeSeatPair = useCallback(async (passId: string, seatPairId: string) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (pass) {
      const updatedSeatPairs = pass.seatPairs.filter(sp => sp.id !== seatPairId);
      await updateSeasonPass(passId, { seatPairs: updatedSeatPairs });
      console.log('[SeasonPass] Removed seat pair - auto-backup triggered via updateSeasonPass');
    }
  }, [seasonPasses, updateSeasonPass]);

  const addSaleRecord = useCallback(async (
    passId: string,
    gameId: string,
    saleRecord: SaleRecord
  ) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (pass) {
      const updatedSalesData = { ...pass.salesData };
      if (!updatedSalesData[gameId]) {
        updatedSalesData[gameId] = {};
      }
      // If the sale record is missing an opponent logo, try to copy it from the
      // game's opponentLogo so UI and exports show the team image.
      const game = pass.games?.find(g => g.id === gameId);
      const saleWithLogo = { ...saleRecord };
      if (!saleWithLogo.opponentLogo && game?.opponentLogo) {
        saleWithLogo.opponentLogo = game.opponentLogo;
      }

      updatedSalesData[gameId][saleWithLogo.pairId] = saleWithLogo;
      await updateSeasonPass(passId, { salesData: updatedSalesData });
      // Increment version to force stats recalculation
      setSalesDataVersion(v => v + 1);
      console.log('[SeasonPass] Added sale record - auto-backup triggered via updateSeasonPass');
    }
  }, [seasonPasses, updateSeasonPass]);

  const removeSaleRecord = useCallback(async (passId: string, gameId: string, pairId: string) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (!pass) return;

    const updatedSalesData = { ...pass.salesData };
    if (!updatedSalesData[gameId]) return;

    const gameSales = { ...updatedSalesData[gameId] };
    if (!gameSales[pairId]) return;

    delete gameSales[pairId];
    if (Object.keys(gameSales).length === 0) {
      delete updatedSalesData[gameId];
    } else {
      updatedSalesData[gameId] = gameSales;
    }

    await updateSeasonPass(passId, { salesData: updatedSalesData });
    // Increment version to force stats recalculation
    setSalesDataVersion(v => v + 1);
    console.log('[SeasonPass] Removed sale record - auto-backup triggered via updateSeasonPass');
  }, [seasonPasses, updateSeasonPass]);

  const updateGames = useCallback(async (passId: string, games: Game[]) => {
    await updateSeasonPass(passId, { games });
    console.log('[SeasonPass] Updated games for pass:', passId, 'count:', games.length);
  }, [updateSeasonPass]);

  const fetchScheduleForPass = useCallback(async (pass: SeasonPass, options?: { overwrite?: boolean }): Promise<{ games: Game[]; error?: string }> => {
    console.log('[SeasonPass] fetchScheduleForPass for:', pass.teamName, pass.seasonLabel, 'overwrite:', options?.overwrite);
    console.log('[SeasonPass] fetchScheduleForPass - pass.teamId:', pass.teamId);
    console.log('[SeasonPass] fetchScheduleForPass - pass.teamAbbreviation:', pass.teamAbbreviation);
    
    try {
      // If this is the Florida Panthers (NHL) use the bundled Panthers schedule.
      // Be tolerant of slight seasonLabel mismatches (seeded passes or restores may
      // use different labels) — match on league and team id only.
      if (String(pass.leagueId).toLowerCase() === 'nhl' && String(pass.teamId).toLowerCase() === 'fla') {
        console.log('[SeasonPass] Loading Panthers (bundled) schedule for teamId=fla');
        return { games: PANTHERS_20252026_SCHEDULE };
      }
      
      const result = await fetchScheduleWithMasterTimeout({
        leagueId: pass.leagueId,
        teamId: pass.teamId,
        teamName: pass.teamName,
        teamAbbreviation: pass.teamAbbreviation,
      });

      console.log('[SeasonPass] fetchScheduleForPass - Fetched', result.games.length, 'HOME games, error:', result.error);
      
      let errorMsg: string | undefined;
      if (result.error === 'API_KEY_MISSING') {
        errorMsg = 'Ticketmaster API key not configured.';
      } else if (result.error === 'CORS') {
        errorMsg = 'Request blocked. Try on mobile device.';
      } else if (result.error && result.games.length === 0) {
        errorMsg = 'Could not fetch schedule.';
      }
      
      return { games: result.games, error: errorMsg };
    } catch (error: any) {
      console.error('[SeasonPass] fetchScheduleForPass error:', error?.message || error);
      return { games: [], error: 'Schedule fetch failed.' };
    }
  }, []);

  const loadScheduleIfNeeded = useCallback(async (pass: SeasonPass) => {
    if (!pass || pass.games.length > 0) {
      console.log('[SeasonPass] Schedule already loaded or pass is null, skipping fetch');
      return;
    }

    setIsLoadingSchedule(true);
    setLastScheduleError(null);
    console.log('[SeasonPass] Games array empty, fetching schedule...');

    try {
      const result = await fetchScheduleForPass(pass);
      
      if (result.games.length > 0) {
        // populate opponent logos for the freshly fetched games
        const gamesWithLogos = fillOpponentLogosForLeague(result.games, pass.leagueId);
        const updatedPasses = seasonPasses.map(sp => 
          sp.id === pass.id ? { ...sp, games: gamesWithLogos } : sp
        );
        setSeasonPasses(updatedPasses);
        await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
        console.log('[SeasonPass] Schedule loaded successfully:', result.games.length, 'games');
      } else if (result.error) {
        setLastScheduleError(result.error);
      }
    } catch (error) {
      console.error('[SeasonPass] Error loading schedule:', error);
      setLastScheduleError('Failed to load schedule.');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, [seasonPasses, fetchScheduleForPass]);

  const resyncSchedule = useCallback(async (passId: string): Promise<{ success: boolean; error?: string }> => {
    console.log('\n========== RESYNC SCHEDULE ==========');
    console.log('[Resync] Platform.OS =', Platform.OS);
    console.log('[Resync] Requested passId:', passId);
    console.log('[Resync] Current activeSeasonPassId:', activeSeasonPassId);
    console.log('[Resync] Total passes in state:', seasonPasses.length);
    
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (!pass) {
      console.log('[Resync] ❌ Pass not found for passId:', passId);
      console.log('[Resync] Available passes:', seasonPasses.map(p => ({ id: p.id, team: p.teamName })));
      console.log('========== END RESYNC (PASS NOT FOUND) ==========\n');
      return { success: false, error: 'Pass not found' };
    }

    console.log('[Resync] Found pass:', pass.id);
    console.log('[Resync] Team:', pass.teamName);
    console.log('[Resync] League:', pass.leagueId);
    console.log('[Resync] TeamId:', pass.teamId);
    console.log('[Resync] TeamAbbreviation:', pass.teamAbbreviation);
    console.log('[Resync] Current games count:', pass.games?.length ?? 0);

    let success = false;
    let errorMsg: string | undefined;
    
    setIsLoadingSchedule(true);
    setLastScheduleError(null);
    console.log('[Resync] 🔄 isLoadingSchedule = true');
    
    try {
      // If this is a Florida Panthers (NHL) pass, prefer the bundled Panthers schedule.
      if (String(pass.leagueId).toLowerCase() === 'nhl' && String(pass.teamId).toLowerCase() === 'fla') {
        console.log('[Resync] Applying bundled Panthers schedule for teamId=fla');
        const updatedPasses = seasonPasses.map(sp => 
          sp.id === passId ? normalizeSeasonPass({ ...sp, games: PANTHERS_20252026_SCHEDULE }) : normalizeSeasonPass(sp)
        );
        setSeasonPasses(updatedPasses);
        await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
        // Ensure the active id stays set to this pass (and persisted)
        setActiveSeasonPassId(passId);
        await saveActiveId(passId);
        success = true;
      } else {
        console.log('[Resync] Fetching schedule via Ticketmaster...');
        const result = await fetchScheduleWithMasterTimeout({
          leagueId: pass.leagueId,
          teamId: pass.teamId,
          teamName: pass.teamName,
          teamAbbreviation: pass.teamAbbreviation,
        });
        
        console.log('[Resync] Fetch result - games:', result.games.length, 'error:', result.error);
        
        if (result.games.length > 0) {
          // Try to fill missing opponent logos by matching opponent text to known teams
          const fillOpponentLogos = (games: Game[], leagueId: string) => {
            try {
              const teams = getTeamsByLeague(leagueId) || [];
              return games.map(g => {
                if (g.opponentLogo) return g;
                const opp = (g.opponent || '') || '';
                // direct find
                const direct = teams.find(t => {
                  const name = (t.name || '').toLowerCase();
                  const city = (t.city || '').toLowerCase();
                  const abbr = (t.abbreviation || '').toLowerCase();
                  const txt = opp.toLowerCase();
                  return (name && txt.includes(name)) || (city && txt.includes(city)) || (abbr && txt.includes(abbr));
                });
                if (direct && direct.logoUrl) return { ...g, opponentLogo: direct.logoUrl };

                // token fallback
          const txt = opp.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
          const tokens: string[] = txt.split(/\s+/).filter(Boolean);
                for (const t of teams) {
                  const name = (t.name || '').toLowerCase();
                  const city = (t.city || '').toLowerCase();
                  for (const token of tokens) {
                    if (name.includes(token) || city.includes(token) || (t.abbreviation || '').toLowerCase() === token) {
                      return { ...g, opponentLogo: t.logoUrl };
                    }
                  }
                }

                return g;
              });
            } catch {
              return games;
            }
          };

          const gamesWithLogos = fillOpponentLogos(result.games, pass.leagueId);

          const updatedPasses = seasonPasses.map(sp => {
            if (sp.id !== passId) return sp;

            // Backfill opponentLogo into any existing sales for the updated games
            const updatedSalesData: any = { ...(sp.salesData || {}) };
            for (const g of gamesWithLogos) {
              const gid = g.id;
              if (updatedSalesData[gid]) {
                const cloned = { ...updatedSalesData[gid] };
                Object.keys(cloned).forEach(k => {
                  const s = { ...cloned[k] } as any;
                  if (!s.opponentLogo && g.opponentLogo) s.opponentLogo = g.opponentLogo;
                  cloned[k] = s;
                });
                updatedSalesData[gid] = cloned;
              }
            }

            return normalizeSeasonPass({ ...sp, games: gamesWithLogos, salesData: updatedSalesData });
          });
          setSeasonPasses(updatedPasses);
          await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
          console.log('[Resync] ✅ Schedule resynced successfully:', result.games.length, 'HOME games');
          success = true;
        } else {
          console.log('[Resync] ⚠️ No games returned during resync');
          success = false;
          
          if (result.error === 'API_KEY_MISSING') {
            errorMsg = 'Ticketmaster API key not configured.';
          } else if (result.error === 'CORS') {
            errorMsg = 'Request blocked. Try on mobile device.';
          } else if (result.error === 'TIMEOUT') {
            errorMsg = 'Request timed out. Please try again.';
          } else if (result.error === 'NO_TEAM') {
            errorMsg = `Team "${pass.teamName}" not found.`;
          } else if (result.error === 'NETWORK') {
            errorMsg = 'Backend unreachable. Please try again later.';
          } else {
            errorMsg = 'Could not fetch schedule. Please try again later.';
          }
          setLastScheduleError(errorMsg);
        }
      }
    } catch (error: any) {
      console.error('[Resync] ❌ Unexpected error:', error?.message || error);
      success = false;
      errorMsg = 'Schedule fetch failed. Please try again.';
      setLastScheduleError(errorMsg);
    } finally {
      console.log('[Resync] 🔄 FINALLY block - Setting isLoadingSchedule = false');
      setIsLoadingSchedule(false);
      console.log('[Resync] ✅ isLoadingSchedule is now FALSE (guaranteed)');
    }
    
    // Debug helper: after resync attempt, dump diagnostics and the active pass to Metro logs.
    // This helps confirm data was persisted to AsyncStorage even if the UI doesn't render it.
    try {
      const diagSnapshot = await runDiagnostics();
      console.log('[Resync][Debug] Diagnostics snapshot after resync:', {
        passesLength: diagSnapshot.passesLength,
        parseSuccess: diagSnapshot.parseSuccess,
        parsedPassesCount: diagSnapshot.parsedPasses?.length ?? 0,
        activeIdParsed: diagSnapshot.activeIdParsed,
      });

      let activeObject: any = null;
      if (diagSnapshot.parsedPasses && diagSnapshot.activeIdParsed) {
        activeObject = diagSnapshot.parsedPasses.find((p: any) => p.id === diagSnapshot.activeIdParsed) || null;
      }

      if (activeObject) {
        // Ensure normalized shape in log
        try {
          const normalized = normalizeSeasonPass(activeObject);
          console.log('[Resync][Debug] Active season pass (normalized):', JSON.stringify(normalized));
        } catch (e: any) {
          console.log('[Resync][Debug] Active season pass (raw):', activeObject, e);
        }
      } else {
        console.log('[Resync][Debug] No active season pass found in storage snapshot');
      }
    } catch (diagErr) {
      console.warn('[Resync][Debug] Failed to run diagnostics after resync:', diagErr);
    }

    console.log('========== END RESYNC (success=' + success + ') ==========\n');
    return { success, error: errorMsg };
  }, [seasonPasses, activeSeasonPassId, saveActiveId]);

  useEffect(() => {
    // Guard: activeSeasonPass may exist but not have a games array yet.
    if (!activeSeasonPass || (activeSeasonPass.games && activeSeasonPass.games.length > 0) || isLoadingSchedule) {
      return;
    }
    
    const passId = activeSeasonPass.id;
    
    if (fetchAttemptedRef.current.has(passId)) {
      console.log('[SeasonPass] Already attempted fetch for pass:', passId, '- skipping to prevent loop');
      return;
    }
    
    fetchAttemptedRef.current.add(passId);
    loadScheduleIfNeeded(activeSeasonPass);
  }, [activeSeasonPass, isLoadingSchedule, loadScheduleIfNeeded]);

  const addEvent = useCallback(async (passId: string, event: Event) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (pass) {
      const updatedEvents = [...pass.events, event];
      await updateSeasonPass(passId, { events: updatedEvents });
      console.log('[SeasonPass] Added event - auto-backup triggered via updateSeasonPass');
    }
  }, [seasonPasses, updateSeasonPass]);

  const removeEvent = useCallback(async (passId: string, eventId: string) => {
    const pass = seasonPasses.find(sp => sp.id === passId);
    if (pass) {
      const updatedEvents = pass.events.filter(e => e.id !== eventId);
      await updateSeasonPass(passId, { events: updatedEvents });
      console.log('[SeasonPass] Removed event - auto-backup triggered via updateSeasonPass');
    }
  }, [seasonPasses, updateSeasonPass]);

  const clearAllData = useCallback(async () => {
    isIntentionalClear.current = true;
    try {
      await AsyncStorage.multiRemove([SEASON_PASSES_KEY, ACTIVE_PASS_KEY, ALL_PASSES_BACKUP_KEY, MASTER_BACKUP_KEY]);
      console.log('[SeasonPass] Cleared all data (including backup locations)');
      setSeasonPasses([]);
      setActiveSeasonPassId(null);
      setNeedsSetup(true);
    } finally {
      setTimeout(() => { isIntentionalClear.current = false; }, 500);
    }
  }, []);

  const saveMasterBackup = useCallback(async (passes: SeasonPass[], activeId: string | null) => {
    try {
      const backup: BackupData = {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: activeId,
        seasonPasses: passes,
      };
      await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(backup));
      console.log('[SeasonPass] Master backup saved with', passes.length, 'passes');
    } catch (error) {
      console.error('[SeasonPass] Failed to save master backup:', error);
    }
  }, []);

  

  const restoreAllSeasonPassData = useCallback(async (): Promise<boolean> => {
    console.log('[SeasonPass] Restoring all season pass data from backups (WIPE + REPLACE mode)...');
    
    try {
      // Try ALL_PASSES_BACKUP_KEY first (more reliable)
      let backupRaw = await AsyncStorage.getItem(ALL_PASSES_BACKUP_KEY);
      
      if (backupRaw) {
        try {
          const allPassesBackup = JSON.parse(backupRaw);
          if (allPassesBackup.passes && Array.isArray(allPassesBackup.passes) && allPassesBackup.passes.length > 0) {
            console.log('[SeasonPass] ✅ Found', allPassesBackup.passes.length, 'passes in all-passes backup');
            
            // WIPE + REPLACE: Use backup data as the single source of truth
            const restoredPasses: SeasonPass[] = allPassesBackup.passes.map((backupPass: any) => {
              // Completely REPLACE with backup data - no merging
              console.log('[SeasonPass] Restoring pass:', backupPass.teamName, '- REPLACING all sales data');
              return normalizeSeasonPass(backupPass);
            });
            
            setSeasonPasses(restoredPasses);
            await saveSeasonPasses(restoredPasses);
            
            const activeId = restoredPasses[0]?.id || null;
            setActiveSeasonPassId(activeId);
            await saveActiveId(activeId);
            setNeedsSetup(restoredPasses.length === 0);
            
            // Trigger auto-backup after restore
            await performAutoBackup(restoredPasses, activeId);
            
            console.log('[SeasonPass] ✅ Restored', restoredPasses.length, 'passes from all-passes backup (WIPE + REPLACE)');
            return true;
          }
        } catch (e: any) {
          console.warn('[SeasonPass] Failed to parse all-passes backup:', e);
        }
      }
      
      // Fall back to master backup
      backupRaw = await AsyncStorage.getItem(MASTER_BACKUP_KEY);
      
      if (!backupRaw) {
        console.log('[SeasonPass] No master backup found, falling back to Panthers default data');
        
        const existingPanthers = seasonPasses.find(
          p => p.leagueId === 'nhl' && p.teamId === 'fla' && p.seasonLabel === '2025-2026'
        );
        
        if (existingPanthers) {
          console.log('[SeasonPass] Panthers 2025-2026 pass exists - WIPING and REPLACING with canonical data');
          
          // WIPE + REPLACE: Use INITIAL_BACKUP_DATA as the single source of truth
          const baseGames = (existingPanthers.games && existingPanthers.games.length > 0) ? existingPanthers.games : PANTHERS_20252026_SCHEDULE;
          const canonicalSalesData = buildCanonicalPanthersSalesData(baseGames, INITIAL_BACKUP_DATA.seatPairs);
          
          const updatedPass: SeasonPass = normalizeSeasonPass({
            ...existingPanthers,
            seatPairs: INITIAL_BACKUP_DATA.seatPairs,
            salesData: canonicalSalesData, // REPLACE, not merge
            games: PANTHERS_20252026_SCHEDULE,
          });
          const updatedPasses = seasonPasses.map(p => 
            p.id === existingPanthers.id ? updatedPass : normalizeSeasonPass(p)
          );
          setSeasonPasses(updatedPasses);
          await saveSeasonPasses(updatedPasses);
          setActiveSeasonPassId(updatedPass.id);
          await saveActiveId(updatedPass.id);
          
          // Trigger auto-backup after restore
          await performAutoBackup(updatedPasses, updatedPass.id);
          
          console.log('[SeasonPass] ✅ Panthers data restored with CANONICAL sales (WIPE + REPLACE)');
          return true;
        }
        
        const panthersPass = await safeSeedPanthersIfEmpty();
        if (!panthersPass) {
          console.error('[SeasonPass] Failed to create Panthers pass');
          return false;
        }
        
        panthersPass.games = PANTHERS_20252026_SCHEDULE;
        
        const normalizedPass = normalizeSeasonPass(panthersPass);
        const updatedPasses = [...seasonPasses.map(normalizeSeasonPass), normalizedPass];
        setSeasonPasses(updatedPasses);
        setActiveSeasonPassId(normalizedPass.id);
        setNeedsSetup(false);
        
        await saveSeasonPasses(updatedPasses);
        await saveActiveId(normalizedPass.id);
        
        console.log('[SeasonPass] ✅ Panthers data restored successfully');
        return true;
      }
      
      const backup: BackupData = JSON.parse(backupRaw);
      console.log('[SeasonPass] Found master backup with', backup.seasonPasses?.length || 0, 'passes from', backup.createdAtISO);
      
      if (!backup.seasonPasses || backup.seasonPasses.length === 0) {
        console.log('[SeasonPass] Master backup is empty, cannot restore');
        return false;
      }
      
      const currentPasses = [...seasonPasses];
      const restoredPasses: SeasonPass[] = [];
      
      for (const backupPass of backup.seasonPasses) {
        const existingPass = currentPasses.find(p => p.id === backupPass.id);
        
        if (existingPass) {
          const mergedSalesData: Record<string, Record<string, SaleRecord>> = { ...existingPass.salesData };
          
          Object.entries(backupPass.salesData || {}).forEach(([gameId, gameSales]) => {
            if (!mergedSalesData[gameId]) {
              mergedSalesData[gameId] = { ...(gameSales as Record<string, SaleRecord>) };
            } else {
              Object.entries(gameSales as Record<string, SaleRecord>).forEach(([pairId, sale]) => {
                if (!mergedSalesData[gameId][pairId]) {
                  mergedSalesData[gameId][pairId] = sale;
                }
              });
            }
          });
          
          const mergedPass = normalizeSeasonPass({
            ...existingPass,
            seatPairs: existingPass.seatPairs.length > 0 ? existingPass.seatPairs : backupPass.seatPairs,
            salesData: mergedSalesData,
            games: existingPass.games.length > 0 ? existingPass.games : backupPass.games,
          });
          restoredPasses.push(mergedPass);
        } else {
          restoredPasses.push(normalizeSeasonPass(backupPass));
        }
      }
      
      for (const currentPass of currentPasses) {
        if (!restoredPasses.find(p => p.id === currentPass.id)) {
          restoredPasses.push(normalizeSeasonPass(currentPass));
        }
      }
      
      setSeasonPasses(restoredPasses);
      await saveSeasonPasses(restoredPasses);
      
      const activeId = backup.activeSeasonPassId && restoredPasses.find(p => p.id === backup.activeSeasonPassId)
        ? backup.activeSeasonPassId
        : restoredPasses[0]?.id || null;
      
      setActiveSeasonPassId(activeId);
      await saveActiveId(activeId);
      setNeedsSetup(restoredPasses.length === 0);
      
      console.log('[SeasonPass] ✅ All season pass data restored successfully:', restoredPasses.length, 'passes');
      return true;
    } catch (error) {
      console.error('[SeasonPass] Failed to restore from master backup:', error);
      return false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonPasses, saveActiveId]);

  const restorePanthersData = restoreAllSeasonPassData;

  const forceReplacePanthersSales = useCallback(async (): Promise<{ success: boolean; salesCount: number }> => {
    console.log('[SeasonPass] FORCE REPLACING Panthers sales data with canonical INITIAL_BACKUP_DATA...');
    console.log('[SeasonPass] ========== WIPE + REPLACE MODE ==========');
    
    try {
      // STEP 1: Clear ALL backup locations FIRST to prevent old data from being restored
      console.log('[SeasonPass] Step 1: Clearing ALL backup storage locations...');
      await AsyncStorage.removeItem(ALL_PASSES_BACKUP_KEY);
      await AsyncStorage.removeItem(MASTER_BACKUP_KEY);
      console.log('[SeasonPass] ✅ Backup locations cleared');
      
      const panthersPass = seasonPasses.find(
        p => p.leagueId === 'nhl' && p.teamId === 'fla' && p.seasonLabel === '2025-2026'
      );
      
      if (!panthersPass) {
        console.error('[SeasonPass] No Panthers 2025-2026 pass found to replace');
        return { success: false, salesCount: 0 };
      }
      
      console.log('[SeasonPass] Found Panthers pass:', panthersPass.id);
      console.log('[SeasonPass] Current sales data games:', Object.keys(panthersPass.salesData || {}).length);
      
      // STEP 2: Build NEW canonical sales data from INITIAL_BACKUP_DATA
      const canonicalSalesData = buildCanonicalPanthersSalesData(panthersPass.games.length > 0 ? panthersPass.games : PANTHERS_20252026_SCHEDULE, INITIAL_BACKUP_DATA.seatPairs);
      
      let totalSales = 0;
      Object.values(canonicalSalesData).forEach(gameSales => {
        totalSales += Object.keys(gameSales).length;
      });
      console.log('[SeasonPass] Canonical sales records to insert:', totalSales);
      
      // STEP 3: Create updated pass with COMPLETELY REPLACED sales data (no merging)
      const updatedPass: SeasonPass = normalizeSeasonPass({
        ...panthersPass,
        seatPairs: INITIAL_BACKUP_DATA.seatPairs,
        salesData: canonicalSalesData, // COMPLETE REPLACE - not merge
        games: panthersPass.games.length > 0 ? panthersPass.games : PANTHERS_20252026_SCHEDULE,
      });
      
      const updatedPasses = seasonPasses.map(p => 
        p.id === panthersPass.id ? updatedPass : p
      );
      
      // STEP 4: Write to ALL storage locations with NEW data
      console.log('[SeasonPass] Step 4: Writing NEW data to all storage locations...');
      
      await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
      console.log('[SeasonPass] ✅ Saved to primary storage');
      
      // Write new backup data immediately
      const backupData = {
        timestamp: new Date().toISOString(),
        passCount: updatedPasses.length,
        passes: updatedPasses,
      };
      await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));
      console.log('[SeasonPass] ✅ Saved to all-passes backup');
      
      const masterBackup: BackupData = {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: panthersPass.id,
        seasonPasses: updatedPasses,
      };
      await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));
      console.log('[SeasonPass] ✅ Saved to master backup');
      
      // STEP 5: Update React state
      setSeasonPasses(updatedPasses);
      setActiveSeasonPassId(panthersPass.id);
      
      // Update backup status
      setLastBackupTime(new Date().toLocaleString());
      setLastBackupStatus('success');
      setBackupError(null);
      
      console.log('[SeasonPass] ✅ FORCE REPLACE COMPLETE - Panthers sales data now has', totalSales, 'records');
      console.log('[SeasonPass] ========== WIPE + REPLACE SUCCESS ==========');
      return { success: true, salesCount: totalSales };
    } catch (error: any) {
      console.error('[SeasonPass] Force replace failed:', error);
      return { success: false, salesCount: 0 };
    }
  }, [seasonPasses]);

  const replaceSalesDataFromPastedSeed = useCallback(
    async (
      seedText: string,
      targetPassId?: string | null,
    ): Promise<{ success: boolean; salesCount: number; message?: string }> => {
      const passId = targetPassId ?? activeSeasonPassId;
      console.log('[SeasonPass] replaceSalesDataFromPastedSeed called', { passId, seedLen: seedText?.length ?? 0 });

      if (!passId) {
        return { success: false, salesCount: 0, message: 'No active season pass selected.' };
      }

      try {
        const pass = seasonPasses.find((p) => p.id === passId);
        if (!pass) {
          return { success: false, salesCount: 0, message: 'Season pass not found.' };
        }

        const seedRows = parseTicketSaleSeedText(seedText);
        if (seedRows.length === 0) {
          return { success: false, salesCount: 0, message: 'No valid sales rows found in pasted data.' };
        }

        const baseGames = pass.games && pass.games.length > 0 ? pass.games : PANTHERS_20252026_SCHEDULE;
        const baseSeatPairs = pass.seatPairs && pass.seatPairs.length > 0 ? pass.seatPairs : INITIAL_BACKUP_DATA.seatPairs;

        const salesData = buildSalesDataFromTicketSaleSeedRows(seedRows, baseGames, baseSeatPairs);

        let salesCount = 0;
        Object.values(salesData).forEach((gameSales) => {
          salesCount += Object.keys(gameSales).length;
        });

        const updatedPass: SeasonPass = normalizeSeasonPass({
          ...pass,
          seatPairs: baseSeatPairs,
          games: baseGames,
          salesData,
        });

        const updatedPasses = seasonPasses.map((p) => (p.id === passId ? updatedPass : p));

        console.log('[SeasonPass] Persisting replaced sales data (primary + backups)...');
        await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));

        const backupData = {
          timestamp: new Date().toISOString(),
          passCount: updatedPasses.length,
          passes: updatedPasses,
        };
        await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));

        const masterBackup: BackupData = {
          version: BACKUP_VERSION,
          createdAtISO: new Date().toISOString(),
          activeSeasonPassId: passId,
          seasonPasses: updatedPasses,
        };
        await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));

        setSeasonPasses(updatedPasses);
        setActiveSeasonPassId(passId);
        setSalesDataVersion((v: number) => v + 1);

        setLastBackupTime(new Date().toLocaleString());
        setLastBackupStatus('success');
        setBackupError(null);

        console.log('[SeasonPass] ✅ replaceSalesDataFromPastedSeed done', { salesCount });
        return { success: true, salesCount };
      } catch (error) {
        console.error('[SeasonPass] replaceSalesDataFromPastedSeed failed:', error);
        return { success: false, salesCount: 0, message: 'Failed to replace sales data. See logs.' };
      }
    },
    [activeSeasonPassId, seasonPasses],
  );

  const importSalesFromFileData = useCallback(
    async (
      rows: { totalPrice: number; eventName: string; eventStartTime: string; tickets: { section: string; row: string; seat_number: number }[] }[],
      targetPassId?: string | null,
    ): Promise<{ success: boolean; salesCount: number; seatPairsCount: number; message?: string }> => {
      const passId = targetPassId ?? activeSeasonPassId;
      console.log('[SeasonPass] importSalesFromFileData called', { passId, rowCount: rows.length });

      if (!passId) {
        return { success: false, salesCount: 0, seatPairsCount: 0, message: 'No active season pass selected.' };
      }

      try {
        const pass = seasonPasses.find((p) => p.id === passId);
        if (!pass) {
          return { success: false, salesCount: 0, seatPairsCount: 0, message: 'Season pass not found.' };
        }

        if (rows.length === 0) {
          return { success: false, salesCount: 0, seatPairsCount: 0, message: 'No valid rows found in imported file.' };
        }

        const seatPairMap = new Map<string, { section: string; row: string; seatNumbers: Set<number> }>();
        for (const r of rows) {
          for (const t of r.tickets || []) {
            const key = `${String(t.section).trim()}|${String(t.row).trim()}`;
            if (!seatPairMap.has(key)) {
              seatPairMap.set(key, { section: String(t.section).trim(), row: String(t.row).trim(), seatNumbers: new Set() });
            }
            seatPairMap.get(key)!.seatNumbers.add(Number(t.seat_number));
          }
        }

        const derivedSeatPairs: SeatPair[] = [];
        let pairIdx = 0;
        for (const [, val] of seatPairMap) {
          pairIdx += 1;
          const sortedSeats = Array.from(val.seatNumbers).sort((a, b) => a - b);
          let seatsStr = '';
          if (sortedSeats.length === 2 && sortedSeats[1] === sortedSeats[0] + 1) {
            seatsStr = `${sortedSeats[0]}-${sortedSeats[1]}`;
          } else {
            seatsStr = sortedSeats.join(',');
          }
          derivedSeatPairs.push({
            id: `pair${pairIdx}`,
            section: val.section,
            row: val.row,
            seats: seatsStr,
            seasonCost: 0,
          });
        }

        const existingSeatKeys = new Set(pass.seatPairs.map(sp => `${sp.section}|${sp.row}`));
        const importedSeatKeys = new Set(derivedSeatPairs.map(sp => `${sp.section}|${sp.row}`));
        let finalSeatPairs = pass.seatPairs;

        const seatPairsChanged = derivedSeatPairs.length !== pass.seatPairs.length ||
          [...importedSeatKeys].some(k => !existingSeatKeys.has(k));

        if (seatPairsChanged) {
          console.log('[SeasonPass] Seat pairs changed during import:', {
            existingCount: pass.seatPairs.length,
            importedCount: derivedSeatPairs.length,
            existing: [...existingSeatKeys],
            imported: [...importedSeatKeys],
          });
          for (const dp of derivedSeatPairs) {
            const existingMatch = pass.seatPairs.find(sp => sp.section === dp.section && sp.row === dp.row);
            if (existingMatch) {
              dp.seasonCost = existingMatch.seasonCost;
              dp.id = existingMatch.id;
            }
          }
          finalSeatPairs = derivedSeatPairs;
        }

        const baseGames = pass.games && pass.games.length > 0 ? pass.games : PANTHERS_20252026_SCHEDULE;
        const salesData = buildSalesDataFromTicketSaleSeedRows(rows, baseGames, finalSeatPairs);

        let salesCount = 0;
        Object.values(salesData).forEach((gameSales) => {
          salesCount += Object.keys(gameSales).length;
        });

        const updatedPass: SeasonPass = normalizeSeasonPass({
          ...pass,
          seatPairs: finalSeatPairs,
          games: baseGames,
          salesData,
        });

        const updatedPasses = seasonPasses.map((p) => (p.id === passId ? updatedPass : p));

        await AsyncStorage.setItem(SEASON_PASSES_KEY, JSON.stringify(updatedPasses));
        const backupData = {
          timestamp: new Date().toISOString(),
          passCount: updatedPasses.length,
          passes: updatedPasses,
        };
        await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupData));
        const masterBackup: BackupData = {
          version: BACKUP_VERSION,
          createdAtISO: new Date().toISOString(),
          activeSeasonPassId: passId,
          seasonPasses: updatedPasses,
        };
        await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));

        setSeasonPasses(updatedPasses);
        setActiveSeasonPassId(passId);
        setSalesDataVersion((v: number) => v + 1);
        setLastBackupTime(new Date().toLocaleString());
        setLastBackupStatus('success');
        setBackupError(null);

        console.log('[SeasonPass] ✅ importSalesFromFileData done', { salesCount, seatPairsCount: finalSeatPairs.length, seatPairsChanged });
        return { success: true, salesCount, seatPairsCount: finalSeatPairs.length, message: seatPairsChanged ? `Seat pairs updated: ${pass.seatPairs.length} → ${finalSeatPairs.length}` : undefined };
      } catch (error) {
        console.error('[SeasonPass] importSalesFromFileData failed:', error);
        return { success: false, salesCount: 0, seatPairsCount: 0, message: 'Import failed. See logs.' };
      }
    },
    [activeSeasonPassId, seasonPasses],
  );

  useEffect(() => {
    if (isInitialLoad.current || isIntentionalClear.current) {
      return;
    }
    const timeout = setTimeout(() => {
      if (isIntentionalClear.current) return;
      saveSeasonPasses(seasonPasses);
      saveMasterBackup(seasonPasses, activeSeasonPassId);
      console.log('[SeasonPass] Autosaved season passes and master backup');
    }, 300);
    return () => clearTimeout(timeout);
  }, [seasonPasses, saveSeasonPasses, saveMasterBackup, activeSeasonPassId]);

  useEffect(() => {
    if (isInitialLoad.current) {
      return;
    }
    const timeout = setTimeout(() => {
      saveActiveId(activeSeasonPassId);
      console.log('[SeasonPass] Autosaved active ID');
    }, 300);
    return () => clearTimeout(timeout);
  }, [activeSeasonPassId, saveActiveId]);

  useEffect(() => {
    if (!isLoading) {
      isInitialLoad.current = false;
    }
  }, [isLoading]);

  // Generate a full backup by reading the persisted storage where possible
  // to ensure the backup matches exactly what is stored on disk.
  // If `embedLogos` is true, attempt to fetch team/opponent logos and
  // embed them as base64 data URIs so the backup is fully self-contained.
  const generateBackup = useCallback(async (embedLogos = false): Promise<BackupData> => {
    try {
      const dataImportedRaw = await AsyncStorage.getItem(DATA_IMPORTED_KEY);
      const passesRaw = await AsyncStorage.getItem(SEASON_PASSES_KEY);
      const activeIdRaw = await AsyncStorage.getItem(ACTIVE_PASS_KEY);

  let passes: SeasonPass[] = seasonPasses;
      if (passesRaw) {
        try {
          const parsed = JSON.parse(passesRaw);
          if (Array.isArray(parsed)) passes = parsed;
        } catch {
          // fallback to in-memory seasonPasses if parse fails
          passes = seasonPasses;
        }
      }

      let activeId = activeSeasonPassId;
      if (activeIdRaw) {
        try {
          const parsedActive = JSON.parse(activeIdRaw);
          activeId = parsedActive;
        } catch {
          // ignore and use in-memory activeSeasonPassId
        }
      }

      // If requested, create a deep-clone of passes and embed logos
      if (embedLogos) {
        try {
          // Deep clone to avoid mutating running state
          const passesClone: SeasonPass[] = JSON.parse(JSON.stringify(passes));

          // Helper: embed logos for a given URL list (team logos and opponent logos)
          const embedForPasses = async (list: SeasonPass[]) => {
            for (const p of list) {
              // teamLogoUrl
              try {
                if (p.teamLogoUrl && typeof p.teamLogoUrl === 'string' && !p.teamLogoUrl.startsWith('data:') && (p.teamLogoUrl.startsWith('http') || p.teamLogoUrl.startsWith('//'))) {
                  const url = p.teamLogoUrl.startsWith('//') ? 'https:' + p.teamLogoUrl : p.teamLogoUrl;
                  if (Platform.OS === 'web') {
                    try {
                      const resp = await fetch(url);
                      const buf = await resp.arrayBuffer();
                      const bytes = new Uint8Array(buf as any);
                      let binary = '';
                      const chunk = 0x8000;
                      for (let i = 0; i < bytes.length; i += chunk) {
                        binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + chunk)));
                      }
                      const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
                      // default to png if not detectable
                      p.teamLogoUrl = `data:image/png;base64,${base64}`;
                    } catch (we) {
                      console.warn('[Backup] Failed to embed team logo (web) for', p.teamName, we);
                    }
                  } else {
                    try {
                      const fileName = `logo_${p.id}_${Date.now()}`;
                      const dest = FileSystem.cacheDirectory + fileName;
                      const dl = await FileSystem.downloadAsync(url, dest);
                      const b64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
                      // infer mime from extension
                      const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png';
                      const mime = ext.includes('svg') ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/png';
                      p.teamLogoUrl = `data:${mime};base64,${b64}`;
                    } catch (ne) {
                      console.warn('[Backup] Failed to embed team logo (native) for', p.teamName, ne);
                    }
                  }
                }
              } catch (e: any) {
                console.warn('[Backup] Unexpected embed team logo error for', p.teamName, e);
              }

              // embed opponent logos found in games
              try {
                if (Array.isArray(p.games)) {
                  for (const g of p.games) {
                    if (g.opponentLogo && typeof g.opponentLogo === 'string' && !g.opponentLogo.startsWith('data:') && (g.opponentLogo.startsWith('http') || g.opponentLogo.startsWith('//'))) {
                      const url = g.opponentLogo.startsWith('//') ? 'https:' + g.opponentLogo : g.opponentLogo;
                      if (Platform.OS === 'web') {
                        try {
                          const resp = await fetch(url);
                          const buf = await resp.arrayBuffer();
                          const bytes = new Uint8Array(buf as any);
                          let binary = '';
                          const chunk = 0x8000;
                          for (let i = 0; i < bytes.length; i += chunk) {
                            binary += String.fromCharCode.apply(null, Array.prototype.slice.call(bytes.subarray(i, i + chunk)));
                          }
                          const base64 = typeof btoa === 'function' ? btoa(binary) : Buffer.from(binary, 'binary').toString('base64');
                          g.opponentLogo = `data:image/png;base64,${base64}`;
                        } catch (ne) {
                          console.warn('[Backup] Failed to embed opponent logo (web) for', g.opponent, ne);
                        }
                      } else {
                        try {
                          const fileName = `opponent_${p.id}_${g.id}_${Date.now()}`;
                          const dest = FileSystem.cacheDirectory + fileName;
                          const dl = await FileSystem.downloadAsync(url, dest);
                          const b64 = await FileSystem.readAsStringAsync(dl.uri, { encoding: FileSystem.EncodingType.Base64 });
                          const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png';
                          const mime = ext.includes('svg') ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'png' ? 'image/png' : 'image/png';
                          g.opponentLogo = `data:${mime};base64,${b64}`;
                        } catch (ne) {
                          console.warn('[Backup] Failed to embed opponent logo (native) for', g.opponent, ne);
                        }
                      }
                    }
                  }
                }
              } catch (e: any) {
                console.warn('[Backup] Unexpected embed opponent logo error for', p.teamName, e);
              }
            }
          };

          await embedForPasses(passesClone);

          return {
            version: BACKUP_VERSION,
            createdAtISO: new Date().toISOString(),
            activeSeasonPassId: activeId,
            seasonPasses: passesClone,
            dataImportedRaw: dataImportedRaw ?? null,
            appTheme: AppColors ?? null,
          };
        } catch (embedErr) {
          console.error('[SeasonPass] Failed to embed logos, falling back to non-embedded backup:', embedErr);
        }
      }

      return {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: activeId,
        seasonPasses: passes,
        dataImportedRaw: dataImportedRaw ?? null,
        appTheme: AppColors ?? null,
      };
    } catch (err) {
      console.error('[SeasonPass] generateBackup failed, falling back to in-memory data:', err);
      return {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId,
        seasonPasses,
      };
    }
  }, [seasonPasses, activeSeasonPassId]);

  const createRecoveryCode = useCallback(async (embedLogos = false): Promise<string> => {
    try {
      const backup = await generateBackup(embedLogos);
      const code = generateRecoveryCode(backup);

      // Copy compressed recovery code to clipboard
      try {
        await Clipboard.setStringAsync(code);
      } catch (e: any) {
        console.warn('[SeasonPass] Failed to copy recovery code to clipboard:', e);
      }

      // Also prepare a raw JSON backup file and open the native share sheet
      try {
        const jsonString = JSON.stringify(backup, null, 2);
        const dateStr = new Date().toISOString().split('T')[0];
        const fileName = `SeasonPassBackup_${dateStr}.json`;

        

        if (Platform.OS === 'web') {
          // Trigger browser download for web
          const blob = new Blob([jsonString], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = fileName;
          a.click();
          URL.revokeObjectURL(url);
          // Also create README and trigger its download
          const readme = `Season Pass Backup (${fileName})\n\nTo restore: Open the app -> Settings -> Restore from File -> select ${fileName}`;
          const rblob = new Blob([readme], { type: 'text/plain' });
          const ra = document.createElement('a');
          ra.href = URL.createObjectURL(rblob);
          ra.download = 'README.txt';
          ra.click();
          return fileName;
        } else {
          const fileUri = FileSystem.documentDirectory + fileName;
          await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });

          // Additionally, create a folder with assets/README if requested or available
          try {
            const folderBase = `SeasonPassBackup_${dateStr}`;
            const folderResult = await writeBackupFolder(backup, folderBase, embedLogos, fileName);
            console.log('[SeasonPass] Backup folder created at:', folderResult.folderUri, folderResult.writtenFiles);
            // Share the main JSON file (native share sheet often prefers single file attachments)
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, {
                mimeType: 'application/json',
                dialogTitle: 'Share Backup File',
              });
            } else {
              console.log('[SeasonPass] Sharing is not available on this device. Backup saved to:', fileUri);
            }
            Alert.alert('Backup Saved', `Backup and assets saved to: ${folderResult.folderUri}`);
          } catch (folderErr) {
            console.error('[SeasonPass] Failed to create backup folder, falling back to single JSON file:', folderErr);
            if (await Sharing.isAvailableAsync()) {
              await Sharing.shareAsync(fileUri, {
                mimeType: 'application/json',
                dialogTitle: 'Share Backup File',
              });
            } else {
              console.log('[SeasonPass] Sharing is not available on this device. Backup saved to:', fileUri);
            }
          }
        }
      } catch (shareErr) {
        console.error('[SeasonPass] Failed to create or share backup file:', shareErr);
      }

      console.log('[SeasonPass] Recovery code generated and copied, length:', code.length);
      return code;
    } catch (err) {
      console.error('[SeasonPass] createRecoveryCode failed:', err);
      throw err;
    }
  }, [generateBackup]);

  const restoreFromRecoveryCode = useCallback(async (code: string): Promise<boolean> => {
    const data = parseRecoveryCode(code);
    if (!data) {
      console.error('[SeasonPass] Invalid recovery code');
      return false;
    }
    try {
      // When restoring, prefer embedded images (data: URIs). On native platforms
      // we write embedded base64 images to local cache files and rewrite the
      // team/opponent logo URL to the local file URI so images work offline.
      // If a logo isn't embedded, attempt to download it and save locally;
      // if download fails (offline), leave the original URL so the UI can
      // attempt to fetch it later when online.

      const ensureLogoSaved = async (logoUrlOrData: string | undefined, passId: string, prefix: string): Promise<string | undefined> => {
        if (!logoUrlOrData) return undefined;
        // Web: data URIs work in-browser, and FileSystem cache isn't guaranteed,
        // so keep as-is on web
        if (Platform.OS === 'web') return logoUrlOrData;

        try {
          // Embedded data URI
          if (logoUrlOrData.startsWith('data:')) {
            const match = logoUrlOrData.match(/^data:(.+?);base64,(.*)$/);
            if (!match) return logoUrlOrData;
            const mime = match[1];
            const b64 = match[2];
            const ext = mime.includes('svg') ? 'svg' : mime.split('/')[1] || 'png';
            const fileName = `${prefix}_${passId}_${Date.now()}.${ext}`;
            const dest = FileSystem.cacheDirectory + fileName;
            await FileSystem.writeAsStringAsync(dest, b64, { encoding: FileSystem.EncodingType.Base64 });
            return dest;
          }

          // Remote URL - try to download and cache it
          if (logoUrlOrData.startsWith('http') || logoUrlOrData.startsWith('//')) {
            const url = logoUrlOrData.startsWith('//') ? 'https:' + logoUrlOrData : logoUrlOrData;
            const ext = url.split('.').pop()?.split('?')[0]?.toLowerCase() || 'png';
            const fileName = `${prefix}_${passId}_${Date.now()}.${ext}`;
            const dest = FileSystem.cacheDirectory + fileName;
            try {
              const dl = await FileSystem.downloadAsync(url, dest);
              return dl.uri;
            } catch (dlErr) {
              console.warn('[Restore] Could not download logo', url, dlErr);
              return logoUrlOrData; // fallback to original URL
            }
          }

          return logoUrlOrData;
        } catch (err) {
          console.warn('[Restore] ensureLogoSaved failed for', logoUrlOrData, err);
          return logoUrlOrData;
        }
      };

      // Process season passes in series to avoid spamming downloads concurrently
      for (const pass of data.seasonPasses) {
        try {
          const newTeamLogo = await ensureLogoSaved(pass.teamLogoUrl, pass.id, 'teamlogo');
          if (newTeamLogo) pass.teamLogoUrl = newTeamLogo;

          if (Array.isArray(pass.games)) {
            for (const g of pass.games) {
              if (g.opponentLogo) {
                const newOpp = await ensureLogoSaved(g.opponentLogo, `${pass.id}_${g.id}`, 'opplogo');
                if (newOpp) g.opponentLogo = newOpp;
              }
            }
          }
        } catch (inner) {
          console.warn('[Restore] Failed to process logos for pass', pass.id, inner);
        }
      }

  // Normalize restored passes
  const normalized = (data.seasonPasses || []).map(normalizeSeasonPass);
  setSeasonPasses(normalized);
  setActiveSeasonPassId(data.activeSeasonPassId);
  setNeedsSetup(normalized.length === 0);

      // CRITICAL: Save normalized data to ALL storage locations to prevent
      // stale backup data from being merged back on next app load.
      const normalizedJson = JSON.stringify(normalized);
      await AsyncStorage.setItem(SEASON_PASSES_KEY, normalizedJson);
      if (data.activeSeasonPassId) {
        await AsyncStorage.setItem(ACTIVE_PASS_KEY, JSON.stringify(data.activeSeasonPassId));
      }
      await AsyncStorage.setItem(DATA_IMPORTED_KEY, 'true');

      // Update ALL backup locations so loadData won't merge stale data
      const backupPayload = {
        timestamp: new Date().toISOString(),
        passCount: normalized.length,
        passes: normalized,
      };
      await AsyncStorage.setItem(ALL_PASSES_BACKUP_KEY, JSON.stringify(backupPayload));
      console.log('[SeasonPass] ✅ Recovery: saved to all-passes backup');

      const masterBackup: BackupData = {
        version: BACKUP_VERSION,
        createdAtISO: new Date().toISOString(),
        activeSeasonPassId: data.activeSeasonPassId,
        seasonPasses: normalized,
      };
      await AsyncStorage.setItem(MASTER_BACKUP_KEY, JSON.stringify(masterBackup));
      console.log('[SeasonPass] ✅ Recovery: saved to master backup');

      // Increment sales version so stats recalculate immediately
      setSalesDataVersion(v => v + 1);

      console.log('[SeasonPass] Restored from recovery code:', normalized.length, 'passes (all backup locations updated)');
      return true;
    } catch (err) {
      console.error('[SeasonPass] restoreFromRecoveryCode failed:', err);
      return false;
    }
  }, []);

  const exportAsJSON = useCallback(async (embedLogos = false): Promise<boolean> => {
    try {
      const backup = await generateBackup(embedLogos);
      const jsonString = JSON.stringify(backup, null, 2);
      const fileName = `SeasonPassBackup_${new Date().toISOString().split('T')[0]}.json`;
      
      if (Platform.OS === 'web') {
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, jsonString, { encoding: FileSystem.EncodingType.UTF8 });
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Save Backup File',
        });
      }
      
      console.log('[SeasonPass] Exported JSON backup');
      return true;
    } catch (e: any) {
      console.error('[SeasonPass] Export JSON failed:', e);
      return false;
    }
  }, [generateBackup]);

  // Prepare a backup package (writes folder with JSON and assets) and return paths.
  const prepareBackupPackage = useCallback(async (embedLogos = false): Promise<{ success: boolean; fileUri?: string; folderUri?: string; writtenFiles?: string[]; isWeb?: boolean }> => {
    try {
      const backup = await generateBackup(embedLogos);
      const dateStr = new Date().toISOString().split('T')[0];
      const fileName = `SeasonPassBackup_${dateStr}.json`;

      // writeBackupFolder helper is top-level function in this module
      const folderBase = `SeasonPassBackup_${dateStr}`;
      const result = await writeBackupFolder(backup, folderBase, embedLogos, fileName);

      // result.folderUri contains dirUri (native) or 'WEB:downloads' on web
      let fileUri: string | undefined = undefined;
      if (result.folderUri && typeof result.folderUri === 'string' && result.folderUri.startsWith(FileSystem.documentDirectory || '')) {
        fileUri = result.folderUri + fileName;
      } else if (result.folderUri === 'WEB:downloads') {
        fileUri = undefined;
      }

      return { success: true, fileUri, folderUri: result.folderUri, writtenFiles: result.writtenFiles, isWeb: Platform.OS === 'web' };
    } catch (e: any) {
      console.error('[SeasonPass] prepareBackupPackage failed:', e);
      return { success: false };
    }
  }, [generateBackup]);

  const exportAsExcel = useCallback(async (): Promise<boolean> => {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();

      // Build a per-sale sheet first so Excel opens to individual sold-seat rows by default.
      const salesData: any[] = [];
      seasonPasses.forEach(pass => {
        Object.entries(pass.salesData).forEach(([gameId, gameSales]) => {
          const game = pass.games.find(g => g.id === gameId);
          Object.values(gameSales).forEach(sale => {
            // Determine seat count (number of seats represented by this sale)
            const seatCount = typeof sale.seatCount === 'number' ? sale.seatCount : parseSeatsCount(sale?.seats);
            salesData.push({
              'Team': pass.teamName,
              'League': pass.leagueId.toUpperCase(),
              'Season': pass.seasonLabel,
              'GameID': gameId,
              'Opponent': game?.opponent || 'Unknown',
              'GameDate': game?.date || '',
              'Section': sale.section || '',
              'Row': sale.row || '',
              'Seats': sale.seats || (seatCount || ''),
              'SeatCount': seatCount,
              // Keep SalePrice as a numeric cell so SUM formulas work
              'SalePrice': (typeof sale.price === 'number') ? Number(sale.price) : (sale.price ? Number(sale.price) : 0),
              'PaymentStatus': sale.paymentStatus || '',
              'Sold Date': sale.soldDate ? new Date(sale.soldDate).toLocaleString() : '',
            });
          });
        });
      });
      const salesWs = XLSX.utils.json_to_sheet(salesData);
      // Append Sales sheet first
      XLSX.utils.book_append_sheet(wb, salesWs, 'Sales');

      // Insert a total cell under the last entry in column K (SalePrice).
      try {
        if (salesWs && salesWs['!ref']) {
          const range = XLSX.utils.decode_range(salesWs['!ref']);
          // range.e.r is 0-based index of last row (header is row 0)
          const lastDataRowNumber = range.e.r + 1; // Excel row number of last data row
          const totalRowNumber = lastDataRowNumber + 1; // place total one row below last data
          const colLetter = 'K';
          const sumRange = `${colLetter}2:${colLetter}${lastDataRowNumber}`;
          const totalAddr = `${colLetter}${totalRowNumber}`;
          // Add label in column J and formula cell (numeric) in column K to compute SUM of SalePrice column
          const labelAddr = `J${totalRowNumber}`;
          salesWs[labelAddr] = { t: 's', v: 'TOTAL' } as any;
          salesWs[totalAddr] = { t: 'n', f: `SUM(${sumRange})` } as any;
          // Expand sheet range to include the new total row
          const newRange = { s: range.s, e: { c: range.e.c, r: range.e.r + 1 } };
          salesWs['!ref'] = XLSX.utils.encode_range(newRange);
        }
      } catch (err) {
        console.warn('[SeasonPass] Failed to add total formula to Sales sheet:', err);
      }

      // Summary sheet (kept for quick totals) - appended after Sales so Sales is the first/opened sheet
      const summaryData: any[] = [];
      seasonPasses.forEach(pass => {
        let totalRevenue = 0;
        let ticketsSold = 0;
        let pendingCount = 0;
        Object.values(pass.salesData).forEach(gameSales => {
          Object.values(gameSales).forEach(sale => {
            totalRevenue += sale.price || 0;
            const sc = typeof sale.seatCount === 'number' ? sale.seatCount : parseSeatsCount(sale?.seats);
            ticketsSold += sc;
            if (sale.paymentStatus === 'Pending') pendingCount += 1;
          });
        });
        const totalSeasonCost = pass.seatPairs.reduce((sum, p) => sum + p.seasonCost, 0);
        summaryData.push({
          'Team': pass.teamName,
          'League': pass.leagueId.toUpperCase(),
          'Season': pass.seasonLabel,
          'Total Games': pass.games.length,
          'Seat Pairs': pass.seatPairs.length,
          'Seats Sold': ticketsSold,
          'Total Revenue': totalRevenue.toFixed(2),
          'Season Cost': totalSeasonCost.toFixed(2),
          'Net Profit': (totalRevenue - totalSeasonCost).toFixed(2),
          'Pending Payments': pendingCount,
          'Events': pass.events.length,
        });
      });
      const summaryWs = XLSX.utils.json_to_sheet(summaryData);
      XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

      const seatPairsData: any[] = [];
      seasonPasses.forEach(pass => {
        pass.seatPairs.forEach(pair => {
          seatPairsData.push({
            'Team': pass.teamName,
            'Season': pass.seasonLabel,
            'Pair ID': pair.id,
            'Section': pair.section,
            'Row': pair.row,
            'Seats': pair.seats,
            'Season Cost': pair.seasonCost.toFixed(2),
          });
        });
      });
      const seatPairsWs = XLSX.utils.json_to_sheet(seatPairsData);
      XLSX.utils.book_append_sheet(wb, seatPairsWs, 'SeatPairs');

      const eventsData: any[] = [];
      seasonPasses.forEach(pass => {
        pass.events.forEach(event => {
          eventsData.push({
            'Team': pass.teamName,
            'Season': pass.seasonLabel,
            'Event Name': event.name,
            'Date': event.date,
            'Paid': event.paid,
            'Sold': event.sold ?? '',
            'Status': event.status,
          });
        });
      });
      const eventsWs = XLSX.utils.json_to_sheet(eventsData);
      XLSX.utils.book_append_sheet(wb, eventsWs, 'Events');

      const wbout = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });
      const fileName = `SeasonPassData_${new Date().toISOString().split('T')[0]}.xlsx`;

      if (Platform.OS === 'web') {
        const binary = atob(wbout);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        return true;
      }

      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, wbout, { encoding: FileSystem.EncodingType.Base64 });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          dialogTitle: 'Export Excel File',
        });
      }

      console.log('[SeasonPass] Exported Excel file');
      return true;
    } catch (e: any) {
      console.error('[SeasonPass] Export Excel failed:', e);
      return false;
    }
  }, [seasonPasses]);

  const exportAsCSV = useCallback(async (): Promise<boolean> => {
    try {
      const escape = (s: any) => {
        if (s === null || s === undefined) return '';
        const str = String(s);
        // Escape double quotes
        const q = str.replace(/"/g, '""');
        return `"${q}"`;
      };

      // Build CSV file content for per-game rows (one line per game that has sales)
      // Also build a TSV of per-sale rows and copy that to clipboard for drill-down in Excel.
      const csvRows: string[] = [];
      csvRows.push(['Team', 'League', 'Season', 'GameID', 'GameNumber', 'Opponent', 'GameDate', 'Time', 'PairsSold', 'SeatsSold', 'Revenue', 'PendingPayments'].join(','));

      const tsvRows: string[] = [];
      // per-sale TSV headers for clipboard (detailed rows)
      tsvRows.push(['Team', 'League', 'Season', 'GameID', 'Opponent', 'GameDate', 'Section', 'Row', 'Seats', 'SalePrice', 'PaymentStatus', 'Sold Date'].join('\t'));

      seasonPasses.forEach(pass => {
        const orderedGames = [...pass.games].sort((a, b) => {
          const aNum = typeof a.gameNumber === 'number' ? a.gameNumber : Number(a.gameNumber ?? 0);
          const bNum = typeof b.gameNumber === 'number' ? b.gameNumber : Number(b.gameNumber ?? 0);
          if (Number.isFinite(aNum) && Number.isFinite(bNum) && aNum !== bNum) return aNum - bNum;
          const aDate = a.date ? new Date(a.date).getTime() : 0;
          const bDate = b.date ? new Date(b.date).getTime() : 0;
          return aDate - bDate;
        });

        orderedGames.forEach(game => {
          const gameSales = pass.salesData[game.id] || {};
          const soldPairs = Object.keys(gameSales).length;

          let seatsSold = 0;
          let revenue = 0;
          let pending = 0;

          Object.values(gameSales).forEach((sale: any) => {
            const sc = typeof sale.seatCount === 'number' ? sale.seatCount : parseSeatsCount(sale?.seats);
            seatsSold += sc;
            revenue += sale.price || 0;
            if (sale.paymentStatus === 'Pending') pending += 1;

            // collect per-sale TSV rows for clipboard
            const saleRow = [
              pass.teamName,
              (pass.leagueId || '').toUpperCase(),
              pass.seasonLabel,
              game.id,
              game.opponent || 'Unknown',
              game.date || '',
              sale.section || '',
              sale.row || '',
              sale.seats || (sc || ''),
              (typeof sale.price === 'number') ? Number(sale.price).toFixed(2) : '',
              sale.paymentStatus || '',
              sale.soldDate ? new Date(sale.soldDate).toLocaleDateString() : '',
            ];
            tsvRows.push(saleRow.map(r => (r === null || r === undefined) ? '' : String(r)).join('\t'));
          });

          if (soldPairs === 0) {
            const gameRow = [
              pass.teamName,
              (pass.leagueId || '').toUpperCase(),
              pass.seasonLabel,
              game.id,
              game.gameNumber || '',
              game.opponent || 'Unknown',
              game.date || '',
              game.time || '',
              '0',
              '0',
              '0.00',
              '0',
            ];
            csvRows.push(gameRow.map(escape).join(','));
            return;
          }

          const gameRow = [
            pass.teamName,
            (pass.leagueId || '').toUpperCase(),
            pass.seasonLabel,
            game.id,
            game.gameNumber || '',
            game.opponent || 'Unknown',
            game.date || '',
            game.time || '',
            String(soldPairs),
            String(seatsSold),
            revenue.toFixed(2),
            String(pending),
          ];

          csvRows.push(gameRow.map(escape).join(','));
        });
      });

      const csvContent = '\uFEFF' + csvRows.join('\n'); // prepend BOM so Excel recognizes UTF-8
      const tsvContent = tsvRows.join('\n');

      // Save the CSV as a file (native share/download), and copy TSV to clipboard for quick Excel paste
      const fileName = `SeasonPassBackup_${new Date().toISOString().split('T')[0]}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
        // Also copy TSV to clipboard to help Excel users
        try { await Clipboard.setStringAsync(tsvContent); } catch {}
        return true;
      }

      // Native: write file to documentDirectory and open share sheet
      const fileUri = FileSystem.documentDirectory + fileName;
      await FileSystem.writeAsStringAsync(fileUri, csvContent, { encoding: FileSystem.EncodingType.UTF8 });

      // Copy TSV to clipboard so pasting into Excel/Numbers yields separate columns
      try {
        await Clipboard.setStringAsync(tsvContent);
        console.log('[SeasonPass] TSV copied to clipboard for Excel paste');
      } catch (e: any) {
        console.warn('[SeasonPass] Failed to copy TSV to clipboard:', e);
      }

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'text/csv',
          dialogTitle: 'Export CSV',
        });
      } else {
        console.log('[SeasonPass] CSV saved to:', fileUri);
      }

      console.log('[SeasonPass] Exported CSV file and copied TSV to clipboard');
      return true;
    } catch (e) {
      console.error('[SeasonPass] Export CSV failed:', e);
      return false;
    }
  }, [seasonPasses]);

  const emailBackup = useCallback(async (embedLogos = false): Promise<{ success: boolean; isWeb: boolean }> => {
    try {
      console.log('[EmailBackup] Platform.OS =', Platform.OS);
      const backup = await generateBackup(embedLogos);
      const jsonString = JSON.stringify(backup, null, 2);
      const dateStr = new Date().toISOString().split('T')[0];
      
      // Use .txt extension for iOS Mail compatibility (Mail reliably attaches .txt files)
      const baseName = `season-pass-backup-${dateStr}`;
      const txtFileName = `${baseName}.txt`;

      console.log('[EmailBackup] Platform.OS:', Platform.OS);
      console.log('[EmailBackup] Creating backup file:', txtFileName);
      console.log('[EmailBackup] Backup data size:', jsonString.length, 'bytes');

      // ========== WEB ONLY ==========
      // NOTE: When running inside Rork app preview, Platform.OS is always 'web'
      // because Rork preview uses React Native Web.
      // We attempt Web Share API with file attachment first (works in iOS Safari/Rork).
      if (Platform.OS === 'web') {
        console.log('[EmailBackup] Using WEB flow - attempting Web Share API with file attachment');
        
        const jsonFileName = `${baseName}.json`;
        const blob = new Blob([jsonString], { type: 'application/json' });
        const file = new File([blob], jsonFileName, { type: 'application/json' });
        
        // Check if Web Share API with files is supported
        const nav = navigator as any;
        let canShareFiles = false;
        try {
          canShareFiles = !!(nav.canShare && nav.canShare({ files: [file] }));
        } catch (e) {
          console.log('[EmailBackup] canShare check failed:', e);
          canShareFiles = false;
        }
        console.log('[EmailBackup] Web Share API canShare files:', canShareFiles);
        
        if (canShareFiles) {
          // Web Share with files IS supported - use it exclusively, NO fallback
          try {
            console.log('[EmailBackup] Opening Web Share with file attachment...');
            await nav.share({
              files: [file],
              title: 'Season Pass Tracker Backup',
              text: 'Backup attached.',
            });
            console.log('[EmailBackup] Web Share completed successfully');
          } catch (shareError: any) {
            // AbortError = user cancelled, any other error = share failed
            // In ALL cases: do NOT show any alert, do NOT fallback to download
            const errorName = shareError?.name || 'Unknown';
            console.log('[EmailBackup] Web Share ended with:', errorName, shareError?.message || '');
          }
          // ALWAYS return here - never fall through to download when Web Share is available
          return { success: true, isWeb: true };
        } else {
          // Web Share with files NOT supported - use download fallback
          console.log('[EmailBackup] Web Share with files not supported - using download fallback');
          
          // Download the file
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = jsonFileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          
          console.log('[EmailBackup] Web: File downloaded');
          
          // Only show "attach manually" alert when download fallback is actually used
          Alert.alert(
            'Backup Downloaded',
            `File "${jsonFileName}" has been downloaded. Please attach it manually to an email.`,
            [{ text: 'OK' }]
          );
          
          return { success: true, isWeb: true };
        }
      }

      // ========== iOS / ANDROID ONLY ==========
      console.log('[EmailBackup] Using NATIVE flow - Share sheet with .txt file (iOS-reliable)');
      
      // Step 1: Write .txt file to cacheDirectory
      const txtUri = `${FileSystem.cacheDirectory}${txtFileName}`;
      console.log('[EmailBackup] txtUri:', txtUri);
      
      await FileSystem.writeAsStringAsync(txtUri, jsonString, { 
        encoding: FileSystem.EncodingType.UTF8 
      });

      // Step 2: Verify file EXISTS and has SIZE
      const fileInfo = await FileSystem.getInfoAsync(txtUri);
      const fileSize = (fileInfo as any).size || 0;
      console.log('[EmailBackup] txtUri:', txtUri, 'exists:', fileInfo.exists, 'size:', fileSize);

      if (!fileInfo.exists || fileSize <= 0) {
        console.error('[EmailBackup] Backup failed - File not created properly');
        Alert.alert('Backup failed', `File not created: ${txtUri}`);
        return { success: false, isWeb: false };
      }

      // Step 3: Check if sharing is available
      const canShare = await Sharing.isAvailableAsync();
      console.log('[EmailBackup] Sharing available:', canShare);

      if (!canShare) {
        console.error('[EmailBackup] Sharing not available');
        Alert.alert('Sharing not available', `File saved at: ${txtUri}`);
        return { success: false, isWeb: false };
      }

      // Step 4: Share the .txt file (Mail reliably attaches text/plain files)
      console.log('[EmailBackup] Opening share sheet with .txt file...');
      await Sharing.shareAsync(txtUri, {
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
        dialogTitle: 'Send Backup',
      });
      
      console.log('[EmailBackup] Share sheet opened with .txt file attachment');
      return { success: true, isWeb: false };
    } catch (e) {
      console.error('[EmailBackup] Email backup failed:', e);
      Alert.alert('Email Backup Error', `${e}`);
      return { success: false, isWeb: false };
    }
  }, [generateBackup]);

  const getLeagueById = useCallback((leagueId: string): League | undefined => {
    return LEAGUES.find(l => l.id === leagueId);
  }, []);

  const getTeamById = useCallback((leagueId: string, teamId: string): Team | undefined => {
    const teams = getTeamsByLeague(leagueId);
    return teams.find(t => t.id === teamId);
  }, []);

  // Debug helper: try to resolve missing opponent logos for a pass using ESPN proxy
  const debugFetchLogosFromEspnForPass = useCallback(async (passId: string) => {
    const pass = seasonPasses.find(p => p.id === passId);
    if (!pass) return { success: false, error: 'PASS_NOT_FOUND' };

    if (!pass.leagueId) return { success: false, error: 'NO_LEAGUE' };

    console.log('[DebugLogos] Fetching teams from ESPN for league:', pass.leagueId);
    try {
      let teamsRes: any;
      try {
        teamsRes = await trpcClient.espn.getTeams.query({ leagueId: pass.leagueId });
      } catch (fetchError: any) {
        console.warn('[DebugLogos] Network error fetching ESPN teams:', fetchError?.message || fetchError);
        return { success: false, error: 'NETWORK_ERROR', message: 'Backend unreachable' };
      }
      if (!teamsRes || teamsRes.error) {
        console.warn('[DebugLogos] ESPN getTeams returned error:', teamsRes?.error);
        return { success: false, error: 'ESPN_TEAMS_FAILED' };
      }

      const teams: any[] = teamsRes.teams || [];
      let changed = false;
      const updatedPasses = seasonPasses.map(sp => {
        if (sp.id !== passId) return sp;

        const gamesClone: Game[] = JSON.parse(JSON.stringify(sp.games || []));
        const salesClone: any = JSON.parse(JSON.stringify(sp.salesData || {}));
        const details: any[] = [];

        for (const g of gamesClone) {
          if (!g.opponentLogo) {
            const opp = (g.opponent || '').toLowerCase();
            // try direct matches against ESPN team display names / name / abbreviation
            let matched: any = null;
            matched = teams.find(t => {
              const name = (t.name || '').toLowerCase();
              const disp = (t.displayName || '').toLowerCase();
              const abbr = (t.abbreviation || '').toLowerCase();
              return (name && opp.includes(name)) || (disp && opp.includes(disp)) || (abbr && opp.includes(abbr));
            });

            if (!matched) {
              // token fallback
              const tokens: string[] = opp.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
              for (const t of teams) {
                const name = (t.name || '').toLowerCase();
                const disp = (t.displayName || '').toLowerCase();
                const abbr = (t.abbreviation || '').toLowerCase();
                if (tokens.some(tok => name.includes(tok) || disp.includes(tok) || abbr === tok)) {
                  matched = t; break;
                }
              }
            }

            if (matched && (matched.abbreviation || matched.displayName)) {
              const ab = (matched.abbreviation || '').toLowerCase();
              // construct ESPN CDN URL similar to backend
              const getEspnLogoUrl = (leagueId: string, teamAbbr: string) => {
                const a = (teamAbbr || '').toLowerCase();
                switch ((leagueId || '').toLowerCase()) {
                  case 'nhl': return `https://a.espncdn.com/i/teamlogos/nhl/500/${a}.png`;
                  case 'nba': return `https://a.espncdn.com/i/teamlogos/nba/500/${a}.png`;
                  case 'nfl': return `https://a.espncdn.com/i/teamlogos/nfl/500/${a}.png`;
                  case 'mlb': return `https://a.espncdn.com/i/teamlogos/mlb/500/${a}.png`;
                  case 'mls': return `https://a.espncdn.com/i/teamlogos/soccer/500/${a}.png`;
                  default: return `https://a.espncdn.com/i/teamlogos/${(leagueId || '').toLowerCase()}/500/${a}.png`;
                }
              };

              g.opponentLogo = getEspnLogoUrl(sp.leagueId, ab || (matched.displayName || '').split(' ')[0] || '');
              changed = true;
              details.push({ gameId: g.id, opponent: g.opponent, logo: g.opponentLogo, matched: matched.displayName || matched.name || matched.abbreviation });
            } else {
              details.push({ gameId: g.id, opponent: g.opponent, logo: null, matched: null });
            }
          }
        }

        // backfill sales for updated games
        const gamesById: Record<string, Game> = {};
        gamesClone.forEach(g => { gamesById[g.id] = g; });
        Object.entries(salesClone).forEach(([gid, gs]: any) => {
          const game = gamesById[gid];
          if (!game) return;
          Object.keys(gs).forEach(k => {
            const s = gs[k];
            if (s && !s.opponentLogo && game.opponentLogo) {
              s.opponentLogo = game.opponentLogo;
              changed = true;
            }
          });
        });

        return { ...sp, games: gamesClone, salesData: salesClone, _debugLogoFixes: details } as SeasonPass;
      });

      if (changed) {
        await saveSeasonPasses(updatedPasses);
        setSeasonPasses(updatedPasses);
        console.log('[DebugLogos] Updated pass with ESPN logos for passId:', passId);
      } else {
        console.log('[DebugLogos] No logos resolved for passId:', passId);
      }

      // Return a compact report
      const reportPass = updatedPasses.find(p => p.id === passId) as any;
      return { success: true, changed, details: reportPass?._debugLogoFixes || [] };
    } catch (e: any) {
      console.warn('[DebugLogos] Unexpected error:', e?.message || e);
      return { success: false, error: 'UNEXPECTED', message: e?.message || 'Unknown error' };
    }
  }, [seasonPasses, saveSeasonPasses]);

  const calculateStats = useMemo(() => {
    if (!activeSeasonPass) {
      return {
        totalRevenue: 0,
        ticketsSold: 0,
        totalTickets: 0,
        avgPrice: 0,
        pendingPayments: 0,
        soldRate: 0,
        totalSeasonCost: 0,
      };
    }

    let totalRevenue = 0;
    let totalSoldSeats = 0;
    let pendingSeats = 0;
    let pendingPaymentRecords = 0;

    // seatsPerGame: sum of configured seats in each seatPair (e.g., pairs may have 2 seats each)
    const seatsPerGame = (activeSeasonPass.seatPairs || []).reduce((acc, p) => acc + parseSeatsCount(p.seats), 0);

    // Count ALL sales including preseason games (p1, p2, etc.)
    // IMPORTANT: Count ALL sales toward ticketsSold regardless of payment status
    // A sale entry = seats sold, even if payment is pending or game is in the future
    Object.entries(activeSeasonPass.salesData).forEach(([gameId, gameSales]) => {
      Object.values(gameSales).forEach(sale => {
        if (typeof sale.price === 'number') {
          totalRevenue += sale.price;
        }
        // Use seatCount if it's a positive number, otherwise parse from seats string
        // Fallback to 2 seats (typical pair) if parsing fails
        let sc = 0;
        if (typeof sale.seatCount === 'number' && sale.seatCount > 0) {
          sc = sale.seatCount;
        } else {
          sc = parseSeatsCount(sale?.seats);
          if (sc <= 0) sc = 2; // Default to 2 seats per pair
        }
        // ALL sales count toward ticketsSold (by sale entry, not by paid status)
        totalSoldSeats += sc;
        // Track pending payments separately for reporting
        if (sale.paymentStatus === 'Pending') {
          pendingSeats += sc;
          pendingPaymentRecords += 1;
        }
      });
    });

    const ticketsSold = totalSoldSeats;
    // totalTickets includes ALL games (preseason + regular season)
    const totalTickets = (activeSeasonPass.games?.length || 42) * seatsPerGame;
    const avgPrice = ticketsSold > 0 ? totalRevenue / ticketsSold : 0;
    const soldRate = totalTickets > 0 ? (ticketsSold / totalTickets) * 100 : 0;
    const totalSeasonCost = activeSeasonPass.seatPairs.reduce((sum, pair) => sum + pair.seasonCost, 0);
    
    console.log('[Stats] Tickets sold (all sales):', ticketsSold, 'Pending payments:', pendingPaymentRecords, 'Total possible:', totalTickets, 'Version:', salesDataVersion);

    return {
      totalRevenue,
      ticketsSold,
      totalTickets,
      avgPrice,
      // keep `pendingPayments` as the number of pending sale records for backward compatibility
      pendingPayments: pendingPaymentRecords,
      // new field: number of pending seats (seat-level)
      pendingSeats,
      soldRate,
      totalSeasonCost,
    };
  }, [activeSeasonPass, salesDataVersion]);

  // (dev helper removed) — auto-restore helper was removed to keep runtime deterministic.

  return {
    seasonPasses,
    activeSeasonPass,
    activeSeasonPassId,
    isLoading,
    isLoadingSchedule,
    lastScheduleError,
    needsSetup,
    createSeasonPass,
    updateSeasonPass,
    deleteSeasonPass,
    switchSeasonPass,
    addSeatPair,
    removeSeatPair,
    addSaleRecord,
  removeSaleRecord,
    updateGames,
    resyncSchedule,
    debugFetchLogosFromEspnForPass,
    addEvent,
    removeEvent,
    clearAllData,
    getLeagueById,
    getTeamById,
    calculateStats,
    leagues: LEAGUES,
    getTeamsByLeague,
    createRecoveryCode,
    restoreFromRecoveryCode,
    exportAsJSON,
    exportAsExcel,
    exportAsCSV,
    emailBackup,
      prepareBackupPackage,
    restorePanthersData,
    restoreAllSeasonPassData,
    forceReplacePanthersSales,
    replaceSalesDataFromPastedSeed,
    importSalesFromFileData,
    lastBackupTime,
    lastBackupStatus,
    backupError,
    backupConfirmationMessage,
    retryBackup,
    reloadFromStorage: loadData,
  };
});
