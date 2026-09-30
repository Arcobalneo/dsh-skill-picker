/**
 * Contract tests for the built browser bundle.
 *
 * The client half is served as **exactly one file** that must register itself
 * through `window.__ModuleLoader__.load({ id, factory })`, and the loader hands
 * the factory **only** `require` — the factory has to declare its own `module`
 * and `exports`. Every one of those facts has broken this plugin's boot at least
 * once:
 *
 *   - "loaded without registering 'dsh-skill-picker' via __ModuleLoader__.load"
 *   - "ReferenceError: module is not defined"    (factory declared nothing)
 *   - "cannot get property \"slots\" without inject"  (`inject` missing/dropped)
 *
 * Those failures are invisible until the web shell refuses to boot, which is a
 * bad place to find them. This runs the real loader contract instead.
 *
 * The bundle is committed, so the test does not build. If `lib/client.js` is
 * missing, run `node build.mjs` first.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const BUNDLE = new URL('../lib/client.js', import.meta.url)

/**
 * A `require` that answers anything with a callable, so an externalised
 * `react` / `@deepseek-ai/dsh-*` import resolves without the real packages.
 */
function stubRequire() {
  const cache = new Map()
  const make = () => new Proxy({}, {
    get: (_target, property) => {
      if (property === 'then') return undefined
      return (..._args) => make()
    },
    has: () => true,
  })
  return (id) => {
    if (!cache.has(id)) cache.set(id, make())
    return cache.get(id)
  }
}

/** Evaluate the bundle under the real loader contract and return what it registered. */
function loadBundle() {
  const source = readFileSync(BUNDLE, 'utf8')
  let registered
  const window = { __ModuleLoader__: { load: (spec) => { registered = spec } } }
  // Only `window` and `require` are in scope — exactly what the shell provides.
  new Function('window', 'require', source)(window, stubRequire())
  return registered
}

test('the bundle registers itself under its package id', () => {
  const registered = loadBundle()
  assert.ok(registered !== undefined, 'the bundle never called window.__ModuleLoader__.load')
  assert.equal(registered.id, 'dsh-skill-picker')
  assert.equal(typeof registered.factory, 'function')
})

test('the factory runs with only `require` supplied', () => {
  const registered = loadBundle()
  // A factory that leans on an injected `module`/`exports` throws here with
  // "module is not defined", which is the exact boot failure this guards.
  const exports = registered.factory(stubRequire())
  assert.equal(typeof exports, 'object')
  assert.equal(typeof exports.apply, 'function', 'the shell calls exports.apply(ctx)')
})

test('the client half injects the services the picker reaches for', () => {
  const registered = loadBundle()
  const exported = registered.factory(stubRequire())
  // Dropping 'remote.skills' or 'sessions' from this list does not fail loudly:
  // the picker loses the official catalog and the workspace cwd, and silently
  // degrades to the host scan. Pin the list.
  assert.deepEqual(exported.inject, ['slots', 'sessions', 'remote', 'remote.skills'])
})

test('the bundle pulls in no Node built-in', () => {
  const source = readFileSync(BUNDLE, 'utf8')
  const builtins = ['fs', 'path', 'os', 'module', 'crypto', 'url', 'child_process', 'node:fs', 'node:path', 'node:os']
  const required = [...source.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1])
  const offenders = required.filter((id) => builtins.includes(id))
  assert.deepEqual(offenders, [], 'the browser half must not require Node built-ins')
  assert.ok(!required.some((id) => id.startsWith('node:')), `Node scheme imports leaked: ${required.join(', ')}`)
})
