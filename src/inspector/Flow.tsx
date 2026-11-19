import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Link2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import type { Board } from '../board/schema'
import { newId } from '../layer/edits'
import { LAYER_LIMITS } from '../layer/model'
import { flowRows, type FlowRow, type Side } from './flowRows'
import { partName } from './names'
import styles from './Flow.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems, useRequestedOpen } from './pickerItems'
import { Group } from './bits'
import { spotProps } from './spotlight'

/** One connection at a part: the part at the other end is the name, and the connection's label is the quiet text at the right. */
function Row({ row, side, names }: { row: FlowRow & { part: string }; side: Side; names: (id: string) => string | undefined }) {
  const { choose } = usePanel()
  // A link of the user's takes the link glyph it has on the Overview and in Yours, so it is told apart by shape. The group says which way it goes.
  const Arrow = row.yours === 'link' ? Link2 : side === 'in' ? ArrowLeft : ArrowRight
  const name = names(row.part)
  const what = row.unlabeled ? 'Link' : row.what
  const select = row.select
  return (
    <li
      className={styles.row}
      data-yours={row.yours}
      {...spotProps({ parts: [row.part], ...(row.edge ? { edges: [row.edge] } : {}) })}
    >
      {name === undefined ? (
        <span className={clsx(styles.part, styles.gone)}>
          <Arrow className={styles.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className={styles.name}>{row.part}</span>
        </span>
      ) : (
        <button type="button" className={styles.part} onClick={() => choose({ type: row.part.startsWith('part-') ? 'proposal' : 'component', id: row.part })}>
          <Arrow className={styles.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className={styles.name}>{name}</span>
          {row.was !== undefined && (
            <>
              <s className={styles.was}>{names(row.was) ?? row.was}</s>
              <span className="sr-only"> moved from</span>
            </>
          )}
        </button>
      )}
      {select && (
        <button type="button" className={styles.what} data-unlabeled={row.unlabeled || undefined} onClick={() => choose(select)}>
          {what}
        </button>
      )}
    </li>
  )
}

/** Adds a link from this part: pick the other part, then give it a label. */
function AddLink({ partId, board, open, setOpen }: { partId: string; board: Board; open: boolean; setOpen: (open: boolean) => void }) {
  const dispatch = useAppDispatch()
  const proposals = useAppStore((s) => s.layer?.proposals ?? [])
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
          name="link-label"
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
      className={styles.add}
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
 * What flows into a part and what flows out, as two flat groups: the agent's connections and the user's links in
 * their color. A plain input or output with no part at the other end is not a row. It reads in the explanation.
 */
export function FlowBlock({ partId }: { partId: string }) {
  const { board, layer } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer })))
  const ui = useUiApi()
  const asked = useUi((u) => u.linkPicker)
  const [open, setOpen] = useRequestedOpen(asked)
  // A request for the link picker opens the group that holds it.
  useEffect(() => {
    if (open) ui.setGroup('outgoing', true)
  }, [open, ui])
  if (!board) return null
  const rows = flowRows(board, layer, partId)
  const names = (id: string) => partName(board, id, layer?.proposals)
  const withPart = (side: Side) => rows[side].filter((row): row is FlowRow & { part: string } => row.part !== undefined)
  const incoming = withPart('in')
  const outgoing = withPart('out')
  return (
    <>
      {incoming.length > 0 && (
        <Group name="incoming" title="Incoming" count={incoming.length}>
          <ul className={styles.rows}>
            {incoming.map((row) => (
              <Row key={row.key} row={row} side="in" names={names} />
            ))}
          </ul>
        </Group>
      )}
      <Group name="outgoing" title="Outgoing" count={outgoing.length}>
        <ul className={styles.rows}>
          {outgoing.map((row) => (
            <Row key={row.key} row={row} side="out" names={names} />
          ))}
        </ul>
        <AddLink partId={partId} board={board} open={open} setOpen={setOpen} />
      </Group>
    </>
  )
}
