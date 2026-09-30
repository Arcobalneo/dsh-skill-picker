/**
 * dsh-skill-picker — browser half: the catalog seam.
 *
 * One interface — `fetchCatalog(sessionId, signal)` → `{ skills, source }` —
 * with **two adapters** behind it, because two genuinely vary:
 *
 *  1. **the official `skills/list` Remote** — the same call the official
 *     ui-skill package makes for DSH's own `/` completion, so the picker lists
 *     what agents can load. It needs a retained, *open* Session, which is why it
 *     can refuse.
 *  2. **this plugin's host route** — answers from a bare `cwd` with no Session
 *     at all. It is the reason the picker still renders while a Session is
 *     switching, cold, or not yet attached.
 *
 * Two adapters justify the seam; before this module the seam had no interface,
 * and the strategy lived in the render body as a try/catch chain that also
 * carried the panel's error policy. The adapters drifted as a result: they
 * returned different entry shapes, and each carried its own copy of the
 * user-invocable policy — which is how issue #10 shipped, where the panel
 * offered a skill the official `/` menu hides and picking it was a silent no-op.
 *
 * Now both adapters cross one normalizer, so the policy has exactly one home
 * and an entry has exactly one shape.
 *
 * @module dsh-skill-picker/client/catalog
 */

import { SKILLS_ROUTE } from '../route-path.js'

/**
 * @typedef {object} CatalogSkill
 * @property {string} name
 * @property {string} description
 */

/**
 * @typedef {object} CatalogResult
 * @property {CatalogSkill[]} skills
 * @property {'official' | 'host'} source - which adapter answered.
 */

/**
 * Whether a catalog entry may be offered by a human-facing surface.
 *
 * The host already filters user-invocable skills out of the Remote payload, so
 * in practice this never fires — which is exactly why it must stay: it is the
 * *contract* that the two adapters agree on, stated once, at the seam. The
 * registry summary nests both flags under `invocation` while the `skills/list`
 * DTO carries a flat `modelInvocable`, so accept either shape and hide only an
 * explicit `false`; an omitted flag keeps the historical behaviour (issue #10).
 *
 * @param {object} skill - a raw entry from either adapter.
 * @returns {boolean}
 */
function isUserFacingSkill(skill) {
  const flag = skill?.userInvocable ?? skill?.invocation?.userInvocable
  return flag !== false
}

/**
 * Bring one adapter's payload onto the shape the panel renders.
 *
 * Both adapters send more than the panel uses — the host route includes a
 * filesystem `path`, the Remote DTO includes `modelInvocable` — and normalizing
 * here is what stops the two from disagreeing again.
 *
 * @param {unknown} list - the raw `skills` array from an adapter.
 * @returns {CatalogSkill[]}
 */
function normalize(list) {
  const entries = Array.isArray(list) ? list : []
  return entries
    .filter(isUserFacingSkill)
    .map((skill) => ({ name: skill.name, description: skill.description ?? '' }))
}

/**
 * Build the catalog source.
 *
 * Dependencies are accepted, not created: tests pass a Remote stub, a Session
 * stub and a `fetch` stub, so every branch — Remote unavailable, Session not
 * open, adapter failure, fallback failure — is reachable without a browser.
 *
 * @param {object} deps
 * @param {object} [deps.remote] - the plugin's `ctx.remote`, carrying the generated `skills` Remote.
 * @param {object} [deps.sessions] - the plugin's `ctx.sessions`, used to retain and inspect a Session.
 * @param {(sessionId: string) => string} [deps.cwdOf] - resolves a Session's workspace root for the route adapter.
 * @param {typeof globalThis.fetch} [deps.fetch] - the transport; defaults to the page's `fetch`.
 * @returns {{ fetchCatalog: (sessionId: string, signal?: AbortSignal) => Promise<CatalogResult> }}
 */
export function createCatalog({ remote, sessions, cwdOf = () => '', fetch: fetchImpl } = {}) {
  const doFetch = fetchImpl ?? ((...args) => globalThis.fetch(...args))

  /**
   * Whether the Session is an addressed continuable child. Those resolve no
   * skill candidates locally: the Remote needs an attached Session, and viewing
   * their persisted history must not activate them.
   */
  const isSubagent = (sessionId) => typeof sessions?.subagentAddress === 'function'
    && sessions.subagentAddress(sessionId) !== undefined

  /** Adapter 1: the official `skills/list` Remote. Throws when it cannot answer. */
  const fetchViaSession = async (sessionId, signal) => {
    const list = remote?.skills?.list
    if (typeof list !== 'function') {
      throw new Error('skills Remote unavailable (ctx.remote.skills)')
    }
    if (isSubagent(sessionId)) return []

    const readCatalog = async () => {
      const result = await list({ sessionId }, signal)
      if (!result.ok) throw new Error(`skills/list failed: ${result.error?.code}: ${result.error?.message}`)
      return normalize(result.value?.skills)
    }

    // The Remote requires an existing retained Session and waits for its
    // initial history open to succeed before answering. `sessions.using` holds
    // that reference only until the fetch settles, mirroring the official
    // ui-skill package. When no reference can be acquired the call rejects and
    // the caller falls back to the host route.
    if (typeof sessions?.using === 'function' && typeof sessions?.binding === 'function') {
      return await sessions.using(sessionId, { source: 'skillPicker', signal }, async (reference) => {
        const state = reference.binding.session.getSnapshot()
        if (state.openState !== 'open') throw state.openError ?? new Error(`session "${sessionId}" is not open`)
        return await readCatalog()
      })
    }
    return await readCatalog()
  }

  /** Adapter 2: this plugin's host route. Throws when it cannot answer. */
  const fetchViaRoute = async (sessionId, signal) => {
    // The cwd is resolved lazily, per request, so the scan always sees the
    // Session's current workspace and a project skill created after mount is
    // still discovered.
    const cwd = cwdOf(sessionId)
    const query = typeof cwd === 'string' && cwd !== '' ? `?cwd=${encodeURIComponent(cwd)}` : ''
    const response = await doFetch(`${SKILLS_ROUTE}${query}`, {
      headers: { accept: 'application/json' },
      signal,
    })
    const body = await response.json()
    if (!body.ok) throw new Error(body.error || 'bad response')
    return normalize(body.skills)
  }

  /**
   * Answer with the official adapter, falling back to the host route.
   *
   * Never swallows a failure silently: the fallback logs why it happened, and
   * if the fallback also fails the error reaches the caller, which owns the
   * user-visible policy (keep the current list, or show the failure).
   */
  const fetchCatalog = async (sessionId, signal) => {
    try {
      return { skills: await fetchViaSession(sessionId, signal), source: 'official' }
    } catch (error) {
      if (signal?.aborted) throw error
      console.warn('[dsh-skill-picker] official skills API failed, falling back to host route:', error)
    }
    return { skills: await fetchViaRoute(sessionId, signal), source: 'host' }
  }

  return { fetchCatalog }
}
