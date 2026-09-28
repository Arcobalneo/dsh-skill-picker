/**
 * Regression tests for the picker's Session view: the panel must take the active
 * Session from the slot's framework standard props, and resolve its workspace
 * cwd from the Session list `byId` rows (issue #11).
 *
 * Why this exists: the 0.1.7 client hands a Session-scoped slot a `sessionId`
 * prop plus the global `useSessions` hook, and its Session list state is
 * `{ ids, byId, phase, projectionsBySession }` — there is no `current` cursor.
 * Reading either value the pre-0.5.13 way (`props.session.sessionId`,
 * `ctx.sessions.list.getSnapshot().current`) therefore resolved to nothing on
 * every 0.1.7 install, the panel fell back to the host scan, and that scan —
 * sent without `?cwd=` — could only see user-level roots, so project-level
 * skills (`<workspace>/.agents/skills`) never reached the panel.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { selectWorkspaceCwd, sessionIdOf, useWorkspaceCwd } from '../src/client/session-view.js'

/** The 0.1.7 Session list state shape, verbatim — note the absent `current`. */
function listState(byId) {
  return { ids: Object.keys(byId), byId, phase: 'ready', projectionsBySession: {} }
}

/** Stand-in for the framework `useSessions` seat: applies the selector once. */
function hookOver(state) {
  return (selector) => selector(state)
}

// ---- Session identity (issue #11, defect 1) --------------------------------

test('takes the Session identity from the 0.1.7 standard prop', () => {
  assert.equal(sessionIdOf({ sessionId: 'session-a' }), 'session-a')
})

test('still accepts the legacy props.session carrier', () => {
  assert.equal(sessionIdOf({ session: { sessionId: 'session-b' } }), 'session-b')
})

test('prefers the standard prop when a kernel ships both', () => {
  assert.equal(sessionIdOf({ sessionId: 'session-a', session: { sessionId: 'session-b' } }), 'session-a')
})

test('reports absence for a seat without a Session', () => {
  assert.equal(sessionIdOf({}), undefined)
  assert.equal(sessionIdOf(undefined), undefined)
})

// ---- Workspace cwd (issue #11, defect 2) -----------------------------------

test('resolves the workspace cwd from the active Session row', () => {
  const state = listState({ 'session-a': { cwd: '/repo/a' }, 'session-b': { cwd: '/repo/b' } })
  assert.equal(selectWorkspaceCwd('session-a')(state), '/repo/a')
  assert.equal(selectWorkspaceCwd('session-b')(state), '/repo/b')
})

test('never follows a stray `current` cursor instead of the seat Session', () => {
  // A kernel that (re)introduces a cursor must not redirect the picker: the
  // seat, not the most-recently-focused Session, decides which workspace the
  // panel lists skills for.
  const state = { ...listState({ 'session-a': { cwd: '/repo/a' }, 'session-b': { cwd: '/repo/b' } }), current: 'session-b' }
  assert.equal(selectWorkspaceCwd('session-a')(state), '/repo/a')
  // Without an identity there is nothing to resolve — and no cursor fallback.
  assert.equal(selectWorkspaceCwd(undefined)(state), '')
})

test('normalizes an absent row, an absent cwd and a non-string cwd to empty', () => {
  const state = listState({ 'session-a': {}, 'session-b': { cwd: 42 } })
  assert.equal(selectWorkspaceCwd('session-unknown')(state), '')
  assert.equal(selectWorkspaceCwd('session-a')(state), '')
  assert.equal(selectWorkspaceCwd('session-b')(state), '')
  assert.equal(selectWorkspaceCwd('session-a')(undefined), '')
})

test('resolves the cwd through the slot useSessions seat', () => {
  const state = listState({ 'session-a': { cwd: '/repo/a' } })
  const props = { sessionId: 'session-a', useSessions: hookOver(state) }
  assert.equal(useWorkspaceCwd(props), '/repo/a')
})

test('degrades to the user-level scan when the seat or the row is missing', () => {
  // No `useSessions` seat (composition without ui-session): the host route is
  // then called without `?cwd=`, which is the documented user-level fallback.
  assert.equal(useWorkspaceCwd({ sessionId: 'session-a' }), '')
  // Panel opened before the Session list landed: still no project root, and a
  // later list state is picked up because the selector stays live.
  const empty = hookOver(listState({}))
  assert.equal(useWorkspaceCwd({ sessionId: 'session-a', useSessions: empty }), '')
  const later = hookOver(listState({ 'session-a': { cwd: '/repo/a' } }))
  assert.equal(useWorkspaceCwd({ sessionId: 'session-a', useSessions: later }), '/repo/a')
})
