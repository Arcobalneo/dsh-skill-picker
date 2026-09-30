/**
 * dsh-skill-picker — browser half: the picker's inline styles.
 *
 * Extracted so the view reads as layout rather than as CSS-in-JS noise, and so
 * the row height and the source badge — the two values that had to be tuned
 * against the resident composer chrome (#4) — have one home each.
 *
 * @module dsh-skill-picker/client/styles
 */

/** Bolt button: matches the resident chrome (access mode, plan, attach, model). */
export const buttonStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '24px',
  height: '24px',
  margin: '0 2px',
  padding: '0',
  border: '1px solid var(--dsw-alias-border-l2, rgba(128,128,128,0.25))',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-secondary, #c9d2e0)',
  cursor: 'pointer',
  fontSize: '15px',
  lineHeight: '1',
  flex: 'none',
}

/** The open-state accent for the bolt button. */
export const buttonOpenStyle = { color: 'var(--dsw-alias-label-primary-bluish, #4cc9f0)' }

/** The popover: anchored above the button, right-aligned to the tool row. */
export const popoverStyle = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  right: '0',
  width: '340px',
  maxHeight: '320px',
  display: 'flex',
  flexDirection: 'column',
  background: 'var(--dsw-specific-tip, #1e2533)',
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.35))',
  borderRadius: '12px',
  boxShadow: '0 8px 28px rgba(0,0,0,0.35)',
  overflow: 'hidden',
  zIndex: 1000,
}

export const searchStyle = {
  boxSizing: 'border-box',
  width: 'calc(100% - 16px)',
  margin: '8px',
  padding: '6px 10px',
  border: '1px solid var(--dsw-alias-border-l1, rgba(128,128,128,0.3))',
  borderRadius: '8px',
  background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.1))',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  fontSize: '13px',
  outline: 'none',
}

export const listStyle = {
  overflowY: 'auto',
  flex: 'auto',
  padding: '0 6px 8px',
}

export const itemStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '2px',
  width: '100%',
  padding: '7px 10px',
  border: 'none',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--dsw-alias-label-primary, #e6ebf2)',
  cursor: 'pointer',
  textAlign: 'left',
}

/** A row in the flat list: the name column and the pin affordance side by side. */
export const itemRowStyle = { ...itemStyle, flexDirection: 'row', alignItems: 'center' }

/** Hover / keyboard-highlight background for one row. */
export const itemActiveStyle = { background: 'var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,0.12))' }

export const itemTextStyle = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: '2px',
  flex: '1',
  minWidth: '0',
}

export const nameStyle = {
  fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
  fontSize: '13px',
  fontWeight: 500,
}

export const descStyle = {
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  fontSize: '12px',
  lineHeight: '16px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: '100%',
}

export const statusStyle = {
  padding: '12px',
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  fontSize: '13px',
}

/** Section header for the grouped browsing view. */
export const groupHeaderStyle = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '6px 10px 2px',
  color: 'var(--dsw-alias-label-tertiary, #8a94a6)',
  fontSize: '11px',
  fontWeight: 600,
  letterSpacing: '0.04em',
}

export const groupCountStyle = { opacity: 0.7 }

/** The pin toggle at the end of a row. */
export function pinStyle(isPinned) {
  return {
    flex: 'none',
    marginLeft: '6px',
    padding: '2px 4px',
    borderRadius: '6px',
    fontSize: '12px',
    lineHeight: '16px',
    cursor: 'pointer',
    color: isPinned ? 'var(--dsw-alias-label-primary-bluish, #4cc9f0)' : 'var(--dsw-alias-label-tertiary, #8a94a6)',
    opacity: isPinned ? 1 : 0.55,
    userSelect: 'none',
  }
}

/** Shown only when the list came from the host scan fallback (official API unavailable). */
export const sourceBadgeStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  alignSelf: 'flex-start',
  margin: '0 8px 8px',
  padding: '2px 8px',
  border: '1px solid rgba(255, 193, 7, 0.35)',
  borderRadius: '999px',
  background: 'rgba(255, 193, 7, 0.1)',
  color: '#d9a520',
  fontSize: '11px',
  lineHeight: '16px',
  flex: 'none',
}

export const sourceBadgeTextStyle = {
  fontFamily: 'var(--ds-font-family-code, ui-monospace, monospace)',
}
