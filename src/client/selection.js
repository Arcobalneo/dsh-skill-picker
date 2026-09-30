/**
 * dsh-skill-picker — browser half: the selection core.
 *
 * This is the plugin's product behaviour. Everything a user can observe about
 * how the ⚡ panel orders and filters is decided here, behind one interface:
 *
 * ```js
 * selectSkills({ skills, usage, pinned, query, limit })
 *   → { groups, visible, showTitles }
 * ```
 *
 * Ordering, grouping, pinyin search, relevance ranking and the result cap are
 * all *implementation*. They used to be four separate modules plus an inline
 * pipeline inside the render body — reachable only by rendering React, which is
 * why the most-changed code in the repository had no test surface at all. The
 * module now carries internal seams (the ranking and grouping steps) that its
 * own tests reach through the one call above.
 *
 * Two rules are worth stating because they are easy to "fix" wrongly:
 *
 *  - **Relevance beats usage within a search.** A query sorts by match rank
 *    first and only then by the browsing order, so a name-exact hit like
 *    `svg-diagram` outranks a merely-frequently-used vague match. Browsing
 *    (empty query) is the other way round: pinned, then recent, then the rest.
 *  - **The cap applies to `visible`, not to `groups`.** Grouping is computed
 *    over the whole catalog and then narrowed to whatever survives the cap, so
 *    the section headers always agree with the rows underneath them.
 *
 * @module dsh-skill-picker/client/selection
 */

import { pinyin } from 'pinyin-pro'

/** Most results the panel will render for one query. */
const DEFAULT_LIMIT = 60

/** Group titles, in display order. */
const PINNED_TITLE = '📌 置顶'
const RECENT_TITLE = '🔥 最近使用'
const REST_TITLE = '🗂️ 全部'

/**
 * @typedef {object} Skill
 * @property {string} name
 * @property {string=} description
 * @property {string=} path
 */

/**
 * @typedef {object} SkillGroup
 * @property {string} title
 * @property {Skill[]} items
 */

/**
 * Pinyin search text for a skill: spaced full pinyin (`ji yi`), joined
 * (`jiyi`) and initials (`jy`) for the name, plus the same three for the
 * description — so `ji yi`, `jiyi` and `jy` all reach 记忆/知识库-ish Chinese
 * text. Cached per name+description pair; never throws (falls back to '').
 */
const pinyinCache = new Map()
function skillPinyinText(name, description = '') {
  const key = `${name}\u0000${description}`
  const cached = pinyinCache.get(key)
  if (cached !== undefined) return cached
  let text = ''
  try {
    const base = { toneType: 'none', nonZh: 'consecutive' }
    text = [
      pinyin(name, base),
      pinyin(name, { ...base, separator: '' }),
      pinyin(name, { ...base, pattern: 'first' }),
      pinyin(name, { ...base, pattern: 'first', separator: '' }),
      pinyin(description, base),
      pinyin(description, { ...base, separator: '' }),
      pinyin(description, { ...base, pattern: 'first' }),
      pinyin(description, { ...base, pattern: 'first', separator: '' }),
    ].join(' ')
  } catch {
    text = ''
  }
  pinyinCache.set(key, text)
  return text
}

/**
 * Search relevance rank: 0 = name starts with the query, 1 = name contains it,
 * 2 = description contains it, 3 = pinyin text contains it, 4 = no match.
 * Lower is more relevant.
 * @param {Skill} skill - the candidate.
 * @param {string} q - the normalized (trimmed, lowercased) query.
 * @returns {number} the rank.
 */
function matchRank(skill, q) {
  const name = skill.name.toLowerCase()
  const desc = String(skill.description ?? '').toLowerCase()
  if (name.startsWith(q)) return 0
  if (name.includes(q)) return 1
  if (desc.includes(q)) return 2
  if (skillPinyinText(skill.name, skill.description ?? '').toLowerCase().includes(q)) return 3
  return 4
}

/**
 * Browsing order: last picked first, then most frequent, then by name.
 * A fresh copy is returned; the input is untouched.
 * @param {Skill[]} skills - the candidates.
 * @param {import('./preferences.js').Usage} usage - pick history.
 * @returns {Skill[]} the ranked copy.
 */
function rankByUsage(skills, usage) {
  return skills.slice().sort((a, b) => {
    const ua = usage[a.name]
    const ub = usage[b.name]
    const la = ua?.lastUsed ?? 0
    const lb = ub?.lastUsed ?? 0
    if (la !== lb) return lb - la
    const ca = ua?.count ?? 0
    const cb = ub?.count ?? 0
    if (ca !== cb) return cb - ca
    return a.name.localeCompare(b.name)
  })
}

/**
 * Split the catalog into the three sections the panel shows, in display order:
 * pinned (in pin order), recently/frequently used (usage order), then the
 * untouched rest (by name). Sections with no members are dropped, so a
 * first-time user sees one section, not three. A fresh structure is returned.
 * @param {Skill[]} skills - the catalog.
 * @param {import('./preferences.js').Usage} usage - pick history.
 * @param {string[]} pinned - pinned names, in pin order.
 * @returns {SkillGroup[]} the non-empty sections.
 */
function groupByPinned(skills, usage, pinned) {
  const pinnedSet = new Set(pinned)
  const pinnedItems = pinned.map((name) => skills.find((skill) => skill.name === name)).filter(Boolean)
  const recent = []
  const rest = []
  for (const skill of rankByUsage(skills, usage)) {
    if (pinnedSet.has(skill.name)) continue
    if (usage[skill.name] !== undefined) recent.push(skill)
    else rest.push(skill)
  }
  return [
    { title: PINNED_TITLE, items: pinnedItems },
    { title: RECENT_TITLE, items: recent },
    { title: REST_TITLE, items: rest },
  ].filter((group) => group.items.length > 0)
}

/**
 * Decide what the panel shows for one query.
 *
 * @param {object} input
 * @param {Skill[]} input.skills - the catalog to select from.
 * @param {import('./preferences.js').Usage} [input.usage] - pick history; drives browsing order.
 * @param {string[]} [input.pinned] - pinned names; drives the first section.
 * @param {string} [input.query] - the search box contents.
 * @param {number} [input.limit] - most rows to return.
 * @returns {{
 *   visible: Skill[],
 *   groups: SkillGroup[],
 *   showTitles: boolean,
 * }} `visible` is the flat, ordered, capped row list — render it when
 *   `showTitles` is false, and use it for keyboard navigation either way.
 *   `groups` holds the same rows arranged under section titles, already
 *   narrowed to `visible`, and is empty when `showTitles` is false.
 */
export function selectSkills({ skills, usage = {}, pinned = [], query = '', limit = DEFAULT_LIMIT }) {
  const q = query.trim().toLowerCase()
  const sections = groupByPinned(skills, usage, pinned)
  // The browsing order is the sections read end to end.
  const browsing = sections.flatMap((group) => group.items)

  const visible = q === ''
    ? browsing.slice(0, limit)
    : browsing
      .map((skill, index) => ({ skill, index, rank: matchRank(skill, q) }))
      .filter((candidate) => candidate.rank < 4)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, limit)
      .map((candidate) => candidate.skill)

  // Titles are a browsing affordance only: a search collapses to one flat,
  // relevance-ordered result set. The decision reads the *whole* catalog, so a
  // capped result never changes whether headers appear.
  const showTitles = q === '' && sections.length > 1
  if (!showTitles) return { visible, groups: [], showTitles }

  const shown = new Set(visible.map((skill) => skill.name))
  const groups = sections
    .map((group) => ({ title: group.title, items: group.items.filter((skill) => shown.has(skill.name)) }))
    .filter((group) => group.items.length > 0)
  return { visible, groups, showTitles }
}
