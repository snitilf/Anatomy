import { z } from 'zod'
import { board } from './schema.ts'

/**
 * The JSON Schema that agents use to write board files.
 *
 * It describes the shape only. The app also checks rules that JSON Schema
 * cannot express, such as unique IDs and valid references.
 */
export function boardJsonSchema() {
  return {
    ...z.toJSONSchema(board, { io: 'input', target: 'draft-2020-12' }),
    $id: 'https://github.com/snitilf/anatomy/schema/board.v1.schema.json',
    title: 'Anatomy board, version 1',
    description:
      'A board explains a plan, feature, or project as parts, connections, open questions, and scenarios. IDs must be unique across the whole board, and every reference must point at an existing part or connection.',
  }
}

export function boardJsonSchemaText(): string {
  return `${JSON.stringify(boardJsonSchema(), null, 2)}\n`
}
