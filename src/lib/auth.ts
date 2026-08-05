/**
 * The single TenMSAuth instance for the app.
 *
 * The README for this SDK is written for Next.js; this project is Vite, so the
 * client ID comes from `import.meta.env.VITE_*` rather than `NEXT_PUBLIC_*`.
 * It is still never hard-coded. Storage stays 'localStorage' as the SDK
 * requires.
 *
 * `redirectUri` has no default in the SDK and the popup flow requires it to be
 * same-origin as the opener, so it is derived from the current origin. That
 * exact origin must be registered against the client ID with the provider.
 */

import { TenMSAuth } from "@tenminuteschool/auth-admin-react";

export const CLIENT_ID = import.meta.env.VITE_TENMS_CLIENT_ID as string;

export const REDIRECT_URI =
  (import.meta.env.VITE_TENMS_REDIRECT_URI as string | undefined) ||
  (typeof window !== "undefined" ? window.location.origin : "");

export const auth = new TenMSAuth({
  clientId: CLIENT_ID,
  redirectUri: REDIRECT_URI,
  storage: "localStorage",
});
