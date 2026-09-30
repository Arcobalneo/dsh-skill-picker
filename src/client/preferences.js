/**
 * dsh-skill-picker — browser half: the user's picker preferences.
 *
 * Two things persist per browser: the manually pinned skill list and the usage
 * history that orders the ⚡ panel. Both used to be four near-identical
 * try/catch/JSON modules that reached for the `localStorage` global on their own
 * — so "what happens with corrupt JSON", "what happens when storage is denied"
 * and "what happens when the quota is full" were three untestable behaviours.
 *
 * This module owns all of it behind one factory. The storage is an accepted
 * dependency, which is what lets the failure modes be tested at all: the
 * production caller passes `localStorage`, the tests pass a Map.
 *
 * @module dsh-skill-picker/client/preferences
 */

/** localStorage key for the picker's per-browser usage history. */
export const USAGE_KEY = 'dsh-skill-picker:usage'

/** localStorage key for the user's manually pinned skills (ordered array of names). */
export const PINNED_KEY = 'dsh-skill-picker:pinned'

/**
 * @typedef {Record<string, { count?: number, lastUsed?: number }>} Usage
 *   Pick counts and last-pick timestamps, keyed by skill name.
 */

/**
 * Resolve the page's storage, or undefined when the page has none.
 *
 * Reading `window.localStorage` can throw outright (a denied or sandboxed
 * origin raises SecurityError on the property access, before any method is
 * called), so even the lookup needs a guard — otherwise the picker would take
 * the composer down on an origin that merely blocks storage.
 * @returns {Storage | undefined}
 */
function resolveStorage() {
  try {
    return globalThis.localStorage ?? undefined
  } catch {
    return undefined
  }
}

/**
 * Build the preference store.
 *
 * Every read degrades to the empty value and every write to a no-op, so the
 * picker works — just without persistence — wherever storage is missing,
 * denied or full. Nothing here throws.
 *
 * @param {Storage | undefined} [storage] - the backing store; defaults to the page's `localStorage`.
 * @returns {{
 *   loadPinned: () => string[],
 *   savePinned: (pinned: string[]) => void,
 *   loadUsage: () => Usage,
 *   saveUsage: (usage: Usage) => void,
 * }}
 */
export function createPreferences(storage = resolveStorage()) {
  /** Read and parse one key; any failure reads as "nothing stored". */
  const read = (key) => {
    try {
      const raw = storage?.getItem(key)
      return raw === null || raw === undefined ? undefined : JSON.parse(raw)
    } catch {
      return undefined
    }
  }
  /** Serialize and write one key; any failure is swallowed (it just won't persist). */
  const write = (key, value) => {
    try {
      storage?.setItem(key, JSON.stringify(value))
    } catch {
      /* storage unavailable or full — the value simply won't persist */
    }
  }

  return {
    /** The pinned names, in pin order. A non-array or non-string payload reads as []. */
    loadPinned() {
      const parsed = read(PINNED_KEY)
      return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : []
    },
    savePinned(pinned) {
      write(PINNED_KEY, pinned)
    },
    /** The usage history. A non-object payload reads as {}. */
    loadUsage() {
      const parsed = read(USAGE_KEY)
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
    },
    saveUsage(usage) {
      write(USAGE_KEY, usage)
    },
  }
}

/**
 * Fold one pick into the usage history. Pure: the clock is a parameter, so the
 * ordering rule can be tested without waiting for real time to pass.
 * @param {Usage} usage - the current history.
 * @param {string} name - the picked skill.
 * @param {number} now - the pick timestamp (epoch milliseconds).
 * @returns {Usage} a fresh history; the input is untouched.
 */
export function recordPick(usage, name, now) {
  return { ...usage, [name]: { count: (usage[name]?.count ?? 0) + 1, lastUsed: now } }
}

/**
 * Add or remove one skill in the pinned list. Pure.
 * @param {string[]} pinned - the current pinned list.
 * @param {string} name - the skill to toggle.
 * @returns {string[]} a fresh list; the input is untouched.
 */
export function togglePin(pinned, name) {
  return pinned.includes(name) ? pinned.filter((entry) => entry !== name) : [...pinned, name]
}
