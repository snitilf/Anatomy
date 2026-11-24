/* oxlint-disable react/refs -- callback refs hand ref lists to the static art, they are not read while rendering */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react'
import { Plate } from '../kit/react/draw'
import { useStillness } from '../kit/react/live'
import { Base, CardBody, CardTab, Deck, DeckFront, GateArch, LedgerArch, LockArch, Outbox, PusherArt, Switch } from './art'
import { useTheme } from '../../theme/theme'
import './lesson.css'
import { HEIGHT, LIFT, PITCH, REACH_GATE, REACH_LEDGER, REACH_LOCK, SHUTTER_LIFT, SLOTS, SWITCH_TRAVEL, TAB_TIP, TRAVEL_END, WIDTH, shift } from './geometry'
import { MAX_VERSION, canEdit, caption, initialState, readout, step as stepModel, type LessonEvent, type LessonState } from './model'
import { fingerOf, keyAlphaOf, keyLiftOf, pinOf, planRun, poseAt, restPose, shownAfter, type Pose, type Run } from './motion'
import { litOf, tabLayerOf } from './scene'

const TAB_LAYERS = [0, 1, 2, 3] as const
/** How far above its finger a key hangs before it drops, in world units. */
const KEY_DROP = 12

/** Writes an attribute only when it changes, so a frame that moves nothing touches nothing. */
function put(node: Element | null | undefined, name: string, value: string) {
  if (node && node.getAttribute(name) !== value) node.setAttribute(name, value)
}

const clamp01 = (value: number) => String(Math.max(0, Math.min(1, value)))

function stopName(card: number, alpha: number): string {
  if (alpha < 0.05) return 'moving'
  const near = (to: number) => Math.abs(card - to) < 0.75
  if (near(0)) return 'home'
  if (near(REACH_LOCK)) return 'lockout'
  if (near(REACH_GATE)) return 'gate'
  if (near(REACH_LEDGER)) return 'ledger'
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

/** One frame loop. It runs only while the figure is on screen, and the tick says whether it has more to do. */
function useFrameLoop(tick: (now: number) => boolean, running: boolean) {
  const latest = useRef(tick)
  const frame = useRef(0)
  useEffect(() => {
    latest.current = tick
  })
  const kick = useCallback(() => {
    if (frame.current || typeof requestAnimationFrame !== 'function') return
    const run = (now: number) => {
      frame.current = latest.current(now) ? requestAnimationFrame(run) : 0
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

interface Engine {
  /** The pose on screen now. A new run starts from it, so nothing snaps. */
  pose: Pose
  run: Run | null
  /** How many beats of the run have fired. */
  fired: number
  /** The frame time the run started at. Null until its first frame. */
  startedAt: number | null
}

/** The polite live region. It clears and sets again, so a repeated outcome is read out again. */
function Announcer({ text, count }: { text: string; count: number }) {
  const region = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const node = region.current
    if (!node) return
    node.textContent = ''
    if (count === 0) return
    const timer = window.setTimeout(() => void (node.textContent = text), 60)
    return () => window.clearTimeout(timer)
  }, [text, count])
  return <div ref={region} className="ag-sr" role="status" aria-live="polite" />
}

const LABEL =
  'A dispatch press seen from above and to one side. A message card stamped with a version number sits in a carrier. A pusher behind it slides the card past three arches: a lockout bar, a gate of eight fingers lifted by a key, and a ledger of eight pins. The last delivered card waits in the outbox.'

const KEYS: Record<string, LessonEvent> = { a: 'approve', r: 'reject', e: 'edit', s: 'trySend', p: 'restart', '0': 'reset' }

export default function ApprovalGateLesson() {
  const dark = useTheme() === 'dark'
  const still = useStillness()
  const stillRef = useRef(still)
  /** What the model says now. It enables the buttons and feeds the next event. */
  const [state, setState] = useState<LessonState>(initialState)
  /** What the picture has shown so far. The words, the readout and the lit part follow it, so they never run ahead of the picture. */
  const [shown, setShown] = useState<LessonState>(initialState)
  const [commits, setCommits] = useState(0)
  const stateRef = useRef(state)
  const shownRef = useRef(shown)
  const engine = useRef<Engine>({ pose: restPose(initialState, 'home'), run: null, fired: 0, startedAt: null })
  const stage = useRef<HTMLDivElement>(null)
  const visible = useVisible(stage)

  const root = useRef<HTMLDivElement>(null)
  const cardRef = useRef<SVGGElement | null>(null)
  const pushRef = useRef<SVGGElement | null>(null)
  const tabRefs = useRef<Array<SVGGElement | null>>([null, null, null, null])
  const cardStamps = useRef<Array<SVGGElement | null>>([])
  const outboxRef = useRef<SVGGElement | null>(null)
  const outboxTabRef = useRef<SVGGElement | null>(null)
  const outboxStamps = useRef<Array<SVGGElement | null>>([])
  const fingerRefs = useRef<Array<SVGGElement | null>>([])
  const pinRefs = useRef<Array<SVGGElement | null>>([])
  const keyRefs = useRef<Array<SVGGElement | null>>([])
  const shutterRef = useRef<SVGGElement | null>(null)
  const knobRef = useRef<SVGGElement | null>(null)
  const lampRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    stillRef.current = still
  }, [still])

  /** Writes every moving part from a pose. No React render per frame. */
  const write = useCallback((p: Pose) => {
    const drawn = p.cardAlpha > 0.005
    const alpha = clamp01(p.cardAlpha)
    const version = Math.round(p.cardVersion)
    const card = cardRef.current
    if (card) {
      put(card, 'transform', shift(p.card))
      put(card, 'opacity', alpha)
      put(card, 'data-stop', stopName(p.card, p.cardAlpha))
      put(card, 'data-version', String(version))
      put(card, 'display', drawn ? 'inline' : 'none')
    }
    cardStamps.current.forEach((node, i) => {
      put(node, 'display', i + 1 === version ? 'inline' : 'none')
      put(node, 'opacity', clamp01(p.stampAlpha))
    })
    put(pushRef.current, 'transform', shift(p.push))
    const layer = tabLayerOf(TAB_TIP + p.card)
    const slide = shift(p.card, (p.tabSlot - 1) * PITCH)
    for (const l of TAB_LAYERS) {
      const tab = tabRefs.current[l]
      put(tab, 'transform', slide)
      put(tab, 'opacity', alpha)
      put(tab, 'display', l === layer && drawn ? 'inline' : 'none')
    }

    const outbox = outboxRef.current
    const outVersion = Math.round(p.outboxVersion)
    if (outbox) {
      put(outbox, 'transform', shift(TRAVEL_END, 0, -p.outboxDrop))
      put(outbox, 'opacity', clamp01(p.outboxAlpha))
      put(outbox, 'data-version', String(outVersion))
      put(outbox, 'display', p.outboxAlpha > 0.005 ? 'inline' : 'none')
    }
    put(outboxTabRef.current, 'transform', shift(0, (Math.max(outVersion, 1) - 1) * PITCH))
    outboxStamps.current.forEach((node, i) => put(node, 'display', i + 1 === outVersion ? 'inline' : 'none'))

    for (let v = 1; v <= SLOTS; v++) {
      const finger = fingerRefs.current[v - 1]
      const up = p[fingerOf(v)]
      put(finger, 'transform', shift(v === version ? p.bumpFinger : 0, 0, LIFT * up))
      put(finger, 'data-pose', up > 0.5 ? 'up' : 'down')
      const pin = pinRefs.current[v - 1]
      const down = p[pinOf(v)]
      put(pin, 'transform', shift(v === version ? p.bumpPin : 0, 0, LIFT * (1 - down)))
      put(pin, 'data-pose', down > 0.5 ? 'down' : 'up')
      const key = keyRefs.current[v - 1]
      const keyAlpha = p[keyAlphaOf(v)]
      put(key, 'transform', shift(0, 0, KEY_DROP * p[keyLiftOf(v)]))
      put(key, 'opacity', clamp01(keyAlpha))
      put(key, 'display', keyAlpha > 0.005 ? 'inline' : 'none')
      put(key, 'data-pose', keyAlpha > 0.5 ? 'shown' : 'hidden')
    }
    const shutter = shutterRef.current
    put(shutter, 'transform', shift(p.bumpLock, 0, SHUTTER_LIFT * (1 - p.shutter)))
    put(shutter, 'data-pose', p.shutter > 0.5 ? 'down' : 'up')
    put(knobRef.current, 'transform', shift(-SWITCH_TRAVEL * (1 - p.power)))
    put(lampRef.current, 'opacity', clamp01(p.power))
  }, [])

  /** Fires the beats of the running run that are due by `upTo` ms, or every one that is left. */
  const fire = useCallback((upTo: number) => {
    const e = engine.current
    const run = e.run
    if (!run) return
    const due = run.beats.slice(e.fired).filter((beat) => beat.at <= upTo)
    if (due.length === 0) return
    e.fired += due.length
    const next = shownAfter(shownRef.current, run, due)
    if (next !== shownRef.current) {
      shownRef.current = next
      setShown(next)
      setCommits((n) => n + 1)
    }
  }, [])

  const tick = useCallback(
    (now: number) => {
      const e = engine.current
      const run = e.run
      if (!run) return false
      e.startedAt ??= now
      const t = now - e.startedAt
      fire(t)
      e.pose = poseAt(run, t)
      write(e.pose)
      if (t < run.duration) return true
      fire(Infinity)
      e.run = null
      put(root.current, 'data-settled', 'true')
      return false
    },
    [write, fire],
  )

  const kick = useFrameLoop(tick, visible)

  // Paint the resting pose before the first frame, and again after every render.
  useLayoutEffect(() => {
    write(engine.current.pose)
  })

  const dispatch = useCallback(
    (event: LessonEvent) => {
      const before = stateRef.current
      if (event === 'edit' && !canEdit(before)) return
      // Whatever the running run still has to say is said now, so the words catch up with the model before the next event starts.
      fire(Infinity)
      const next = stepModel(before, event)
      stateRef.current = next
      setState(next)
      const e = engine.current
      e.run = planRun(event, before, next, e.pose, stillRef.current)
      e.fired = 0
      e.startedAt = null
      put(root.current, 'data-settled', 'false')
      kick()
    },
    [kick, fire],
  )

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return
    const action = KEYS[event.key.toLowerCase()]
    if (!action) return
    event.preventDefault()
    dispatch(action)
  }

  const lit = litOf(shown)
  const litFinger = lit.kind === 'finger' ? lit.version : null
  const litPin = lit.kind === 'pin' ? lit.version : null
  const setFinger = useCallback((version: number, node: SVGGElement | null) => void (fingerRefs.current[version - 1] = node), [])
  const setPin = useCallback((version: number, node: SVGGElement | null) => void (pinRefs.current[version - 1] = node), [])
  const setKey = useCallback((version: number, node: SVGGElement | null) => void (keyRefs.current[version - 1] = node), [])
  const setCardStamp = useCallback((version: number, node: SVGGElement | null) => void (cardStamps.current[version - 1] = node), [])
  const setOutboxStamp = useCallback((version: number, node: SVGGElement | null) => void (outboxStamps.current[version - 1] = node), [])
  const setTab = (layer: number) => (node: SVGGElement | null) => {
    tabRefs.current[layer] = node
  }
  const tabLayer = (layer: number) => (
    <g key={`tab-${layer}`} ref={setTab(layer)} data-part="tab" data-layer={layer}>
      <CardTab lit={lit.kind === 'tab'} />
    </g>
  )

  return (
    <div ref={root} className="iso ag" data-settled="true" data-theme={dark ? 'dark' : 'light'} tabIndex={0} role="group" aria-label="Approval gate lesson" aria-keyshortcuts="A R E S P 0" onKeyDown={onKeyDown}>
      <Plate
        fig="Fig 1"
        title="Approval gate"
        hint="Keys: A approve · R reject · E edit · S send"
        readout={readout(shown)}
        keys={[{ mark: 'lit', label: 'The lit part shows why' }]}
        caption={caption(shown)}
      >
        <div className="iso-stage" ref={stage}>
          <svg className="iso-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${LABEL} ${readout(shown)}.`} focusable="false">
            <Base />
            <Deck />
            <g ref={cardRef} data-part="card" data-stop="home" data-version="1">
              <CardBody stampRef={setCardStamp} />
            </g>
            <g ref={pushRef} data-part="pusher">
              <PusherArt />
            </g>
            <Outbox groupRef={outboxRef} tabRef={outboxTabRef} stampRef={setOutboxStamp} />
            {tabLayer(3)}
            <LedgerArch pinRef={setPin} dropped={shown.sent} litVersion={litPin} />
            {tabLayer(2)}
            <GateArch fingerRef={setFinger} keyRef={setKey} litVersion={litFinger} />
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

      <Announcer text={caption(shown)} count={commits} />

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
