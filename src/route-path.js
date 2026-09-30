/**
 * dsh-skill-picker — the HTTP contract between the two halves.
 *
 * The browser half's fallback catalog source fetches this route; the host half
 * registers it. That makes the path an interface, not an implementation detail:
 * it used to be the same string literal written out independently in both
 * halves, where renaming one side would have broken the fallback silently — the
 * route would simply 404 and the panel would show a load error.
 *
 * Kept free of Node built-ins so the browser bundle and `node --test` can both
 * import it.
 *
 * @module dsh-skill-picker/route-path
 */

/** The path prefix the plugin owns on the web server. */
export const ROUTE_PREFIX = '/dsh-skill-picker'

/**
 * The catalog route: `GET` → `{ ok: true, complete: true, skills }`, accepting
 * an optional `?cwd=` naming the active Session's workspace root.
 */
export const SKILLS_ROUTE = `${ROUTE_PREFIX}/skills`
