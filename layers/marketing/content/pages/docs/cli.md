---
title: skilld CLI reference
description: Every skilld command with its help text. Generated from the CLI help for skilld 3.3.0.
label: Reference
author: Harlan Wilton
command: npm install --global skilld
publishedAt: 2026-09-01
updatedAt: 2026-10-02
---

Generated from `skilld --help` for skilld `3.3.0`. Run `npx skilld <command>` or install the CLI once with `npm install --global skilld`.

The npm package selects a native executable for your system. It has no JavaScript engine or fallback.

## skilld

```text
Search, run, install, and keep Skills current

Usage: skilld [OPTIONS] <COMMAND>

Commands:
  search      Search for Skills
  install     Install a Skill, or restore the Skills in your lockfile
  add         Install every Skill a Repository, curator, or collection names
  run         Load a Skill for this session without installing it
  list        List installed Skills
  view        View an installed Skill, or a Skill, Repository, curator, or collection on skilld.dev
  remove      Remove an installed Skill
  update      Update installed Skills to their current source commit
  verify      Verify a Skill source and report its source status
  outdated    Report outdated and unmanaged Skills
  browse      Browse the registry by owner, tag, and order
  trending    List trending Skills and why each one trends
  tracks      List tracks, or the Skills of one track
  index       Ask skilld.dev to index a GitHub Repository, then wait for its Skills
  curators    List the curators who publish collections on skilld.dev
  account     Show your skilld.dev account, or change one setting
  like        Like a Skill. skilld.dev also watches its Repository for your digest
  unlike      Remove your like of a Skill
  likes       List the Skills you like, or the public likes of one curator
  watch       Watch a Repository or a collection, so your digest reports its changes
  unwatch     Stop watching a Repository
  watches     List the Repositories you watch
  changes     List what changed in the Repositories you watch: your digest
  stars       List your starred GitHub Repositories that hold Skills, or import them again
  collection  Create a collection, or add and remove its Skills
  tokens      List, create, or revoke the skilld tokens that act for your account
  auth        Log in, check, or log out of your account
  config      Read, set, or list configuration values

Options:
      --json     Output stable JSON for Agents and automation
      --plain    Output stable text without terminal formatting
  -h, --help     Print help
  -V, --version  Print version
```

## skilld search

Search for Skills.

```text
Search for Skills

Usage: skilld search [OPTIONS] [QUERY]...

Arguments:
  [QUERY]...

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld install

Install a Skill, or restore the Skills in your lockfile.

```text
Install a Skill, or restore the Skills in your lockfile.

Give SOURCE as:
  OWNER/REPOSITORY/SKILL
      Install a hosted Artifact.
  github:OWNER/REPOSITORY/SKILL_PATH
  github:OWNER/REPOSITORY/SKILL_PATH#branch:BRANCH
  github:OWNER/REPOSITORY/SKILL_PATH#tag:TAG
  github:OWNER/REPOSITORY/SKILL_PATH#commit:SHA
  https://github.com/OWNER/REPOSITORY/tree/REF/SKILL_PATH
      Install a hosted Artifact from an explicit GitHub selector.
      Add --direct to fetch a public GitHub Repository instead.
  ./RELATIVE_PATH or ABSOLUTE_PATH
      Install a local Skill.
  skilld
      Install the skilld-maintained Skill with --global.

Run skilld install without SOURCE to restore .skills/skilld-lock.yaml.
Verified remote Skills restore the exact locked Git commit.

Usage: skilld install [OPTIONS] [SOURCE]

Arguments:
  [SOURCE]
          The Skill source to install. Omit SOURCE to restore .skills/skilld-lock.yaml

Options:
  -g, --global
          Install to your account-level Agent targets. The default is the current project.

      --json
          Output stable JSON for Agents and automation

      --agent <AGENT>
          Select an Agent target. Repeat --agent to select several.
          Values: claude-code, cursor, windsurf, cline, codex, github-copilot,
                  gemini-cli, goose, amp, opencode, roo, antigravity, openclaw,
                  hermes, kiro, kilo, droid, trae, zed.
          Use --agent all to select every Agent target.
          Default: every Agent target skilld detects. If skilld detects none, it uses agent.targets.

      --plain
          Output stable text without terminal formatting

      --mode <MODE>
          Choose how each Agent target receives the Skill.
          Values: copy, symlink. The default comes from install.mode. A fresh configuration sets install.mode to copy.

      --direct
          Fetch a public GitHub Repository without going through skilld.dev.
          Give an explicit github: source or a GitHub tree URL.
          Without --direct, these selectors use hosted Artifact delivery.
          A direct install records the unverified source status.

  -h, --help
          Print help (see a summary with '-h')

Examples:
  skilld install skilld-dev/skills/find-skill --agent codex
  skilld install github:skilld-dev/skilld/skills/skilld --direct --agent codex
  skilld install
```

## skilld add

Install every Skill a Repository, curator, or collection names.

```text
Install every Skill a Repository, curator, or collection names.

Give REF as:
  OWNER/REPOSITORY
      Install every Skill the Repository carries.
  @LOGIN
      Install every Skill the curator's collections name.
  @LOGIN/SLUG
      Install every Skill one collection names.
  Any SOURCE skilld install accepts
      Install that one Skill.

Each Skill installs through the same hosted Artifact path skilld install uses.
Run skilld run REF first to see the Skills a ref names.

Usage: skilld add [OPTIONS] <REF>

Arguments:
  <REF>
          The Repository, curator, collection, or Skill source to install

Options:
      --global
          Install to your account-level Agent targets. The default is the current project.

      --json
          Output stable JSON for Agents and automation

      --agent <AGENT>
          Select an Agent target. Repeat --agent to select several.
          Default: every Agent target skilld detects. If skilld detects none, it uses agent.targets.

      --plain
          Output stable text without terminal formatting

      --mode <MODE>
          Choose how each Agent target receives the Skill.
          Values: copy, symlink. The default comes from install.mode.

      --direct
          Fetch a public GitHub Repository without going through skilld.dev.
          Only one Skill source accepts --direct. A direct install records the unverified source status.

      --all
          Install every Skill the ref names without asking.
          A terminal asks which Skills to install. Every other context installs all of them.

  -h, --help
          Print help (see a summary with '-h')

Examples:
  npx skilld add skilld-dev/skills
  npx skilld add @harlan-zw/nuxt --agent codex
  npx skilld add skilld-dev/skills/vue --global
```

## skilld run

Load a Skill for this session without installing it.

```text
Load a Skill for this session without installing it.

skilld run prints SKILL.md so the calling Agent follows it now.
A remote run retains no Skill files. It creates no lockfile entry, Agent target,
or project file.

skilld names the supporting files and prints none of them.
Use --file to read one. Remote file reads also require the returned --revision.
Use skilld install to put supporting files on disk.

Give SOURCE in the same forms skilld install accepts.

Give a ref that names several Skills to list them instead:
  OWNER/REPOSITORY, @LOGIN, or @LOGIN/SLUG
skilld prints one line per Skill with its run command and loads none of them.

Usage: skilld run [OPTIONS] <SOURCE>

Arguments:
  <SOURCE>
          The Skill source to load, or a ref that names several Skills

Options:
      --file <PATH>
          Read one supporting file the Skill carries. Repeat --file for several.
          Give the path exactly as the Skill inventory reports it.
          Remote reads require --revision. Local and bundled reads do not.
          skilld never prints executable or binary files. Install the Skill to use one.

      --json
          Output stable JSON for Agents and automation

      --plain
          Output stable text without terminal formatting

      --revision <COMMIT>
          Read supporting files from one exact remote Git commit.
          Use the revision that an earlier skilld run returned.

      --direct
          Fetch a public GitHub Repository without going through skilld.dev.
          Give a github: source or a GitHub tree URL.
          A direct run carries the unverified source status.

  -h, --help
          Print help (see a summary with '-h')

Examples:
  npx skilld run skilld-dev/skills/find-skill
  npx skilld run skilld-dev/skills
  npx skilld run @harlan-zw/nuxt
  skilld run ./skills/my-skill --file references/api.md
  skilld run github:skilld-dev/skilld/skills/skilld --direct
  skilld run ./skills/my-skill
```

## skilld list

List installed Skills.

```text
List installed Skills

Usage: skilld list [OPTIONS]

Options:
  -g, --global  List Skills in the global scope
      --json    Output stable JSON for Agents and automation
      --plain   Output stable text without terminal formatting
  -h, --help    Print help
```

## skilld view

View an installed Skill, or a Skill, Repository, curator, or collection on skilld.dev.

```text
View an installed Skill, or a Skill, Repository, curator, or collection on skilld.dev.

Give REF as:
  NAME
      An installed Skill: its path, source, source status, and Agent targets.
  OWNER/REPOSITORY/SKILL
      One registry Skill: its author, the exact SKILL.md, and the run and install commands.
  OWNER/REPOSITORY
      One Repository and every Skill the registry holds from it.
  @LOGIN
      One curator and their collections.
  @LOGIN/SLUG
      One collection and the Skills it names.

Usage: skilld view [OPTIONS] <REF>

Arguments:
  <REF>
          An installed Skill name, or a registry ref

Options:
  -g, --global
          View an installed Skill in the global scope

      --json
          Output stable JSON for Agents and automation

      --plain
          Output stable text without terminal formatting

  -h, --help
          Print help (see a summary with '-h')

Examples:
  skilld view vue
  skilld view vercel-labs/agent-skills/web-design-guidelines
  skilld view vercel-labs/agent-skills
  skilld view @harlan-zw/nuxt
```

## skilld remove

Remove an installed Skill.

```text
Remove an installed Skill

Usage: skilld remove [OPTIONS] <SKILL>

Arguments:
  <SKILL>

Options:
  -g, --global  Remove a Skill from the global scope
      --json    Output stable JSON for Agents and automation
      --plain   Output stable text without terminal formatting
  -h, --help    Print help
```

## skilld update

Update installed Skills to their current source commit.

```text
Update installed Skills to their current source commit

Usage: skilld update [OPTIONS] [SKILL]

Arguments:
  [SKILL]

Options:
      --check        Check update relations without changing files
      --json         Output stable JSON for Agents and automation
      --interactive  Select Skill updates in a terminal
      --plain        Output stable text without terminal formatting
  -g, --global       Update Skills in the global scope
  -h, --help         Print help
```

## skilld verify

Verify a Skill source and report its source status.

```text
Verify a Skill source and report its source status

Usage: skilld verify [OPTIONS] [SKILL]

Arguments:
  [SKILL]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld outdated

Report outdated and unmanaged Skills.

```text
Report outdated and unmanaged Skills

Usage: skilld outdated [OPTIONS]

Options:
      --all    Check both scopes and every Agent target directory
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld browse

Browse the registry by owner, tag, and order.

```text
Browse the registry by owner, tag, and order

Usage: skilld browse [OPTIONS] [QUERY]...

Arguments:
  [QUERY]...
          Rank Skills by relevance to this text. Without it, --sort orders them

Options:
      --json
          Output stable JSON for Agents and automation

      --owner <OWNER>
          Only Skills from Repositories this GitHub account owns

      --plain
          Output stable text without terminal formatting

      --tag <TAG>
          Only Skills with this tag

      --sort <ORDER>
          Order by stars, likes, or the last SKILL.md change. The default is stars

          [possible values: stars, likes, updated]

      --limit <N>
          Skills per page, from 1 to 100. The default is 20

      --offset <N>
          Skip this many Skills, for the next page

  -h, --help
          Print help (see a summary with '-h')

Examples:
  skilld browse
  skilld browse testing --sort likes
  skilld browse --owner vercel-labs --limit 50
```

## skilld trending

List trending Skills and why each one trends.

```text
List trending Skills and why each one trends

Usage: skilld trending [OPTIONS]

Options:
      --json             Output stable JSON for Agents and automation
      --window <WINDOW>  The board window: week or month. The default is week [possible values: week, month]
      --limit <N>        Rows to show, from 1 to 30. The default is 30
      --plain            Output stable text without terminal formatting
  -h, --help             Print help
```

## skilld tracks

List tracks, or the Skills of one track.

```text
List tracks, or the Skills of one track

Usage: skilld tracks [OPTIONS] [SLUG]

Arguments:
  [SLUG]  One track slug, such as design

Options:
      --json        Output stable JSON for Agents and automation
      --limit <N>   Skills per page, from 1 to 100. The default is 20
      --offset <N>  Skip this many Skills, for the next page
      --plain       Output stable text without terminal formatting
  -h, --help        Print help
```

## skilld index

Ask skilld.dev to index a GitHub Repository, then wait for its Skills.

```text
Ask skilld.dev to index a GitHub Repository, then wait for its Skills.

Give REPOSITORY as OWNER/REPOSITORY or a https://github.com URL.
skilld waits about a minute. A Repository still indexing after that keeps indexing;
run the same command again to check.

Usage: skilld index [OPTIONS] <REPOSITORY>

Arguments:
  <REPOSITORY>


Options:
      --json
          Output stable JSON for Agents and automation

      --plain
          Output stable text without terminal formatting

  -h, --help
          Print help (see a summary with '-h')

Examples:
  skilld index vercel-labs/agent-skills
  skilld index https://github.com/vercel-labs/agent-skills
```

## skilld curators

List the curators who publish collections on skilld.dev.

```text
List the curators who publish collections on skilld.dev

Usage: skilld curators [OPTIONS]

Options:
      --json        Output stable JSON for Agents and automation
      --limit <N>   Curators per page, from 1 to 60. The default is 30
      --offset <N>  Skip this many curators, for the next page
      --plain       Output stable text without terminal formatting
  -h, --help        Print help
```

## skilld account

Show your skilld.dev account, or change one setting.

```text
Show your skilld.dev account, or change one setting.

Every account command needs skilld auth login first.
Account deletion needs skilld.dev in a browser.

Usage: skilld account [OPTIONS]
       skilld account <COMMAND>

Commands:
  set        Change one account setting
  scan       Scan your public GitHub Repositories for Skills and index them
  unpublish  Remove every Skill of one of your Repositories from the registry

Options:
      --json
          Output stable JSON for Agents and automation

      --plain
          Output stable text without terminal formatting

  -h, --help
          Print help (see a summary with '-h')

Examples:
  skilld account
  skilld account set digest off
  skilld account set email you@example.com
  skilld account scan
  skilld account unpublish harlan-zw/skills
```

### skilld account set

Change one account setting.

```text
Change one account setting.

KEY and VALUE:
  email ADDRESS
      The address skilld emails. It takes effect at once.
  digest on|off
      The email that reports changes to your watched Repositories.
  weekly on|off
      The weekly email: Skills you liked that changed, plus what trended.
  likes-public on|off
      Whether anyone can read your liked Skills at /@LOGIN/liked.
  repository-indexing on|off
      Whether skilld.dev may scan your public Repositories for Skills.

Usage: skilld account set [OPTIONS] <KEY> <VALUE>

Arguments:
  <KEY>


  <VALUE>


Options:
      --json
          Output stable JSON for Agents and automation

      --plain
          Output stable text without terminal formatting

  -h, --help
          Print help (see a summary with '-h')
```

### skilld account scan

Scan your public GitHub Repositories for Skills and index them.

```text
Scan your public GitHub Repositories for Skills and index them

Usage: skilld account scan [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld account unpublish

Remove every Skill of one of your Repositories from the registry.

```text
Remove every Skill of one of your Repositories from the registry

Usage: skilld account unpublish [OPTIONS] <REPOSITORY>

Arguments:
  <REPOSITORY>  Your Repository as OWNER/REPOSITORY

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld like

Like a Skill. skilld.dev also watches its Repository for your digest.

```text
Like a Skill. skilld.dev also watches its Repository for your digest

Usage: skilld like [OPTIONS] <SKILL>

Arguments:
  <SKILL>  The Skill as OWNER/REPOSITORY/SKILL

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld unlike

Remove your like of a Skill.

```text
Remove your like of a Skill

Usage: skilld unlike [OPTIONS] <SKILL>

Arguments:
  <SKILL>  The Skill as OWNER/REPOSITORY/SKILL

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld likes

List the Skills you like, or the public likes of one curator.

```text
List the Skills you like, or the public likes of one curator

Usage: skilld likes [OPTIONS] [@LOGIN]

Arguments:
  [@LOGIN]  A curator as @LOGIN. Without it, skilld lists your own likes

Options:
      --json        Output stable JSON for Agents and automation
      --limit <N>   Skills per page. The default is 20 for yours and 50 for a curator's
      --offset <N>  Skip this many Skills, for the next page
      --plain       Output stable text without terminal formatting
  -h, --help        Print help
```

## skilld watch

Watch a Repository or a collection, so your digest reports its changes.

```text
Watch a Repository or a collection, so your digest reports its changes

Usage: skilld watch [OPTIONS] <REF>

Arguments:
  <REF>  A Repository as OWNER/REPOSITORY, or a collection as @LOGIN/SLUG

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld unwatch

Stop watching a Repository.

```text
Stop watching a Repository

Usage: skilld unwatch [OPTIONS] <REPOSITORY>

Arguments:
  <REPOSITORY>  The Repository as OWNER/REPOSITORY

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld watches

List the Repositories you watch.

```text
List the Repositories you watch

Usage: skilld watches [OPTIONS]

Options:
      --json        Output stable JSON for Agents and automation
      --limit <N>   Repositories per page, from 1 to 100. The default is 50
      --offset <N>  Skip this many Repositories, for the next page
      --plain       Output stable text without terminal formatting
  -h, --help        Print help
```

## skilld changes

List what changed in the Repositories you watch: your digest.

```text
List what changed in the Repositories you watch: your digest

Usage: skilld changes [OPTIONS]

Options:
      --json          Output stable JSON for Agents and automation
      --since <DATE>  Start at this date or timestamp. The default is 30 days ago
      --plain         Output stable text without terminal formatting
  -h, --help          Print help
```

## skilld stars

List your starred GitHub Repositories that hold Skills, or import them again.

```text
List your starred GitHub Repositories that hold Skills, or import them again

Usage: skilld stars [OPTIONS]
       skilld stars <COMMAND>

Commands:
  import  Import your GitHub stars again, every page

Options:
      --json        Output stable JSON for Agents and automation
      --limit <N>   Repositories per page, from 1 to 100. The default is 50
      --plain       Output stable text without terminal formatting
      --offset <N>  Skip this many Repositories, for the next page
  -h, --help        Print help
```

### skilld stars import

Import your GitHub stars again, every page.

```text
Import your GitHub stars again, every page

Usage: skilld stars import [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld collection

Create a collection, or add and remove its Skills.

```text
Create a collection, or add and remove its Skills

Usage: skilld collection [OPTIONS] <COMMAND>

Commands:
  create  Create a collection at skilld.dev/@LOGIN/SLUG
  add     Add a Skill to one of your collections
  remove  Remove a Skill from one of your collections

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld collection create

Create a collection at skilld.dev/@LOGIN/SLUG.

```text
Create a collection at skilld.dev/@LOGIN/SLUG

Usage: skilld collection create [OPTIONS] --title <TITLE> <SLUG>

Arguments:
  <SLUG>  Lowercase letters, digits, and hyphens

Options:
      --json                Output stable JSON for Agents and automation
      --title <TITLE>       The collection title
      --description <TEXT>  Your introduction to the collection
      --plain               Output stable text without terminal formatting
  -h, --help                Print help
```

### skilld collection add

Add a Skill to one of your collections.

```text
Add a Skill to one of your collections

Usage: skilld collection add [OPTIONS] <@LOGIN/SLUG> <SKILL>

Arguments:
  <@LOGIN/SLUG>  The collection as @LOGIN/SLUG
  <SKILL>        The Skill as OWNER/REPOSITORY/SKILL

Options:
      --json           Output stable JSON for Agents and automation
      --reason <TEXT>  Why you picked the Skill. Without it, a stored reason stays
      --plain          Output stable text without terminal formatting
  -h, --help           Print help
```

### skilld collection remove

Remove a Skill from one of your collections.

```text
Remove a Skill from one of your collections

Usage: skilld collection remove [OPTIONS] <@LOGIN/SLUG> <SKILL>

Arguments:
  <@LOGIN/SLUG>  The collection as @LOGIN/SLUG
  <SKILL>        The Skill as OWNER/REPOSITORY/SKILL

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld tokens

List, create, or revoke the skilld tokens that act for your account.

```text
List, create, or revoke the skilld tokens that act for your account

Usage: skilld tokens [OPTIONS]
       skilld tokens <COMMAND>

Commands:
  create  Create a token. skilld prints its secret once
  revoke  Revoke one token. It stops working at once

Options:
      --json        Output stable JSON for Agents and automation
      --plain       Output stable text without terminal formatting
      --limit <N>   Tokens per page, from 1 to 100. The default is 50
      --offset <N>  Skip this many tokens, for the next page
  -h, --help        Print help
```

### skilld tokens create

Create a token. skilld prints its secret once.

```text
Create a token. skilld prints its secret once

Usage: skilld tokens create [OPTIONS] --label <LABEL>

Options:
      --json             Output stable JSON for Agents and automation
      --label <LABEL>    A name that says where the token works, such as CI deploy
      --plain            Output stable text without terminal formatting
      --ttl-days <DAYS>  Days until the token stops working. Without it, the token has no set end
  -h, --help             Print help
```

### skilld tokens revoke

Revoke one token. It stops working at once.

```text
Revoke one token. It stops working at once

Usage: skilld tokens revoke [OPTIONS] <ID>

Arguments:
  <ID>  The token ID skilld tokens prints

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld auth

Log in, check, or log out of your account.

```text
Log in, check, or log out of your account

Usage: skilld auth [OPTIONS] <COMMAND>

Commands:
  login
  status
  logout

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld auth login

```text
Usage: skilld auth login [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld auth status

```text
Usage: skilld auth status [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld auth logout

```text
Usage: skilld auth logout [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

## skilld config

Read, set, or list configuration values.

```text
Read, set, or list configuration values

Usage: skilld config [OPTIONS] <COMMAND>

Commands:
  get
  set
  list

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld config get

```text
Usage: skilld config get [OPTIONS] <KEY>

Arguments:
  <KEY>

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld config set

```text
Usage: skilld config set [OPTIONS] <KEY> <VALUE>

Arguments:
  <KEY>
  <VALUE>

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```

### skilld config list

```text
Usage: skilld config list [OPTIONS]

Options:
      --json   Output stable JSON for Agents and automation
      --plain  Output stable text without terminal formatting
  -h, --help   Print help
```
