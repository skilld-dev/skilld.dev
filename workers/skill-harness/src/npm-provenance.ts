import { z } from 'zod'
import { parseJson } from './contracts'

const envelopeSchema = z.object({ attestations: z.array(z.object({ bundle: z.object({ dsseEnvelope: z.object({ payload: z.string().min(1).regex(/^(?:[A-Z0-9+/]{4})*(?:[A-Z0-9+/]{2}==|[A-Z0-9+/]{3}=)?$/i).max(256 * 1024) }) }) })).max(10) })
const statementSchema = z.object({
  predicateType: z.literal('https://slsa.dev/provenance/v1'),
  subject: z.array(z.object({ name: z.string(), digest: z.object({ sha512: z.string() }) })).max(10),
  predicate: z.object({ buildDefinition: z.object({
    externalParameters: z.object({ workflow: z.object({ repository: z.string(), ref: z.string() }) }),
    resolvedDependencies: z.array(z.object({ uri: z.string(), digest: z.object({ gitCommit: z.string() }) })).max(128),
  }) }),
})

/** Match npm's HTTPS registry record. This does not independently verify Sigstore signatures. */
export function matchesNpmProvenance(value: unknown, source: { owner: string, name: string, tag: string, targetSha: string, packageName: string, version: string, integrity: string }): boolean {
  const envelopes = envelopeSchema.safeParse(value)
  if (!envelopes.success || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(source.integrity))
    return false
  const digest = Uint8Array.from(atob(source.integrity.slice(7)), char => char.charCodeAt(0))
  if (digest.length !== 64)
    return false
  const hex = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  const repository = `https://github.com/${source.owner}/${source.name}`
  for (const envelope of envelopes.data.attestations) {
    const decoded = Uint8Array.from(atob(envelope.bundle.dsseEnvelope.payload), char => char.charCodeAt(0))
    const json = parseJson(new TextDecoder().decode(decoded))
    const parsed = json._tag === 'Ok' ? statementSchema.safeParse(json.value) : undefined
    if (!parsed?.success)
      continue
    const statement = parsed.data
    const build = statement.predicate.buildDefinition
    if (build.externalParameters.workflow.repository === repository && build.externalParameters.workflow.ref === `refs/tags/${source.tag}`
      && statement.subject.some(subject => subject.name === `pkg:npm/${source.packageName}@${source.version}` && subject.digest.sha512 === hex)
      && build.resolvedDependencies.some(dependency => dependency.uri === `git+${repository}@refs/tags/${source.tag}` && dependency.digest.gitCommit === source.targetSha)) {
      return true
    }
  }
  return false
}
