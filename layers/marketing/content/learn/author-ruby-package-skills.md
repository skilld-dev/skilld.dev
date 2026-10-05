---
title: Author a Skill for your Ruby gem
description: Draft a Skill for your Ruby API, include its files in the gemspec, and inspect the gem before publishing.
relatedPages:
  - path: /make-skill?kind=package
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-09-07
updatedAt: 2026-10-05
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="rubygems"}
::

Point your agent at the gem repository and its `.gemspec` file.
Ask it to save the draft in `skills/your-skill/SKILL.md`.

Cover public require paths, supported Ruby versions, dependencies, and configuration.
If the gem integrates with Rails, state supported Rails versions and initialization steps.

## 2. Review the draft

Run the examples using your gem's supported Ruby versions.
Use [the cross-Agent selection and task checks](/learn/create-agent-skills#check-selection-and-task-completion-separately) before publishing the Skill.
Check require paths and public method names against the release you plan to publish.
Remove generic Ruby advice and cite package documentation for version limits.
Review the draft before committing it.

## 3. Include the Skill in your gemspec

Check the `files` list in your `.gemspec`.
Add the Skill directory and every linked local file to the existing release files.
For a gemspec that uses Git to build this list, ensure Git tracks the new files.
The [RubyGems specification reference](https://guides.rubygems.org/specification-reference/#files) explains this list.

Build the gem from the package directory:

```bash
gem build your_gem.gemspec
```

Inspect the file list in the built gem:

```bash
gem specification your_gem-1.0.0.gem files
```

Replace the example names with your gemspec and build output.
Confirm the list includes `skills/your-skill/SKILL.md` and its references.
See the [gem build](https://guides.rubygems.org/command-reference/#gem-build) and [gem specification](https://guides.rubygems.org/command-reference/#gem-specification) references.

## 4. Publish and share

Commit the reviewed Skill and publish through your normal RubyGems release process.
Link to its repository directory from the gem README.
Installing the gem does not automatically install the Skill into an agent.
Review the Skill when public methods, dependencies, or supported Ruby versions change.
