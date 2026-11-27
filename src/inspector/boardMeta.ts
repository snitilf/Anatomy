/** One quiet meta line for the sidebar's board view: parts (and groups when present), connections (when present), and revision. */
export function boardMeta(parts: number, groups: number, connections: number, revision: number): string {
  const partsClause =
    groups > 0
      ? `${parts} ${parts === 1 ? 'part' : 'parts'} in ${groups} ${groups === 1 ? 'group' : 'groups'}`
      : `${parts} ${parts === 1 ? 'part' : 'parts'}`
  const clauses = [partsClause]
  if (connections > 0) clauses.push(`${connections} ${connections === 1 ? 'connection' : 'connections'}`)
  clauses.push(`revision ${revision}`)
  return clauses.join(' · ')
}
