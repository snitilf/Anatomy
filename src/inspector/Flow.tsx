import clsx from 'clsx'
import { ArrowLeft, ArrowRight, Link2, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import rowsCss from '../app/rows.module.css'
import { useAppDispatch, useAppStore } from '../app/store'
import { useUi, useUiApi } from '../app/ui'
import type { Board } from '../board/schema'
import { newId } from '../layer/edits'
import { LAYER_LIMITS } from '../layer/model'
import { connectionRows, type ConnectionRow } from './flowRows'
import { partName } from './names'
import styles from './Flow.module.css'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems, useRequestedOpen } from './pickerItems'
import { Group } from './bits'
import { spotProps } from './spotlight'

/** One connection at a part: direction arrow as row icon, other part as name, line's label as meta at the right. */
function Row({ row, names }: { row: ConnectionRow; names: (id: string) => string | undefined }) {
  const { choose } = usePanel()
  // A link of the user's takes the link glyph it has on the Overview and in Yours, so it is told apart by shape (D133).
  const Glyph = row.yours === 'link' ? Link2 : row.side === 'in' ? ArrowLeft : ArrowRight
  const name = names(row.part)
  const what = row.unlabeled ? 'Link' : row.what
  const select = row.select
  return (
    <li
      className={styles.row}
      data-yours={row.yours}
      data-side={row.side}
      {...spotProps({ parts: [row.part], ...(row.edge ? { edges: [row.edge] } : {}) })}
    >
      {name === undefined ? (
        <span className={clsx(rowsCss.row, rowsCss.sm, styles.part, styles.gone)}>
          <Glyph className={styles.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
          <span className={styles.name}>{row.part}</span>
        </span>
      ) : (
        <button
          type="button"
          className={clsx(rowsCss.row, rowsCss.sm, styles.part)}
          title={row.side === 'in' ? `Incoming from ${name}` : `Outgoing to ${name}`}
          onClick={() => choose({ type: row.part.startsWith('part-') ? 'proposal' : 'component', id: row.part })}
        >
          <Glyph className={styles.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
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
        <button
          type="button"
          className={clsx(buttons.button, buttons.quiet, buttons.small, styles.what)}
          data-unlabeled={row.unlabeled || undefined}
          onClick={() => choose(select)}
        >
          {what}
        </button>
      )}
    </li>
  )
}

/** Inline label step after picking the target part for a new link. */
function LabelForm({
  partId,
  to,
  board,
  onDone,
}: {
  partId: string
  to: string
  board: Board
  onDone: () => void
}) {
  const dispatch = useAppDispatch()
  const proposals = useAppStore((s) => s.layer?.proposals ?? [])
  const [label, setLabel] = useState('')
  const { choose } = usePanel()

  function add() {
    const id = newId('link')
    dispatch({ type: 'linkAdded', from: partId, to, label: label.trim(), id, now: new Date() })
    onDone()
    choose({ type: 'link', id })
  }

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
            onDone()
          }
        }}
      />
      <button type="submit" className={clsx(buttons.button, buttons.small)}>
        Add
      </button>
    </form>
  )
}

/**
 * One Connections section for incoming and outgoing rows together, incoming first, with the direction arrow
 * as the row icon and the line's label as meta. "Add link" sits as a quiet small button in the heading.
 */
export function FlowBlock({ partId }: { partId: string }) {
  const { board, layer } = useAppStore(useShallow((s) => ({ board: s.board, layer: s.layer })))
  const ui = useUiApi()
  const asked = useUi((u) => u.linkPicker)
  const [open, setOpen] = useRequestedOpen(asked)
  const [to, setTo] = useState<string | undefined>()

  // A request for the link picker opens the Connections group.
  useEffect(() => {
    if (open || to) ui.setGroup('connections', true)
  }, [open, to, ui])

  if (!board) return null
  const proposals = layer?.proposals ?? []
  const rows = connectionRows(board, layer, partId)
  const names = (id: string) => partName(board, id, proposals)

  const addAction = (
    <Picker
      label="Add link"
      className={clsx(buttons.button, buttons.quiet, buttons.small)}
      trigger={
        <>
          <Plus size={14} strokeWidth={1.5} aria-hidden="true" />
          Add link
        </>
      }
      items={partItems(board, proposals, partId)}
      open={open}
      onOpenChange={setOpen}
      onPick={(picked) => {
        setTo(picked)
        ui.setGroup('connections', true)
      }}
    />
  )

  return (
    <Group name="connections" title="Connections" count={rows.length} action={addAction}>
      {rows.length > 0 && (
        <ul className={styles.rows}>
          {rows.map((row) => (
            <Row key={row.key} row={row} names={names} />
          ))}
        </ul>
      )}
      {to && <LabelForm partId={partId} to={to} board={board} onDone={() => setTo(undefined)} />}
    </Group>
  )
}
