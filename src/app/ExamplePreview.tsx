import { EXAMPLE_OUTLINES } from './exampleOutlines.generated'
import type { Example } from './examples'
import { unpackOutline, type BoardOutline } from './outline'

const unpacked = new Map<string, BoardOutline | undefined>()

/** The precomputed outline of an example board, which `npm run outlines` writes from the board file. */
function outlineOf(example: Example): BoardOutline | undefined {
  if (!unpacked.has(example.fileName)) unpacked.set(example.fileName, unpackOutline(EXAMPLE_OUTLINES[example.fileName]))
  return unpacked.get(example.fileName)
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`

/** A miniature of the real map: the groups, the lines, and the cards as the layout places them. The styles are in `EmptyState.module.css`. */
export function MapPreview({ example, className }: { example: Example; className?: string | undefined }) {
  const o = outlineOf(example)
  return (
    <svg className={className} viewBox={`0 0 ${o && o.width > 0 ? o.width : 40} ${o && o.height > 0 ? o.height : 25}`} preserveAspectRatio="xMidYMid meet">
      {o?.groups.map((g, i) => (
        <rect key={i} data-outline-group="" x={g.x} y={g.y} width={g.w} height={g.h} rx={2.5} />
      ))}
      {o?.lines.map((d, i) => (
        <path key={i} data-outline-line="" d={d} />
      ))}
      {o?.cards.map((c, i) => (
        <g key={i} data-outline-card="">
          <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5} />
          <rect x={c.x + 3} y={c.y + c.h * 0.28} width={c.w * 0.54} height={Math.max(1.2, c.h * 0.13)} rx={0.8} />
          <rect x={c.x + 3} y={c.y + c.h * 0.56} width={c.w * 0.72} height={Math.max(1, c.h * 0.1)} rx={0.6} />
        </g>
      ))}
    </svg>
  )
}

/** How many parts and walkthroughs the example has. */
export function MapCounts({ example, id }: { example: Example; id: string }) {
  const o = outlineOf(example)
  if (!o) return null
  const parts = plural(o.parts, 'part')
  return <span id={id}>{o.walkthroughs > 0 ? `${parts} · ${plural(o.walkthroughs, 'walkthrough')}` : parts}</span>
}
