/**
 * Tests for the catalog route.
 *
 * The route is the browser half's fallback source, so its wire shape is load
 * bearing: the client reads `ok` and `skills` and nothing else. The scan is
 * injected, which is what lets these tests assert the contract without a
 * filesystem.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { createSkillsRoute, cwdFromRequest } from '../src/host/skills-route.js'

/** A response stub capturing what the handler wrote. */
function resStub() {
  const captured = {}
  return {
    captured,
    writeHead(status, headers) {
      captured.status = status
      captured.headers = headers
    },
    end(body) {
      captured.body = body
    },
  }
}

/** A scan stub recording the cwd it was asked for. */
function scanStub(skills = [], { throws } = {}) {
  const calls = []
  const scan = async (cwd) => {
    calls.push(cwd)
    if (throws !== undefined) throw throws
    return skills
  }
  scan.calls = calls
  return scan
}

test('answers 200 with the wire shape the client reads', async () => {
  const res = resStub()
  await createSkillsRoute({ scanSkills: scanStub([{ name: 'tdd', description: 'x', path: '/tmp/tdd' }]) })({ url: '/dsh-skill-picker/skills' }, res)
  assert.equal(res.captured.status, 200)
  assert.equal(res.captured.headers['content-type'], 'application/json; charset=utf-8')
  assert.deepEqual(JSON.parse(res.captured.body), {
    ok: true,
    complete: true,
    skills: [{ name: 'tdd', description: 'x', path: '/tmp/tdd' }],
  })
})

test('passes the workspace cwd through to the scan', async () => {
  const scan = scanStub()
  await createSkillsRoute({ scanSkills: scan })({ url: '/dsh-skill-picker/skills?cwd=%2Ftmp%2Fproject' }, resStub())
  assert.deepEqual(scan.calls, ['/tmp/project'])
})

test('scans user roots only when no cwd is given', async () => {
  const scan = scanStub()
  await createSkillsRoute({ scanSkills: scan })({ url: '/dsh-skill-picker/skills' }, resStub())
  assert.deepEqual(scan.calls, [undefined])
})

test('a request with no url still answers from the user roots', async () => {
  const scan = scanStub()
  await createSkillsRoute({ scanSkills: scan })({}, resStub())
  assert.deepEqual(scan.calls, [undefined])
})

test('cwdFromRequest reads the query and tolerates a missing url', () => {
  assert.equal(cwdFromRequest({ url: '/x?cwd=/a/b' }), '/a/b')
  assert.equal(cwdFromRequest({ url: '/x' }), undefined)
  assert.equal(cwdFromRequest({}), undefined)
})

test('a scan failure becomes a 500 rather than an unhandled rejection', async () => {
  const res = resStub()
  await createSkillsRoute({ scanSkills: scanStub([], { throws: new Error('scan exploded') }) })({ url: '/dsh-skill-picker/skills' }, res)
  assert.equal(res.captured.status, 500)
  assert.deepEqual(JSON.parse(res.captured.body), { ok: false, error: 'scan exploded' })
})

test('a non-Error rejection still produces a readable message', async () => {
  const res = resStub()
  await createSkillsRoute({ scanSkills: scanStub([], { throws: 'just a string' }) })({ url: '/dsh-skill-picker/skills' }, res)
  assert.equal(res.captured.status, 500)
  assert.deepEqual(JSON.parse(res.captured.body), { ok: false, error: 'just a string' })
})
