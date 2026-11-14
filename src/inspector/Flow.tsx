import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore } from '../app/store'
import { useUi } from '../app/ui'
import type { Board } from '../board/schema'
import { emphasizeConnection } from '../canvas/emphasis'
import { newId } from '../layer/edits'
import { LAYER_LIMITS } from '../layer/model'
import { flowRows, type FlowRow, type Side } from './flowRows'
import { partName } from './names'
import styles from './Flow.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems, useRequestedOpen } from './pickerItems'

function Row({ row, side, names }: { row: FlowRow; side: Side; names: (id: string) => string | undefined }) {
  const { choose } = usePanel()
  const Arrow = side === 'in' ? ArrowLeft : ArrowRight
  const name = row.part === undefined ? undefined : names(row.part)
  const what = row.unlabeled ? 'Link' : row.what
  const select = row.select
  return (
    <li className={styles.row} data-yours={row.yours}>
      {select ? (
        <button
          type="button"
          className={styles.what}
          data-unlabeled={row.unlabeled || undefined}
          onClick={() => choose(select)}
          onPointerEnter={() => emphasizeConnection(row.edge)}
          onPointerLeave={() => emphasizeConnection(undefined)}
          onFocus={() => emphasizeConnection(row.edge)}
          onBlur={() => emphasizeConnection(undefined)}
        >
          {what}
        </button>
      ) : (
        <span className={styles.what} data-text="">
          {what}
        </span>
      )}
      {row.part !== undefined && (
        <span className={styles.end}>
          <Arrow className={styles.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className="sr-only">{side === 'in' ? 'from' : 'to'} </span>
          {row.was !== undefined && (
            <>
              <s className={styles.was}>{names(row.was) ?? row.was}</s>
              <span className="sr-only"> moved to </span>
            </>
          )}
          {name === undefined ? (
            <span className={styles.gone}>{row.part}</span>
          ) : (
            <button type="button" className={styles.part} onClick={() => choose({ type: row.part?.startsWith('part-') ? 'proposal' : 'component', id: row.part as string })}>
              {name}
            </button>
          )}
        </span>
      )}
    </li>
  )
}

/** Adds a link from this part: pick the other part, then give it a label. */
function AddLink({ partId, board }: { partId: string; board: Board }) {
  const dispatch = useAppDispatch()
  const proposals = useAppStore((s) => s.layer?.proposals ?? [])
  const asked = useUi((u) => u.linkPicker)
  const [open, setOpen] = useRequestedOpen(asked)
  const [to, setTo] = useState<string | undefined>()
  const [label, setLabel] = useState('')
  const { choose } = usePanel()

  function add() {
    if (!to) return
    const id = newId('link')
    dispatch({ type: 'linkAdded', from: partId, to, label: label.trim(), id, now: new Date() })
    setTo(undefined)
    setLabel('')
    choose({ type: 'link', id })
  }

  if (to) {
    return (
      <form
        className={styles.label}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <span className={styles.labelTo}>
          <ArrowRight size={14} strokeWidth={1.5} aria-hidden="true" />
          {partName(board, to, proposals)}
        </span>
        <input
          className={styles.input}
          aria-label="Label"
          placeholder="Label"
          value={label}
          maxLength={LAYER_LIMITS.linkLabel}
          autoFocus
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation()
              setTo(undefined)
            }
          }}
        />
        <button type="submit" className={clsx(buttons.button, buttons.small)}>
          Add
        </button>
      </form>
    )
  }
  return (
    <Picker
      label="Add link"
      className={clsx(buttons.button, buttons.quiet, buttons.small, styles.add)}
      trigger={
        <>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add link
        </>
      }
      items={partItems(board, proposals, partId)}
      open={open}
      onOpenChange={setOpen}
      onPick={setTo}
    />
  )
}

/**
 * What flows into a part and what flows out: the agent's connections, the board's inputs and outputs, and the user's
 * links in their color. It replaces separate lists of inputs, outputs, and connections.
 */
export function FlowBlock({ partId }: { partId: string }) {
  const { board, layer } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer })))
  if (!board) return null
  const rows = flowRows(board, layer, partId)
  const names = (id: string) => partName(board, id, layer?.proposals)
  return (
    <section className={styles.section} aria-label="Flow">
      {(rows.in.length > 0 || rows.out.length > 0) && (
        <div className={styles.block}>
          {(['in', 'out'] as const).map((side) =>
            rows[side].length === 0 ? null : (
              <div key={side} className={styles.half}>
                <h3 className={styles.halfLabel}>{side === 'in' ? 'In' : 'Out'}</h3>
                <ul className={styles.rows}>
                  {rows[side].map((row) => (
                    <Row key={row.key} row={row} side={side} names={names} />
                  ))}
                </ul>
              </div>
            ),
          )}
        </div>
      )}
      <AddLink partId={partId} board={board} />
    </section>
  )
}
