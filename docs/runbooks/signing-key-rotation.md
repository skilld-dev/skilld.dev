# Signing key rotation

Rotate the Artifact signing key before its validity window closes.
The key `skilld-production-2026-08` closes at `2026-11-20T00:00:00.000Z`.
This rotation adds `skilld-production-2026-11`, with both keys trusted during the overlap.
The `skilld.signing-key` check-in warns 30 days before the last window closes.

## Root keys

The private key for `skilld-root-2026` was lost in November 2026.
Do not use it for this ceremony.
Preserve `ARTIFACT_TRUSTED_ROOT_JSON` unchanged for `/api/v1/trusted-root`.
CLI releases 3.0.0 through 3.6.9 pin that root and cannot trust the new signing key.
Those users must upgrade to a release carrying the new pins before the signer switches keys.
Even without a switch, their old key expires on November 20.

The CLI 3.7.0 rollout pins these two roots independently:

| Root key | Selection | Private key escrow |
| --- | --- | --- |
| `skilld-root-2026-11` | Primary | Harlan's password manager and an offline USB stick |
| `skilld-root-backup-2026-11` | Backup when the primary is absent | Harlan's password manager and a second offline USB stick |

Confirm that the released CLI contains both exact public keys before activation.
A matching root ID alone does not establish a pin.
Never generate replacement root keys for IDs already pinned by a released CLI.
If one root key is lost, serve the other root. If both are lost, release new CLI pins.

`ARTIFACT_TRUSTED_ROOTS_JSON` holds a JSON array, primary first, backup second.
The site verifies attestations with the first entry, without automatic failover from an invalid entry.
Each `/api/v1/trusted-roots/{rootKeyId}` endpoint serves its own valid entry independently.
An invalid entry logs its array index without logging its contents.
Both roots must contain identical signing key IDs, public keys, statuses, algorithms, and validity windows.
Their root public keys, statements, and root signatures differ by design.

## How signing works

The site stages an attestation statement for a Resolution.
The signer Worker checks its D1 state and R2 bytes, then signs a digest of the statement.
It signs only a Resolution in `signing` state with fresh check results.

The signer has two slots in `workers/artifact-signer/wrangler.jsonc`:

| Slot | Vars | Secret |
| --- | --- | --- |
| primary | `ARTIFACT_SIGNING_KEY_ID`, `ARTIFACT_SIGNING_KEY_NOT_BEFORE`, `ARTIFACT_SIGNING_KEY_NOT_AFTER` | `ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8` |
| secondary | `ARTIFACT_SIGNING_SECONDARY_KEY_ID`, `ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE`, `ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER` | `ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8` |

A secret with no slot vars signs nothing.
If a named slot lacks a valid secret, every signing request fails with `SIGNING_KEY_INVALID`.
The signer selects the newest key covering both the statement's `createdAt` and the current time.
The site requires the same coverage and an `active` or `overlapping` status.
The CLI checks the statement's time and the root signature against its compiled pin.
The site parser checks statement consistency but does not verify root signatures.
The ceremony verification below therefore gates publication.

When a key expires or leaves the roots, stored attestations lose site trust.
The next request builds again and signs with the current key.
Matching bytes keep the Artifact ID and R2 object. A new attestation row records the signature.
Private Artifacts use the same attestation verification.

## Before you start

Restore both new root private keys from escrow.
Keep them outside the repository, [Cloudflare](https://cloudflare.com), and GitHub Actions.
Prepare a complete root configuration file for each new root as a local pin file.
Compare each file's `rootKeyId` and `rootPublicKey` with the reviewed CLI release's compiled pins.
Stop if either differs. The tool parses each pin file as a complete root configuration.
Do not obtain pins from the endpoint being tested.
Save them as `$KEYS/primary-pin.json` and `$KEYS/backup-pin.json`.

Use a private directory on an encrypted volume. Run commands from the repository root:

```sh
export KEYS=/path/to/private/dir
```

The ceremony tool writes new files without overwriting existing files.
Private key and root files use mode 600.
The commands below assume escrowed roots already contain the old signing key.
For initial activation, create those roots first with each escrowed private key:

```sh
for ROOT in skilld-root-2026-11 skilld-root-backup-2026-11; do
  pnpm exec tsx scripts/trusted-root.ts create-root \
    --root-key-id "$ROOT" --root-key "$KEYS/$ROOT.pkcs8" \
    --key-id skilld-production-2026-08 \
    --public-key-file "$KEYS/skilld-production-2026-08.pub" \
    --not-before 2026-08-20T00:00:00Z --not-after 2026-11-20T00:00:00Z \
    --out "$KEYS/$ROOT-before.json"
done
```

Use the old public key and window from the preserved legacy root.
For later rotations, save both current endpoints as the `*-before.json` files instead.
Retain the exact previous array and its order as `$KEYS/roots-before.json` for rollback.
For initial activation, record that the array was absent instead.

## 1. Prepare and verify both roots

Generate one signing key, then sign the same entry under both root keys:

```sh
pnpm exec tsx scripts/trusted-root.ts signing-key --key-id skilld-production-2026-11 --out "$KEYS"
for ROOT in skilld-root-2026-11 skilld-root-backup-2026-11; do
  pnpm exec tsx scripts/trusted-root.ts add-key \
    --root "$KEYS/$ROOT-before.json" --root-key "$KEYS/$ROOT.pkcs8" \
    --key-id skilld-production-2026-11 \
    --public-key-file "$KEYS/skilld-production-2026-11.pub" \
    --not-before 2026-11-18T00:00:00Z --not-after 2027-05-20T00:00:00Z \
    --status active --out "$KEYS/$ROOT-next.json"
done
pnpm exec tsx scripts/trusted-root.ts verify \
  --root "$KEYS/skilld-root-2026-11-next.json" --pin "$KEYS/primary-pin.json" \
  --peer-root "$KEYS/skilld-root-backup-2026-11-next.json" --peer-pin "$KEYS/backup-pin.json" \
  --key-id skilld-production-2026-11 --signing-key "$KEYS/skilld-production-2026-11.pkcs8"
jq -s '.' "$KEYS/skilld-root-2026-11-next.json" "$KEYS/skilld-root-backup-2026-11-next.json" > "$KEYS/roots-next.json"
```

Stop unless verification prints `OK`.
It checks both pins, both sets of root signatures, matching signer coverage, and the new signing private key.
If the ceremony date changes, use its UTC midnight for `notBefore` in both roots and signer vars.

## 2. Publish and verify both endpoints

Run the verification from step 1 on the exact file you upload, then put it:

```sh
pnpm exec wrangler secret put ARTIFACT_TRUSTED_ROOTS_JSON --config wrangler.jsonc < "$KEYS/roots-next.json"
```

Confirm the deployed secondary slot has no key ID vars, then stage the new signing key there:

```sh
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret put ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8 --config wrangler.jsonc < "$KEYS/skilld-production-2026-11.pkcs8"
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret list --config wrangler.jsonc
```

A secret with no vars naming its slot signs nothing, so staging it early is safe.
Neither offline root private key leaves the ceremony machine.
Do not upload either new root to `ARTIFACT_TRUSTED_ROOT_JSON`.
After the route deployment, verify both live endpoints against their own independent pins:

```sh
pnpm exec tsx scripts/trusted-root.ts verify \
  --root https://skilld.dev/api/v1/trusted-roots/skilld-root-2026-11 --pin "$KEYS/primary-pin.json" \
  --peer-root https://skilld.dev/api/v1/trusted-roots/skilld-root-backup-2026-11 --peer-pin "$KEYS/backup-pin.json"
```

Stop unless it prints `OK` and lists both signing keys.
Wait at least 10 minutes after publication before switching the signer, so five-minute endpoint caches expire.
Confirm a released CLI with both new pins can run a Skill before proceeding.
Do not use an old CLI's success under the old key as proof of new root support.

## 3. Activate the signer

Confirm slot support passed the production deploy workflow.
The free slot has no key ID vars. This rotation uses the secondary slot.
Step 2 stages its secret before any vars enable it.
Never put that secret again after vars name the slot.

Open a pull request adding these vars to `workers/artifact-signer/wrangler.jsonc`:

```jsonc
{
  "vars": {
    "ARTIFACT_SIGNING_SECONDARY_KEY_ID": "skilld-production-2026-11",
    "ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE": "2026-11-19T20:00:00.000Z",
    "ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER": "2027-05-20T00:00:00.000Z"
  }
}
```

The signer picks the newest open key, so `NOT_BEFORE` sets the switch time.
2026-11-19T20:00Z leaves four hours to roll back before the old key closes.
Run `pnpm --filter @skilld/artifact-signer-worker types` in that pull request.
Before merging, confirm both live root checks passed and the secondary secret exists.
The deploy workflow deploys the signer first. Statements created from `NOT_BEFORE` use the new key.
Inspect new attestation key IDs with a read-only D1 query:

```sh
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --command \
  "SELECT json_extract(attestation_json, '$.signature.keyId') AS key_id, COUNT(*) AS attestations, datetime(MAX(created_at), 'unixepoch') AS newest FROM artifact_attestations GROUP BY key_id"
```

Check signer logs for `SIGNING_KEY_INVALID` and [Sentry](https://sentry.io) for `Artifact signer returned an invalid signature`.
Either error requires signer rollback while the old window remains open.

## 4. Remove the old signing key

After confirming new signatures work, remove the old entry from both new roots:

```sh
for ROOT in skilld-root-2026-11 skilld-root-backup-2026-11; do
  pnpm exec tsx scripts/trusted-root.ts remove-key \
    --root "$KEYS/$ROOT-next.json" --key-id skilld-production-2026-08 --out "$KEYS/$ROOT-after.json"
done
pnpm exec tsx scripts/trusted-root.ts verify \
  --root "$KEYS/skilld-root-2026-11-after.json" --pin "$KEYS/primary-pin.json" \
  --peer-root "$KEYS/skilld-root-backup-2026-11-after.json" --peer-pin "$KEYS/backup-pin.json"
jq -s '.' "$KEYS/skilld-root-2026-11-after.json" "$KEYS/skilld-root-backup-2026-11-after.json" > "$KEYS/roots-after.json"
```

Put the reduced array:

```sh
pnpm exec wrangler secret put ARTIFACT_TRUSTED_ROOTS_JSON --config wrangler.jsonc < "$KEYS/roots-after.json"
```

Repeat the live endpoint verification from step 2.
Preserve the legacy secret. Removing its old key cannot make old CLIs trust the new key.
Watch the build queue and failed jobs for one hour as stored Artifacts rebuild.
A Resolution held across removal can fail once with `SIGNING_KEY_UNKNOWN`; its next run resolves again.

After November 20, remove the three primary slot vars through a pull request and regenerate signer types.
After that deployment, the unused primary secret signs nothing.
Then delete it with `wrangler secret delete ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8` on the signer.
Never delete a secret while vars name its slot.
Store the new signing private key offline, or delete the local copy.

## Roll back

| Change | Recovery | Limit |
| --- | --- | --- |
| New array, before signer activation | Put the previous verified array back into `ARTIFACT_TRUSTED_ROOTS_JSON`. For initial activation, keep the verified roots and leave the secondary slot disabled. | Before any new-key attestations exist |
| Secondary secret, before slot vars | Leave the secondary slot disabled. Its unused secret signs nothing. | Before signer activation |
| Signer activation | Revert the vars pull request. Keep the new signing key in both roots because it signed live attestations. | Old key window closes November 20 |
| Old key removal | Republish `roots-next.json` to `ARTIFACT_TRUSTED_ROOTS_JSON`, then verify both endpoints against their pins. | Old signatures remain usable only before November 20 |

Do not restore legacy-only verification after the new key signs live attestations.
After the old window closes, recover forward with a valid new signing key in both roots and the signer.
All recovery deployments use the production workflow. Never overwrite the legacy secret with a new root.

For root failover, validate matching coverage first, then serve only the backup root in the array.
Verify its endpoint against the backup pin. Removing the primary lets clients select the backup.
The backup becomes the site's first entry. Do not leave an invalid primary in that position.

## Next rotation

Alternate signer slots. Repeat the ceremony for both roots and compare coverage before every publication.
Never add fields to key entries or statements, because released CLIs reject unknown fields.
Use only `active`, `overlapping`, `retired`, and `revoked` statuses.
A status change requires a new root signature. Removal needs no root private key.
