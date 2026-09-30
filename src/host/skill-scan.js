/**
 * dsh-skill-picker — host half: the picker's skill scan.
 *
 * One interface — `scanSkills(cwd)` — behind which sit four facts a caller
 * would otherwise have to know:
 *
 *  1. **The roots.** The same four the official `dsh-skill-filesystem`
 *     provider mirrors, in the same rank order (project `.dsh/skills` 100 >
 *     project `.agents/skills` 200 > user `$DSH_HOME/skills` 400 > user
 *     `$DSH_AGENTS_HOME/skills` 500). Scanned low priority first so a
 *     higher-priority root overwrites a same-named skill in the map.
 *  2. **The link semantics.** `readdir` describes the entry, not its target, so
 *     a symlink or a Windows junction has to be resolved before a skill behind
 *     it is visible (issue #6). That lives in `dir-entry.js`.
 *  3. **The frontmatter shape.** A flat, deliberately narrow YAML subset —
 *     only the fields a picker row renders.
 *  4. **The invocation policy.** Whether a human-facing surface may offer this
 *     skill at all (issue #10), including the legacy keys the official provider
 *     rejects outright.
 *
 * ### Why this module exists instead of `ctx.skills`
 *
 * The official registry would be the obvious dependency, and it is the wrong
 * one here. In the shipped web composition the base host `skill-filesystem`
 * row is **disabled** — `dsh-web-app`'s patch carries
 * `- id: skill-filesystem / disabled: true` with the rationale "presets own
 * local discovery" — and a preset's provider registers into that preset's
 * layer, not the global one. `SkillRegistry.collectFresh()` reads
 * `[layers.global, ...layers.chainLayers(scope)]`, so a host-context
 * `ctx.skills.list({ cwd })` with no scope sees the global layer alone and
 * finds **no local skills**. Reaching the real catalog would mean borrowing the
 * viewing agent's preset scope and retaining a live Session — the dance
 * `dsh-api-session-controller` does — which would make this route depend on the
 * very session state its callers use it to survive.
 *
 * So this is a second adapter at the catalog seam, not a duplicate of an
 * available capability. What it gives up against the registry — YAML proper,
 * name/kebab-case validation, the `.git` project-root walk-up, custom and
 * bundled roots, watch-driven invalidation, `whenToUse` — is the price of
 * answering a bare `cwd` with no session, which is the whole point of the
 * fallback path.
 *
 * @module dsh-skill-picker/host/skill-scan
 */

import { readFile, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { isDirectoryEntry } from './dir-entry.js'

/**
 * @typedef {object} SkillEntry
 * @property {string} name - the skill's frontmatter name, else its directory name.
 * @property {string} description - frontmatter description, else ''.
 * @property {string} path - absolute directory holding the `SKILL.md`.
 */

//#region roots

/** Resolve the user skills directory, mirroring the official provider's default. */
function userSkillsDir() {
  const home = process.env.DSH_HOME ?? path.join(os.homedir(), '.dsh')
  return path.join(home, 'skills')
}

/**
 * Resolve the user agents-home skills directory, mirroring the official
 * provider's default (`$DSH_AGENTS_HOME` > `~/.agents`). This is the
 * cross-tool `.agents` convention; the official `dsh-skill-filesystem` scans
 * it as its `user-agents` root (rank 500), so the fallback must too — else
 * the picker's list silently misses skills that DSH's own `/` completion
 * shows (issue #5).
 */
function userAgentsSkillsDir() {
  const agentsHome = process.env.DSH_AGENTS_HOME ?? path.join(os.homedir(), '.agents')
  return path.join(agentsHome, 'skills')
}

/**
 * The roots to scan, in scan order: **lowest priority first**, so that each
 * later root overwrites a same-named skill already in the map and the highest
 * priority wins. The rank values are the official provider's, kept so this
 * order can be read against `dsh-skill-filesystem` at a glance.
 * @param {string | undefined} cwd - the session workspace root; project roots are skipped when absent.
 * @returns {Array<{ path: string, rank: number }>}
 */
function skillRootsFor(cwd) {
  const roots = [
    { path: userAgentsSkillsDir(), rank: 500 },
    { path: userSkillsDir(), rank: 400 },
  ]
  if (typeof cwd === 'string' && cwd !== '') {
    roots.push({ path: path.join(cwd, '.agents', 'skills'), rank: 200 })
    roots.push({ path: path.join(cwd, '.dsh', 'skills'), rank: 100 })
  }
  return roots
}

//#endregion

//#region invocation policy

/** The YAML frontmatter block of a SKILL.md body, or undefined when absent. */
function frontmatterBlock(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  return match === null ? undefined : match[1]
}

/** Parse a SKILL.md frontmatter block into a key/value map (flat YAML subset). */
function parseFrontmatter(content) {
  const block = frontmatterBlock(content)
  if (block === undefined) return {}
  const out = {}
  for (const line of block.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (!kv) continue
    const value = kv[2].trim().replace(/^["']|["']$/g, '')
    if (value !== '') out[kv[1]] = value
  }
  return out
}

/**
 * Whether the frontmatter carries `key` at all, whatever its value.
 * `parseFrontmatter` drops empty values, so presence checks that must also
 * see a bare `key:` line go through here instead.
 */
function hasFrontmatterKey(content, key) {
  const block = frontmatterBlock(content)
  if (block === undefined) return false
  return block.split(/\r?\n/).some((line) => {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    return kv !== null && kv[1] === key
  })
}

/**
 * Legacy invocation spellings the official `dsh-skill-filesystem` provider
 * rejects outright (`rejectLegacyInvocationKey`) — a skill carrying one is
 * dropped from every surface, so the picker must drop it too.
 */
const LEGACY_INVOCATION_KEYS = ['disableModelInvocation', 'modelInvocable', 'userInvocable']

/**
 * Read a frontmatter boolean with the official provider's semantics: YAML
 * booleans plus the case-insensitive `true`/`false`, `yes`/`no`, `on`/`off`
 * and `1`/`0` forms. An absent key yields undefined ("surface permitted").
 */
function frontmatterBoolean(meta, key) {
  if (!Object.hasOwn(meta, key)) return undefined
  const value = meta[key]
  if (typeof value === 'boolean') return value
  if (value === 1 || value === '1') return true
  if (value === 0 || value === '0') return false
  if (typeof value === 'string') {
    switch (value.toLowerCase()) {
      case 'true':
      case 'yes':
      case 'on':
        return true
      case 'false':
      case 'no':
      case 'off':
        return false
    }
  }
  throw new TypeError(`frontmatter field "${key}" must be a boolean`)
}

/**
 * Whether a scanned skill may be offered by the picker, i.e. whether it is
 * user-invocable. Mirrors `parseInvocationPolicy` in
 * `@deepseek-ai/dsh-skill-filesystem`: `user-invocable: false` keeps the skill
 * out of human-facing commands, a rejected spelling or a legacy invocation key
 * drops it entirely.
 *
 * Why this exists (issue #10): the official `skills/list` Remote filters with
 * `isUserInvocable` before answering, but this host's own fallback scan read
 * name/description only — so the picker offered skills the official `/` menu
 * hides, and picking one inserted a `/name` gesture that `dsh-tool-skill` then
 * refused to load (a silent no-op).
 *
 * @param {Record<string, string>} meta - parsed frontmatter map.
 * @param {string} content - the raw SKILL.md body (legacy keys are detected on it).
 */
function isUserInvocableSkill(meta, content) {
  for (const legacy of LEGACY_INVOCATION_KEYS) {
    if (hasFrontmatterKey(content, legacy)) return false
  }
  try {
    // Omitted → permitted; only an explicit `false` hides the skill.
    return frontmatterBoolean(meta, 'user-invocable') !== false
  } catch {
    return false
  }
}

//#endregion

/** Scan one skill directory into the map; never throws (missing dir is a no-op). */
async function scanSkillsDirInto(map, dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // Links are followed (`isDirectoryEntry`), so a skill may live behind a
    // symlink/junction — e.g. `~/.agents/skills/neat` → another repo (#6).
    if (!(await isDirectoryEntry(dir, entry))) continue
    const skillDir = path.join(dir, entry.name)
    let content
    try {
      content = await readFile(path.join(skillDir, 'SKILL.md'), 'utf8')
    } catch {
      continue
    }
    const meta = parseFrontmatter(content)
    if (!isUserInvocableSkill(meta, content)) continue
    // Later writes win, so project-level skills override same-named user skills.
    map.set(meta.name ?? entry.name, {
      name: meta.name ?? entry.name,
      description: meta.description ?? '',
      path: skillDir,
    })
  }
}

/**
 * List the skills the picker may offer for one workspace.
 *
 * Scans every root the official `dsh-skill-filesystem` provider mirrors, in
 * priority order (see the module comment), drops anything the invocation policy
 * hides, and deduplicates by name with the highest-priority root winning.
 * Never throws: an unreadable or missing root contributes nothing.
 *
 * @param {string} [cwd] - the active session's workspace root; omit for user-level skills only.
 * @returns {Promise<SkillEntry[]>} deduplicated, name-sorted entries.
 */
export async function scanSkills(cwd) {
  const map = new Map()
  for (const root of skillRootsFor(cwd)) await scanSkillsDirInto(map, root.path)
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
}
