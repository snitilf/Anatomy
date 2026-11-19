import type { Plugin } from '../types.ts'

const csv: Plugin = {
  reads: ['csv'],
  writes: 'csv',
  read: (text) => {
    const [head = '', ...lines] = text.trim().split('\n')
    const keys = head.split(',')
    return lines.map((line) => Object.fromEntries(line.split(',').map((v, i) => [keys[i] ?? String(i), v])))
  },
  write: (rows) => rows.map((r) => Object.values(r).join(',')).join('\n'),
}
export default csv
