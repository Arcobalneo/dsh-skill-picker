/**
 * dsh-skill-picker — host half: the composition root.
 *
 * This module wires; it does not implement. Three rows make up the host half —
 * the catalog route (`host/skills-route.js` over `host/skill-scan.js`), the
 * model-facing announcement, and the opt-in slash-completion patch
 * (`host/slash-completion.js`) — and each is mounted here and nowhere else.
 *
 * The browser half (exports "./client") is served by client-modules from the
 * same package's `dsh.client` declaration.
 *
 * @module dsh-skill-picker
 */

import { scanSkills } from './host/skill-scan.js'
import { createSkillsRoute } from './host/skills-route.js'
import { healUiSkillPatches, reportUiSkillPatches } from './host/slash-completion.js'
import { ROUTE_PREFIX } from './route-path.js'

/** Required services: the route registry and the prompt band. */
export const inject = ['webServer', 'systemPrompt']

/** Name of the announcement section within the tool-guidance band. */
const SECTION_NAME = 'plugin:skill-picker'

/** Order of the announcement section within the tool-guidance band. */
const SECTION_ORDER = 215

/** Model-facing announcement: picker presence and the user-visible gesture. */
export const SKILL_PICKER_GUIDANCE =
  '本机已安装 dsh-skill-picker 插件（Web GUI 的技能选择器）：输入框旁有技能按钮，用户点选技能后会把 `/技能名`（如 /duo-xuan-pi-gai）插入发送框并随消息发出。DSH 官方机制会把用户消息里的 `/技能名` 手势当作技能直接调用并自动加载技能内容——你照常按加载后的技能指令执行即可，无需额外操作。用户说「技能选择器 / 选个技能 / 技能列表」时即指本插件。'

/**
 * Mount the host half.
 * @param {import('@deepseek-ai/cordis').Context} ctx - context carrying webServer and systemPrompt.
 */
export function apply(ctx) {
  const skillsRoute = createSkillsRoute({ scanSkills })

  ctx.effect(
    () => ctx.webServer.register({ kind: 'prefix', path: ROUTE_PREFIX, handler: skillsRoute }),
    'dsh-skill-picker: routes',
  )

  ctx.effect(() => ctx.systemPrompt.section({
    name: SECTION_NAME,
    order: SECTION_ORDER,
    text: SKILL_PICKER_GUIDANCE,
  }), 'dsh-skill-picker: prompt section')

  // NOTE (DSH 0.2.0-rc.2 adaptation): the ui-skill source patch is NOT
  // installed by default. It rewrote the official
  // `@deepseek-ai/dsh-client-ui-skill` `client.js` on disk, which cannot work
  // in the DSH desktop app — those bundles live inside the signed, read-only
  // `app.asar` (upstream issue #7: "0 target client.js found").
  //
  // Consequence, stated plainly: on 0.2.0-rc.2 the `/` menu keeps its built-in
  // prefix matching. This plugin provides the ⚡ picker, which is the supported
  // surface (`conversation.input.right` + the official `skills/list` Remote).
  //
  // Set DSH_SKILL_PICKER_PATCH_SLASH=1 to opt back in for npm/pnpm installs
  // where the official bundle really is a writable file on disk.
  if (process.env.DSH_SKILL_PICKER_PATCH_SLASH === '1') {
    ctx.effect(() => {
      healUiSkillPatches()
        .then((report) => reportUiSkillPatches(report))
        .catch((error) => {
          console.warn('[dsh-skill-picker] ui-skill patch failed:', error)
        })
      return () => {}
    }, 'dsh-skill-picker: ui-skill self-heal patch')
  }
}
