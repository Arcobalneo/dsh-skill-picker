/**
 * Tests for the picker's preference store.
 *
 * Every one of these is a behaviour that used to be unreachable: the store
 * reached for the `localStorage` global on its own, so "corrupt JSON", "storage
 * denied", "quota full" and "the clock" could only be exercised by driving a
 * real browser. Accepting the storage as a dependency is what makes them
 * ordinary unit tests.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { PINNED_KEY, USAGE_KEY, createPreferences, recordPick, togglePin } from '../src/client/preferences.js'

/** A `Storage`-shaped fake over a Map. */
function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial))
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
    /** Test-only peek at the raw stored strings. */
    raw: map,
  }
}

/** A `Storage` whose every operation throws, as a denied origin does. */
const hostileStorage = {
  getItem() {
    throw new Error('SecurityError: storage is denied')
  },
  setItem() {
    throw new Error('QuotaExceededError')
  },
}

test('a missing store reads as empty and writes without throwing', () => {
  const preferences = createPreferences(undefined)
  assert.deepEqual(preferences.loadPinned(), [])
  assert.deepEqual(preferences.loadUsage(), {})
  assert.doesNotThrow(() => preferences.savePinned(['tdd']))
  assert.doesNotThrow(() => preferences.saveUsage({ tdd: { count: 1, lastUsed: 5 } }))
})

test('a denied store reads as empty and writes without throwing', () => {
  const preferences = createPreferences(hostileStorage)
  assert.deepEqual(preferences.loadPinned(), [])
  assert.deepEqual(preferences.loadUsage(), {})
  assert.doesNotThrow(() => preferences.savePinned(['tdd']))
  assert.doesNotThrow(() => preferences.saveUsage({ tdd: { count: 1, lastUsed: 5 } }))
})

test('pinned names round-trip in order', () => {
  const storage = memoryStorage()
  const preferences = createPreferences(storage)
  preferences.savePinned(['pr', 'tdd', 'research'])
  assert.deepEqual(preferences.loadPinned(), ['pr', 'tdd', 'research'])
})

test('usage rounds-trip', () => {
  const storage = memoryStorage()
  const preferences = createPreferences(storage)
  const usage = { tdd: { count: 3, lastUsed: 1_700_000_000_000 } }
  preferences.saveUsage(usage)
  assert.deepEqual(preferences.loadUsage(), usage)
})

test('corrupt JSON reads as empty rather than throwing', () => {
  const preferences = createPreferences(memoryStorage({
    [PINNED_KEY]: '{not json',
    [USAGE_KEY]: 'also not json',
  }))
  assert.deepEqual(preferences.loadPinned(), [])
  assert.deepEqual(preferences.loadUsage(), {})
})

test('a non-array pinned payload reads as empty', () => {
  const preferences = createPreferences(memoryStorage({ [PINNED_KEY]: '{"a":1}' }))
  assert.deepEqual(preferences.loadPinned(), [])
})

test('a pinned payload keeps only its string entries', () => {
  const preferences = createPreferences(memoryStorage({ [PINNED_KEY]: '["tdd",7,null,{"a":1},"pr"]' }))
  assert.deepEqual(preferences.loadPinned(), ['tdd', 'pr'])
})

test('a non-object usage payload reads as empty, including an array', () => {
  assert.deepEqual(createPreferences(memoryStorage({ [USAGE_KEY]: '"text"' })).loadUsage(), {})
  assert.deepEqual(createPreferences(memoryStorage({ [USAGE_KEY]: '["tdd"]' })).loadUsage(), {})
  assert.deepEqual(createPreferences(memoryStorage({ [USAGE_KEY]: 'null' })).loadUsage(), {})
})

test('recordPick starts a name at one pick', () => {
  assert.deepEqual(recordPick({}, 'tdd', 1000), { tdd: { count: 1, lastUsed: 1000 } })
})

test('recordPick increments an existing name and stamps the new time', () => {
  const before = { tdd: { count: 2, lastUsed: 1000 } }
  assert.deepEqual(recordPick(before, 'tdd', 2000), { tdd: { count: 3, lastUsed: 2000 } })
})

test('recordPick leaves other names untouched and does not mutate its input', () => {
  const before = { tdd: { count: 2, lastUsed: 1000 }, pr: { count: 1, lastUsed: 900 } }
  const after = recordPick(before, 'tdd', 2000)
  assert.deepEqual(after.pr, { count: 1, lastUsed: 900 })
  assert.deepEqual(before.tdd, { count: 2, lastUsed: 1000 }, 'the input history was mutated')
})

test('recordPick tolerates a half-written entry', () => {
  assert.deepEqual(recordPick({ tdd: {} }, 'tdd', 50), { tdd: { count: 1, lastUsed: 50 } })
})

test('togglePin appends to the end so pin order is the pin order', () => {
  assert.deepEqual(togglePin([], 'pr'), ['pr'])
  assert.deepEqual(togglePin(['pr'], 'tdd'), ['pr', 'tdd'])
})

test('togglePin removes an existing pin and preserves the rest', () => {
  assert.deepEqual(togglePin(['pr', 'tdd', 'research'], 'tdd'), ['pr', 'research'])
})

test('togglePin does not mutate its input', () => {
  const pinned = ['pr']
  togglePin(pinned, 'tdd')
  assert.deepEqual(pinned, ['pr'])
})
