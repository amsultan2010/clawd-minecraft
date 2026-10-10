import { expect, mock, test } from 'claude-code/testing'
import type { On, SessionRateLimit } from 'claude-code'

const BAND = {
  plugin: 'clawd-minecraft',
  component: 'AbovePrompt',
  props: {
    hasSurvey: false,
    isWorking: false,
    maxRows: 10,
    bodyColumns: 80,
    scroll: { offset: 0, bodyRows: 10 },
    view: {},
  },
} as const

const BOTH: SessionRateLimit[] = [
  { kind: 'five_hour', percentUsed: 86 },
  { kind: 'seven_day', percentUsed: 15 },
]

// What sits beneath the mod: the limits and how full the context is, and
// whatever another mod (or the engine) drew in the same band.
const usage = (on: On, rateLimits: SessionRateLimit[], percent?: number) => {
  on('session.usage', () => ({
    value: { startedAt: 0, context: { window: 200000, percent }, rateLimits },
  }))
  on('ui.render', { component: 'AbovePrompt' }, ($, e) =>
    $.ui.resolve(e).Text({ children: 'drawn beneath' }),
  )
}

const TURN = { answer: '', durationMs: 0, isAborted: false, turnId: 't' } as const

test('draws what is left of each limit on the desktop', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH, 25)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })

  expect(svg?.props.alt).toBe('7d 85% left, 5h 14% left, context 75% left')
  // 14% of the 180px XP bar
  expect(String(svg?.props.source)).toContain('M1 21h25v1h-25z')
  await ui.unmount()
})

test('leaves out a bar that has no reading instead of drawing it full', async ($, on) => {
  mock.clock(on)
  usage(on, [{ kind: 'five_hour', percentUsed: 86 }])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })

  expect(svg?.props.alt).toBe('5h 14% left')
  // no heart red, no armor white, no drumstick brown
  expect(String(svg?.props.source)).not.toContain('#ff1313')
  expect(String(svg?.props.source)).not.toContain('#f4f4f4')
  expect(String(svg?.props.source)).not.toContain('#b97a45')
  await ui.unmount()
})

test('shows a limit as full once its reset time has passed', async ($, on) => {
  mock.clock(on, { now: Date.parse('2026-01-01T12:00:00Z') })
  usage(on, [
    { kind: 'five_hour', percentUsed: 86, resetsAt: '2026-01-01T11:00:00Z' },
    { kind: 'seven_day', percentUsed: 15, resetsAt: '2026-01-05T00:00:00Z' },
  ])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('7d 85% left, 5h 100% left')
  await ui.unmount()
})

test('never shows less than 0% for a limit that is over', async ($, on) => {
  mock.clock(on)
  usage(on, [{ kind: 'five_hour', percentUsed: 103 }])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('5h 0% left')
  await ui.unmount()
})

test('draws hunger and Clawd alone when only the context has a reading', async ($, on) => {
  mock.clock(on)
  // no plan limits (an API key), or only a kind the HUD has no bar for
  usage(on, [{ kind: 'spend_limit', percentUsed: 40 }], 25)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const [hud, clawd] = await ui.findAll({ type: 'Svg' })

  expect(hud?.props.alt).toBe('context 75% left')
  expect(clawd?.props.alt).toBe('Clawd: walk')
  await ui.unmount()
})

test('draws nothing while no figure has a reading', async ($, on) => {
  mock.clock(on)
  usage(on, [{ kind: 'spend_limit', percentUsed: 40 }])

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect((await ui.find({ type: 'Text' }))?.text).toBe('drawn beneath')
  await ui.unmount()
})

test('never shows the context as less than empty', async ($, on) => {
  mock.clock(on)
  usage(on, [], 104)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect((await ui.find({ type: 'Svg' }))?.props.alt).toBe('context 0% left')
  await ui.unmount()
})

test('keeps Clawd’s picture byte-identical while the band’s width only wobbles', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH)

  // the desktop keeps his frame only while the source is the same text: a changed one reloads it
  const picture = async (bodyColumns: number) => {
    const ui = await $.ui.mount({ ...BAND, props: { ...BAND.props, bodyColumns }, surface: 'desktop' })
    const source = (await ui.findAll({ type: 'Svg' }))[1]?.props.source
    await ui.unmount()

    return source
  }
  const first = await picture(80)

  expect(await picture(81)).toBe(first)
  expect(await picture(78)).toBe(first)
  // a real resize still gets a strip that fits
  expect(await picture(100)).not.toBe(first)
})

test('starts the walk in the middle, where his other poses stand, heading right', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = String((await ui.findAll({ type: 'Svg' }))[1]?.props.source)

  // 80 columns give a 14s lap; a quarter of the way in he is mid-strip, eyes right
  expect(source).toContain('.w{animation:w 14s linear -3.5s infinite}')
  expect(source).toContain('.g{animation:g 14s step-end -3.5s infinite}')
  expect(source).toContain('<g class="s c">')
  await ui.unmount()
})

test('asks for a redraw when a figure it shows moved, not for the session’s cost alone', async ($, on) => {
  let redraws = 0
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.invalidate', (_, e, next) => {
    redraws += 1

    return next(e)
  })

  const measured = { context: { window: 200000, percent: 25 }, rateLimits: BOTH }

  // the cost grows with every reply while Claude works, and the HUD shows none of it
  await $.session.measure({ ...measured, cost: { usd: 1 }, changed: ['cost'] })
  expect(redraws).toBe(0)
  await $.session.measure({ ...measured, changed: ['cost', 'context'] })
  expect(redraws).toBe(1)
})

test('carries a still Clawd for people who ask for reduced motion', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const source = String((await ui.findAll({ type: 'Svg' }))[1]?.props.source)
  const still = source.slice(source.indexOf('<g class="s'))

  // the system setting swaps the moving figure for one with nothing animated
  expect(source).toContain('@media(prefers-reduced-motion:reduce){.m{display:none}.s{display:inline}}')
  expect(still).toContain('<rect')
  expect(still).not.toContain('<animate')
  await ui.unmount()
})

test('Clawd walks, celebrates a finished turn until the next one starts, then walks again', async ($, on) => {
  const clock = mock.clock(on)
  usage(on, BOTH)
  on('turn.start', (_, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt

  expect(await clawd()).toBe('Clawd: walk')
  await $.turn.complete({ ...TURN, reason: 'answer' })
  expect(await clawd()).toBe('Clawd: done')
  // no timer ends the cheer: only Claude going back to work does
  await clock.advance(60 * 60 * 1000)
  expect(await clawd()).toBe('Clawd: done')
  await $.turn.start({ text: 'next', turnId: 'u' })
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('Clawd does not celebrate a turn that errored, was interrupted or was a subagent’s', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH)
  on('turn.complete', () => ({ text: '' }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt

  await $.turn.complete({ ...TURN, reason: 'error' })
  expect(await clawd()).toBe('Clawd: walk')
  await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })
  expect(await clawd()).toBe('Clawd: walk')
  await $.turn.complete({ ...TURN, reason: 'answer', agentId: 'a1' })
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('a subagent’s turn does not end the cheer, and an interrupted turn does', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH)
  on('turn.complete', () => ({ text: '' }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt

  await $.turn.complete({ ...TURN, reason: 'answer' })
  await $.turn.complete({ ...TURN, reason: 'error', agentId: 'a1' })
  expect(await clawd()).toBe('Clawd: done')
  await $.turn.complete({ ...TURN, reason: 'aborted', isAborted: true })
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('Clawd asks while a question waits, and hands its answer on untouched', async ($, on) => {
  const clock = mock.clock(on)
  let answer = () => {}
  usage(on, BOTH)
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await new Promise<void>(resolve => (answer = resolve))

    return { result: { answers: { Color: 'orange' } } }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt
  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [] })

  await clock.settle()
  expect(await clawd()).toBe('Clawd: ask')
  answer()
  expect(await call).toMatchObject({ result: { answers: { Color: 'orange' } } })
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('Clawd keeps asking until every open question is answered', async ($, on) => {
  const clock = mock.clock(on)
  const answers: (() => void)[] = []
  usage(on, BOTH)
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await new Promise<void>(resolve => answers.push(resolve))

    return { result: {} }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt
  const first = $.tool.call({ tool: 'AskUserQuestion', questions: [] })
  const second = $.tool.call({ tool: 'AskUserQuestion', questions: [] })

  await clock.settle()
  answers[0]?.()
  await first
  expect(await clawd()).toBe('Clawd: ask')
  answers[1]?.()
  await second
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('keeps what another mod drew in the band, under the HUD', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH, 25)

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })

  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(2)
  expect((await ui.find({ type: 'Text' }))?.text).toBe('drawn beneath')
  await ui.unmount()
})

test('leaves the terminal band to whatever is beneath', async ($, on) => {
  mock.clock(on)
  usage(on, BOTH, 25)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })

  expect((await ui.find({ type: 'Text' }))?.text).toBe('drawn beneath')
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  await ui.unmount()
})
