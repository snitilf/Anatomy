/** Static art for the dispatch press, built from the geometry module. Parts that move are wrapped by the lesson. */
import { useMemo, type Ref } from 'react'
import { Dots, FaceText, Line, Solid } from '../kit/react/draw'
import {
  BASE_ART,
  CARD_ART,
  CARD_H,
  DECK_ART,
  FINGER_ART,
  GATE_ARCH,
  GATE_COMB,
  GATE_NUMBERS,
  KEY_SIZE,
  LABEL_SIZE,
  LEDGER_ARCH,
  LEDGER_COMB,
  LEDGER_NUMBERS,
  LOCK_ARCH,
  NUMBER_SIZE,
  PIN_ART,
  PUSHER_ART,
  SLOTS,
  SHUTTER_ART,
  STACK_SHIFT,
  STAMP_SIZE,
  SWITCH_ART,
  shift,
} from './geometry'

type Arch = typeof GATE_ARCH
type Comb = typeof GATE_COMB

export function Base() {
  const b = BASE_ART
  return (
    <g>
      <path className="iso-halo" d={b.halo} />
      {b.feet.map(([flange, foot], index) => (
        <g key={index}>
          <Solid paths={flange} tone="lo" />
          <Solid paths={foot} tone="mid" />
        </g>
      ))}
      <Solid paths={b.slab} tone="mid" />
      <Line d={b.groove} tone="faint" />
      <Line d={b.screwRings} tone="lo" />
      <Dots points={b.screws} size={0.5} tone="mid" />
      <Solid paths={b.rulerStrip} tone="lo" crease="none" />
      <Line d={b.rulerTicks.minor} tone="lo" />
      <Line d={b.rulerTicks.major} tone="mid" />
      <Solid paths={b.farRuler} tone="lo" crease="none" />
      <Line d={b.farRulerTicks.minor} tone="lo" />
      <Line d={b.farRulerTicks.major} tone="mid" />
      <Solid paths={b.labelPlate} tone="lo" crease="none" />
      <Line d={b.labelInset} tone="faint" />
      <FaceText transform={b.labelMatrix} size={LABEL_SIZE} tone="mid">
        DISPATCH
      </FaceText>
      <Line d={b.labelRules} tone="lo" free />
      <Dots points={b.labelScrews} size={0.45} tone="mid" />
      <Solid paths={b.ventPlate} tone="lo" crease="none" />
      <Line d={b.ventSlots} tone="faint" />
    </g>
  )
}

export function Deck() {
  const d = DECK_ART
  return (
    <g>
      <Solid paths={d.slab} tone="lo" />
      <Line d={d.groove} tone="faint" />
      <Line d={d.ticks} tone="lo" />
      <Solid paths={d.lipFar} tone="mid" />
      <Dots points={d.farRivets} size={0.45} tone="mid" />
      <Solid paths={d.lipNear} tone="mid" />
      <Dots points={d.nearRivets} size={0.45} tone="mid" />
      <Solid paths={d.wall} tone="mid" />
      <Line d={d.wallSeam} tone="faint" />
      <Dots points={d.wallScrews} size={0.5} tone="mid" />
    </g>
  )
}

export function DeckFront() {
  const d = DECK_ART
  return (
    <g>
      <Solid paths={d.stop} tone="mid" />
      <Dots points={d.stopScrews} size={0.5} tone="mid" />
    </g>
  )
}

export function Switch({ knobRef, lampRef, lamp }: { knobRef: Ref<SVGGElement>; lampRef: Ref<SVGGElement>; lamp: boolean }) {
  const s = SWITCH_ART
  return (
    <g>
      <Solid paths={s.housing} tone="mid" />
      <Line d={s.seam} tone="faint" />
      <Dots points={s.screws} size={0.5} tone="mid" />
      <Solid paths={s.track} tone="lo" crease="none" />
      <g ref={knobRef}>
        <Solid paths={s.knob} tone="hi" />
        <Line d={s.ridges} tone="lo" />
      </g>
      <Solid paths={s.lampBody} tone="mid" />
      <Line d={s.lampRing} tone="lo" />
      <Solid paths={s.lampLens} tone="lo" crease="none" />
      <g ref={lampRef}>
        <Solid paths={s.lampLens} tone="hi" lit={lamp} crease="none" />
      </g>
    </g>
  )
}

export function PusherArt() {
  const p = PUSHER_ART
  return (
    <g>
      <Solid paths={p.tongue} tone="mid" />
      <Line d={p.hole} tone="lo" />
      <Solid paths={p.plate} tone="mid" />
      <Line d={p.join} tone="faint" />
      <Line d={p.ridges} tone="lo" free />
      <Dots points={p.screws} size={0.45} tone="mid" />
    </g>
  )
}

/** The slab of the card with its rules and its stamp. It stays under every overhead part, so it is drawn once. */
export function CardBody({ version }: { version: number }) {
  const c = CARD_ART
  return (
    <g>
      <Solid paths={c.slab} tone="hi" />
      <Line d={c.inset} tone="faint" />
      <Line d={c.slotTicks} tone="lo" />
      <Line d={c.rules} tone="lo" free />
      <FaceText transform={c.stampMatrix} size={STAMP_SIZE} tone="hi">
        {`v${version}`}
      </FaceText>
      <Dots points={c.corners} size={0.4} tone="mid" />
    </g>
  )
}

/** The tab that names the version. It is the only part of the card that rises into the overhead parts. */
export function CardTab({ version, lit }: { version: number; lit: boolean }) {
  const tab = CARD_ART.tabs[version - 1]
  if (!tab) return null
  return (
    <g>
      <Solid paths={tab.body} tone="hi" lit={lit} />
      <Line d={tab.hole} tone="lo" />
      <Line d={tab.edge} tone="faint" />
    </g>
  )
}

/** Cards already delivered to the outbox. Each one rests on the one below it. */
export function Stack({ delivered }: { delivered: readonly number[] }) {
  return (
    <g>
      {delivered.map((version, index) => (
        <g key={version} transform={shift(STACK_SHIFT, 0, index * CARD_H)}>
          <CardBody version={version} />
          <CardTab version={version} lit={false} />
        </g>
      ))}
    </g>
  )
}

function Post({ parts }: { parts: Arch['far'] }) {
  return (
    <g>
      <Solid paths={parts.foot} tone="lo" />
      <Dots points={parts.footScrews} size={0.45} tone="mid" />
      <Solid paths={parts.body} tone="mid" />
      <Line d={parts.bands} tone="faint" />
      <Dots points={parts.bolts} size={0.5} tone="mid" />
      <Solid paths={parts.cap} tone="lo" />
    </g>
  )
}

function Bar({ arch, numbers }: { arch: Arch; numbers: typeof GATE_NUMBERS | null }) {
  return (
    <g>
      <Solid paths={arch.bar} tone="mid" />
      <Line d={arch.barSeam} tone="faint" />
      <Line d={arch.barSeamB} tone="faint" />
      {numbers
        ? numbers.map(({ v, matrix }) => (
            <FaceText key={v} transform={matrix} size={NUMBER_SIZE} tone="mid" anchor="middle">
              {String(v)}
            </FaceText>
          ))
        : null}
    </g>
  )
}

function CombBack({ comb }: { comb: Comb }) {
  return <Solid paths={comb.body} tone="lo" />
}

function CombFront({ comb }: { comb: Comb }) {
  return (
    <g>
      <Solid paths={comb.strip} tone="mid" />
      <Line d={comb.stripSeam} tone="faint" />
      <Dots points={comb.stripScrews} size={0.45} tone="mid" />
    </g>
  )
}

export interface GateProps {
  fingerRef: (version: number, node: SVGGElement | null) => void
  keyRef: (node: SVGGElement | null) => void
  keyVersion: number | null
  litVersion: number | null
}

/** One ref callback per slot, so React keeps the same callback between renders and never detaches a part. */
function useSlotRefs(ref: (version: number, node: SVGGElement | null) => void) {
  return useMemo(() => Array.from({ length: SLOTS }, (_, i) => (node: SVGGElement | null) => ref(i + 1, node)), [ref])
}

export function GateArch({ fingerRef, keyRef, keyVersion, litVersion }: GateProps) {
  const fingerRefs = useSlotRefs(fingerRef)
  return (
    <g data-part="arch" data-arch="gate">
      <Post parts={GATE_ARCH.far} />
      <Bar arch={GATE_ARCH} numbers={GATE_NUMBERS} />
      <CombBack comb={GATE_COMB} />
      {FINGER_ART.fingers.map((finger) => {
        const key = FINGER_ART.keys[finger.v - 1]
        return (
          <g key={finger.v} ref={fingerRefs[finger.v - 1]} data-part="finger" data-slot={finger.v} data-pose="down">
            <Solid paths={finger.body} tone="mid" lit={litVersion === finger.v} />
            <Line d={finger.eye} tone="lo" />
            <Line d={finger.groove} tone="faint" />
            <Line d={finger.notch} tone="faint" />
            {keyVersion === finger.v && key ? (
              <g ref={keyRef} data-part="key" data-slot={finger.v} data-pose="hidden">
                <Solid paths={key.stem} tone="hi" crease="none" lit={litVersion === finger.v} />
                <Solid paths={key.tooth} tone="hi" crease="none" lit={litVersion === finger.v} />
                <Solid paths={key.bow} tone="hi" lit={litVersion === finger.v} />
                <Line d={key.bowHole} tone="lo" />
                <FaceText transform={key.stamp} size={KEY_SIZE} tone="hi">
                  {`v${finger.v}`}
                </FaceText>
              </g>
            ) : null}
          </g>
        )
      })}
      <CombFront comb={GATE_COMB} />
      <Post parts={GATE_ARCH.near} />
    </g>
  )
}

export interface LedgerProps {
  pinRef: (version: number, node: SVGGElement | null) => void
  dropped: readonly number[]
  litVersion: number | null
}

export function LedgerArch({ pinRef, dropped, litVersion }: LedgerProps) {
  const pinRefs = useSlotRefs(pinRef)
  return (
    <g data-part="arch" data-arch="ledger">
      <Post parts={LEDGER_ARCH.far} />
      <Bar arch={LEDGER_ARCH} numbers={LEDGER_NUMBERS} />
      <CombBack comb={LEDGER_COMB} />
      {PIN_ART.pins.map((pin) => {
        const down = dropped.includes(pin.v)
        const lit = litVersion === pin.v
        return (
          <g key={pin.v} ref={pinRefs[pin.v - 1]} data-part="pin" data-slot={pin.v} data-pose="up">
            <Solid paths={pin.rod} tone={down ? 'hi' : 'mid'} lit={lit} crease="none" />
            <Line d={pin.band} tone="faint" />
            <Solid paths={pin.cap} tone={down ? 'hi' : 'mid'} lit={lit} />
            <Line d={pin.capRing} tone="lo" />
          </g>
        )
      })}
      <CombFront comb={LEDGER_COMB} />
      <Post parts={LEDGER_ARCH.near} />
    </g>
  )
}

export function LockArch({ shutterRef, lit }: { shutterRef: Ref<SVGGElement>; lit: boolean }) {
  const s = SHUTTER_ART
  return (
    <g data-part="arch" data-arch="lock">
      <Post parts={LOCK_ARCH.far} />
      <Bar arch={LOCK_ARCH} numbers={null} />
      <Line d={s.grooves} tone="faint" />
      <g ref={shutterRef} data-part="shutter" data-pose="up">
        <Solid paths={s.body} tone="mid" lit={lit} />
        <Line d={s.seam} tone="faint" />
        <Solid paths={s.tag} tone="lo" crease="none" />
        <Line d={s.stripes} tone="mid" />
        <Dots points={s.screws} size={0.5} tone="mid" />
      </g>
      <Post parts={LOCK_ARCH.near} />
    </g>
  )
}
