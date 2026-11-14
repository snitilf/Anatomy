import clsx from 'clsx'
import { ArrowRight, CircleHelp } from 'lucide-react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { KIND_WORDS } from '../app/labels'
import { useAppDispatch, useAppStore } from '../app/store'
import type { Board, BoardRelationship } from '../board/schema'
import { newId } from '../layer/edits'
import { BackButton, Cited, Explanation, Heading, OpenItems, PartLink, Section, SourceLine } from './bits'
import { endsOf } from './flowRows'
import { partName } from './names'
import flow from './Flow.module.css'
import { NotesSection } from './notes'
import { Picker } from './Picker'
import { partItems } from './pickerItems'
import styles from './view.module.css'

/** Moving an end of the agent's connection. One edit per connection holds both ends. */
function moved(relationshipId: string, end: 'from' | 'to', part: string, id: string | undefined) {
  return { type: 'reconnected', relationshipId, end, part, id: id ?? newId('edit'), now: new Date() } as const
}

export function ConnectionView({ board, relationship: r }: { board: Board; relationship: BoardRelationship }) {
  const dispatch = useAppDispatch()
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const items = board.items.filter((i) => i.about === r.id)
  const proposals = layer?.proposals ?? []
  const name = (id: string) => partName(board, id, proposals)
  const ends = endsOf(layer, r)
  const unknown = r.kind === 'unknown'

  const move = (end: 'from' | 'to', part: string) => dispatch(moved(r.id, end, part, ends.edit?.id))

  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <BackButton />
        <Heading>{r.label}</Heading>
        {r.source.kind !== 'agent-explanation' && (
          <p className={styles.meta}>
            <SourceLine source={r.source} />
          </p>
        )}
      </div>
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
      {unknown && (
        <p className={styles.notice}>
          <CircleHelp size={14} strokeWidth={1.5} aria-hidden="true" />
          {KIND_WORDS.unknown}
        </p>
      )}
      {ends.edit && (
        <Section title="You moved">
          <ul className={clsx(flow.block, flow.moved)}>
            {(['from', 'to'] as const)
              .filter((end) => ends[end] !== r[end])
              .map((end) => (
                <li key={end} className={flow.row} data-yours="moved">
                  <span className={flow.what} data-text="">
                    {end === 'from' ? 'Start' : 'End'}
                  </span>
                  <span className={flow.end}>
                    <s className={flow.was}>{name(r[end]) ?? r[end]}</s>
                    <span className="sr-only"> moved to </span>
                    <ArrowRight className={flow.arrow} size={14} strokeWidth={1.5} aria-hidden="true" />
                    <PartLink id={ends[end]} name={name(ends[end])} />
                  </span>
                </li>
              ))}
          </ul>
          <div className={styles.actions}>
            <button type="button" className={clsx(buttons.button, buttons.small)} onClick={() => ends.edit && dispatch({ type: 'reconnectDeleted', id: ends.edit.id })}>
              Put back
            </button>
          </div>
        </Section>
      )}
      {r.explanation && <Explanation source={r.explanation} />}
      <OpenItems items={items} />
      <Cited source={r.source} />
      <Section title="Move end">
        <div className={styles.actions}>
          <Picker label="From" trigger={<>From: {name(ends.from) ?? ends.from}</>} items={partItems(board, proposals, ends.to)} onPick={(part) => move('from', part)} />
          <Picker label="To" trigger={<>To: {name(ends.to) ?? ends.to}</>} items={partItems(board, proposals, ends.from)} onPick={(part) => move('to', part)} />
        </div>
      </Section>
      <NotesSection target={{ type: 'relationship', id: r.id }} />
    </div>
  )
}
