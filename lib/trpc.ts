import { httpLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import superjson from "superjson";

import type { AppRouter } from "@/backend/trpc/app-router";

export const trpc = createTRPCReact<AppRouter>();

const getBaseUrl = () => {
  const url = process.env.EXPO_PUBLIC_RORK_API_BASE_URL;

  if (!url) {
    // In development, don't crash the app just because the Rork wrapper
    // didn't inject the public API URL. Log a warning and return a
    // sensible local fallback so the UI can render; network calls will
    // fail but won't cause an immediate uncaught exception.
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      // eslint-disable-next-line no-console
      console.warn(
        '[trpc] EXPO_PUBLIC_RORK_API_BASE_URL is not set — using fallback http://localhost:8787 (dev only)'
      );
      return 'http://localhost:8787';
    }

    throw new Error(
      "Rork did not set EXPO_PUBLIC_RORK_API_BASE_URL, please use support",
    );
  }

  return url;
};

export const trpcClient = trpc.createClient({
  links: [
    httpLink({
      url: `${getBaseUrl()}/api/trpc`,
      transformer: superjson,
    }),
  ],
});
