// Writes schema/board.v1.schema.json from the Zod schema.
// Run with: npm run schema
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { boardJsonSchemaText } from '../src/board/jsonSchema.ts'

const target = new URL('../schema/board.v1.schema.json', import.meta.url)
writeFileSync(target, boardJsonSchemaText())
console.log(`Wrote ${fileURLToPath(target)}`)
