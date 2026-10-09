import { expect, mock, test } from 'claude-code/testing'

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

test('draws what is left of each limit on the desktop', async ($, on) => {
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000, tokens: 50000, percent: 25 },
      rateLimits: [
        { kind: 'five_hour', percentUsed: 86 },
        { kind: 'seven_day', percentUsed: 15 },
      ],
    },
  }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const svg = await ui.find({ type: 'Svg' })

  expect(svg?.props.alt).toBe('7d 85% left, 5h 14% left, context 75% left')
  // 14% of the 180px XP bar
  expect(String(svg?.props.source)).toContain('M1 21h25v1h-25z')
  await ui.unmount()
})

test('Clawd walks, celebrates a finished turn, then walks again', async ($, on) => {
  const clock = mock.clock(on)
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 0 }],
    },
  }))
  on('turn.complete', () => ({ text: '' }))

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt

  expect(await clawd()).toBe('Clawd: walk')
  await $.turn.complete({
    answer: '',
    durationMs: 0,
    isAborted: false,
    turnId: 't',
    reason: 'answer',
  })
  expect(await clawd()).toBe('Clawd: done')
  await clock.advance(4000)
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})

test('Clawd asks while a question waits for its answer', async ($, on) => {
  const clock = mock.clock(on)
  let answer = () => {}
  on('session.usage', () => ({
    value: {
      startedAt: 0,
      context: { window: 200000 },
      rateLimits: [{ kind: 'five_hour', percentUsed: 0 }],
    },
  }))
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    await new Promise<void>(resolve => (answer = resolve))

    return { result: {} }
  })

  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' })
  const clawd = async () => (await ui.findAll({ type: 'Svg' }))[1]?.props.alt
  const call = $.tool.call({ tool: 'AskUserQuestion', questions: [] })

  await clock.settle()
  expect(await clawd()).toBe('Clawd: ask')
  answer()
  await call
  expect(await clawd()).toBe('Clawd: walk')
  await ui.unmount()
})
