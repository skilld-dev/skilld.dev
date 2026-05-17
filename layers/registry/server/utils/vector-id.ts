/**
 * Cloudflare Vectorize caps vector IDs at 64 bytes. The natural key
 * `${owner}/${repo}/${name}` overflows for long repo/name combos (e.g.
 * `callstackincubator/react-native-brownfield-migration/...` = 65+ bytes).
 *
 * Hash to SHA-256 hex (exactly 64 ASCII chars). Owner/repo/name remain
 * accessible via the vector's metadata, so lookups by hashed id can
 * reconstruct the natural key for downstream use.
 */
export async function vectorIdFor(skill: { owner: string, repo: string, name: string }): Promise<string> {
  const text = `${skill.owner}/${skill.repo}/${skill.name}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  const bytes = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < bytes.length; i++)
    hex += bytes[i]!.toString(16).padStart(2, '0')
  return hex
}
