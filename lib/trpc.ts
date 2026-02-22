import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

/**
 * Get the base URL for the API.
 * In production (TestFlight/App Store), we MUST NOT crash if the env var is missing.
 */
const getBaseUrl = (): string => {
  try {
    const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

    if (url && typeof url === 'string' && url.length > 0) {
      return url;
    }

    // In development, log a warning
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn(
        '[trpc] EXPO_PUBLIC_RORK_API_BASE_URL is not set — using fallback http://localhost:8787 (dev only)'
      );
      return 'http://localhost:8787';
    }

    // In production, return a safe fallback URL that won't crash the app
    console.warn('[trpc] EXPO_PUBLIC_RORK_API_BASE_URL is not set in production');
    return 'https://api.rork.com';
  } catch (e) {
    console.error('[trpc] Error getting base URL:', e);
    return 'https://api.rork.com';
  }
};

/**
 * Create the tRPC client with superjson transformer.
 */
function createTrpcClient(): ReturnType<typeof trpc.createClient> {
  const baseUrl = getBaseUrl();
  
  return trpc.createClient({
    links: [
      httpLink({
        url: `${baseUrl}/api/trpc`,
        transformer: superjson,
      }),
    ],
  });
}

// Lazily create the client on first access
let _trpcClientInstance: ReturnType<typeof trpc.createClient> | null = null;

function getTrpcClient(): ReturnType<typeof trpc.createClient> {
  if (!_trpcClientInstance) {
    _trpcClientInstance = createTrpcClient();
  }
  return _trpcClientInstance;
}

// Export a proxy that lazily initializes the client
export const trpcClient = new Proxy({} as ReturnType<typeof trpc.createClient>, {
  get(_target, prop) {
    const client = getTrpcClient();
    const value = (client as any)[prop];
    if (typeof value === 'function') {
      return value.bind(client);
    }
    return value;
  },
});
