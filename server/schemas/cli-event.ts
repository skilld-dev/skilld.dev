/**
 * Re-export of the canonical CLI event schema from `skilld-protocol`. The
 * schema is aliased to keep existing handlers (`schema: CliEventInput`)
 * working without renames.
 */

export { CliEventInputSchema as CliEventInput } from 'skilld-protocol/wire'
