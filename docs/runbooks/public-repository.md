# Public repository preparation

Complete these steps before changing repository visibility.

## Remove self-hosted access

A fork can change workflow files and request a self-hosted runner.
Workflow conditions do not protect registered runners.
[GitHub documents this risk](https://docs.github.com/en/actions/reference/security/secure-use#hardening-for-self-hosted-runners).

1. Merge the workflow changes that use GitHub-hosted runners.
2. Confirm the main push passes Test and Deploy to Cloudflare.
3. In the runner infrastructure repository, remove this repository from both pool configurations.
   Remove its `harlan-desktop-ci` and `harlan-desktop-deploy` entries from `runners.conf` and `hogwild-runners.conf`.
4. Apply both pool configurations using the runner infrastructure's installation procedure.
   Let active jobs finish before removing their registrations.
5. Confirm the supervisor no longer creates runners for this repository.
6. Confirm GitHub reports zero self-hosted runners for the repository.

Run the last check from this repository:

```sh
gh api repos/skilld-dev/skilld.dev/actions/runners --jq '.runners | length'
```

The result must be `0`.
Keep organization runner groups unavailable to public repositories unless they restrict trusted workflows and refs.
Changing `runs-on` alone leaves a registered runner available to a modified fork workflow.

## Review published records

Scan tracked files, all available Git refs, retained Actions logs, artifacts, issues, and pull request discussions.
Review internal work notes and backups for deliberate publication.
Deleting a file from main leaves earlier versions in Git history.

If a scan finds a real credential, rotate it before removing its public copies.
Review image attachments separately. A text scan cannot inspect their pixels.

[GitHub makes historical Actions logs public when visibility changes](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/setting-repository-visibility).
Secret masking does not guarantee that every credential stays hidden.

## Change visibility

After the checks pass, the repository owner can change visibility in GitHub settings.
Confirm branch protection, required checks, fork workflow approvals, and secret protection after the change.
Use the current `site/lint`, `site/typecheck`, `site/test`, `build`, and `harness-proof` job names when setting required checks.
Exercise a fork pull request and confirm that every job uses GitHub-hosted runners.
Confirm that its Test completion does not start a production deployment.
