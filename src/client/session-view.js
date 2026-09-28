/**
 * Session identity and workspace cwd for the picker's two skill sources.
 *
 * Both values come from the slot's framework standard props: the picker seats
 * itself in `conversation.input.right`, which is a Session-scoped slot, so the
 * kernel hands the component a `sessionId` plus the global `useSessions`
 * selector hook. This module keeps that contract in one testable place.
 *
 * Why not read them from `ctx.sessions.list` (as this plugin did before
 * 0.5.13)? Because the Session list snapshot is not a "which Session is
 * current" source any more: since the 0.1.7 client its state is
 * `{ ids, byId, phase, projectionsBySession }`, with no `current` cursor. The
 * old lookup therefore resolved to `undefined` on every 0.1.7 install, the
 * picker fell back to the host scan, and that scan — sent without `?cwd=` —
 * could only see user-level roots. Project-level skills
 * (`<workspace>/.agents/skills`) silently disappeared from the panel while
 * user-level ones kept showing.
 *
 * @module dsh-skill-picker/client/session-view
 */

/**
 * The active Session's identity, or `undefined` outside a Session scope.
 *
 * `sessionId` is the current standard prop. `props.session` is the carrier the
 * older client lines handed to slot components; it stays as a fallback so the
 * panel keeps working on 0.1.2/0.1.5 kernels too.
 *
 * @param props - the slot component's framework props.
 */
export function sessionIdOf(props) {
  return props?.sessionId ?? props?.session?.sessionId
}

/**
 * Selector over the Session list state: the active Session's workspace cwd.
 *
 * Deliberately reads `byId[sessionId]` — the only shape every supported kernel
 * publishes — and normalizes "no row yet" / "row without cwd" / a non-string
 * cwd to `''`, which is what the host route treats as "no project root".
 *
 * @param sessionId - the active Session identity, if any.
 * @returns a `useSessions` selector producing the cwd string (possibly empty).
 */
export function selectWorkspaceCwd(sessionId) {
  return (state) => {
    const cwd = sessionId === undefined ? undefined : state?.byId?.[sessionId]?.cwd
    return typeof cwd === 'string' ? cwd : ''
  }
}

/**
 * Resolve the active Session's workspace cwd through the slot's global
 * `useSessions` hook (framework seat owned by `ui-session`).
 *
 * The availability check is stable across renders — `props.useSessions` is a
 * framework seat, never flipped per render — so the hook is either always
 * called or never called for one mounted seat. A composition without the hook
 * degrades to `''` (user-level scan) instead of failing the panel.
 *
 * @param props - the slot component's framework props.
 * @returns the workspace cwd, or `''` when it cannot be resolved.
 */
export function useWorkspaceCwd(props) {
  const useSessions = props?.useSessions
  const cwd = typeof useSessions === 'function' ? useSessions(selectWorkspaceCwd(sessionIdOf(props))) : undefined
  return typeof cwd === 'string' ? cwd : ''
}
