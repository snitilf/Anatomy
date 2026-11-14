/** The node of the part (a board part or a proposed one) under a screen point. Group areas, text, and stickies do not count. */
export function partNodeUnder(x: number, y: number): HTMLElement | undefined {
  for (const el of document.elementsFromPoint(x, y)) {
    const node = el.closest<HTMLElement>('.react-flow__node-card, .react-flow__node-proposal')
    if (node) return node
  }
  return undefined
}

export const partUnder = (x: number, y: number): string | undefined => partNodeUnder(x, y)?.dataset.id
