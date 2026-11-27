import clsx from 'clsx'
import { ArrowRight } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { KIND_WORDS } from '../app/labels'
import { useAppDispatch, useAppStore } from '../app/store'
import type { Board, BoardRelationship } from '../board/schema'
import { newId } from '../layer/edits'
import { Cited, Explanation, Heading, OpenItems, PartLink, PickerValue, Prop, Props, SourceLine } from './bits'
import { endsOf } from './flowRows'
import { partName } from './names'
import { NotesSection } from './notes'
import { Picker } from './Picker'
import { partItems } from './pickerItems'
import styles from './view.module.css'

/** Moving an end of the agent's connection. One edit per connection holds both ends. */
function moved(relationshipId: string, end: 'from' | 'to', part: string, id: string | undefined) {
  return { type: 'reconnected', relationshipId, end, part, id: id ?? newId('edit'), now: new Date() } as const
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

export function ConnectionView({ board, relationship: r }: { board: Board; relationship: BoardRelationship }) {
  const dispatch = useAppDispatch()
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const items = board.items.filter((i) => i.about === r.id)
  const proposals = layer?.proposals ?? []
  const name = (id: string) => partName(board, id, proposals)
  const ends = endsOf(layer, r)
  const unknown = r.kind === 'unknown'

  const move = (end: 'from' | 'to', part: string) => dispatch(moved(r.id, end, part, ends.edit?.id))

  /** The end as a picker button. An end the user moved says so, with the part it left. */
  const end = (which: 'from' | 'to') => {
    const other = which === 'from' ? ends.to : ends.from
    const label = which === 'from' ? 'From' : 'To'
    const shown = name(ends[which]) ?? ends[which]
    return (
      <Prop label={label}>
        <Picker
          label={label}
          title={`${label}: ${shown}`}
          className={clsx(buttons.button, buttons.quiet, buttons.small, styles.pickerValue)}
          trigger={<PickerValue>{shown}</PickerValue>}
          items={partItems(board, proposals, other)}
          onPick={(part) => move(which, part)}
        />
        {ends[which] !== r[which] && (
          <>
            <span className={styles.moved}>moved</span>
            <s className={styles.was}>{name(r[which]) ?? r[which]}</s>
          </>
        )}
      </Prop>
    )
  }

  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <Heading>{r.label}</Heading>
        <p className={styles.route}>
          <PartLink id={r.from} name={name(r.from)} />{' '}
          {unknown ? (
            <>
              <ArrowRight className={styles.inlineArrow} size={14} strokeWidth={1.5} aria-hidden="true" />
              <span className="sr-only">to</span>
            </>
          ) : (
            KIND_WORDS[r.kind]
          )}{' '}
          <PartLink id={r.to} name={name(r.to)} />
        </p>
      </div>
      <Props>
        {end('from')}
        <Prop label="Kind">{unknown ? KIND_WORDS.unknown : capital(KIND_WORDS[r.kind])}</Prop>
        {end('to')}
        <Prop label="Source">
          <SourceLine source={r.source} className={styles.propSource} />
        </Prop>
      </Props>
      {ends.edit && (
        <div className={styles.actions}>
          <button type="button" className={clsx(buttons.button, buttons.quiet, buttons.small)} onClick={() => ends.edit && dispatch({ type: 'reconnectDeleted', id: ends.edit.id })}>
            Put back
          </button>
        </div>
      )}
      {r.explanation && <Explanation source={r.explanation} />}
      <OpenItems items={items} />
      <Cited source={r.source} />
      <NotesSection target={{ type: 'relationship', id: r.id }} />
    </div>
  )
}
