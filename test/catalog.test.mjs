/**
 * Tests for the catalog seam.
 *
 * Both adapters are substituted here — the Remote by a stub, the host route by
 * an injected `fetch` — so every branch is reachable without a browser, a
 * Session or a server. These are exactly the branches that used to live in the
 * render body's try/catch chain and could only be exercised by hand: which
 * adapter answers, what happens when the official one refuses, and what an
 * entry looks like after normalization.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createCatalog } from '../src/client/catalog.js'
import { SKILLS_ROUTE } from '../src/route-path.js'

/** A Remote stub whose `skills.list` is the given implementation. */
const remoteStub = (list) => ({ skills: { list } })

/** A Remote stub that answers with one page of skills. */
const remoteAnswering = (skills) => remoteStub(async () => ({ ok: true, value: { skills } }))

/**
 * A `ctx.sessions` stub. `retain: false` omits `using`/`binding`, which is the
 * shape an older or partially-initialised context has.
 */
function sessionsStub({ openState = 'open', openError, subagentAddress, retain = true } = {}) {
  const sessions = {}
  if (subagentAddress !== undefined) sessions.subagentAddress = () => subagentAddress
  if (retain) {
    sessions.binding = (sessionId) => ({ sessionId })
    sessions.using = async (sessionId, _options, work) => work({
      binding: { session: { getSnapshot: () => ({ openState, openError }) } },
    })
  }
  return sessions
}

/** A `fetch` stub recording its calls. */
function fetchStub(body, { throws } = {}) {
  const calls = []
  const impl = async (url, init) => {
    calls.push({ url, init })
    if (throws !== undefined) throw throws
    return { json: async () => body }
  }
  impl.calls = calls
  return impl
}

/** Run `fn` with `console.warn` captured, returning the warnings it emitted. */
async function captureWarnings(fn) {
  const warnings = []
  const original = console.warn
  console.warn = (...args) => warnings.push(args)
  try {
    await fn()
  } finally {
    console.warn = original
  }
  return warnings
}

test('the official adapter answers and is labelled official', async () => {
  const catalog = createCatalog({
    remote: remoteAnswering([{ name: 'tdd', description: 'test-first' }]),
    sessions: sessionsStub(),
  })
  assert.deepEqual(await catalog.fetchCatalog('s1'), {
    skills: [{ name: 'tdd', description: 'test-first' }],
    source: 'official',
  })
})

test('entries are normalized to name + description whatever the adapter sent', async () => {
  const catalog = createCatalog({
    // The Remote DTO also carries `modelInvocable`; the panel renders neither it
    // nor a path, so the seam decides the one shape both adapters produce.
    remote: remoteAnswering([{ name: 'tdd', description: 'x', modelInvocable: true, path: '/tmp/tdd' }]),
    sessions: sessionsStub(),
  })
  const result = await catalog.fetchCatalog('s1')
  assert.deepEqual(result.skills, [{ name: 'tdd', description: 'x' }])
})

test('a missing description normalizes to the empty string, never undefined', async () => {
  const catalog = createCatalog({ remote: remoteAnswering([{ name: 'tdd' }]), sessions: sessionsStub() })
  assert.deepEqual((await catalog.fetchCatalog('s1')).skills, [{ name: 'tdd', description: '' }])
})

test('the user-invocable policy drops an explicit false in either entry shape (issue #10)', async () => {
  const catalog = createCatalog({
    remote: remoteAnswering([
      { name: 'flat-hidden', userInvocable: false },
      { name: 'nested-hidden', invocation: { userInvocable: false } },
      { name: 'flat-shown', userInvocable: true },
      { name: 'nested-shown', invocation: { userInvocable: true } },
      { name: 'omitted' },
    ]),
    sessions: sessionsStub(),
  })
  const result = await catalog.fetchCatalog('s1')
  assert.deepEqual(result.skills.map((skill) => skill.name), ['flat-shown', 'nested-shown', 'omitted'])
})

test('a non-array payload reads as no skills rather than throwing', async () => {
  const catalog = createCatalog({
    remote: remoteStub(async () => ({ ok: true, value: { skills: undefined } })),
    sessions: sessionsStub(),
  })
  assert.deepEqual((await catalog.fetchCatalog('s1')).skills, [])
})

test('an absent Remote falls back to the host route and says why', async () => {
  const route = fetchStub({ ok: true, skills: [{ name: 'from-route', description: '' }] })
  const catalog = createCatalog({ remote: undefined, sessions: sessionsStub(), fetch: route })
  const warnings = await captureWarnings(async () => {
    assert.deepEqual(await catalog.fetchCatalog('s1'), {
      skills: [{ name: 'from-route', description: '' }],
      source: 'host',
    })
  })
  assert.equal(warnings.length, 1, 'the fallback must not be silent')
  assert.equal(route.calls.length, 1)
})

test('a refused Remote call falls back to the host route', async () => {
  const route = fetchStub({ ok: true, skills: [{ name: 'from-route', description: '' }] })
  const catalog = createCatalog({
    remote: remoteStub(async () => ({ ok: false, error: { code: 'gateway/internal', message: 'boom' } })),
    sessions: sessionsStub(),
    fetch: route,
  })
  const warnings = await captureWarnings(async () => {
    const result = await catalog.fetchCatalog('s1')
    assert.equal(result.source, 'host')
  })
  assert.equal(warnings.length, 1)
})

test('a Session that is not open falls back to the host route', async () => {
  const route = fetchStub({ ok: true, skills: [] })
  const catalog = createCatalog({
    remote: remoteAnswering([{ name: 'never-read' }]),
    sessions: sessionsStub({ openState: 'opening' }),
    fetch: route,
  })
  const warnings = await captureWarnings(async () => {
    assert.deepEqual(await catalog.fetchCatalog('s1'), { skills: [], source: 'host' })
  })
  assert.equal(warnings.length, 1)
})

test('a Session that is open is read through its retained reference', async () => {
  const retains = []
  const sessions = sessionsStub()
  sessions.using = async (sessionId, options, work) => {
    retains.push({ sessionId, source: options.source })
    return work({ binding: { session: { getSnapshot: () => ({ openState: 'open' }) } } })
  }
  const catalog = createCatalog({ remote: remoteAnswering([{ name: 'tdd' }]), sessions })
  await catalog.fetchCatalog('s1')
  assert.deepEqual(retains, [{ sessionId: 's1', source: 'skillPicker' }])
})

test('without a retain capability the Remote is called directly', async () => {
  let called = 0
  const catalog = createCatalog({
    remote: remoteStub(async () => {
      called += 1
      return { ok: true, value: { skills: [{ name: 'tdd' }] } }
    }),
    sessions: sessionsStub({ retain: false }),
  })
  const result = await catalog.fetchCatalog('s1')
  assert.equal(result.source, 'official')
  assert.equal(called, 1)
})

test('an addressed continuable child resolves no candidates, without touching the Remote', async () => {
  let remoteCalls = 0
  const route = fetchStub({ ok: true, skills: [{ name: 'should-not-be-reached' }] })
  const catalog = createCatalog({
    remote: remoteStub(async () => {
      remoteCalls += 1
      return { ok: true, value: { skills: [{ name: 'should-not-be-reached' }] } }
    }),
    sessions: sessionsStub({ subagentAddress: 'child:1' }),
    fetch: route,
  })
  assert.deepEqual(await catalog.fetchCatalog('s1'), { skills: [], source: 'official' })
  assert.equal(remoteCalls, 0)
  assert.equal(route.calls.length, 0, 'viewing a child must not activate it')
})

test('the route carries the workspace cwd so the scan sees the right project roots', async () => {
  const route = fetchStub({ ok: true, skills: [] })
  const catalog = createCatalog({
    remote: undefined,
    sessions: sessionsStub(),
    cwdOf: (sessionId) => (sessionId === 's1' ? '/tmp/a b/project' : ''),
    fetch: route,
  })
  await captureWarnings(() => catalog.fetchCatalog('s1'))
  assert.equal(route.calls[0].url, `${SKILLS_ROUTE}?cwd=%2Ftmp%2Fa%20b%2Fproject`)
})

test('the route omits the query when the workspace is unknown', async () => {
  const route = fetchStub({ ok: true, skills: [] })
  const catalog = createCatalog({ remote: undefined, sessions: sessionsStub(), cwdOf: () => '', fetch: route })
  await captureWarnings(() => catalog.fetchCatalog('s1'))
  assert.equal(route.calls[0].url, SKILLS_ROUTE)
})

test('the route adapter applies the same user-invocable policy as the official one', async () => {
  const route = fetchStub({
    ok: true,
    skills: [
      { name: 'hidden', userInvocable: false, path: '/tmp/hidden' },
      { name: 'shown', path: '/tmp/shown' },
    ],
  })
  const catalog = createCatalog({ remote: undefined, sessions: sessionsStub(), fetch: route })
  let result
  await captureWarnings(async () => {
    result = await catalog.fetchCatalog('s1')
  })
  assert.deepEqual(result.skills, [{ name: 'shown', description: '' }])
})

test('an error body from the route surfaces instead of being read as an empty catalog', async () => {
  const route = fetchStub({ ok: false, error: 'scan exploded' })
  const catalog = createCatalog({ remote: undefined, sessions: sessionsStub(), fetch: route })
  await captureWarnings(async () => {
    await assert.rejects(() => catalog.fetchCatalog('s1'), /scan exploded/)
  })
})

test('when both adapters fail the route error reaches the caller', async () => {
  const route = fetchStub(undefined, { throws: new Error('network down') })
  const catalog = createCatalog({ remote: undefined, sessions: sessionsStub(), fetch: route })
  await captureWarnings(async () => {
    await assert.rejects(() => catalog.fetchCatalog('s1'), /network down/)
  })
})

test('an aborted request surfaces the abort instead of falling back', async () => {
  const controller = new AbortController()
  const route = fetchStub({ ok: true, skills: [] })
  const catalog = createCatalog({
    remote: remoteStub(async () => {
      controller.abort()
      throw new Error('aborted')
    }),
    sessions: sessionsStub(),
    fetch: route,
  })
  await assert.rejects(() => catalog.fetchCatalog('s1', controller.signal))
  assert.equal(route.calls.length, 0, 'an aborted request must not start a second one')
})
