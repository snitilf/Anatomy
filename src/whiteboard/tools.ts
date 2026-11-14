/** The whiteboard tools. Select is the default; every other tool returns to it with Escape or V. */
export type Tool = 'select' | 'hand' | 'pen' | 'rect' | 'ellipse' | 'arrow' | 'text' | 'sticky' | 'part'

/** Tools that draw: the map stops panning and dragging under them, and a surface over the map takes the pointer. */
export const DRAWING_TOOLS: ReadonlySet<Tool> = new Set(['pen', 'rect', 'ellipse', 'arrow', 'text', 'sticky', 'part'])

/** Tools that go back to Select after one use. The pen stays until Escape or V. */
export const ONE_USE_TOOLS: ReadonlySet<Tool> = new Set(['rect', 'ellipse', 'arrow', 'text', 'sticky', 'part'])

export const isDrawing = (tool: Tool) => DRAWING_TOOLS.has(tool)

/** What the map allows under a tool. Hand pans from anywhere, drawing tools leave the pointer to the draw surface. */
export function mapProps(tool: Tool) {
  const select = tool === 'select'
  return {
    nodesDraggable: select,
    elementsSelectable: select,
    nodesConnectable: select,
    nodesFocusable: select,
    edgesFocusable: select,
    panOnDrag: tool === 'select' || tool === 'hand',
  }
}

/** Something being typed on the map: a new text, sticky note, or part, or one that already exists. */
export interface Editing {
  kind: 'text' | 'sticky' | 'part'
  /** The mark or proposed part being changed. Absent for a new one. */
  id?: string | undefined
  /** Top left, in board coordinates. */
  x: number
  y: number
}
