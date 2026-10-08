import type { CheckResult } from '@harlan-zw/nuxt-checkin/external'
import type { ArtifactSigningKeyWindow } from '../../workers/artifact-signer/src/slots'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fail, pass, readBoundedResponseText, warn } from '@harlan-zw/nuxt-checkin/external'
import { z } from 'zod'
import { ARTIFACT_SIGNING_KEY_SLOTS, selectSigningKey } from '../../workers/artifact-signer/src/slots'

export const TRUSTED_ROOT_URL = 'https://skilld.dev/api/v1/trusted-root'
export const SIGNING_KEY_WARN_DAYS = 30
export const SIGNING_KEY_FAIL_DAYS = 7
const DAY_SECONDS = 86_400
const RUNBOOK = 'docs/runbooks/signing-key-rotation.md'
const SIGNER_CONFIG = 'workers/artifact-signer/wrangler.jsonc'

const timestamp = z.string().datetime().transform(value => Date.parse(value) / 1000)

const rootSchema = z.object({
  keys: z.array(z.object({
    keyId: z.string().min(1),
    status: z.enum(['active', 'overlapping', 'retired', 'revoked']),
    notBefore: timestamp,
    notAfter: timestamp,
  })).min(1),
})

const signerSlotSchema = z.object({
  keyId: z.string().min(1),
  notBefore: timestamp,
  notAfter: timestamp,
})

export type RootKeyWindow = z.infer<typeof rootSchema>['keys'][number]

export interface SigningKeyEvidence {
  signer: ArtifactSigningKeyWindow[]
  root: RootKeyWindow[]
  /** Unix seconds. */
  now: number
}

/** The signer key windows that `wrangler.jsonc` names, one per filled slot. */
export function parseSignerKeys(vars: Readonly<Record<string, unknown>>): ArtifactSigningKeyWindow[] {
  return Object.entries(ARTIFACT_SIGNING_KEY_SLOTS).flatMap(([slot, names]) => {
    if (vars[names.keyId] === undefined && vars[names.notBefore] === undefined && vars[names.notAfter] === undefined)
      return []
    const parsed = signerSlotSchema.parse({
      keyId: vars[names.keyId],
      notBefore: vars[names.notBefore],
      notAfter: vars[names.notAfter],
    })
    return [{ slot: slot as ArtifactSigningKeyWindow['slot'], ...parsed }]
  })
}

export function parseRootKeys(value: unknown): RootKeyWindow[] {
  return rootSchema.parse(value).keys
}

/**
 * When Artifact signing stops, from the signer config and the live trusted root.
 *
 * A signer key signs usefully only inside both its signer window and its
 * trusted root window, with the root status `active` or `overlapping`. Past
 * the end of that coverage every build fails at verification, and every
 * stored Artifact fails once its own key window closes.
 */
export function evaluateSigningKeys({ signer, root, now }: SigningKeyEvidence): CheckResult {
  const trusted = new Map(root
    .filter(key => key.status === 'active' || key.status === 'overlapping')
    .map(key => [key.keyId, key]))
  const usable = signer.flatMap((key) => {
    const rootKey = trusted.get(key.keyId)
    if (!rootKey)
      return []
    const from = Math.max(key.notBefore, rootKey.notBefore)
    const until = Math.min(key.notAfter, rootKey.notAfter)
    return from < until ? [{ keyId: key.keyId, from, until }] : []
  })
  const signing = selectSigningKey(signer, now, now)
  const evidence = {
    signer: signer.map(key => ({ ...key, notBefore: iso(key.notBefore), notAfter: iso(key.notAfter) })),
    root: root.map(key => ({ ...key, notBefore: iso(key.notBefore), notAfter: iso(key.notAfter) })),
    signingKeyId: signing?.keyId ?? null,
    warnDays: SIGNING_KEY_WARN_DAYS,
  }
  if (!signing)
    return fail(`The Artifact signer has no key whose window holds now. Every Artifact build fails. Follow ${RUNBOOK}.`, evidence)
  if (!usable.some(window => window.keyId === signing.keyId && window.from <= now && now < window.until))
    return fail(`The Artifact signer signs with ${signing.keyId}, and the live trusted root does not trust that key now. Every Artifact build fails. Follow ${RUNBOOK}.`, evidence)

  let endsAt = now
  for (let extended = true; extended;) {
    const next = Math.max(endsAt, ...usable.filter(window => window.from <= endsAt && endsAt < window.until).map(window => window.until))
    extended = next > endsAt
    endsAt = next
  }
  const daysLeft = Math.floor((endsAt - now) / DAY_SECONDS)
  const covered = { ...evidence, signingEndsAt: iso(endsAt), daysLeft }
  const ending = `Artifact signing stops at ${iso(endsAt)}, in ${daysLeft} days. After that every skilld run fails. Follow ${RUNBOOK}.`
  if (endsAt - now <= SIGNING_KEY_FAIL_DAYS * DAY_SECONDS)
    return fail(ending, covered)
  if (endsAt - now <= SIGNING_KEY_WARN_DAYS * DAY_SECONDS)
    return warn(ending, covered)

  const staged = signer.filter(key => key.notBefore > now && !usable.some(window => window.keyId === key.keyId && window.from <= key.notBefore))
  if (staged.length > 0) {
    const names = staged.map(key => `${key.keyId} (from ${iso(key.notBefore)})`).join(', ')
    return warn(`The Artifact signer starts to sign with ${names}, and the live trusted root does not trust it from that date. Add it to the trusted root first. Follow ${RUNBOOK}.`, covered)
  }
  return pass(covered)
}

export async function readSignerKeys(rootDir: string): Promise<ArtifactSigningKeyWindow[]> {
  const config = JSON.parse(await readFile(join(rootDir, SIGNER_CONFIG), 'utf8')) as { vars?: Record<string, unknown> }
  return parseSignerKeys(config.vars ?? {})
}

export async function fetchRootKeys(signal: AbortSignal, request: typeof fetch = fetch): Promise<RootKeyWindow[]> {
  const response = await request(TRUSTED_ROOT_URL, { signal, headers: { accept: 'application/json' } })
  if (!response.ok)
    throw new Error(`The trusted root answered HTTP ${response.status}.`)
  return parseRootKeys(JSON.parse(await readBoundedResponseText(response, 65_536)))
}

function iso(seconds: number): string {
  return new Date(seconds * 1000).toISOString()
}
