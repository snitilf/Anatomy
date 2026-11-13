import type { Board, BoardRelationship } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import { NotesSection } from '../notes/NotesSection'
import { Markdown } from '../text/markdown'
import { BackButton, CitedSection, Disclosure, Heading, OpenItems, PartButton, SourcePill } from './parts'
import styles from './parts.module.css'

export function RelationshipDetail({ board, relationship }: { board: Board; relationship: BoardRelationship }) {
  const items = board.items.filter((i) => i.about === relationship.id)
  const unknown = relationship.kind === 'unknown'
  return (
    <>
      <BackButton />
      <Heading>{relationship.label}</Heading>
      <div className={styles.route}>
        <PartButton board={board} id={relationship.from} />
        <span className={styles.routeKind}>{unknown ? '→' : `${KIND_WORDS[relationship.kind]}`}</span>
        <PartButton board={board} id={relationship.to} />
      </div>
      {unknown && <p className={styles.notice}>{KIND_WORDS.unknown}.</p>}
      <SourcePill source={relationship.source} />
      {/* A connection has no summary, so its explanation is the first thing to read. */}
      {relationship.explanation && (
        <Disclosure title="Explanation" open>
          <Markdown source={relationship.explanation} className={styles.prose ?? ''} />
        </Disclosure>
      )}
      <OpenItems items={items} />
      <CitedSection source={relationship.source} />

      <NotesSection target={{ type: 'relationship', id: relationship.id }} />
    </>
  )
}
