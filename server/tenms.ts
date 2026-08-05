/**
 * Server-side verification of a "Login with 10 Minute School" session.
 *
 * The browser finishes the OAuth flow and ends up holding an access token. It
 * then sends that token here — never an email address. Trusting an email from
 * the browser would let anyone sign in as anyone, so the token is exchanged
 * for a profile at the provider's own userinfo endpoint, and only the email
 * that comes back is used to look the person up in the Employees sheet.
 */

const BASE_URL = (process.env.TENMS_AUTH_BASE_URL || "https://api.10minuteschool.com/auth").replace(/\/$/, "");

export interface TenMSUser {
  sub: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
}

export class TenMSVerifyError extends Error {
  constructor(message: string, readonly status = 401) {
    super(message);
  }
}

/** Resolves an access token to the profile the provider vouches for. */
export async function verifyAccessToken(accessToken: string): Promise<TenMSUser> {
  if (!accessToken) throw new TenMSVerifyError("No access token was supplied.", 400);

  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
  } catch {
    throw new TenMSVerifyError("Could not reach the 10 Minute School sign-in service. Try again.", 503);
  }

  if (!res.ok) {
    throw new TenMSVerifyError(
      res.status === 401 || res.status === 403
        ? "Your sign-in session is not valid any more. Please sign in again."
        : `The sign-in service rejected the token (${res.status}).`,
      401,
    );
  }

  const profile = (await res.json()) as TenMSUser;
  if (!profile?.sub) throw new TenMSVerifyError("The sign-in service returned an incomplete profile.", 502);
  return profile;
}
