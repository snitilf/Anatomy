import { z } from 'zod'

/**
 * The board document, version 1.
 *
 * A board is data written by an agent or a person. The app never runs,
 * fetches, or evaluates anything in it. Paths in references are shown as
 * text only.
 *
 * Shape rules live here. Rules that compare one part of the document with
 * another (unique IDs, endpoints, scenario targets) live in `validate.ts`.
 */

export const BOARD_FORMAT = 'anatomy-board'
export const SCHEMA_VERSION = 1

export const LIMITS = {
  fileBytes: 1_000_000,
  components: 60,
  relationships: 200,
  groups: 12,
  items: 100,
  responses: 300,
  scenarios: 20,
  steps: 50,
  highlights: 30,
  references: 10,
  listEntries: 20,
  id: 64,
  title: 120,
  label: 60,
  summary: 280,
  shortText: 600,
  markdown: 4000,
  coordinate: 100_000,
} as const

const id = z
  .string()
  .regex(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    'must use lowercase letters, digits, and single hyphens, for example "rule-check"',
  )
  .max(LIMITS.id)

const text = (max: number) => z.string().trim().min(1, 'must not be empty').max(max)

/** A small Markdown subset. The renderer treats anything else as plain text. */
const markdown = text(LIMITS.markdown)

/**
 * Where a claim comes from.
 * - agent-explanation: an agent describes something as it understands it.
 * - agent-proposal: an agent suggests a design that nobody decided yet.
 * - documented-intent: a written plan or spec says this. Needs a reference.
 * - user-stated: the user told the agent this.
 *
 * Code-derived and observed evidence are not supported in version 1.
 */
export const SOURCE_KINDS = [
  'agent-explanation',
  'agent-proposal',
  'documented-intent',
  'user-stated',
] as const

export const reference = z.strictObject({
  label: text(LIMITS.label),
  path: text(LIMITS.shortText).optional(),
  note: text(LIMITS.summary).optional(),
})

export const source = z
  .strictObject({
    kind: z.enum(SOURCE_KINDS),
    references: z.array(reference).max(LIMITS.references).default([]),
  })
  .refine((s) => s.kind !== 'documented-intent' || s.references.length > 0, {
    message: 'a documented-intent source needs at least one reference',
    path: ['references'],
  })

export const RELATIONSHIP_KINDS = [
  'calls',
  'sends-data-to',
  'stores-in',
  'reads-from',
  'depends-on',
  'triggers',
  'unknown',
] as const

const position = z.strictObject({
  x: z.number().finite().min(-LIMITS.coordinate).max(LIMITS.coordinate),
  y: z.number().finite().min(-LIMITS.coordinate).max(LIMITS.coordinate),
})

const shortList = z.array(text(LIMITS.summary)).max(LIMITS.listEntries).default([])

export const group = z.strictObject({
  id,
  label: text(LIMITS.label),
  description: text(LIMITS.summary).optional(),
})

export const component = z.strictObject({
  id,
  label: text(LIMITS.label),
  summary: text(LIMITS.summary),
  explanation: markdown.optional(),
  group: id.optional(),
  inputs: shortList,
  outputs: shortList,
  source,
  position: position.optional(),
  /** ID of a built-in lesson. Unknown IDs produce a warning, not an error. */
  lesson: id.optional(),
})

export const relationship = z.strictObject({
  id,
  from: id,
  to: id,
  kind: z.enum(RELATIONSHIP_KINDS),
  label: text(LIMITS.label),
  explanation: markdown.optional(),
  source,
})

export const ITEM_KINDS = ['assumption', 'unknown', 'question'] as const

/** An assumption, unknown, or open question. Without `about`, it is about the whole board. */
export const item = z.strictObject({
  id,
  kind: z.enum(ITEM_KINDS),
  text: text(LIMITS.shortText),
  about: id.optional(),
})

export const step = z.strictObject({
  caption: text(LIMITS.shortText),
  highlight: z.array(id).max(LIMITS.highlights).default([]),
})

export const scenario = z.strictObject({
  id,
  title: text(LIMITS.title),
  summary: text(LIMITS.summary).optional(),
  steps: z.array(step).min(1, 'needs at least one step').max(LIMITS.steps),
})

export const RESPONSE_STATUSES = ['adopted', 'declined', 'answered'] as const

/**
 * The agent's answer to one item of the user's feedback.
 * - adopted: the change is now part of the board. The user's item leaves their layer.
 * - declined: the agent did not make the change, and says why.
 * - answered: a question or note, answered in `text`.
 */
export const response = z.strictObject({
  /** The `id` of the item in the feedback file. */
  feedbackId: id,
  status: z.enum(RESPONSE_STATUSES),
  text: text(LIMITS.shortText),
  /** IDs of the components and relationships this revision changed for the item. */
  changed: z.array(id).max(LIMITS.listEntries).default([]),
})

export const responses = z.strictObject({
  /** The `id` of the feedback file this revision answers. */
  respondsTo: id,
  items: z.array(response).max(LIMITS.responses).default([]),
})

export const board = z.strictObject({
  format: z.literal(BOARD_FORMAT),
  schemaVersion: z.literal(SCHEMA_VERSION),
  id,
  revision: z.number().int().min(1),
  title: text(LIMITS.title),
  goal: text(LIMITS.shortText),
  scope: z.strictObject({
    includes: shortList,
    excludes: shortList,
  }),
  groups: z.array(group).max(LIMITS.groups).default([]),
  components: z
    .array(component)
    .min(1, 'needs at least one component')
    .max(LIMITS.components, `has more than ${LIMITS.components} components; split it into smaller boards`),
  relationships: z.array(relationship).max(LIMITS.relationships).default([]),
  items: z.array(item).max(LIMITS.items).default([]),
  scenarios: z.array(scenario).max(LIMITS.scenarios).default([]),
  /** Answers to the user's feedback. Optional; boards without it stay valid. */
  responses: responses.optional(),
})

export type Board = z.infer<typeof board>
export type BoardComponent = z.infer<typeof component>
export type BoardRelationship = z.infer<typeof relationship>
export type BoardGroup = z.infer<typeof group>
export type BoardItem = z.infer<typeof item>
export type BoardScenario = z.infer<typeof scenario>
export type BoardResponses = z.infer<typeof responses>
export type BoardResponse = z.infer<typeof response>
export type Source = z.infer<typeof source>
export type SourceKind = (typeof SOURCE_KINDS)[number]
export type RelationshipKind = (typeof RELATIONSHIP_KINDS)[number]
