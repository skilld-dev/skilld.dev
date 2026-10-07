/**
 * The signer holds up to two signing keys, one per slot, so a rotation can
 * overlap the old key with the new one. Each slot is three vars in
 * `wrangler.jsonc` and one secret.
 *
 * A slot counts only once its vars name a key ID. A secret with no vars is a
 * staged key and signs nothing, so the secret can be put before the deploy
 * that names it. Rotations alternate slots: the next key goes in the slot the
 * last rotation emptied. `docs/runbooks/signing-key-rotation.md` has the order.
 */
export const ARTIFACT_SIGNING_KEY_SLOTS = {
  primary: {
    keyId: 'ARTIFACT_SIGNING_KEY_ID',
    notBefore: 'ARTIFACT_SIGNING_KEY_NOT_BEFORE',
    notAfter: 'ARTIFACT_SIGNING_KEY_NOT_AFTER',
    privateKey: 'ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8',
  },
  secondary: {
    keyId: 'ARTIFACT_SIGNING_SECONDARY_KEY_ID',
    notBefore: 'ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE',
    notAfter: 'ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER',
    privateKey: 'ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8',
  },
} as const

export type ArtifactSigningKeySlot = keyof typeof ARTIFACT_SIGNING_KEY_SLOTS

type SlotNames = typeof ARTIFACT_SIGNING_KEY_SLOTS[ArtifactSigningKeySlot]

export type ArtifactSigningKeyBindingName = SlotNames[keyof SlotNames]

export interface ArtifactSigningKeyWindow {
  slot: ArtifactSigningKeySlot
  keyId: string
  /** Unix seconds. */
  notBefore: number
  /** Unix seconds. */
  notAfter: number
}

/**
 * The key the signer uses for a statement created at `createdAt` and signed
 * at `now`: the newest key whose window holds both times.
 *
 * Both times count because each verifier checks one of them. The site
 * refuses a key whose window is closed now. The skilld CLI refuses a
 * statement created outside the key window. A Resolution created just before
 * the new key's window opens still gets the old key.
 */
export function selectSigningKey<Key extends ArtifactSigningKeyWindow>(
  keys: readonly Key[],
  createdAt: number,
  now: number,
): Key | null {
  const earliest = Math.min(createdAt, now)
  const latest = Math.max(createdAt, now)
  let selected: Key | null = null
  for (const key of keys) {
    if (key.notBefore > earliest || latest >= key.notAfter)
      continue
    if (!selected || key.notBefore > selected.notBefore || (key.notBefore === selected.notBefore && key.notAfter > selected.notAfter))
      selected = key
  }
  return selected
}
