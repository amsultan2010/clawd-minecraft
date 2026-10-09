import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Mood } from '../types'

const mood = atom({ plugin: 'clawd-minecraft', key: 'mood' } as const, 'walk')

// 9x9 sprites: `.` clear, `K` outline, any other letter a color of the icon's palette.
const ARMOR = [
  'KKK...KKK',
  'KLLK.KLLK',
  'KLLLKLLMK',
  'KLLLLLMMK',
  '.KLLLLMK.',
  '.KLLLLMK.',
  '.KLLLLMK.',
  '.KLLMMMK.',
  '..KKKKK..',
]
const HEART = [
  '..KK.KK..',
  '.KRRKRRK.',
  'KRWRRRRRK',
  'KRRRRRRDK',
  'KRRRRRRDK',
  '.KRRRRDK.',
  '..KRRDK..',
  '...KDK...',
  '....K....',
]
const FOOD = [
  '..KKKK...',
  '.KBBRRK..',
  'KBBBRRRK.',
  'KBBBBRRK.',
  'KTBBBBBK.',
  'KTTBBBK..',
  '.KKTTKWK.',
  '...KKKWWK',
  '......KKK',
]
const ARMOR_COLORS = { L: '#f4f4f4', M: '#b9b9b9' }
const HEART_COLORS = { R: '#ff1313', W: '#ffc8c8', D: '#bb1313' }
const FOOD_COLORS = { B: '#b97a45', R: '#d83a2b', T: '#8a5630', W: '#f2f2f2' }
const EMPTY = '#4b4b4b'
const XP = ['#b9f55f', '#80e01f', '#58a514']

// 5x7 glyphs in the game's font.
const FONT: Record<string, string[]> = Object.fromEntries(
  Object.entries({
    0: '.###. #...# #..## #.#.# ##..# #...# .###.',
    1: '..#.. .##.. ..#.. ..#.. ..#.. ..#.. #####',
    2: '.###. #...# ....# ..##. .#... #...# #####',
    3: '.###. #...# ....# ..##. ....# #...# .###.',
    4: '...## ..#.# .#..# #...# ##### ....# ....#',
    5: '##### #.... ####. ....# ....# #...# .###.',
    6: '..##. .#... #.... ####. #...# #...# .###.',
    7: '##### #...# ....# ...#. ..#.. ..#.. ..#..',
    8: '.###. #...# #...# .###. #...# #...# .###.',
    9: '.###. #...# #...# .#### ....# ...#. .##..',
    '%': '#...# #..#. ...#. ..#.. .#... .#..# #...#',
    '?': '.###. #...# ....# ...#. ..#.. ..... ..#..',
    '✓': '..... ..... ....# ...#. #.#.. .#... .....',
  }).map(([glyph, rows]) => [glyph, rows.split(' ')]),
)

// One path per color; a later color paints over an earlier one.
type Paint = Map<string, string>

const px = (paint: Paint, fill: string, x: number, y: number, w = 1, h = 1) =>
  paint.set(fill, `${paint.get(fill) ?? ''}M${x} ${y}h${w}v${h}h${-w}z`)

const paths = (paint: Paint) =>
  [...paint].map(([fill, d]) => `<path fill="${fill}" d="${d}"/>`).join('')

// Text in the game's font, black-edged like the level number.
const write = (paint: Paint, text: string, x0: number, y0: number, fill: string) => {
  for (const [i, glyph] of [...text].entries()) {
    FONT[glyph]?.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c !== '#') return
        const x = x0 + i * 6 + dx
        const y = y0 + dy
        px(paint, '#000', x - 1, y, 3, 1)
        px(paint, '#000', x, y - 1, 1, 3)
        px(paint, fill, x, y)
      }),
    )
  }
}

// Ten icons for `left` percent in half-icon steps, draining from the last
// drawn; `half` is the columns a half icon keeps lit.
const icons = (
  paint: Paint,
  rows: string[],
  colors: Record<string, string>,
  left: number,
  x0: number,
  step: number,
  y: number,
  half: [number, number],
) => {
  const halves = Math.round(left / 5)

  for (let i = 0; i < 10; i++) {
    const lit: [number, number] =
      halves >= 2 * i + 2 ? [0, 9] : halves === 2 * i + 1 ? half : [0, 0]

    rows.forEach((row, dy) =>
      [...row].forEach((c, dx) => {
        if (c === '.') return
        const isLit = dx >= lit[0] && dx < lit[1]
        const fill = c === 'K' ? '#000' : isLit ? (colors[c] ?? EMPTY) : EMPTY
        px(paint, fill, x0 + i * step + dx, y + dy)
      }),
    )
  }
}

// The HUD at the game's own 182x25 pixel grid; each argument is a percent
// left, or undefined for a figure with no reading, whose bar is left out.
const hud = (week?: number, session?: number, context?: number) => {
  const base: Paint = new Map()
  const top: Paint = new Map()

  if (week !== undefined) {
    icons(base, ARMOR, ARMOR_COLORS, week, 0, 8, 0, [0, 5])
    icons(base, HEART, HEART_COLORS, week, 0, 8, 10, [0, 5])
  }

  if (context !== undefined) {
    icons(base, FOOD, FOOD_COLORS, context, 173, -8, 10, [4, 9])
  }

  if (session !== undefined) {
    px(base, '#000', 0, 20, 182, 5)
    px(base, '#333', 1, 21, 180, 3)
    const filled = Math.round(session * 1.8)
    if (filled > 0) XP.forEach((fill, i) => px(base, fill, 1, 21 + i, filled))
    for (let x = 10; x < 180; x += 10) px(base, 'rgba(0,0,0,.5)', x, 21, 1, 3)

    const text = `${session}%`
    write(top, text, Math.round((182 - (text.length * 6 - 1)) / 2), 14, '#80ff20')
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 182 25" width="364" height="50" shape-rendering="crispEdges">${paths(base)}${paths(top)}</svg>`
}

const LOOP = 'repeatCount="indefinite"'
const STEPPED = 'calcMode="discrete"'
const JUMP = 'calcMode="spline" keyTimes="0;.5;1" keySplines="0 0 .4 1;.6 0 1 1"'

const animate = (attribute: string, values: string, dur: string, pace = STEPPED) =>
  `<animate attributeName="${attribute}" values="${values}" dur="${dur}" ${pace} ${LOOP}/>`

const move = (values: string, dur: string, pace = STEPPED) =>
  `<animateTransform attributeName="transform" type="translate" values="${values}" dur="${dur}" ${pace} ${LOOP}/>`

const BODY = '#d77757'
const EYE = '#141414'

const EDGE = '#5b2c1e'

// A block of Clawd: his orange, lit along the top and left, shaded along the
// bottom and right.
const block = (x: number, y: number, w: number, h: number) => {
  const paint: Paint = new Map()
  px(paint, BODY, x, y, w, h)
  px(paint, '#eb9d7e', x, y, w, 1)
  px(paint, '#eb9d7e', x, y, 1, h)
  px(paint, '#b65f43', x + w - 1, y, 1, h)
  px(paint, '#b65f43', x, y + h - 1, w, 1)

  return paths(paint)
}

// The grain of his hide, as the game's blocks have one.
const GRAIN = `<path fill="#e2896a" d="M12 2h1v1h-1zM19 10h1v1h-1zM26 12h1v1h-1zM7 11h1v1h-1z"/><path fill="#c8684b" d="M15 6h1v1h-1zM21 3h1v1h-1zM10 13h1v1h-1zM27 8h1v1h-1zM17 12h1v1h-1z"/>`

const marks = (text: string, fill: string) => {
  const paint: Paint = new Map()
  write(paint, text, 36, -4, fill)

  return paths(paint)
}

// Clawd at twice the grid Claude Code draws him on (13x8 body, 2x2 arms,
// four legs), in the HUD's own 2px pixels. He is drawn in a frame as wide as
// the band has left, so CSS places him by the frame's width (`vw`) and SMIL
// moves his parts: nothing redraws while he walks. `width` is that frame's
// cap; the frame's page is painted the band's dark so it shows no white.
const clawd = (now: Mood, width: number) => {
  const isWalking = now === 'walk'
  const lap = Math.max(8, Math.round((width - 80) / 14))
  const css = `:root{color-scheme:light dark;overflow:hidden}body{margin:0;overflow:hidden}svg{width:100vw}@media(prefers-color-scheme:dark){:root,body{background:#212121}}.w{animation:w ${lap}s linear infinite}.g{animation:g ${lap}s step-end infinite}.c{transform:translateX(calc(50vw - 34px))}@keyframes w{0%,100%{transform:translateX(6px)}50%{transform:translateX(calc(100vw - 74px))}}@keyframes g{0%{transform:translateX(2px)}50%{transform:translateX(-2px)}}`

  // Each part carries its dark edge on the sides the body does not cover.
  const leg = (x: number, fill: string, values: string) => {
    const edge = values.split(';').map(tall => Number(tall) + 1).join(';')

    return `<rect x="${x - 1}" y="15" width="4" height="6" fill="${EDGE}">${isWalking ? animate('height', edge, '.44s') : ''}</rect><rect x="${x}" y="15" width="2" height="5" fill="${fill}">${isWalking ? animate('height', values, '.44s') : ''}</rect>`
  }
  const arm = (x: number, edge: number, motion: string) =>
    `<g${now === 'done' ? ' transform="translate(0 -5)"' : ''}>${motion}<rect x="${edge}" y="7" width="5" height="6" fill="${EDGE}"/>${block(x, 8, 4, 4)}</g>`
  const swing: Record<Mood, [string, string]> = {
    walk: ['0 0;0 1', '0 1;0 0'],
    ask: ['0 0', '0 0;0 -5'],
    done: ['0 0', '0 0'],
  }
  const [left, right] = swing[now]
  const eyes =
    now === 'done'
      ? `<path fill="${EYE}" d="M8 5h2v1h-2zM7 6h1v1h-1zM10 6h1v1h-1zM24 5h2v1h-2zM23 6h1v1h-1zM26 6h1v1h-1z"/>`
      : `<g${isWalking ? ' class="g"' : ''}><path fill="${EYE}" d="M8 4h2v4h-2zM24 4h2v4h-2z"/><path fill="#fff" d="M8 4h1v1h-1zM24 4h1v1h-1z"/><path fill="${BODY}" opacity="0" d="M8 4h2v3h-2zM24 4h2v3h-2z"><animate attributeName="opacity" values="0;1" keyTimes="0;.97" dur="4s" ${STEPPED} ${LOOP}/></path></g>`
  const shadow = `<rect x="5" y="20" width="24" height="1" opacity=".3">${now === 'done' ? animate('x', '5;9;5', '.56s', JUMP) + animate('width', '24;16;24', '.56s', JUMP) : ''}</rect>`
  const beside = {
    walk: '',
    ask: `<g>${move('0 0;0 1', '.5s')}${marks('?', '#ffff55')}</g>`,
    done: `${marks('✓', '#55ff55')}<g fill="#ffe95c"><rect x="-4" y="2" width="1" height="1">${animate('opacity', '1;0', '.4s')}</rect><rect x="-2" y="12" width="1" height="1">${animate('opacity', '0;1', '.4s')}</rect><rect x="43" y="9" width="1" height="1">${animate('opacity', '1;0', '.6s')}</rect></g>`,
  }[now]

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="50" shape-rendering="crispEdges"><style>${css}</style><g class="${isWalking ? 'w' : 'c'}"><g transform="scale(2)"><g transform="translate(0 4)">${shadow}<g>${now === 'done' ? move('0 0;0 -4;0 0', '.56s', JUMP) : ''}${leg(8, '#9c4f37', '3;5')}${leg(24, '#9c4f37', '5;3')}${leg(4, BODY, '5;3')}${leg(28, BODY, '3;5')}<g>${isWalking ? move('0 0;0 -1', '.22s') : ''}<rect x="3" y="-1" width="28" height="18" fill="${EDGE}"/>${block(4, 0, 26, 16)}${GRAIN}${arm(0, -1, move(left, '.44s'))}${arm(30, 30, move(right, now === 'ask' ? '.36s' : '.44s'))}${eyes}</g></g>${beside}</g></g></g></svg>`
}

// Clawd's mood is read off two facts, so events that overlap cannot leave it
// wrong: how many questions are waiting, and the timer that ends a cheer.
let asking = 0
let cheer: Timer | undefined

const settle = ($: EngineInterface) =>
  update($, mood, () => (asking > 0 ? 'ask' : cheer === undefined ? 'walk' : 'done'))

export const register: Register = on => {
  // A reload drops both facts, so start over from them.
  on('session.start', async ($, e, next) => {
    await settle($)

    return next(e)
  })

  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    asking += 1
    await settle($)

    try {
      return await next(e)
    } finally {
      asking -= 1
      await settle($)
    }
  })

  // Only the main thread's own answered turn is cheered: not an error, a
  // refusal, an interrupt or a subagent's turn. Each cheer runs its full time.
  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      cheer?.cancel()
      cheer =
        e.reason === 'answer'
          ? $.clock.after(4000, () => {
              cheer = undefined
              void settle($)
            })
          : undefined
      await settle($)
    }

    return next(e)
  })

  on('session.measure', ($, e, next) => {
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.surface !== 'desktop' || e.props.hasSurvey) {
      return next(e)
    }

    const { context, rateLimits } = await $.session.usage()

    if (rateLimits.length === 0) {
      return next(e)
    }

    const time = await $.clock.now()
    // What a window has left: nothing to say without a reading, all of it once
    // its reset time has passed, never below zero.
    const left = (kind: string) => {
      const one = rateLimits.find(limit => limit.kind === kind)

      if (one === undefined) {
        return undefined
      }

      if (one.resetsAt !== undefined && Date.parse(one.resetsAt) <= time) {
        return 100
      }

      return Math.min(100, Math.max(0, Math.round(100 - one.percentUsed)))
    }
    const week = left('seven_day')
    const session = left('five_hour')
    const room = context.percent === undefined ? undefined : 100 - context.percent
    const figures = [
      week !== undefined && `7d ${week}% left`,
      session !== undefined && `5h ${session}% left`,
      room !== undefined && `context ${room}% left`,
    ]
    const now = await read($, mood)
    // What the band has left beside the HUD, guessed from its cells: only the
    // cap on Clawd's frame, which the surface fits to the room it really has.
    const spare = Math.max(120, Math.round(e.props.bodyColumns * 8) - 364)
    const { Box, Svg } = $.ui.resolve(e)

    return (
      <Box>
        <Box flexShrink={0}>
          <Svg
            source={hud(week, session, room)}
            alt={figures.filter(Boolean).join(', ')}
            width={364}
            height={50}
          />
        </Box>
        <Box flexGrow={1} minWidth={0} overflow="hidden">
          <Svg source={clawd(now, spare)} alt={`Clawd: ${now}`} height={50} isInteractive />
        </Box>
      </Box>
    )
  })
}
