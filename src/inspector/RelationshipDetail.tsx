import type { Board, BoardRelationship } from '../board/schema'
import { KIND_WORDS } from '../app/labels'
import { Markdown } from '../text/markdown'
import { BackButton, Heading, ItemGroups, PartButton, Section, SourceBlock } from './parts'
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
      <SourceBlock source={relationship.source} />
      {relationship.explanation && (
        <Section title="Explanation">
          <Markdown source={relationship.explanation} className={styles.prose ?? ""} />
        </Section>
      )}
      <ItemGroups items={items} />
    </>
  )
}
