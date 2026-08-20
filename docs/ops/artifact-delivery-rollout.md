# Artifact delivery rollout

Use this guide before merging the first Artifact delivery change.

The deploy workflow applies D1 migrations, then deploys the signer and public Worker.
The signer always deploys first.

## 1. Prepare access and recovery

Use a [Cloudflare](https://cloudflare.com) token.
It must manage Workers, D1, R2, Queues, secrets, and routes.

Export D1 before the first migration:

```bash
pnpm exec wrangler d1 export DB --remote --output <secure-path>/skilld-db-before-artifacts.sql
```

Store the export outside the repository.

Worker rollback does not restore D1, R2, Queue, or secret state.

## 2. Create Cloudflare resources

Create each missing resource once:

```bash
pnpm exec wrangler r2 bucket create skilld-public-artifacts
pnpm exec wrangler r2 bucket create skilld-private-artifacts
pnpm exec wrangler queues create skilld-artifact-build
pnpm exec wrangler queues create skilld-artifact-build-dlq
```

Keep both R2 buckets private through their `r2.dev` URLs.

Attach `artifacts.skilld.dev` as the custom domain for `skilld-public-artifacts`.
Do not attach a custom domain to `skilld-private-artifacts`.

Confirm these bindings match `wrangler.jsonc`:

- `DB`
- `PUBLIC_ARTIFACTS`
- `PRIVATE_ARTIFACTS`
- `ARTIFACT_BUILD_QUEUE`
- `ARTIFACT_SIGNER`

The signer uses the same D1 database and both R2 buckets.

## 3. Register the GitHub App

Create one GitHub App for login and private Repository access.

Set these values:

- Callback URL: `https://skilld.dev/auth/github`
- Webhook URL: `https://skilld.dev/api/v1/webhooks/github`
- Webhook SSL verification: enabled
- Repository permission, Contents: read only
- Repository permission, Metadata: read only
- Events: `installation` and `installation_repositories`
- Repository selection: selected Repositories only
- Expiring user access tokens: enabled

Use the same GitHub App client ID and secret for [GitHub](https://github.com) login.
Set them as `NUXT_OAUTH_GITHUB_CLIENT_ID` and `NUXT_OAUTH_GITHUB_CLIENT_SECRET`.

Set the client ID again as `GITHUB_APP_CLIENT_ID`.
Set the numeric App ID as `GITHUB_APP_ID`.
Stop if `NUXT_OAUTH_GITHUB_CLIENT_ID` and `GITHUB_APP_CLIENT_ID` differ.

Convert the GitHub App private key to unencrypted PKCS8.
Store its canonical base64url bytes as `GITHUB_APP_PRIVATE_KEY_PKCS8`.

Store the webhook secret as `GITHUB_APP_WEBHOOK_SECRET`.

Existing users must sign in again after the login App changes.
Their old token cannot prove GitHub App installation access.

## 4. Complete the key ceremony

Keep the Ed25519 root private key offline.
Never add it to Cloudflare or GitHub Actions.

Create one root signed statement for the production signing key.
The statement bytes must use canonical JSON and canonical base64url.

Set `ARTIFACT_TRUSTED_ROOT_JSON` on the public Worker.
It contains the root public key and root signed production keys.

Compile the same root key ID and public key into the skilld CLI release.
Stop if either value differs.

Set these signer values in `workers/artifact-signer/wrangler.jsonc`:

- `ARTIFACT_SIGNING_KEY_ID`
- `ARTIFACT_SIGNING_KEY_NOT_BEFORE`
- `ARTIFACT_SIGNING_KEY_NOT_AFTER`
- `ARTIFACT_SIGNING_MAX_AGE_SECONDS`

Store only the production signing private key in the signer Worker:

```bash
pnpm --filter @skilld/artifact-signer-worker exec wrangler secret put ARTIFACT_SIGNING_PRIVATE_KEY_PKCS8
```

## 5. Set public Worker secrets

Generate two random 32 byte keys.
Encode both with canonical base64url.

Store one as `ARTIFACT_KEY_WRAP_KEY_PRIMARY`.
Store the other as `ARTIFACT_GRANT_IDEMPOTENCY_KEY`.

Leave `ARTIFACT_KEY_WRAP_KEY_SECONDARY` unset for the first deploy.
Keep `ARTIFACT_KEY_WRAP_KEY_ACTIVE_SLOT` set to `primary`.
Keep `ARTIFACT_KEY_WRAP_KEY_SECONDARY_ID` empty.

Set the remaining values with `wrangler secret put`:

- `GITHUB_APP_ID`
- `GITHUB_APP_CLIENT_ID`
- `GITHUB_APP_PRIVATE_KEY_PKCS8`
- `GITHUB_APP_WEBHOOK_SECRET`
- `NUXT_OAUTH_GITHUB_CLIENT_ID`
- `NUXT_OAUTH_GITHUB_CLIENT_SECRET`
- `ARTIFACT_KEY_WRAP_KEY_PRIMARY`
- `ARTIFACT_GRANT_IDEMPOTENCY_KEY`
- `ARTIFACT_TRUSTED_ROOT_JSON`

Preserve the existing `NUXT_TOKEN_KEY`.
Changing it breaks stored GitHub credentials.

Keep every Artifact wrapping key in recoverable secret storage.
Losing it makes every stored private Artifact unreadable.

## 6. Apply migrations in order

List the pending migrations:

```bash
pnpm exec wrangler d1 migrations list DB --remote
```

The list must show this order:

1. `0110_artifact_delivery.sql`
2. `0111_github_app_delivery.sql`
3. `0112_private_artifact_keys.sql`

Apply them:

```bash
pnpm db:migrations:prod
```

List pending migrations again.
Stop unless the list is empty.

These migrations are additive and forward only.
Do not delete their tables during rollback.

## 7. Deploy in order

Deploy the signer first:

```bash
pnpm --filter @skilld/artifact-signer-worker deploy:production
```

Then deploy the public Worker:

```bash
pnpm build
pnpm production:deploy
```

The production workflow runs the same signer first order.
Create every resource and secret before merging.

## 8. Run production smoke checks

Run the existing route smoke:

```bash
pnpm production:smoke
```

Then check Artifact delivery:

1. Fetch `/api/v1/trusted-root`. Require `200` and a five minute public cache policy.
2. Create one public Resolution. Poll it until `ready`.
3. Create its grant. Require a signed attestation and HTTPS content URL.
4. Download the public Artifact twice. Require identical SHA256 bytes.
5. Require `Cache-Control: public, max-age=31536000, immutable` on those bytes.
6. Fetch a missing private Artifact without a bearer token. Require `404` and `no-store`.
7. Fetch private content without `x-skilld-grant`. Require `404` and `no-store`.
8. Send a webhook with an invalid signature. Require `401` and `no-store`.
9. Install the GitHub App on one test Repository.
10. Create and download one private Artifact. Confirm the grant works once.
11. Replay that grant. Require `404`.
12. Remove the test Repository. Require old and new grants to fail.

Check `CF-Cache-Status` on the public Artifact domain.
The second public download should be cache eligible.

Private responses must never report a shared cache hit.

## 9. Roll back safely

`pnpm production:deploy` can roll back only the public Worker version.

It cannot reverse D1 migrations or restore R2, Queue, or secret state.
The signer also remains on its new version.

If public smoke fails, let the deploy command restore the previous public Worker.
Keep the signer deployed when it supports both public Worker versions.

If the signer fails before public deployment, stop the rollout.
Use `wrangler rollback` in the signer package only after identifying its previous version.

Never restore the D1 export over a live database without a separate recovery plan.
New writes after the export would be lost.

Public Artifact URLs are immutable and may remain in shared caches.
Revocation stops new grants but cannot remove bytes already downloaded or cached.

## 10. Rotate keys

Rotate an Ed25519 signing key with an overlap window:

1. Add the new root signed public key with `overlapping` status.
2. Deploy the updated trusted root to the public Worker.
3. Deploy the signer with the new private key and key ID.
4. Confirm new Artifacts use the new key.
5. Mark the old key `retired` after its overlap window.

Rotate the GitHub App private key before deleting the old key in GitHub.
Update `GITHUB_APP_PRIVATE_KEY_PKCS8`, then deploy and test one private Resolution.

Rotate an Artifact wrapping key through the inactive slot:

1. Generate a new canonical base64url 32 byte key.
2. Store it in the inactive wrapping key secret.
3. Set the inactive slot ID to a new unique value.
4. Change `ARTIFACT_KEY_WRAP_KEY_ACTIVE_SLOT` to the inactive slot.
5. Deploy the public Worker once with both variable changes.
6. Read or build private Artifacts to rewrap Account keys on demand.
7. Count rows that still use the old ID.

```sql
SELECT COUNT(*) FROM private_artifact_keys WHERE wrap_key_id = '<old-id>';
```

Keep the old slot configured until the count reaches zero.
Never overwrite a slot while any row uses its ID.

Rotate `ARTIFACT_GRANT_IDEMPOTENCY_KEY` only after every private grant expires.
Keep the old value for at least 25 hours after the last grant request.
