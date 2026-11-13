import { useState } from 'react'
import { useAppDispatch, useAppState } from '../app/appContext'
import type { Board } from '../board/schema'
import { BackButton, Heading, PartButton, Section } from '../inspector/parts'
import { usePanel } from '../inspector/panelContext'
import { newId } from '../overlay/notes'
import { OVERLAY_LIMITS } from '../overlay/schema'
import { manualLinkStatus } from '../overlay/status'
import type { ManualLink } from '../overlay/types'
import styles from './notes.module.css'
import { PartSelect } from './TargetSelect'
import { YouTag } from './YouTag'

function partName(board: Board, id: string): string {
  return board.components.find((c) => c.id === id)?.label ?? id
}

/** The links the user drew at one part, and a keyboard-friendly form to draw another. */
export function LinksSection({ componentId }: { componentId: string }) {
  const { board, overlay } = useAppState()
  const dispatch = useAppDispatch()
  const { choose } = usePanel()
  const [to, setTo] = useState('')
  const [label, setLabel] = useState('')
  if (!board || !overlay) return null
  const mine = overlay.manualLinks.filter((l) => l.from === componentId || l.to === componentId)

  function add() {
    if (to === '') return
    dispatch({ type: 'linkAdded', from: componentId, to, label: label.trim(), id: newId('link'), now: new Date() })
    setTo('')
    setLabel('')
  }

  return (
    <Section title="Your links">
      {mine.length > 0 && (
        <ul className={styles.list}>
          {mine.map((link) => {
            const outgoing = link.from === componentId
            const other = partName(board, outgoing ? link.to : link.from)
            return (
              <li key={link.id}>
                <button type="button" className={styles.linkRow} onClick={() => choose({ type: 'link', id: link.id })}>
                  <YouTag />
                  <span className={styles.linkText}>
                    <span aria-hidden="true">{outgoing ? '→' : '←'}</span> {other}
                    {link.label !== '' && <span className={styles.linkLabel}>{link.label}</span>}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault()
          add()
        }}
      >
        <PartSelect board={board} label="Draw a link to" value={to} exclude={componentId} onChange={setTo} />
        <span className={styles.field}>
          <label htmlFor={`link-label-${componentId}`} className={styles.fieldLabel}>
            Label (optional)
          </label>
          <input
            id={`link-label-${componentId}`}
            className={styles.input}
            value={label}
            maxLength={OVERLAY_LIMITS.linkLabel}
            onChange={(event) => setLabel(event.target.value)}
          />
        </span>
        <div className={styles.formFoot}>
          <button type="submit" className={styles.solid} disabled={to === ''}>
            Add link
          </button>
        </div>
      </form>
    </Section>
  )
}

/** Attaches the missing end of a link to a part that exists now. Never done automatically. */
export function RelinkLinkEnd({ link, end, board }: { link: ManualLink; end: 'from' | 'to'; board: Board }) {
  const dispatch = useAppDispatch()
  const [chosen, setChosen] = useState('')
  const other = end === 'from' ? link.to : link.from
  return (
    <div className={styles.relink}>
      <PartSelect
        board={board}
        label={end === 'from' ? 'Attach the start to' : 'Attach the end to'}
        value={chosen}
        exclude={other}
        onChange={setChosen}
      />
      <button
        type="button"
        className={styles.solid}
        disabled={chosen === ''}
        onClick={() => dispatch({ type: 'linkEdited', id: link.id, change: { [end]: chosen } })}
      >
        Attach
      </button>
    </div>
  )
}

function DeleteLink({ id }: { id: string }) {
  const dispatch = useAppDispatch()
  const [confirming, setConfirming] = useState(false)
  return confirming ? (
    <>
      <button type="button" className={styles.solid} onClick={() => dispatch({ type: 'linkDeleted', id })}>
        Delete link
      </button>
      <button type="button" className={styles.plain} onClick={() => setConfirming(false)}>
        Keep
      </button>
    </>
  ) : (
    <button type="button" className={styles.plain} onClick={() => setConfirming(true)}>
      Delete
    </button>
  )
}

export { DeleteLink }

/** The inspector view for a link the user drew. */
export function LinkDetail({ board, link }: { board: Board; link: ManualLink }) {
  const dispatch = useAppDispatch()
  const [label, setLabel] = useState(link.label)
  const broken = manualLinkStatus(board, link) === 'needs-relinking'
  const ids = new Set(board.components.map((c) => c.id))
  const changed = label.trim() !== link.label

  function save() {
    if (changed) dispatch({ type: 'linkEdited', id: link.id, change: { label } })
  }

  return (
    <>
      <BackButton />
      <Heading>Your link</Heading>
      <div className={styles.tags}>
        <YouTag />
        {broken && (
          <span className={styles.tag} data-warn="">
            Needs relinking
          </span>
        )}
      </div>
      <div className={`${styles.route}`}>
        {ids.has(link.from) ? <PartButton board={board} id={link.from} /> : <span className={styles.gone}>{link.from}</span>}
        <span aria-hidden="true">→</span>
        <span className="sr-only">to</span>
        {ids.has(link.to) ? <PartButton board={board} id={link.to} /> : <span className={styles.gone}>{link.to}</span>}
      </div>
      {broken && (
        <>
          <p className={styles.notice}>
            A part this link joined was removed. Attach the link to another part, or delete it.
          </p>
          {!ids.has(link.from) && <RelinkLinkEnd link={link} end="from" board={board} />}
          {!ids.has(link.to) && <RelinkLinkEnd link={link} end="to" board={board} />}
        </>
      )}
      <div className={styles.labelBlock}>
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
        >
          <span className={styles.field}>
            <label htmlFor="link-label" className={styles.fieldLabel}>
              Label
            </label>
            <input
              id="link-label"
              className={styles.input}
              value={label}
              maxLength={OVERLAY_LIMITS.linkLabel}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={save}
            />
          </span>
          <div className={styles.formFoot}>
            <button type="submit" className={styles.solid} disabled={!changed}>
              Save label
            </button>
          </div>
        </form>
      </div>
      <div className={`${styles.row} ${styles.spaced}`}>
        <DeleteLink id={link.id} />
      </div>
    </>
  )
}
