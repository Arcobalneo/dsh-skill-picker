/**
 * dsh-skill-picker — browser half: the composition root.
 *
 * This module wires; it does not implement. Four modules carry the behaviour —
 * `catalog` (where the list comes from), `selection` (what to show),
 * `preferences` (what persists) and `draft` (what gets inserted) — and the view
 * in `PickerButton` renders the result.
 *
 * Nothing here touches the DOM at module scope, and every runtime wiring
 * failure is logged rather than thrown: the web shell fails the whole boot when
 * a plugin's `apply` throws.
 *
 * @module dsh-skill-picker/client
 */

import React from 'react'

import { PickerButton } from './PickerButton.jsx'
import { createCatalog } from './catalog.js'
import { createPreferences } from './preferences.js'

/**
 * Required services (DSH 0.2.0-rc.2): the slot registry, the session catalog
 * (workspace cwd for the fallback scan) and the generated `skills` Remote
 * (`remote.skills` backs the official `skills/list` call, the same namespace
 * the official ui-skill package consumes).
 */
export const inject = ['slots', 'sessions', 'remote', 'remote.skills']

/** This entry's identity in the composer's right tool row. */
const SLOT = { name: 'conversation.input.right', id: 'skill-picker', order: 100, label: 'Skill picker' }

/**
 * Read one Session's workspace cwd out of the client session catalog.
 *
 * DSH 0.2.0-rc.2 reshaped `SessionListState` to
 * `{ ids, byId, phase, projectionsBySession }` — the pre-0.2 `current` field
 * that named the active Session is gone, so the active identity now arrives as
 * the slot's `sessionId` prop and only its catalog row is read here.
 *
 * @param {object} ctx - the plugin's context.
 * @param {string} sessionId - the Session whose workspace is wanted.
 * @returns {string} the workspace root, or '' when unknown.
 */
function sessionCwd(ctx, sessionId) {
  try {
    const row = ctx.sessions.list.getSnapshot().byId?.[sessionId]
    return typeof row?.cwd === 'string' ? row.cwd : ''
  } catch {
    return ''
  }
}

/** Apply the browser half: register the picker into the composer tool row. */
export function apply(ctx) {
  ctx.effect(() => {
    const dispose = ctx.slots.inject(SLOT.name, () => {
      // Built here rather than in `apply` so the services are read when the
      // composer actually mounts — the same laziness the previous closure had,
      // and cheap either way: both are plain closures over `ctx`.
      const catalog = createCatalog({
        remote: ctx.remote,
        sessions: ctx.sessions,
        cwdOf: (sessionId) => sessionCwd(ctx, sessionId),
      })
      const preferences = createPreferences()

      // Pass the composed props through untouched and attach the injected
      // dependencies — never swallow the framework's own props.
      const Picker = (props) => React.createElement(PickerButton, { ...props, catalog, preferences })
      return ctx.slots.register(SLOT, Picker)
    })
    return () => dispose()
  }, 'dsh-skill-picker: composer input slot')
}
