import { describe, expect, it } from 'vitest'
import { emptyLayer } from '../layer/model'
import { refundBoard } from '../layer/testBoards'
import { MANUAL_PREFIX } from '../canvas/buildGraph'
import { flowRows } from './flowRows'

describe('the flow block', () => {
  it('lists connections first, then the board inputs and outputs', () => {
    const board = refundBoard()
    const rows = flowRows(board, emptyLayer(board.id), 'manager-approval')
    const incoming = board.relationships.filter((r) => r.to === 'manager-approval')
    const approval = board.components.find((c) => c.id === 'manager-approval')!
    expect(rows.in.map((r) => r.what)).toEqual([...incoming.map((r) => r.label), ...approval.inputs])
    expect(rows.in[0]).toMatchObject({ part: incoming[0]!.from, select: { type: 'relationship', id: incoming[0]!.id } })
    expect(rows.in.at(-1)).not.toHaveProperty('select')
  })

  it('drops a plain input or output that a connection on the same side already names', () => {
    const board = refundBoard()
    const incoming = board.relationships.find((r) => r.to === 'manager-approval')!
    const approval = board.components.find((c) => c.id === 'manager-approval')!
    approval.inputs = [` ${incoming.label.toUpperCase()} `, 'something only listed']
    const rows = flowRows(board, emptyLayer(board.id), 'manager-approval')
    const whats = rows.in.map((r) => r.what)
    expect(whats.filter((w) => w.trim().toLowerCase() === incoming.label.toLowerCase())).toHaveLength(1)
    expect(whats).toContain('something only listed')
  })

  it('drops an input already named by a user link', () => {
    const board = refundBoard()
    board.components.find((c) => c.id === 'manager-approval')!.inputs = ['  CUSTOM FLOW  ']
    const layer = { ...emptyLayer(board.id), links: [{ id: 'link-aaaaaa', from: 'payout-preview', to: 'manager-approval', label: 'custom flow', createdAt: '2026-11-13T00:00:00.000Z' }] }
    expect(flowRows(board, layer, 'manager-approval').in.filter((row) => row.what.trim().toLowerCase() === 'custom flow')).toMatchObject([{ select: { type: 'link', id: 'link-aaaaaa' } }])
  })

  it('shows the user links as theirs, and a moved end with the part it left', () => {
    const board = refundBoard()
    const out = board.relationships.find((r) => r.from === 'manager-approval')!
    const elsewhere = board.components.find((c) => c.id !== out.to && c.id !== 'manager-approval')!.id
    const layer = {
      ...emptyLayer(board.id),
      links: [{ id: 'link-aaaaaa', from: 'manager-approval', to: 'payout-preview', label: '', createdAt: '2026-11-13T00:00:00.000Z' }],
      reconnects: [{ id: 'edit-aaaaaa', relationshipId: out.id, to: elsewhere, createdAt: '2026-11-13T00:00:00.000Z' }],
    }
    const rows = flowRows(board, layer, 'manager-approval')
    expect(rows.out.find((r) => r.select?.id === out.id)).toMatchObject({ part: elsewhere, was: out.to, yours: 'moved' })
    expect(rows.out.at(-1)).toMatchObject({ yours: 'link', unlabeled: true, part: 'payout-preview', edge: `${MANUAL_PREFIX}link-aaaaaa` })
    // The part the end left still lists the connection, marked as moved away.
    expect(flowRows(board, layer, out.to).in.find((r) => r.select?.id === out.id)).toMatchObject({ part: elsewhere, was: out.to, yours: 'moved' })
  })
})
