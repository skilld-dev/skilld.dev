# Signing key rotation

Every Artifact attestation carries an Ed25519 signature from the Artifact signer.
Each signing key has a validity window.
When the last usable window closes, the signer refuses to sign and the site stops trusting stored attestations.
After that, every `skilld run` fails.

The key `skilld-production-2026-08` closes at `2026-11-20T00:00:00.000Z`.
This runbook replaces it with `skilld-production-2026-11` and keeps both keys trusted during an overlap.
The daily check-in result `skilld.signing-key` warns 30 days before the last window closes.

## How signing works

The site stages an attestation statement for a Resolution.
The signer Worker `workers/artifact-signer` loads that statement from D1, checks the R2 bytes, and signs a digest of the statement.

The signer has two key slots. Each slot is three vars in `workers/artifact-signer/wrangler.jsonc` and one secret.

| Slot | Vars | Secret |
| --- | --- | --- |
| primary | `ARTIFACT_SIGNING_KEY_ID`, `ARTIFACT_SIGNING_KEY_NOT_BEFORE`, `ARTIFACT_SIGNING_KEY_NOT_AFTER` | `ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8` |
| secondary | `ARTIFACT_SIGNING_SECONDARY_KEY_ID`, `ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE`, `ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER` | `ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8` |

A slot counts only when its vars name a key ID.
A secret with no vars signs nothing, so you can put a secret before the deploy that names it.
If a named slot has no valid secret, the signer refuses every request with `SIGNING_KEY_INVALID`.

For each statement, the signer uses the newest key whose window holds both the statement's `createdAt` and the current time.
A Resolution created before a new window opens still gets the old key.

The trusted root is the `ARTIFACT_TRUSTED_ROOT_JSON` secret on the public Worker.
It holds the root key ID, the root public key, and one entry per signing key.
Each entry carries a statement that the offline root key signed.
The site serves it at `/api/v1/trusted-root` with a five-minute cache.

Each verifier applies these rules to a signing key:

| Rule | Signer | Site | skilld CLI |
| --- | --- | --- | --- |
| The trusted root names the key with status `active` or `overlapping` | no | yes | yes |
| The root key signed the key entry | no | no | yes |
| The window holds the statement's `createdAt` | yes | yes | yes |
| The window holds the current time | yes | yes | no |

The CLI fetches the trusted root on every run and keeps no copy.
It checks the root against a root key compiled into each release.
Every release from 3.0.0 through 3.6.4 carries the root key `skilld-root-2026` and no signing key.
A signing key rotation needs no CLI release. Only a root key change needs one.

## What happens to stored Artifacts

Once a key window closes, the site stops trusting every attestation that key signed.
The next request for that Skill commit misses the reuse check with `attestation-untrusted` and builds again.
The new build signs under the current key.
The bytes match, so the Artifact ID and the R2 object stay the same. Only a new attestation row is added.

The signer cannot sign a stored statement again. It signs only a Resolution in `signing` state with fresh check results.
A rebuild is the only way to sign an Artifact again.

The CLI keeps no attestation on disk. A lockfile names a commit, so `skilld install` resolves again and gets the new attestation.

Private Artifacts follow the same path through `verifyArtifactAttestation`.

## Before you start

You need the offline root private key for `skilld-root-2026`, in PKCS8 PEM or base64url DER form.
Never copy it into the repository, [Cloudflare](https://cloudflare.com), or GitHub Actions.

Work in a private directory outside the repository, for example on an encrypted volume.
Set `KEYS` to that directory. Run every command from the repository root.

```sh
export KEYS=/path/to/private/dir
```

`scripts/trusted-root.ts` runs the ceremony. It never prints a private key.
It writes new files with mode 600 and refuses to overwrite a file.

## Timeline

All times are UTC. Each date is the latest safe date. Earlier is better.

| Step | Action | Latest safe date |
| --- | --- | --- |
| 1 | Deploy slot support | 2026-11-02 |
| 2 | Run the ceremony | 2026-11-06 |
| 3 | Put the new trusted root on the site | 2026-11-09 |
| 4 | Put the new private key in the free slot | 2026-11-09 |
| 5 | Name the new key in the signer vars | 2026-11-13 |
| 6 | Remove the old key from the trusted root | 2026-11-19 |
| 7 | Empty the old slot | after 2026-11-20 |

Step 3 must reach production at least 10 minutes before step 5, so that cached roots expire.
If step 5 slips past 2026-11-13, a failed deploy has less than a week to recover.
If step 5 does not deploy before `2026-11-20T00:00:00.000Z`, every `skilld run` fails until it does.

## 1. Deploy slot support

Confirm that `workers/artifact-signer/src/slots.ts` exists on `main`.
Confirm that the last `Deploy to Cloudflare` run on `main` passed after that file arrived.

```sh
git fetch origin main
git log -1 --format='%H %cs' origin/main -- workers/artifact-signer/src/slots.ts
gh run list --repo skilld-dev/skilld.dev --workflow deploy-cloudflare.yml --branch main --limit 3
```

## 2. Run the ceremony

Save the live root. It is the rollback value and the pin for the checks below.

```sh
curl -fsS https://skilld.dev/api/v1/trusted-root | jq -c 'del(.fetchedAt)' > "$KEYS/root-before.json"
```

Generate the new signing key.

```sh
pnpm exec tsx scripts/trusted-root.ts signing-key --key-id skilld-production-2026-11 --out "$KEYS"
```

Sign its statement with the root key.
Set `--not-before` to the ceremony day at 00:00. Set `--not-after` six months later.
A longer window means fewer ceremonies. A shorter one limits the damage of a leaked key.

```sh
pnpm exec tsx scripts/trusted-root.ts add-key \
  --root "$KEYS/root-before.json" \
  --root-key /path/to/root-private-key \
  --key-id skilld-production-2026-11 \
  --public-key-file "$KEYS/skilld-production-2026-11.pub" \
  --not-before 2026-10-14T00:00:00Z \
  --not-after 2027-05-20T00:00:00Z \
  --status active \
  --out "$KEYS/root-next.json"
```

Use `active`. The verifiers treat `overlapping` the same way, and the status is part of the signed statement.

Check the new root by the rules every released CLI applies, and check that the private key matches the entry:

```sh
pnpm exec tsx scripts/trusted-root.ts verify \
  --root "$KEYS/root-next.json" \
  --pin "$KEYS/root-before.json" \
  --key-id skilld-production-2026-11 \
  --signing-key "$KEYS/skilld-production-2026-11.pkcs8"
```

Stop unless it prints `OK`.

## 3. Put the new trusted root on the site

```sh
pnpm exec wrangler secret put ARTIFACT_TRUSTED_ROOT_JSON --config wrangler.jsonc < "$KEYS/root-next.json"
```

The put deploys a new public Worker version at once.

Verify the live root:

```sh
pnpm exec tsx scripts/trusted-root.ts verify --root https://skilld.dev/api/v1/trusted-root --pin "$KEYS/root-before.json"
```

It must list both keys and print `OK`.

Run the oldest and newest released CLIs. Each run checks every root signature as shipped:

```sh
npx -y skilld@3.0.0 run skilld-dev/skills/find-skill > /dev/null && echo ok
npx -y skilld@latest run skilld-dev/skills/find-skill > /dev/null && echo ok
```

If either run fails with a `TRUSTED_ROOT_` code, roll back this step at once.

## 4. Put the new private key in the free slot

The free slot is the one whose vars name no key. For this rotation it is the secondary slot.

```sh
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret put ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8 --config wrangler.jsonc < "$KEYS/skilld-production-2026-11.pkcs8"
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret list --config wrangler.jsonc
```

The list must name `ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8`.
The signer still signs with the old key, because no vars name the secondary slot.

## 5. Name the new key in the signer vars

Open a pull request that adds these vars to `workers/artifact-signer/wrangler.jsonc`.
Use the same window as the trusted root entry, or a window inside it.

```jsonc
{
  "vars": {
    "ARTIFACT_SIGNING_SECONDARY_KEY_ID": "skilld-production-2026-11",
    "ARTIFACT_SIGNING_SECONDARY_KEY_NOT_BEFORE": "2026-10-14T00:00:00.000Z",
    "ARTIFACT_SIGNING_SECONDARY_KEY_NOT_AFTER": "2027-05-20T00:00:00.000Z"
  }
}
```

Regenerate the signer types in the same pull request:

```sh
pnpm --filter @skilld/artifact-signer-worker types
```

Before you merge, confirm step 3 is live and step 4 lists the secret.
The merge runs `Deploy to Cloudflare`. It deploys the signer first.
From that deploy, each new build signs with `skilld-production-2026-11`.

Count attestations per key. New builds must show the new key ID:

```sh
pnpm exec wrangler d1 execute DB --remote --config wrangler.jsonc --command \
  "SELECT json_extract(attestation_json, '$.signature.keyId') AS key_id, COUNT(*) AS attestations, datetime(MAX(created_at), 'unixepoch') AS newest FROM artifact_attestations GROUP BY key_id"
```

Check [Sentry](https://sentry.io) for `Artifact signer returned an invalid signature` and the signer logs for `SIGNING_KEY_INVALID`.
Either one means the signer and the trusted root disagree. Roll back this step.

## 6. Remove the old key from the trusted root

Do this at a time you can watch, at least one day before the old window closes.
Every stored Artifact that the old key signed then builds again on its next request.
The same rebuilds happen at `2026-11-20T00:00:00.000Z` anyway. Before that time, you can still roll back.

Removal needs no root key.

```sh
pnpm exec tsx scripts/trusted-root.ts remove-key --root "$KEYS/root-next.json" --key-id skilld-production-2026-08 --out "$KEYS/root-after.json"
pnpm exec tsx scripts/trusted-root.ts verify --root "$KEYS/root-after.json" --pin "$KEYS/root-before.json"
pnpm exec wrangler secret put ARTIFACT_TRUSTED_ROOT_JSON --config wrangler.jsonc < "$KEYS/root-after.json"
pnpm exec tsx scripts/trusted-root.ts verify --root https://skilld.dev/api/v1/trusted-root --pin "$KEYS/root-before.json"
```

Watch the build queue, failed jobs, and [GitHub](https://github.com) read quota in the daily check-in for one hour.
A CLI that held a Resolution across the change fails once with `SIGNING_KEY_UNKNOWN`. Its next run passes.

## 7. Empty the old slot

After `2026-11-20T00:00:00.000Z`, open a pull request that removes the three primary slot vars from `workers/artifact-signer/wrangler.jsonc`.
Regenerate the signer types in it.
After its deploy, delete the old secret:

```sh
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret delete ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8 --config wrangler.jsonc
```

Never delete a secret while vars still name its slot. The signer then refuses every request.

Store the new private key file offline, or delete it. Cloudflare holds the only copy the signer needs.

## Next rotation

The next rotation uses the slot this one emptied, so the slots alternate.
Repeat steps 2 to 7 with the slot names swapped.
`skilld.signing-key` warns 30 days before `skilld-production-2026-11` closes.

## Roll back

| Step | Roll back | Valid until |
| --- | --- | --- |
| 3 | Put `$KEYS/root-before.json` back as `ARTIFACT_TRUSTED_ROOT_JSON`. | step 5 deploys |
| 4 | Delete `ARTIFACT_SIGNING_SECONDARY_PRIVATE_KEY_PKCS8`. | step 5 deploys |
| 5 | Revert the vars pull request. The signer signs with the old key again. Keep the new key in the trusted root, because it signed live attestations. | `2026-11-20T00:00:00.000Z` |
| 6 | Put `$KEYS/root-next.json` back as `ARTIFACT_TRUSTED_ROOT_JSON`. | `2026-11-20T00:00:00.000Z` |

Never remove a key from the trusted root while the signer still names it.
The site then rejects every new signature, and every build fails.

## Rules for every released CLI

- Never change the root key without a CLI release. Each release compiles in the root key and refuses any other root.
- Never add a field to a trusted root key entry or statement. The CLI rejects unknown fields there.
- Use only the statuses `active`, `overlapping`, `retired`, and `revoked`.
- A status change needs a new root signature. Remove a key instead of retiring it.
- Run `scripts/trusted-root.ts verify` before every `wrangler secret put ARTIFACT_TRUSTED_ROOT_JSON`.
  The site never checks a root signature. A bad one stops every CLI with an upgrade message that no upgrade fixes.
