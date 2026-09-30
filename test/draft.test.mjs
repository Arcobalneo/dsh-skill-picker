/**
 * Tests for the draft-insertion rule.
 *
 * The load-bearing fact here is the **trailing space**: DSH's gesture matcher is
 * `/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g`, so a `/name` token only
 * counts when whitespace or end-of-input follows it. If this rule ever loses
 * that space the picker still looks like it works — the text lands in the box —
 * but the message stops loading the skill. That is the regression these tests
 * exist to catch, and it is why the rule is not inlined in a click handler.
 */

import assert from 'node:assert/strict'
import test from 'node:test'

import { draftWithPick } from '../src/client/draft.js'

/** The gesture pattern DSH itself uses, so the tests assert the real contract. */
const GESTURE = /(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g

/** The skill names inserted by the gesture found anywhere in `text`. */
const gesturesIn = (text) => [...text.matchAll(GESTURE)].map((match) => match[2])

test('inserts into an empty draft without a leading separator', () => {
  assert.equal(draftWithPick('', 'tdd'), '/tdd ')
})

test('inserts after existing text with exactly one separator space', () => {
  assert.equal(draftWithPick('fix the parser', 'tdd'), 'fix the parser /tdd ')
})

test('does not add a second separator when the draft already ends in a space', () => {
  assert.equal(draftWithPick('fix the parser ', 'tdd'), 'fix the parser /tdd ')
})

test('treats a trailing newline as whitespace', () => {
  assert.equal(draftWithPick('fix the parser\n', 'tdd'), 'fix the parser\n/tdd ')
})

test('always leaves a trailing space, which is what makes it a gesture (the contract)', () => {
  for (const draft of ['', 'text', 'text ', 'text\n', '  ']) {
    const next = draftWithPick(draft, 'code-review')
    assert.ok(next.endsWith('/code-review '), `no trailing space after picking into ${JSON.stringify(draft)}`)
    assert.deepEqual(gesturesIn(next), ['code-review'], `not a gesture: ${JSON.stringify(next)}`)
  }
})

test('two picks in a row produce two gestures and no double space', () => {
  const once = draftWithPick('do this', 'tdd')
  const twice = draftWithPick(once, 'pr')
  assert.equal(twice, 'do this /tdd /pr ')
  assert.deepEqual(gesturesIn(twice), ['tdd', 'pr'])
})

test('the inserted name is used verbatim (no folding or trimming)', () => {
  assert.equal(draftWithPick('', 'svg-diagram'), '/svg-diagram ')
})

test('a draft of only whitespace keeps its whitespace rather than gaining a separator', () => {
  assert.equal(draftWithPick('  ', 'tdd'), '  /tdd ')
})
