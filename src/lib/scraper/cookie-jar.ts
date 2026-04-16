// Minimal cookie jar scoped to a single scrape session. Parses Set-Cookie
// header values, keeps only name + value (ignores Path/HttpOnly/Secure/
// Expires/Max-Age/Domain — we control the host and the session lives ~5s),
// and serializes back out as a "name=value; name=value" Cookie header.
//
// Design rationale in design-plan.md Q1: manual cookie handling at the
// application layer removes any dependency on whether the underlying fetch
// client (browser, Node, Tauri http plugin) persists cookies across calls.

export class CookieJar {
  private readonly cookies = new Map<string, string>();

  /**
   * Absorb an array of Set-Cookie header values. Use with
   * `response.headers.getSetCookie()` — which returns the raw values
   * without folding them into a single comma-joined string, preserving
   * each cookie as its own entry.
   */
  absorb(setCookieHeaders: readonly string[]): void {
    for (const header of setCookieHeaders) {
      this.absorbOne(header);
    }
  }

  /**
   * Absorb a single Set-Cookie header value. Takes only the first `name=value`
   * segment (everything before the first `;`) and discards attributes.
   * Silently ignores empty or malformed input — parser must not throw on
   * unexpected server behavior.
   */
  absorbOne(setCookieHeader: string): void {
    const firstSegment = setCookieHeader.split(";", 1)[0]?.trim();
    if (!firstSegment) return;

    const eqIdx = firstSegment.indexOf("=");
    if (eqIdx < 0) return;

    const name = firstSegment.slice(0, eqIdx).trim();
    const value = firstSegment.slice(eqIdx + 1).trim();
    if (!name) return;

    this.cookies.set(name, value);
  }

  /**
   * Build a Cookie header value for the next request. Returns an empty
   * string when the jar holds no cookies — callers should check for that
   * and omit the header rather than sending a blank one.
   */
  header(): string {
    return [...this.cookies].map(([n, v]) => `${n}=${v}`).join("; ");
  }

  get size(): number {
    return this.cookies.size;
  }
}
