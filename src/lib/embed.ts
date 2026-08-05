/**
 * Who is hosting this page.
 *
 * When a host owns the sign-in session, this app must not offer to end it — a
 * "Sign out" here would leave the surrounding page signed in and this panel
 * signed out. The signal is `?source=hq`, and only that: being inside a frame
 * is not enough on its own, because the app is embedded in places that do not
 * own the session.
 *
 * The marker must be on the **iframe's src**:
 *
 *     <iframe src="https://…vercel.app/?source=hq">
 *
 * Putting it only on the surrounding page's own address does nothing. A
 * cross-origin frame cannot read its parent's location, and browsers trim the
 * referrer to a bare origin, so the parent's query string never reaches this
 * code. A full referrer is honoured when one is sent, but nothing should be
 * built on that.
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
 * must not offer to end it. Driven by the marker alone — see the note above on
 * where it has to be set.
 */
export const HOST_OWNS_SESSION = EMBED_SOURCE === "hq";
