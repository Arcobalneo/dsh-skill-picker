/**
 * dsh-skill-picker — browser half: the draft-insertion rule.
 *
 * Picking a skill does not send anything. It inserts the official `/skill-name`
 * gesture into the composer's draft, and DSH's own user-invocation path loads
 * the skill when the message is sent. That makes this a small function with a
 * load-bearing contract:
 *
 *  - **The trailing space is required.** DSH's gesture matcher is
 *    `/(^|\s)\/([a-z0-9]+(?:-[a-z0-9]+)*)(?=\s|$)/g` — the `/name` token only
 *    counts when whitespace or end-of-input follows it. Drop the trailing space
 *    and the gesture silently stops being a gesture.
 *  - **A separator is added only when needed**, so picking twice in a row does
 *    not accumulate double spaces, and picking into an empty draft does not
 *    leave a leading one.
 *
 * The rule has already regressed once (v0.5.0, "fix draft-overwrite on
 * alpha.5"), which is why it lives alone with a name and a test rather than
 * inline in a click handler between a framework call and two state resets.
 *
 * @module dsh-skill-picker/client/draft
 */

/**
 * Insert one skill gesture into a draft.
 * @param {string} draft - the composer's current draft text.
 * @param {string} name - the skill name to insert.
 * @returns {string} the next draft.
 */
export function draftWithPick(draft, name) {
  const separator = draft === '' || draft.endsWith(' ') || draft.endsWith('\n') ? '' : ' '
  return `${draft}${separator}/${name} `
}
