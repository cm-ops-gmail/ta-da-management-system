/**
 * Who is hosting this page.
 *
 * When a host owns the sign-in session, this app must not offer to end it — a
 * "Sign out" here would leave the surrounding page signed in and this panel
 * signed out.
 *
 * Two signals, either of which is enough:
 *
 *  - `?source=hq` on this page's own URL. To reach here it has to be on the
 *    **iframe's src**; putting it only on the surrounding page's address does
 *    nothing, since a cross-origin frame cannot read its parent's location and
 *    the referrer arrives trimmed to a bare origin. A full referrer is honoured
 *    when one is sent, but nothing is built on that.
 *
 *  - Being inside a frame at all. HQ is the only site that embeds this app, so
 *    this is a dependable stand-in, and unlike the marker it needs nothing from
 *    HQ's embed code. Comparing the two window references is safe across
 *    origins — it is reading a *property* off window.top that would throw.
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

/**
 * True when this page is running inside someone else's frame.
 *
 * Comparing the two is safe across origins — it is reading a *property* of
 * window.top that throws, never the identity check itself.
 */
function detectFramed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.top !== window.self;
  } catch {
    // A sandboxed frame can make even this throw, and throwing at all means
    // there is something above us.
    return true;
  }
}

/** The raw `source` marker, lower-cased — "" when no marker was passed. */
export const EMBED_SOURCE = readSource().toLowerCase();

/** True when this page is embedded in another site. */
export const IS_FRAMED = detectFramed();

/**
 * True when something other than this app owns the sign-in session, so the app
 * must not offer to end it.
 *
 * Either signal is enough. The marker is the explicit one but cannot be relied
 * on, so being framed stands in for it: the only site that embeds this app is
 * the HQ portal, and that check needs nothing from HQ's embed code.
 */
export const HOST_OWNS_SESSION = EMBED_SOURCE === "hq" || IS_FRAMED;
