import type { Plugin } from '../types.ts'

const json: Plugin = {
  reads: ['json'],
  writes: 'json',
  read: (text) => JSON.parse(text),
  write: (rows) => JSON.stringify(rows, null, 2),
}
export default json
