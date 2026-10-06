import type { Hash } from 'node:crypto'
import type { ArtifactFile, CheckResult, ResolvedSource } from '../schemas/contracts'
import type { ArtifactSourceFile, OmittedArtifactFile } from './github-source'
import { createHash } from 'node:crypto'
import { ARTIFACT_POLICY_VERSION } from './state'

/**
 * 2026-10-07: the check became advisory. It still reports every finding, but
 * no finding blocks delivery. The registry admits a Skill by its folder, so a
 * frontmatter name, a long description or a missing field never changes which
 * Skill runs. Safety checks stay required.
 */
const AGENT_SKILLS_CHECK_VERSION = '2026-10-07'
const MAX_DESCRIPTION_CHARACTERS = 1024
const PATH_POLICY_VERSION = '1'
/**
 * Version 2, 2026-10-07: a finding needs a whole key block, not its first
 * line. Version 1 blocked nine Skills for a header alone: a secret scanner's
 * pattern table, a `"-----BEGIN PRIVATE KEY-----\n..."` placeholder, and a
 * test fixture whose body read `TEST-NOT-A-REAL-KEY`. None held a key.
 */
const CREDENTIAL_MATERIAL_VERSION = '2'
const EXECUTABLE_FILES_VERSION = '1'
/**
 * Lists the files left out of the Artifact for a size limit. It is a check
 * result, not a new attestation field: the released skilld CLI refuses an
 * attestation or a Resolution answer with a field it does not know, and it
 * accepts any check result that is not required.
 */
const OMITTED_FILES_VERSION = '1'
/** The skilld CLI refuses a check result with more findings, or a longer one. */
const MAX_CHECK_FINDINGS = 100
const MAX_CHECK_FINDING_CHARACTERS = 500

/** The checks a statement under one policy carries, by check name. */
export type ArtifactCheckSet = ReadonlyMap<string, { version: string, required: boolean }>

const CURRENT_ARTIFACT_CHECKS: ArtifactCheckSet = new Map([
  ['path-policy', { version: PATH_POLICY_VERSION, required: true }],
  ['agent-skills-spec', { version: AGENT_SKILLS_CHECK_VERSION, required: false }],
  ['credential-material', { version: CREDENTIAL_MATERIAL_VERSION, required: true }],
  ['executable-files', { version: EXECUTABLE_FILES_VERSION, required: false }],
  ['omitted-files', { version: OMITTED_FILES_VERSION, required: false }],
])

/**
 * Every policy the artifact signer signs, with the checks its statements carry.
 *
 * The deploy updates the signer before the site, and a failed smoke rolls the
 * site back alone. In both windows the running site stages statements under
 * the policy before the signer's, so the signer signs that one too. When you
 * bump `ARTIFACT_POLICY_VERSION`, replace the previous entry with the policy
 * you bumped from. Leave it out only when the bump closes a safety gap, so the
 * signer refuses the old policy at once.
 *
 * The site never reuses a build under another policy, so a statement signed
 * under the previous one only finishes a run already in flight.
 */
export const SIGNABLE_ARTIFACT_POLICIES: ReadonlyMap<string, ArtifactCheckSet> = new Map([
  [ARTIFACT_POLICY_VERSION, CURRENT_ARTIFACT_CHECKS],
  // ADR-0013 changed loading and packaging only, so the policy before it
  // carries the same checks.
  ['2026-10-07.2', CURRENT_ARTIFACT_CHECKS],
])

export interface CheckedArtifactSource {
  files: ArtifactFile[]
  checkResults: CheckResult[]
}

export async function checkArtifactSource(
  source: ResolvedSource,
  files: ArtifactSourceFile[],
  omitted: OmittedArtifactFile[] = [],
): Promise<CheckedArtifactSource> {
  const scanner = createArtifactCheckScanner(source)
  for (const file of files) {
    scanner.begin({ path: file.path, mode: file.mode, size: file.bytes.byteLength })
    scanner.chunk(file.bytes)
    scanner.end()
  }
  return scanner.finish(omitted)
}

/** Receives the Skill files one at a time, each as a run of chunks. */
export interface ArtifactFileObserver {
  begin: (file: { path: string, mode: 420 | 493, size: number }) => void
  chunk: (bytes: Uint8Array) => void
  end: () => void
}

export interface ArtifactCheckScanner extends ArtifactFileObserver {
  finish: (omitted: OmittedArtifactFile[]) => CheckedArtifactSource
}

/**
 * Runs every check over files that stream past once, so a build never holds
 * the whole Skill. Only SKILL.md is kept, for its frontmatter. The results
 * match {@link checkArtifactSource} over the same bytes, in any chunk size.
 */
export function createArtifactCheckScanner(source: ResolvedSource): ArtifactCheckScanner {
  const inventory: ArtifactFile[] = []
  const pathFindings: string[] = []
  const credentialFindings: string[] = []
  const executableFindings: string[] = []
  let skillBytes: Uint8Array[] | null = null
  let current: {
    path: string
    mode: 420 | 493
    size: number
    sha256: Hash
    credentials: CredentialScanner
    skill: Uint8Array[] | null
  } | null = null

  return {
    begin(file) {
      if (current)
        throw new Error(`The check scanner is still reading ${current.path}`)
      current = {
        ...file,
        sha256: createHash('sha256'),
        credentials: createCredentialScanner(),
        skill: file.path === 'SKILL.md' ? [] : null,
      }
    },
    chunk(bytes) {
      if (!current)
        throw new Error('The check scanner received bytes outside a file')
      current.sha256.update(bytes)
      current.credentials.chunk(bytes)
      current.skill?.push(bytes.slice())
    },
    end() {
      if (!current)
        throw new Error('The check scanner ended no file')
      const file = current
      current = null
      inventory.push({ path: file.path, mode: file.mode, size: file.size, sha256: file.sha256.digest('hex') })
      if (!splitUstarPath(file.path))
        pathFindings.push(file.path)
      if (file.credentials.end())
        credentialFindings.push(`${file.path} contains private key material.`)
      if (file.mode === 493)
        executableFindings.push(file.path)
      if (file.skill)
        skillBytes = file.skill
    },
    finish(omitted) {
      if (current)
        throw new Error(`The check scanner did not end ${current.path}`)
      const pathPolicy: CheckResult = pathFindings.length > 0
        ? {
            name: 'path-policy',
            version: PATH_POLICY_VERSION,
            outcome: 'fail',
            required: true,
            summary: `A Skill path cannot be represented by the Artifact format.${listedNote(pathFindings)}`,
            findings: boundedFindings(pathFindings),
          }
        : {
            name: 'path-policy',
            version: PATH_POLICY_VERSION,
            outcome: 'pass',
            required: true,
          }
      const credentialMaterial: CheckResult = credentialFindings.length > 0
        ? {
            name: 'credential-material',
            version: CREDENTIAL_MATERIAL_VERSION,
            outcome: 'fail',
            required: true,
            summary: `The Skill contains private key material.${listedNote(credentialFindings)}`,
            findings: boundedFindings(credentialFindings),
          }
        : {
            name: 'credential-material',
            version: CREDENTIAL_MATERIAL_VERSION,
            outcome: 'pass',
            required: true,
          }
      const executableFiles: CheckResult = executableFindings.length > 0
        ? {
            name: 'executable-files',
            version: EXECUTABLE_FILES_VERSION,
            outcome: 'warn',
            required: false,
            summary: `The Skill contains executable files.${listedNote(executableFindings)}`,
            findings: boundedFindings(executableFindings),
          }
        : {
            name: 'executable-files',
            version: EXECUTABLE_FILES_VERSION,
            outcome: 'pass',
            required: false,
          }
      return {
        files: inventory,
        checkResults: [
          pathPolicy,
          agentSkillsSpecResult(source, skillBytes),
          credentialMaterial,
          executableFiles,
          omittedFilesResult(omitted),
        ],
      }
    },
  }
}

/**
 * The findings a check result carries. The skilld CLI refuses more than 100,
 * or one longer than 500 characters, and a Skill may now hold 2,000 files.
 */
function boundedFindings(findings: string[]): string[] {
  return findings.slice(0, MAX_CHECK_FINDINGS).map(finding => finding.slice(0, MAX_CHECK_FINDING_CHARACTERS))
}

/** Names how many findings a result leaves unlisted, or nothing when it lists them all. */
function listedNote(findings: string[]): string {
  return findings.length > MAX_CHECK_FINDINGS
    ? ` The first ${MAX_CHECK_FINDINGS} of ${findings.length.toLocaleString('en-US')} are listed.`
    : ''
}

function agentSkillsSpecResult(source: ResolvedSource, skillChunks: Uint8Array[] | null): CheckResult {
  const specFindings: string[] = []
  if (!skillChunks) {
    specFindings.push('SKILL.md is missing.')
  }
  else {
    const decodedSkill = decodeText(concatBytes(skillChunks)) ?? ''
    if (!decodedSkill) {
      specFindings.push('SKILL.md must contain UTF-8 text.')
    }
    else {
      const frontmatter = readSkillFrontmatter(decodedSkill)
      if (!frontmatter) {
        specFindings.push('SKILL.md must start with YAML frontmatter.')
      }
      else {
        const directoryName = source.skillPath === '.'
          ? source.repository
          : source.skillPath.split('/').at(-1)!
        if (!frontmatter.name)
          specFindings.push('The frontmatter has no name.')
        else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(frontmatter.name) || frontmatter.name.length > 64)
          specFindings.push(`The frontmatter name \`${frontmatter.name.slice(0, 100)}\` must use 1 to 64 lowercase letters, numbers, or single hyphens.`)
        else if (frontmatter.name !== directoryName)
          specFindings.push(`The frontmatter name \`${frontmatter.name}\` does not match the folder \`${directoryName}\`.`)
        if (!frontmatter.description)
          specFindings.push('The frontmatter has no description.')
        else if (frontmatter.description.length > MAX_DESCRIPTION_CHARACTERS)
          specFindings.push(`The description has ${frontmatter.description.length.toLocaleString('en-US')} characters. The limit is ${MAX_DESCRIPTION_CHARACTERS.toLocaleString('en-US')}.`)
      }
    }
  }
  return specFindings.length > 0
    ? {
        name: 'agent-skills-spec',
        version: AGENT_SKILLS_CHECK_VERSION,
        outcome: 'warn',
        required: false,
        summary: 'The Skill does not match the Agent Skills specification.',
        findings: specFindings,
      }
    : {
        name: 'agent-skills-spec',
        version: AGENT_SKILLS_CHECK_VERSION,
        outcome: 'pass',
        required: false,
      }
}

/**
 * Text the credential check reads around a chunk boundary. A key block the
 * check finds is at most 16,384 body characters plus its two marker lines, so
 * twice that keeps every block whole in one window.
 */
const CREDENTIAL_WINDOW_CHARACTERS = 32 * 1024

interface CredentialScanner {
  chunk: (bytes: Uint8Array) => void
  /** True when the file is UTF-8 text that holds a private key. */
  end: () => boolean
}

/**
 * The credential check over a file that arrives in chunks. A file that is not
 * valid UTF-8 from end to end is not text, so it has no finding, as before.
 */
function createCredentialScanner(): CredentialScanner {
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false })
  let text = true
  let found = false
  let tail = ''
  let pending = ''
  // Small network reads collect into one piece first, so the window is not
  // searched again for every few bytes.
  const scan = (piece: string, flush: boolean): void => {
    if (found)
      return
    pending += piece
    if (!flush && pending.length < CREDENTIAL_WINDOW_CHARACTERS / 2)
      return
    const window = tail + pending
    pending = ''
    if (containsPrivateKey(window))
      found = true
    tail = window.slice(-CREDENTIAL_WINDOW_CHARACTERS)
  }
  const decode = (bytes?: Uint8Array): string | null => {
    try {
      return bytes ? decoder.decode(bytes, { stream: true }) : decoder.decode()
    }
    catch {
      // Invalid UTF-8 is an expected result: the file is not text.
      return null
    }
  }
  return {
    chunk(bytes) {
      if (!text)
        return
      const piece = decode(bytes)
      if (piece === null) {
        text = false
        tail = ''
        pending = ''
        return
      }
      scan(piece, false)
    },
    end() {
      if (!text)
        return false
      const piece = decode()
      if (piece === null)
        return false
      scan(piece, true)
      return found
    },
  }
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  if (parts.length === 1)
    return parts[0]!
  const merged = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0))
  let offset = 0
  for (const part of parts) {
    merged.set(part, offset)
    offset += part.byteLength
  }
  return merged
}

function omittedFilesResult(omitted: OmittedArtifactFile[]): CheckResult {
  if (omitted.length === 0)
    return { name: 'omitted-files', version: OMITTED_FILES_VERSION, outcome: 'pass', required: false }
  const count = omitted.length === 1
    ? '1 file over the size limits was left out of the Artifact.'
    : `${omitted.length} files over the size limits were left out of the Artifact.`
  const listed = omitted.length > MAX_CHECK_FINDINGS ? ` The first ${MAX_CHECK_FINDINGS} are listed.` : ''
  return {
    name: 'omitted-files',
    version: OMITTED_FILES_VERSION,
    outcome: 'warn',
    required: false,
    summary: count + listed,
    findings: omitted.slice(0, MAX_CHECK_FINDINGS).map((file) => {
      const finding = `${file.path}: ${file.bytes.toLocaleString('en-US')} bytes, ${file.url}`
      // A long path drops the URL first: the path is what a reader needs.
      return finding.length <= MAX_CHECK_FINDING_CHARACTERS
        ? finding
        : `${file.path}: ${file.bytes.toLocaleString('en-US')} bytes`.slice(0, MAX_CHECK_FINDING_CHARACTERS)
    }),
  }
}

export function checksBlockArtifact(checks: CheckResult[], checkSet: ArtifactCheckSet = CURRENT_ARTIFACT_CHECKS): boolean {
  const byName = new Map(checks.map(check => [check.name, check]))
  if (byName.size !== checks.length)
    return true
  for (const [name, expected] of checkSet) {
    const check = byName.get(name)
    if (!check || check.version !== expected.version || check.required !== expected.required)
      return true
  }
  return checks.some(check => check.required && (check.outcome === 'fail' || check.outcome === 'error'))
}

/** Whether checks permit signing under one policy. The current policy is the default. */
export function checksPermitSigning(checks: CheckResult[], policyVersion: string = ARTIFACT_POLICY_VERSION): boolean {
  const checkSet = SIGNABLE_ARTIFACT_POLICIES.get(policyVersion)
  return checkSet !== undefined
    && !checksBlockArtifact(checks, checkSet)
    && checks.every(check => !check.required || check.outcome === 'pass')
}

/**
 * A PEM private key block: the BEGIN line, a body with no dashes, and the END
 * line with the same label. The body bound keeps one match linear; a 4096-bit
 * RSA key is about 3,300 characters.
 */
const PRIVATE_KEY_BLOCK = /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY-----((?:(?!-----)[\s\S]){0,16384})-----END \1PRIVATE KEY-----/g
/** A line break, real or escaped inside a JSON or code string. */
const BODY_LINE_BREAK = /\r?\n|(?:\\+[rn])+/
/** A legacy PEM header such as `Proc-Type: 4,ENCRYPTED`. */
const PEM_HEADER_LINE = /^[\w-]+:\s/
/**
 * Base64 of at least 48 bytes: an Ed25519 PKCS#8 key, the smallest private
 * key format, is exactly 64 characters.
 */
const KEY_BODY = /^[A-Z0-9+/]{64,}={0,2}$/i

/**
 * True when the text holds a complete private key, encrypted or not.
 *
 * A placeholder has the BEGIN line but no key: an ellipsis, a bracketed note,
 * or a test label in the body never reads as base64. The body may sit in a
 * JSON string with escaped line breaks, which is how a leaked service account
 * key usually arrives, or be indented inside YAML.
 */
function containsPrivateKey(text: string): boolean {
  for (const match of text.matchAll(PRIVATE_KEY_BLOCK)) {
    const body = match[2]!
      .split(BODY_LINE_BREAK)
      .map(line => line.trim())
      .filter(line => !PEM_HEADER_LINE.test(line))
      .join('')
    if (KEY_BODY.test(body))
      return true
  }
  return false
}

function decodeText(bytes: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes)
  }
  catch {
    // Invalid UTF-8 is an expected check result.
    return null
  }
}

/**
 * Minimal frontmatter reader for the Agent Skills specification check.
 *
 * Deliberately not the registry parser in `layers/registry`: the signer worker
 * compiles this file on its own, so sharing that parser would pull a YAML
 * dependency into the signing path. This reader only needs to know whether
 * `name` and `description` are present and within their length bounds.
 */
function readSkillFrontmatter(raw: string): { name?: string, description?: string } | null {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match)
    return null
  const lines = match[1]!.split(/\r?\n/)
  const values: { name?: string, description?: string } = {}
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    const separator = line.indexOf(':')
    if (separator < 0)
      continue
    const key = line.slice(0, separator)
    if (key !== 'name' && key !== 'description')
      continue
    const value = line.slice(separator + 1).trim()
    // A block scalar (`>`, `|-`, `>+2`) or a plain scalar that continues on
    // indented lines. Reading `>-` as the value reported a two-character
    // description for Skills whose description is over a thousand.
    if (/^[>|][+-]?\d*$/.test(value) || value === '') {
      const continued: string[] = []
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1]!))
        continued.push(lines[++index]!.trim())
      values[key] = continued.join(value.startsWith('|') ? '\n' : ' ').trim()
    }
    else {
      values[key] = value.replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
    }
  }
  return values
}

export function splitUstarPath(path: string): { name: string, prefix: string } | null {
  const encoder = new TextEncoder()
  if (encoder.encode(path).byteLength <= 100)
    return { name: path, prefix: '' }
  const separators = [...path.matchAll(/\//g)].map(match => match.index)
  for (let index = separators.length - 1; index >= 0; index--) {
    const separator = separators[index]!
    const prefix = path.slice(0, separator)
    const name = path.slice(separator + 1)
    if (encoder.encode(prefix).byteLength <= 155 && encoder.encode(name).byteLength <= 100)
      return { name, prefix }
  }
  return null
}
