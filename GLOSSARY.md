# Glossary

The domain language of dsh-skill-picker. Architecture reviews should use these
terms; module names in the source follow them.

## The two halves

**Host half** — the Node side, mounted from `src/index.js`. It owns the HTTP
route, the model-facing announcement, and the opt-in slash-completion patch. It
is the only half that touches the filesystem.

**Browser half** — the side mounted into the DSH web shell from
`src/client/index.jsx`. It owns the ⚡ control and everything a user sees. It
never touches the filesystem.

There is no third half. Anything that needs both is a contract, and contracts
live in `src/route-path.js`.

## The skill domain

**Skill** — one directory bundle under a scanned root, carrying a `SKILL.md`
with frontmatter. DSH itself owns the concept; this plugin only reads it.

**Entry** — one row's worth of a skill: `{ name, description, path }`. The shape
the picker renders, produced by the scan and by the catalog normalizer.

**Root** — a directory the scan reads skills from. Mirrored from the official
`dsh-skill-filesystem` provider, with its `rank`: project `.dsh/skills` (100),
project `.agents/skills` (200), user `$DSH_HOME/skills` (400), user
`$DSH_AGENTS_HOME/skills` (500). Lower rank wins a name collision.

**Invocation policy** — whether a skill may be offered at all. A human-facing
surface may offer any skill that does not say `user-invocable: false`; a skill
carrying a legacy invocation key is dropped from every surface.

**User-facing** — the property the invocation policy decides. The picker is a
user-facing surface, so it offers exactly the skills DSH's own `/` menu offers —
no more, or picking one would insert a gesture the loader then refuses.

## The picker domain

**Catalog** — the list of entries the picker may offer for one Session. It has
two **adapters**, because two genuinely vary: the official `skills/list` Remote
(needs a retained, open Session) and this plugin's host route (answers from a
bare `cwd`). One **normalizer** brings both onto the entry shape.

**Source** — which adapter answered. Surfaced to the user as the 本地扫描 badge
when it was the host route, because that means the official path is unavailable.

**Selection** — for one query, what the panel shows: the ordered, capped rows,
the sections they fall into, and whether section titles are drawn.

**Section** — a titled band of the browsing view: 置顶, 最近使用, 全部. Sections
are a browsing affordance only; a search collapses to one relevance-ordered
list.

**Pick** — one user invocation: inserting the gesture, recording the use, and
closing the panel.

**Gesture** — the `/skill-name ` token the picker writes into the draft. The
trailing space is part of the gesture: DSH's matcher requires whitespace or
end-of-input after the name, so a gesture without it silently stops being one.

**Usage** — the pick history: a count and a last-picked timestamp per name. It
orders the browsing view.

**Pinned** — the user's manual ordering override, kept as an ordered list of
names and shown as the first section.

**Preferences** — what persists per browser: usage and pinned.
