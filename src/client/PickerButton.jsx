/**
 * dsh-skill-picker — browser half: the picker control.
 *
 * Mounted into the composer's right tool row. This module is the view and its
 * interaction state machine; it decides nothing about *what* to show. The
 * catalog comes from `catalog.fetchCatalog`, the ordering and filtering from
 * `selectSkills`, the gesture text from `draftWithPick`, and persistence from
 * `preferences` — all injected, which is what keeps this file about layout and
 * keyboard handling.
 *
 * State ownership is deliberate: the catalog is fetched once when a settled
 * entry is re-opened and refreshed in the background afterwards, so a skill
 * installed while the composer stays mounted appears without a page reload,
 * while a failed background refresh keeps painting the list it already has.
 *
 * @module dsh-skill-picker/client/PickerButton
 */

import { Fragment, useCallback, useEffect, useRef, useState } from 'react'

import { draftWithPick } from './draft.js'
import { recordPick, togglePin } from './preferences.js'
import { selectSkills } from './selection.js'
import {
  buttonOpenStyle,
  buttonStyle,
  descStyle,
  groupCountStyle,
  groupHeaderStyle,
  itemActiveStyle,
  itemRowStyle,
  itemTextStyle,
  listStyle,
  nameStyle,
  pinStyle,
  popoverStyle,
  searchStyle,
  sourceBadgeStyle,
  sourceBadgeTextStyle,
  statusStyle,
} from './styles.js'

/** Placeholder text for the search box. */
const SEARCH_PLACEHOLDER = '搜索技能…（↑↓ 选择，Enter 插入）'

/** The picker's bolt glyph: DeepSeek palette gradient + slim stroke. */
function BoltIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style={{ display: 'block' }}>
      <defs>
        <linearGradient id="dsh-sp-bolt-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--dsw-static-deepseek-400, rgb(103, 158, 254))" />
          <stop offset="100%" stopColor="var(--dsw-static-deepseek-600, rgb(72, 104, 178))" />
        </linearGradient>
      </defs>
      <path
        d="M11 21h-1l1-7H7.5c-.58 0-.57-.32-.38-.66.19-.34.05-.08.07-.12C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.15C12.96 17.55 11 21 11 21z"
        fill="url(#dsh-sp-bolt-grad)"
        stroke="var(--dsw-static-deepseek-600, rgb(72, 104, 178))"
        strokeWidth="1"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The picker control. Rendered by the slot renderer with the composed props
 * plus the injected `catalog` and `preferences`.
 * @param {object} props - framework props (`sessionId`, `useInput`, `inputActions`) plus the injected dependencies.
 */
export function PickerButton(props) {
  const { catalog, preferences, sessionId } = props

  const [open, setOpen] = useState(false)
  const [skills, setSkills] = useState(undefined)
  const [error, setError] = useState(undefined)
  const [source, setSource] = useState(undefined)
  const [query, setQuery] = useState('')
  const [usage, setUsage] = useState(() => preferences.loadUsage())
  const [pinned, setPinned] = useState(() => preferences.loadPinned())
  const [active, setActive] = useState(0)

  const boxRef = useRef(null)
  const itemRefs = useRef([])
  const abortRef = useRef(undefined)

  // Cancel an in-flight catalog fetch when this entry unmounts (Session switch,
  // composer teardown, plugin disposal). The Remote carries the signal through
  // to the transport, so a superseded fetch stops instead of landing late.
  useEffect(() => () => abortRef.current?.abort(), [])

  // Latest draft mirror: `useInput` is a framework selector hook — supplied for
  // every session-scoped slot by `@deepseek-ai/dsh-client-ui-session` — while
  // the pick handler runs from a click callback, so the live draft is read here
  // during render and kept in a ref. Appending onto the store's REAL current
  // draft is what keeps the pick from overwriting the user's typed text with a
  // stale snapshot.
  const draftRef = useRef('')
  const inputState = typeof props.useInput === 'function' ? props.useInput((state) => state) : undefined
  if (inputState !== undefined && typeof inputState.draft === 'string') draftRef.current = inputState.draft

  const load = useCallback(async (force = false) => {
    if (!force && (skills !== undefined || error !== undefined)) return
    // A forced refresh runs on top of an already-settled entry, so remember
    // whether a working catalog exists: a failed refresh must keep painting it
    // rather than replace the list with the error panel.
    const hadCatalog = skills !== undefined
    // Supersede any in-flight fetch (rapid close/re-open) and keep `abortRef`
    // pointing at the newest request so unmount still cancels the live one.
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await catalog.fetchCatalog(sessionId, controller.signal)
      if (controller.signal.aborted) return
      setSkills(result.skills)
      setSource(result.source)
      setError(undefined)
    } catch (cause) {
      if (controller.signal.aborted) return
      // Keep a working catalog through a failed background refresh. Only a cold
      // load — or a forced retry while the previous attempt left an error — is
      // allowed to surface the failure to the user.
      if (hadCatalog) {
        console.warn('[dsh-skill-picker] catalog refresh failed, keeping the current list:', cause)
        return
      }
      setError(String(cause?.message ?? cause))
    }
  }, [skills, error, catalog, sessionId])

  const toggle = () => {
    if (!open) {
      // Re-read the stored preferences on every open, so a pick recorded
      // elsewhere is reflected in the ordering.
      setUsage(preferences.loadUsage())
      // Refetch on every open. A skill installed while this entry stayed mounted
      // (the entry lives as long as the composer does) must show up without a
      // page reload. The first open is a cold load that paints "加载中…"; later
      // opens refresh in the background while the current list stays visible.
      void load(skills !== undefined || error !== undefined)
    }
    setOpen(!open)
  }

  const pick = (name) => {
    // Draft source: the render-time mirror of the live input store (see the
    // `draftRef` sync above). Appending onto anything else risks overwriting
    // the user's typed draft with a stale snapshot.
    const next = draftWithPick(draftRef.current, name)
    try {
      if (typeof props.inputActions?.setDraft === 'function') {
        props.inputActions.setDraft(next)
      } else {
        console.error('[dsh-skill-picker] inputActions.setDraft unavailable; draft not written:', next)
      }
    } catch (cause) {
      console.error('[dsh-skill-picker] setDraft failed:', cause)
    }

    // Record usage for ordering (recent first, then frequent).
    const nextUsage = recordPick(usage, name, Date.now())
    setUsage(nextUsage)
    preferences.saveUsage(nextUsage)

    setOpen(false)
    setQuery('')
  }

  const onTogglePin = (name) => {
    const next = togglePin(pinned, name)
    setPinned(next)
    preferences.savePinned(next)
  }

  // Close on outside pointer-down (the shell's menu convention).
  useEffect(() => {
    if (!open) return
    const onDown = (event) => {
      if (boxRef.current !== null && !boxRef.current.contains(event.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const { visible, groups, showTitles } = selectSkills({ skills: skills ?? [], usage, pinned, query })
  // One name→row index, so a row knows its position in `visible` whether it is
  // rendered from the flat list or from a section. Keyboard order therefore
  // follows `visible` in both layouts.
  const indexByName = new Map(visible.map((skill, index) => [skill.name, index]))

  // Keyboard navigation (#1): reset highlight when the query changes, keep it
  // in range when the result list shrinks, and keep the highlighted row visible.
  useEffect(() => {
    setActive(0)
  }, [query])

  useEffect(() => {
    setActive((current) => Math.min(current, Math.max(0, visible.length - 1)))
  }, [visible.length])

  useEffect(() => {
    itemRefs.current[active]?.scrollIntoView({ block: 'nearest' })
  }, [active, visible.length])

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActive((index) => Math.min(index + 1, visible.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActive((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      const skill = visible[active]
      if (skill !== undefined) pick(skill.name)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      setOpen(false)
    }
  }

  const renderItem = (skill, index) => (
    <button
      key={skill.name}
      type="button"
      ref={(element) => {
        itemRefs.current[index] = element
      }}
      onClick={() => pick(skill.name)}
      onMouseEnter={(event) => {
        setActive(index)
        event.currentTarget.style.background = itemActiveStyle.background
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.background = 'transparent'
      }}
      style={{ ...itemRowStyle, ...(index === active ? itemActiveStyle : {}) }}
    >
      <span style={itemTextStyle}>
        <span style={nameStyle}>{`/${skill.name}`}</span>
        <span style={descStyle}>{skill.description ?? ''}</span>
      </span>
      <span
        role="button"
        tabIndex={-1}
        title={pinned.includes(skill.name) ? '取消置顶' : '置顶到列表顶部'}
        aria-label={pinned.includes(skill.name) ? '取消置顶' : '置顶'}
        onClick={(event) => {
          event.stopPropagation()
          onTogglePin(skill.name)
        }}
        style={pinStyle(pinned.includes(skill.name))}
      >
        {pinned.includes(skill.name) ? '📌' : '📍'}
      </span>
    </button>
  )

  return (
    <div ref={boxRef} style={{ position: 'relative', display: 'inline-flex', flex: 'none' }}>
      <button
        type="button"
        onClick={toggle}
        title="选择技能（插入 /技能名 到发送框）"
        aria-label="选择技能"
        style={{ ...buttonStyle, ...(open ? buttonOpenStyle : {}) }}
      >
        <BoltIcon />
      </button>
      {open && (
        <div style={popoverStyle}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={SEARCH_PLACEHOLDER}
            style={searchStyle}
            autoFocus
          />
          {error !== undefined ? (
            <div style={statusStyle}>{`加载失败：${error}`}</div>
          ) : skills === undefined ? (
            <div style={statusStyle}>加载中…</div>
          ) : (
            <>
              <div style={listStyle}>
                {visible.length === 0 ? (
                  <div style={statusStyle}>没有匹配的技能</div>
                ) : showTitles ? (
                  groups.map((group) => (
                    <Fragment key={group.title}>
                      <div style={groupHeaderStyle}>
                        <span>{group.title}</span>
                        <span style={groupCountStyle}>{group.items.length}</span>
                      </div>
                      {group.items.map((skill) => renderItem(skill, indexByName.get(skill.name)))}
                    </Fragment>
                  ))
                ) : (
                  visible.map((skill) => renderItem(skill, indexByName.get(skill.name)))
                )}
              </div>
              {source === 'host' && (
                <div style={sourceBadgeStyle} title="官方技能 API 不可用，列表来自本地目录扫描（与官方 / 补全同源）">
                  <span style={sourceBadgeTextStyle}>本地扫描</span>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
