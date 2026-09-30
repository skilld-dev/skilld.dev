---
title: Use Skills from private Repositories
description: Run and install Skills from a private GitHub Repository with one login and the skilld GitHub App. The commands stay the same.
label: Delivery
author: Harlan Wilton
command: skilld auth login
publishedAt: 2026-09-01
updatedAt: 2026-09-01
---

**TL;DR.** A Skill in a private Repository works with the same commands as a public one. Log in once, install the skilld GitHub App on the Repository, then `skilld run` or `skilld install` as usual.

## What you need

Private Repository delivery requires both of these:

- `skilld auth login` for a skilld.dev account
- Access through the skilld GitHub App installation

[GitHub](https://github.com) remains the source of truth. skilld.dev reads the Repository through the App and builds an Artifact from one exact commit.

## Log in

```sh
skilld auth login
```

The command opens your browser. Finish the login there with your GitHub account. The CLI stores the credential in your operating system keychain. It does not store tokens in environment variables or plain text files.

```sh
skilld auth status
skilld auth logout
```

`status` shows the signed-in account. `logout` removes the credential from the keychain.

## Install the GitHub App

Install the skilld GitHub App on the account or organization that owns the Repository. Grant it the Repository that holds the Skill. skilld.dev resolves private Skills through that installation only.

If the App is missing, the CLI reports that the source is not available. Install the App, then run the command again.

## Run or install

The commands do not change:

```sh
npx skilld run owner/repo/skill
npx skilld install owner/repo/skill
```

Private Artifact responses use short lived, one time grants. The API does not expose private storage addresses. The CLI verifies the Artifact the same way it verifies a public one. See [How skilld verifies a Skill](/verify).

## What direct mode does

`--direct` fetches a public GitHub Repository without the skilld.dev API. Direct mode never handles private Repositories. It never falls back to skilld.dev. A direct install records the `unverified` source status.

## What this is not

Private delivery is transient and scoped to your account. skilld.dev keeps no private registry, no seats, and no team console. Your Repository stays where it is, and GitHub decides who can read it.
