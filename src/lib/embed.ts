/**
 * Who is hosting this page.
 *
 * Embedded in the HQ portal the app is not where anyone signs in or out — HQ
 * owns that session, and a "Sign out" here would leave the surrounding page
 * logged in and this panel logged out. HQ marks the embed with `?source=hq`
 * and the button disappears.
 *
 * The marker has to be on the *iframe's* src. A cross-origin frame cannot read
 * the parent's URL, and browsers trim the referrer to a bare origin by default,
 * so the query string of the surrounding page is not visible from in here. The
 * referrer is still checked in case HQ sends a full one.
 */

const KEY = "ta-perdiem-source";

/**
 * Session storage is blocked outright in some third-party frames, so both
 * halves are best-effort: failing to remember the marker must never lose it.
 */
function remember(value: string): void {
  try {
    sessionStorage.setItem(KEY, value);
  } catch {
    /* the marker still holds for this page load */
  }
}

function recall(): string {
  try {
    return sessionStorage.getItem(KEY) || "";
  } catch {
    return "";
  }
}

function readSource(): string {
  if (typeof window === "undefined") return "";

  let found = "";
  try {
    found = new URLSearchParams(window.location.search).get("source") || "";
    if (!found && document.referrer) {
      found = new URL(document.referrer).searchParams.get("source") || "";
    }
  } catch {
    /* a malformed referrer is not worth breaking the page over */
  }

  // The marker only arrives on the first load, so it is remembered: an in-app
  // reload would otherwise bring the button back.
  if (found) remember(found);
  return found || recall();
}

/** The raw `source` marker, lower-cased — "" when the app was opened directly. */
export const EMBED_SOURCE = readSource().toLowerCase();

/** True when the HQ portal is hosting this page and owns the session. */
export const HOSTED_BY_HQ = EMBED_SOURCE === "hq";
