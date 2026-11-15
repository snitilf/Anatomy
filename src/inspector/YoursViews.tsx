import clsx from 'clsx'
import { ArrowRight, Circle, Link2, MoveUpRight, Pen, Square, SquarePlus, StickyNote, Type, Unlink, type LucideIcon } from 'lucide-react'
import { Fragment, useContext, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'
import buttons from '../app/buttons.module.css'
import { useAppDispatch, useAppStore } from '../app/store'
import type { Board } from '../board/schema'
import { CameraSlotContext } from '../canvas/cameraContext'
import { describeMarkFor } from '../feedback/build'
import type { MissingRef, Pointed, Ref } from '../feedback/types'
import { LAYER_LIMITS, type Link, type Mark, type Proposal } from '../layer/model'
import { linkStatus } from '../layer/status'
import { deletedToast } from '../notes/undoToast'
import { BackButton, Heading, PartLink } from './bits'
import { FlowBlock } from './Flow'
import { partName } from './names'
import { ItemAnswer } from './notes'
import { usePanel } from './panelContext'
import { Picker } from './Picker'
import { partItems } from './pickerItems'
import styles from './view.module.css'

/** A text field that saves when it loses focus or on Enter. */
function SavedField({
  label,
  value,
  placeholder,
  max,
  multiline = false,
  onSave,
}: {
  label: string
  value: string
  placeholder?: string
  max: number
  multiline?: boolean
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [shown, setShown] = useState(value)
  // A change from elsewhere, such as undo, replaces the draft.
  if (shown !== value) {
    setShown(value)
    setDraft(value)
  }
  const save = () => {
    if (draft.trim() !== value) onSave(draft.trim())
  }
  const common = {
    'aria-label': label,
    name: label.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    placeholder: placeholder ?? label,
    value: draft,
    maxLength: max,
    onBlur: save,
  }
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      {multiline ? (
        <textarea
          {...common}
          className={styles.textarea}
          rows={3}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') save()
          }}
        />
      ) : (
        <input
          {...common}
          className={styles.input}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
          }}
        />
      )}
    </label>
  )
}

function DeleteButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  return (
    <div className={styles.actions}>
      <button type="button" className={clsx(buttons.button, buttons.small)} onClick={onDelete}>
        {label}
      </button>
    </div>
  )
}

function Answer({ board, id }: { board: Board; id: string }) {
  return <ItemAnswer board={board} id={id} />
}

/** A link the user drew between two parts. */
export function LinkView({ board, link }: { board: Board; link: Link }) {
  const dispatch = useAppDispatch()
  const proposals = useAppStore((s) => s.layer?.proposals ?? [])
  const name = (id: string) => partName(board, id, proposals)
  const broken = linkStatus(board, { proposals }, link) === 'needs-relinking'
  const remove = () => {
    dispatch({ type: 'linkDeleted', id: link.id })
    deletedToast('Link deleted', dispatch)
  }
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <BackButton />
        <Heading icon={Link2}>{link.label || 'Link'}</Heading>
        <p className={styles.meta}>Link</p>
      </div>
      <p className={styles.route}>
        <PartLink id={link.from} name={name(link.from)} />
        <ArrowRight className={styles.inlineArrow} size={14} strokeWidth={1.5} aria-hidden="true" />
        <span className="sr-only">to </span>
        <PartLink id={link.to} name={name(link.to)} />
      </p>
      {broken && (
        <div className={styles.section}>
          <p className={styles.notice} data-tone="danger">
            <Unlink size={14} strokeWidth={1.5} aria-hidden="true" />
            {name(link.from) === undefined ? link.from : link.to} was removed.
          </p>
          <div className={styles.actions}>
            <Picker
              label="Attach to"
              trigger="Attach to"
              items={partItems(board, proposals, name(link.from) === undefined ? link.to : link.from)}
              onPick={(part) => dispatch({ type: 'linkEdited', id: link.id, change: { [name(link.from) === undefined ? 'from' : 'to']: part } })}
            />
          </div>
        </div>
      )}
      <SavedField label="Label" value={link.label} max={LAYER_LIMITS.linkLabel} onSave={(label) => dispatch({ type: 'linkEdited', id: link.id, change: { label } })} />
      <Answer board={board} id={link.id} />
      <DeleteButton label="Delete" onDelete={remove} />
    </div>
  )
}

const MARK: Record<Mark['kind'], { word: string; icon: LucideIcon }> = {
  stroke: { word: 'Drawing', icon: Pen },
  rect: { word: 'Rectangle', icon: Square },
  ellipse: { word: 'Ellipse', icon: Circle },
  arrow: { word: 'Arrow', icon: MoveUpRight },
  text: { word: 'Text', icon: Type },
  sticky: { word: 'Sticky note', icon: StickyNote },
}

function RefName({ target }: { target: Ref | MissingRef | Pointed }) {
  const { choose } = usePanel()
  if (target.type === 'point') return <>empty space</>
  if (target.type === 'missing') return <span className={styles.gone}>{target.id}</span>
  if (target.type === 'relationship')
    return (
      <button type="button" className={styles.partLink} onClick={() => choose({ type: 'relationship', id: target.id })}>
        {target.label}
      </button>
    )
  return <PartLink id={target.id} name={target.label} />
}

function joined(refs: readonly Ref[]): ReactNode {
  return refs.map((ref, i) => (
    <Fragment key={ref.id}>
      {i > 0 && (i === refs.length - 1 ? ' and ' : ', ')}
      <RefName target={ref} />
    </Fragment>
  ))
}

/** Something drawn on the whiteboard, and what the agent will be told about it. */
export function MarkView({ board, mark }: { board: Board; mark: Mark }) {
  const dispatch = useAppDispatch()
  const { layer } = useAppStore(useShallow((s) => ({ layer: s.layer })))
  const camera = useContext(CameraSlotContext)
  if (!layer) return null
  const { word, icon } = MARK[mark.kind]
  // Read against the lines the map draws now, as the feedback will be.
  const told = describeMarkFor(board, layer, mark, camera.get()?.scene())
  const sentence: ReactNode[] = []
  if (told && (told.type === 'drawing' || told.type === 'shape')) {
    if (told.encloses.length > 0) sentence.push(<Fragment key="a">Around {joined(told.encloses)}.</Fragment>)
    if (told.touches.length > 0) sentence.push(<Fragment key="t">Touches {joined(told.touches)}.</Fragment>)
  } else if (told?.type === 'arrow') {
    sentence.push(
      <Fragment key="f">
        From <RefName target={told.from} /> to <RefName target={told.to} />.
      </Fragment>,
    )
  } else if (told && (told.type === 'text' || told.type === 'sticky') && told.on.length > 0) {
    sentence.push(<Fragment key="o">On {joined(told.on)}.</Fragment>)
  }
  const change = (next: Partial<Mark>) => dispatch({ type: 'markChanged', id: mark.id, mark: { ...mark, ...next } as Mark })
  const remove = () => {
    dispatch({ type: 'markDeleted', id: mark.id })
    deletedToast(`${word} deleted`, dispatch)
  }
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <BackButton />
        <Heading icon={icon}>{word}</Heading>
      </div>
      {sentence.length > 0 && <p className={styles.route}>{sentence.flatMap((s, i) => (i > 0 ? [' ', s] : [s]))}</p>}
      {(mark.kind === 'text' || mark.kind === 'sticky') && (
        <SavedField label="Text" value={mark.text} max={LAYER_LIMITS.markText} multiline onSave={(text) => (text || mark.kind === 'sticky' ? change({ text }) : undefined)} />
      )}
      <SavedField
        label="Note"
        placeholder="What should the agent do with this?"
        value={mark.note ?? ''}
        max={LAYER_LIMITS.noteText}
        multiline
        onSave={(note) => {
          const { note: _old, ...rest } = mark
          dispatch({ type: 'markChanged', id: mark.id, mark: (note ? { ...rest, note } : rest) as Mark })
        }}
      />
      {!told && <p className={styles.notice}>Not sent. Add a note, or draw it around a part.</p>}
      <Answer board={board} id={mark.id} />
      <DeleteButton label="Delete" onDelete={remove} />
    </div>
  )
}

/** A new part the user sketched. */
export function ProposalView({ board, proposal }: { board: Board; proposal: Proposal }) {
  const dispatch = useAppDispatch()
  const remove = () => {
    dispatch({ type: 'proposalDeleted', id: proposal.id })
    deletedToast('Part deleted', dispatch)
  }
  return (
    <div className={styles.view}>
      <div className={styles.head}>
        <BackButton />
        <Heading icon={SquarePlus}>{proposal.label}</Heading>
        <p className={styles.meta}>New part</p>
      </div>
      <SavedField label="Name" value={proposal.label} max={LAYER_LIMITS.partLabel} onSave={(label) => label && dispatch({ type: 'proposalChanged', id: proposal.id, change: { label } })} />
      <SavedField label="Summary" value={proposal.summary} max={LAYER_LIMITS.partSummary} multiline onSave={(summary) => dispatch({ type: 'proposalChanged', id: proposal.id, change: { summary } })} />
      <FlowBlock partId={proposal.id} />
      <Answer board={board} id={proposal.id} />
      <DeleteButton label="Delete" onDelete={remove} />
    </div>
  )
}
