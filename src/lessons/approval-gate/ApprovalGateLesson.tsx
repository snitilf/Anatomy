/* oxlint-disable react/refs -- callback refs hand ref lists to the static art, they are not read while rendering */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Plate } from '../kit/react/draw'
import { spring, type Spring } from '../kit/react/live'
import { Base, CardBody, CardTab, Deck, DeckFront, GateArch, LedgerArch, LockArch, PusherArt, Stack, Switch } from './art'
import { useTheme } from '../../theme/theme'
import './lesson.css'
import { HEIGHT, LIFT, SHUTTER_LIFT, SLOTS, SWITCH_TRAVEL, TAB_TIP, TRAVEL_END, WIDTH, shift } from './geometry'
import { MAX_VERSION, canEdit, caption, initialState, readout, step as stepModel, type LessonEvent, type LessonState } from './model'
import { litOf, reachOf, stopOf, tabLayerOf, targetsOf } from './scene'
import { REACH_GATE, REACH_LEDGER, REACH_LOCK } from './geometry'

const STILL = '(prefers-reduced-motion: reduce)'
const TAB_LAYERS = [0, 1, 2, 3] as const

const hasMedia = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function'
const stillNow = () => hasMedia() && window.matchMedia(STILL).matches

/** Writes an attribute only when it changes, so a frame that moves nothing touches nothing. */
function put(node: Element | null | undefined, name: string, value: string) {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value)
}

function stopName(card: number, alpha: number): string {
  if (alpha < 0.05) return 'moving'
  const near = (to: number) => Math.abs(card - to) < 0.75
  if (near(0)) return 'home'
  if (near(REACH_LOCK)) return 'lockout'
  if (near(REACH_GATE)) return 'gate'
  if (near(REACH_LEDGER)) return 'ledger'
  if (near(TRAVEL_END)) return 'outbox'
  return 'moving'
}

function useVisible(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const node = ref.current
    if (!node || typeof IntersectionObserver === 'undefined') return
    const watcher = new IntersectionObserver((entries) => setVisible(Boolean(entries.at(-1)?.isIntersecting)), { rootMargin: '120px 0px' })
    watcher.observe(node)
    return () => watcher.disconnect()
  }, [ref])
  return visible
}

/** One frame loop. It runs only while the figure is on screen and something is still moving. */
function useFrameLoop(tick: (dt: number, calm: boolean) => boolean, running: boolean) {
  const latest = useRef(tick)
  const frame = useRef(0)
  const last = useRef(0)
  useEffect(() => {
    latest.current = tick
  })
  const kick = useCallback(() => {
    if (frame.current || typeof requestAnimationFrame !== 'function') return
    last.current = 0
    const run = (now: number) => {
      const dt = last.current ? Math.min((now - last.current) / 1000, 1 / 30) : 1 / 60
      last.current = now
      frame.current = latest.current(dt, stillNow()) ? requestAnimationFrame(run) : 0
    }
    frame.current = requestAnimationFrame(run)
  }, [])
  useEffect(() => {
    if (running) kick()
    return () => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame.current)
      frame.current = 0
    }
  }, [running, kick])
  return kick
}

interface Step {
  /** Seconds since the previous step ran. */
  wait?: number
  until?: () => boolean
  run: () => void
}

interface Motion {
  card: Spring
  push: Spring
  alpha: Spring
  power: Spring
  lock: Spring
  keyLift: Spring
  keyAlpha: Spring
  fingers: Spring[]
  pins: Spring[]
  goal: { card: number; push: number; alpha: number; power: number; keyLift: number; keyAlpha: number }
  script: Step[]
  since: number
}

const rest = (at = 0): Spring => ({ at, rate: 0 })

function initialMotion(): Motion {
  return {
    card: rest(),
    push: rest(),
    alpha: rest(1),
    power: rest(1),
    lock: rest(),
    keyLift: rest(),
    keyAlpha: rest(),
    fingers: Array.from({ length: SLOTS }, () => rest()),
    pins: Array.from({ length: SLOTS }, () => rest()),
    goal: { card: 0, push: 0, alpha: 1, power: 1, keyLift: 0, keyAlpha: 0 },
    script: [],
    since: 0,
  }
}

interface Visual {
  /** The version stamped on the card that sits in the carrier. */
  cardVersion: number
  /** Versions whose card has reached the outbox. The ledger pins follow this list. */
  delivered: readonly number[]
  /** The version the key on the gate is cut for. It stays while the key fades out. */
  keyVersion: number | null
}

const LABEL =
  'A dispatch press seen from above and to one side. A message card stamped with a version number sits in a carrier. A pusher behind it slides the card past three arches: a lockout bar, a gate of eight fingers lifted by a key, and a ledger of eight pins. Delivered cards pile up in the outbox.'

const KEYS: Record<string, LessonEvent> = { a: 'approve', r: 'reject', e: 'edit', s: 'trySend', p: 'restart', '0': 'reset' }

export default function ApprovalGateLesson() {
  const dark = useTheme() === 'dark'
  const [state, setState] = useState<LessonState>(initialState)
  const [visual, setVisual] = useState<Visual>({ cardVersion: 1, delivered: [], keyVersion: null })
  const [announcement, setAnnouncement] = useState('')
  const stateRef = useRef(state)
  const visualRef = useRef(visual)
  const motion = useRef<Motion>(initialMotion())
  const stage = useRef<HTMLDivElement>(null)
  const visible = useVisible(stage)

  const cardRef = useRef<SVGGElement | null>(null)
  const pushRef = useRef<SVGGElement | null>(null)
  const tabRefs = useRef<Array<SVGGElement | null>>([null, null, null, null])
  const fingerRefs = useRef<Array<SVGGElement | null>>([])
  const pinRefs = useRef<Array<SVGGElement | null>>([])
  const shutterRef = useRef<SVGGElement | null>(null)
  const keyRef = useRef<SVGGElement | null>(null)
  const knobRef = useRef<SVGGElement | null>(null)
  const lampRef = useRef<SVGGElement | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const announceTimer = useRef(0)

  const setVis = useCallback((next: Visual) => {
    visualRef.current = next
    setVisual(next)
  }, [])

  /** Writes every moving part from the motion state. No React render per frame. */
  const write = useCallback(() => {
    const m = motion.current
    const alpha = String(Math.max(0, Math.min(1, m.alpha.at)))
    const shown = m.alpha.at > 0.005
    const card = cardRef.current
    if (card) {
      card.setAttribute('transform', shift(m.card.at))
      card.setAttribute('opacity', alpha)
      put(card, 'data-stop', stopName(m.card.at, m.alpha.at))
      if (shown) card.removeAttribute('display')
      else card.setAttribute('display', 'none')
    }
    pushRef.current?.setAttribute('transform', shift(m.push.at))
    const tabLayer = tabLayerOf(TAB_TIP + m.card.at)
    for (const l of TAB_LAYERS) {
      const tab = tabRefs.current[l]
      if (!tab) continue
      tab.setAttribute('transform', shift(m.card.at))
      tab.setAttribute('opacity', alpha)
      if (l === tabLayer && shown) tab.removeAttribute('display')
      else tab.setAttribute('display', 'none')
    }
    for (let i = 0; i < SLOTS; i++) {
      const finger = fingerRefs.current[i]
      finger?.setAttribute('transform', shift(0, 0, LIFT * (m.fingers[i]?.at ?? 0)))
      put(finger, 'data-pose', (m.fingers[i]?.at ?? 0) > 0.5 ? 'up' : 'down')
      const pin = pinRefs.current[i]
      pin?.setAttribute('transform', shift(0, 0, LIFT * (1 - (m.pins[i]?.at ?? 0))))
      put(pin, 'data-pose', (m.pins[i]?.at ?? 0) > 0.5 ? 'down' : 'up')
    }
    shutterRef.current?.setAttribute('transform', shift(0, 0, SHUTTER_LIFT * (1 - m.lock.at)))
    put(shutterRef.current, 'data-pose', m.lock.at > 0.5 ? 'down' : 'up')
    keyRef.current?.setAttribute('transform', shift(0, 0, 18 * m.keyLift.at))
    keyRef.current?.setAttribute('opacity', String(Math.max(0, Math.min(1, m.keyAlpha.at))))
    put(keyRef.current, 'data-pose', m.keyAlpha.at > 0.5 ? 'shown' : 'hidden')
    knobRef.current?.setAttribute('transform', shift(-SWITCH_TRAVEL * (1 - m.power.at)))
    lampRef.current?.setAttribute('opacity', String(Math.max(0, Math.min(1, m.power.at))))
  }, [])

  const advance = useCallback((everything: boolean) => {
    const m = motion.current
    while (m.script.length > 0) {
      const next = m.script[0]
      if (!next) break
      const ready = everything || ((next.wait === undefined || m.since >= next.wait) && (!next.until || next.until()))
      if (!ready) break
      m.script.shift()
      m.since = 0
      next.run()
    }
  }, [])

  const tick = useCallback(
    (dt: number, calm: boolean) => {
      const m = motion.current
      m.since += dt
      advance(calm)
      const t = targetsOf(stateRef.current, visualRef.current.delivered)
      let moving = m.script.length > 0
      const go = (sp: Spring, target: number, stiffness: number) => {
        if (calm) {
          sp.at = target
          sp.rate = 0
          return
        }
        if (!spring(sp, target, dt, stiffness, 2 * Math.sqrt(stiffness))) moving = true
      }
      go(m.card, m.goal.card, 26)
      go(m.push, m.goal.push, 26)
      go(m.alpha, m.goal.alpha, 90)
      go(m.power, m.goal.power, 70)
      go(m.lock, t.lockout, 60)
      go(m.keyLift, m.goal.keyLift, 80)
      go(m.keyAlpha, m.goal.keyAlpha, 90)
      t.fingers.forEach((target, i) => {
        const sp = m.fingers[i]
        if (sp) go(sp, target, 80)
      })
      t.pins.forEach((target, i) => {
        const sp = m.pins[i]
        if (sp) go(sp, target, 110)
      })
      write()
      put(root.current, 'data-settled', moving ? 'false' : 'true')
      return moving
    },
    [advance, write],
  )

  const kick = useFrameLoop(tick, visible)

  // Paint the resting pose before the first frame, and again after every render.
  useLayoutEffect(() => {
    write()
  })
  useLayoutEffect(() => {
    // The first render shows the pose for the initial state without easing.
    const m = motion.current
    const t = targetsOf(initialState, [])
    t.fingers.forEach((v, i) => {
      const sp = m.fingers[i]
      if (sp) sp.at = v
    })
    write()
  }, [write])

  const snap = useCallback(() => {
    const m = motion.current
    m.card.at = m.goal.card
    m.push.at = m.goal.push
    m.alpha.at = m.goal.alpha
    m.power.at = m.goal.power
    for (const sp of [m.card, m.push, m.alpha, m.power]) sp.rate = 0
  }, [])

  /** Finishes whatever the press is doing so the next event starts from a settled pose. */
  const flush = useCallback(() => {
    advance(true)
    snap()
  }, [advance, snap])

  const near = (sp: Spring, target: number) => Math.abs(sp.at - target) < 0.6

  const plan = useCallback(
    (event: LessonEvent, before: LessonState, next: LessonState) => {
      const m = motion.current
      const g = m.goal
      if (event === 'approve' || event === 'reject') {
        if (next.approvedVersion !== null) {
          if (next.approvedVersion !== before.approvedVersion || m.keyAlpha.at < 0.5) {
            m.keyLift.at = 1
            m.keyAlpha.at = 0
          }
          g.keyLift = 0
          g.keyAlpha = 1
          setVis({ ...visualRef.current, keyVersion: next.approvedVersion })
        } else {
          g.keyLift = 1
          g.keyAlpha = 0
        }
      }
      if (event === 'edit') {
        m.script.push(
          { run: () => void (g.alpha = 0) },
          {
            until: () => m.alpha.at < 0.05,
            run: () => {
              setVis({ ...visualRef.current, cardVersion: next.version })
              g.alpha = 1
            },
          },
        )
      }
      if (event === 'trySend') {
        const stop = stopOf(next.lastOutcome)
        if (stop === 'end') {
          m.script.push(
            {
              run: () => {
                g.card = TRAVEL_END
                g.push = TRAVEL_END
              },
            },
            {
              until: () => near(m.card, TRAVEL_END),
              run: () => {
                // The card reaches the outbox. A fresh copy of the same card feeds in behind the pusher.
                m.card.at = 0
                m.card.rate = 0
                g.card = 0
                m.alpha.at = 0
                g.alpha = 0
                g.push = 0
                const delivered = [...visualRef.current.delivered, next.version]
                setVis({ ...visualRef.current, delivered })
              },
            },
            { wait: 0.6, run: () => void (g.alpha = 1) },
          )
        } else if (stop) {
          const reach = reachOf(stop)
          m.script.push(
            {
              run: () => {
                g.card = reach
                g.push = reach
              },
            },
            { until: () => near(m.card, reach), run: () => {} },
            {
              wait: 0.45,
              run: () => {
                g.card = 0
                g.push = 0
              },
            },
          )
        }
      }
      if (event === 'restart') {
        m.script.push({ run: () => void (g.power = 0) }, { wait: 0.8, run: () => void (g.power = 1) })
      }
      if (event === 'reset') {
        m.card.at = 0
        m.push.at = 0
        g.card = 0
        g.push = 0
        m.alpha.at = 0
        g.alpha = 1
        g.keyLift = 1
        g.keyAlpha = 0
        setVis({ cardVersion: 1, delivered: [], keyVersion: null })
      }
    },
    [setVis],
  )

  const dispatch = useCallback(
    (event: LessonEvent) => {
      const before = stateRef.current
      if (event === 'edit' && !canEdit(before)) return
      flush()
      const next = stepModel(before, event)
      stateRef.current = next
      setState(next)
      plan(event, before, next)
      const text = caption(next)
      window.clearTimeout(announceTimer.current)
      setAnnouncement('')
      announceTimer.current = window.setTimeout(() => setAnnouncement(text), 60)
      put(root.current, 'data-settled', 'false')
      kick()
    },
    [flush, plan, kick],
  )

  useEffect(() => () => window.clearTimeout(announceTimer.current), [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    const action = KEYS[event.key.toLowerCase()]
    if (!action) return
    event.preventDefault()
    dispatch(action)
  }

  const lit = litOf(state)
  const litFinger = lit.kind === 'finger' ? lit.version : null
  const litPin = lit.kind === 'pin' ? lit.version : null
  const setFinger = useCallback((version: number, node: SVGGElement | null) => void (fingerRefs.current[version - 1] = node), [])
  const setPin = useCallback((version: number, node: SVGGElement | null) => void (pinRefs.current[version - 1] = node), [])
  const setKey = useCallback((node: SVGGElement | null) => void (keyRef.current = node), [])
  const setTab = (layer: number) => (node: SVGGElement | null) => {
    tabRefs.current[layer] = node
  }
  const tabLayer = (layer: number) => (
    <g key={`tab-${layer}`} ref={setTab(layer)} data-part="tab" data-layer={layer}>
      <CardTab version={visual.cardVersion} lit={lit.kind === 'tab'} />
    </g>
  )

  return (
    <div ref={root} className="iso ag" data-settled="true" data-theme={dark ? 'dark' : 'light'} tabIndex={0} role="group" aria-label="Approval gate lesson" aria-keyshortcuts="A R E S P 0" onKeyDown={onKeyDown}>
      <Plate
        fig="Fig 1"
        title="Approval gate"
        hint="Keys: A approve · R reject · E edit · S send"
        readout={readout(state)}
        keys={[{ mark: 'lit', label: 'The lit part shows why' }]}
        caption={caption(state)}
      >
        <div className="iso-stage" ref={stage}>
          <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${LABEL} ${readout(state)}.`} focusable="false">
            <Base />
            <Deck />
            <g ref={cardRef} data-part="card" data-stop="home" data-version={visual.cardVersion}>
              <CardBody version={visual.cardVersion} />
            </g>
            <g ref={pushRef} data-part="pusher">
              <PusherArt />
            </g>
            <Stack delivered={visual.delivered} />
            {tabLayer(3)}
            <LedgerArch pinRef={setPin} dropped={visual.delivered} litVersion={litPin} />
            {tabLayer(2)}
            <GateArch fingerRef={setFinger} keyRef={setKey} keyVersion={visual.keyVersion} litVersion={litFinger} />
            {tabLayer(1)}
            <LockArch shutterRef={shutterRef} lit={lit.kind === 'shutter'} />
            {tabLayer(0)}
            <DeckFront />
            <Switch knobRef={knobRef} lampRef={lampRef} lamp={lit.kind === 'lamp'} />
          </svg>
        </div>
      </Plate>

      <div className="ag-controls" role="group" aria-label="Controls">
        <button type="button" onClick={() => dispatch('approve')} aria-keyshortcuts="A">
          Approve <kbd>A</kbd>
        </button>
        <button type="button" onClick={() => dispatch('reject')} aria-keyshortcuts="R">
          Reject <kbd>R</kbd>
        </button>
        <button type="button" onClick={() => dispatch('edit')} disabled={!canEdit(state)} aria-keyshortcuts="E" title={canEdit(state) ? undefined : `The press holds ${MAX_VERSION} versions`}>
          Edit message <kbd>E</kbd>
        </button>
        <button type="button" data-primary onClick={() => dispatch('trySend')} aria-keyshortcuts="S">
          Send <kbd>S</kbd>
        </button>
        <span className="ag-spacer" />
        <button type="button" onClick={() => dispatch('restart')} aria-keyshortcuts="P">
          Restart app <kbd>P</kbd>
        </button>
        <button type="button" onClick={() => dispatch('reset')} aria-keyshortcuts="0">
          Reset lesson <kbd>0</kbd>
        </button>
      </div>

      <div className="ag-sr" role="status" aria-live="polite">
        {announcement}
      </div>

      <section className="ag-notes" aria-label="About this model">
        <div>
          <dl className="ag-map">
            <div>
              <dt>
                The gate
                <span>equals approval</span>
              </dt>
              <dd>A key is cut for one version and lifts only that version&apos;s finger. Edit the message and the new card needs a new key.</dd>
            </div>
            <div>
              <dt>
                The card in the carrier
                <span>equals the exact action version</span>
              </dt>
              <dd>The tab and the stamp name one version. A different version is a different card.</dd>
            </div>
            <div>
              <dt>
                The ledger pins
                <span>equal remembered completion</span>
              </dt>
              <dd>A pin drops when a version goes out and stays down after a restart. That version cannot go out again.</dd>
            </div>
          </dl>
        </div>
        <div>
          <h2>Where the analogy stops</h2>
          <p>This is a drawing of a rule. It does not show that any real app follows the rule.</p>
        </div>
      </section>
    </div>
  )
}
