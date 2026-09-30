/**
 * Tests for the selection core — the plugin's product behaviour.
 *
 * This is the code that changed most often in the repository's history and had
 * no test surface, because it lived inside the render body and could only be
 * exercised by mounting React. It is now one call, so ordering, grouping,
 * relevance ranking, the result cap and the section-title rule are all
 * assertable here.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { selectSkills } from '../src/client/selection.js'

/** A catalog in deliberately non-alphabetical order. */
const catalog = [
  { name: 'gamma', description: 'third' },
  { name: 'alpha', description: 'first' },
  { name: 'beta', description: 'second' },
]

/** The names in `visible`, in order. */
const names = (result) => result.visible.map((skill) => skill.name)

/** The section titles in `groups`, in order. */
const titles = (result) => result.groups.map((group) => group.title)

test('browsing with no history falls back to name order', () => {
  const result = selectSkills({ skills: catalog })
  assert.deepEqual(names(result), ['alpha', 'beta', 'gamma'])
})

test('browsing orders by last pick, then by pick count, then by name', () => {
  const result = selectSkills({
    skills: catalog,
    usage: {
      alpha: { count: 9, lastUsed: 100 },
      beta: { count: 1, lastUsed: 300 },
      gamma: { count: 9, lastUsed: 100 },
    },
  })
  // beta is most recent; alpha and gamma tie on time and count, so name decides.
  assert.deepEqual(names(result), ['beta', 'alpha', 'gamma'])
})

test('pinned skills come first, in pin order, and leave the other sections', () => {
  const result = selectSkills({
    skills: catalog,
    pinned: ['gamma', 'alpha'],
    usage: { beta: { count: 1, lastUsed: 10 } },
  })
  assert.deepEqual(names(result), ['gamma', 'alpha', 'beta'])
  assert.deepEqual(titles(result), ['📌 置顶', '🔥 最近使用'])
})

test('a pinned name that is not installed is ignored rather than rendered blank', () => {
  const result = selectSkills({
    skills: catalog,
    pinned: ['ghost'],
    usage: { beta: { count: 1, lastUsed: 10 } },
  })
  assert.deepEqual(titles(result), ['🔥 最近使用', '🗂️ 全部'], 'no pinned section, because nothing matched the pin')
  const rendered = result.groups.flatMap((group) => group.items.map((skill) => skill.name))
  assert.deepEqual(rendered, ['beta', 'alpha', 'gamma'])
})

test('used and untouched skills are split into their own sections', () => {
  const result = selectSkills({
    skills: catalog,
    usage: { gamma: { count: 1, lastUsed: 1 } },
  })
  assert.deepEqual(titles(result), ['🔥 最近使用', '🗂️ 全部'])
  assert.deepEqual(result.groups[0].items.map((skill) => skill.name), ['gamma'])
  assert.deepEqual(result.groups[1].items.map((skill) => skill.name), ['alpha', 'beta'])
})

test('a first-time catalog is a single section, so no headers are drawn', () => {
  const result = selectSkills({ skills: catalog })
  // The header rule reads the section count, so a false here also pins down that
  // the empty 置顶 / 最近使用 sections were dropped rather than rendered as
  // headings with nothing under them.
  assert.equal(result.showTitles, false)
  assert.deepEqual(result.groups, [], 'there is no grouped layout to render')
  assert.deepEqual(names(result), ['alpha', 'beta', 'gamma'])
})

test('section headers appear only while browsing a multi-section catalog', () => {
  const pinned = selectSkills({ skills: catalog, pinned: ['beta'], usage: { alpha: { count: 1, lastUsed: 1 } } })
  assert.equal(pinned.showTitles, true)
  assert.equal(selectSkills({ skills: catalog, pinned: ['beta'], usage: { alpha: { count: 1, lastUsed: 1 } }, query: 'a' }).showTitles, false)
})

test('groups is empty whenever the titles are hidden', () => {
  assert.deepEqual(selectSkills({ skills: catalog }).groups, [])
  assert.deepEqual(selectSkills({ skills: catalog, query: 'a' }).groups, [])
})

test('browsing is capped at the limit', () => {
  const result = selectSkills({ skills: catalog, limit: 2 })
  assert.deepEqual(names(result), ['alpha', 'beta'])
})

test('the cap narrows the sections instead of dropping them', () => {
  const result = selectSkills({
    skills: catalog,
    pinned: ['gamma'],
    usage: { alpha: { count: 1, lastUsed: 1 } },
    limit: 2,
  })
  assert.equal(result.showTitles, true, 'the header decision reads the whole catalog, not the capped rows')
  const rendered = result.groups.flatMap((group) => group.items.map((skill) => skill.name))
  assert.deepEqual(rendered, names(result), 'sections must agree with the flat list they were narrowed to')
  assert.deepEqual(rendered, ['gamma', 'alpha'])
})

test('an empty catalog selects nothing', () => {
  const result = selectSkills({ skills: [] })
  assert.deepEqual(result.visible, [])
  assert.deepEqual(result.groups, [])
  assert.equal(result.showTitles, false)
})

test('ranking puts a name prefix above a name substring above a description', () => {
  const result = selectSkills({
    skills: [
      { name: 'reporting', description: 'unrelated' },
      { name: 'other', description: 'a port lives here' },
      { name: 'portfolio', description: 'unrelated' },
      { name: 'nothing', description: 'unrelated' },
    ],
    query: 'port',
  })
  assert.deepEqual(names(result), ['portfolio', 'reporting', 'other'])
})

test('ranking puts pinyin last, and a literal match above it', () => {
  const result = selectSkills({
    skills: [
      { name: 'reporting', description: '一份报告' },
      { name: 'other', description: 'reporting tools' },
    ],
    query: 'reporting',
  })
  // 'reporting' is a name prefix for one skill (rank 0) and a description hit
  // for the other (rank 2); the Chinese description also carries pinyin for
  // "报告" but a literal hit must win.
  assert.deepEqual(names(result), ['reporting', 'other'])
})

test('a Chinese description is reachable by spaced pinyin, joined pinyin and initials', () => {
  const skills = [{ name: 'lark-im', description: '飞书即时通讯：收发消息和管理群聊' }]
  for (const query of ['fei shu', 'feishu', 'fsjstx']) {
    assert.deepEqual(names(selectSkills({ skills, query })), ['lark-im'], `query ${JSON.stringify(query)} found nothing`)
  }
})

test('relevance outranks usage, so an exact name is not buried by a frequent vague match', () => {
  const result = selectSkills({
    skills: [
      { name: 'other-svg-thing', description: 'unrelated' },
      { name: 'svg-diagram', description: 'unrelated' },
    ],
    usage: { 'other-svg-thing': { count: 99, lastUsed: 9_999 } },
    query: 'svg',
  })
  assert.deepEqual(names(result), ['svg-diagram', 'other-svg-thing'])
})

test('scattered letters are not a match (the subsequence noise v0.5.7 removed)', () => {
  const result = selectSkills({
    skills: [{ name: 'openviking', description: 'unrelated' }],
    query: 'svg',
  })
  assert.deepEqual(names(result), [])
})

test('a query is trimmed and matched case-insensitively', () => {
  const result = selectSkills({ skills: catalog, query: '  ALP ' })
  assert.deepEqual(names(result), ['alpha'])
})

test('a non-matching query yields the empty state rather than the whole catalog', () => {
  const result = selectSkills({ skills: catalog, query: 'zzzz' })
  assert.deepEqual(names(result), [])
  assert.deepEqual(result.groups, [])
})

test('search results are also capped', () => {
  const result = selectSkills({ skills: catalog, query: 'a', limit: 1 })
  assert.deepEqual(names(result), ['alpha'])
})

test('the input catalog is not mutated', () => {
  const skills = [{ name: 'beta' }, { name: 'alpha' }]
  const snapshot = JSON.stringify(skills)
  selectSkills({ skills, usage: { alpha: { count: 1, lastUsed: 1 } }, pinned: ['beta'], query: 'a' })
  assert.equal(JSON.stringify(skills), snapshot)
})
