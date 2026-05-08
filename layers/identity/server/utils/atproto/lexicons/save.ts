/** AT Protocol Lexicon: dev.skilld.collection.save */

export const SAVE_NSID = 'dev.skilld.collection.save'

export interface SaveSubject {
  uri: string
  cid: string
}

export interface SaveRecord {
  $type: typeof SAVE_NSID
  subject: SaveSubject
  createdAt: string
}

export function parseSaveRecord(value: unknown): SaveRecord | null {
  if (!value || typeof value !== 'object')
    return null

  const v = value as Record<string, unknown>

  if (!v.subject || typeof v.subject !== 'object')
    return null

  const subject = v.subject as Record<string, unknown>
  if (typeof subject.uri !== 'string' || typeof subject.cid !== 'string')
    return null

  if (typeof v.createdAt !== 'string')
    return null

  return {
    $type: SAVE_NSID,
    subject: { uri: subject.uri, cid: subject.cid },
    createdAt: v.createdAt,
  }
}
