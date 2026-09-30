/**
 * dsh-skill-picker — host half: the JSON route behind the browser half's
 * fallback catalog source.
 *
 * The route exists because the primary source (the official `skills/list`
 * Remote) needs a retained, open Session: when a Session is switching, cold, or
 * not yet attached, the Remote rejects and the picker still has to render
 * something. This handler answers from a bare `cwd` with no Session at all.
 *
 * The interface is deliberately two values wide — `createSkillsRoute({ scanSkills })`
 * returns the request handler — so the scan is a dependency the caller supplies
 * rather than something this module reaches for. Tests pass a stub and assert
 * the wire shape without touching a filesystem; the host passes the real scan.
 *
 * @module dsh-skill-picker/host/skills-route
 */

/**
 * Read the active session's workspace root off the request.
 *
 * The browser half appends it as `?cwd=`, because only the client knows which
 * Session's draft the picker is attached to. A request without it is answered
 * from the user-level roots alone rather than refused.
 *
 * @param {import('node:http').IncomingMessage} req - the incoming request.
 * @returns {string | undefined} the workspace root, or undefined when absent.
 */
export function cwdFromRequest(req) {
  if (req.url === undefined) return undefined
  return new URL(req.url, 'http://dsh').searchParams.get('cwd') ?? undefined
}

/**
 * Build the catalog route handler.
 *
 * Never throws: a scan failure becomes a 500 with an `{ ok: false, error }`
 * body, because an exception here would take down the web server's request
 * handling rather than one picker panel.
 *
 * @param {{ scanSkills: (cwd?: string) => Promise<Array<{ name: string, description: string, path: string }>> }} deps
 *   - the catalog scan to answer from.
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => Promise<void>}
 */
export function createSkillsRoute({ scanSkills }) {
  const respond = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(JSON.stringify(body))
  }
  return async function skillsRoute(req, res) {
    try {
      const skills = await scanSkills(cwdFromRequest(req))
      respond(res, 200, { ok: true, complete: true, skills })
    } catch (error) {
      respond(res, 500, { ok: false, error: String(error?.message ?? error) })
    }
  }
}
