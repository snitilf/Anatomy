// Writes schema/board.v1.schema.json from the Zod schema, and schema/board.v1.fields.txt, the short field list that
// `anatomy schema` prints.
// Run with: npm run schema
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fieldSheet } from '../src/board/cheatSheet.ts'
import { boardJsonSchema, boardJsonSchemaText } from '../src/board/jsonSchema.ts'

const schema = new URL('../schema/board.v1.schema.json', import.meta.url)
writeFileSync(schema, boardJsonSchemaText())
console.log(`Wrote ${fileURLToPath(schema)}`)

const fields = new URL('../schema/board.v1.fields.txt', import.meta.url)
writeFileSync(fields, fieldSheet(boardJsonSchema()))
console.log(`Wrote ${fileURLToPath(fields)}`)
