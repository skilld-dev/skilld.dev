---
title: Author a Skill for your PyPI package
description: Draft a Skill for your Python API, include its files with your build backend, and inspect the wheel and source distribution.
relatedPages:
  - path: /make-skill?kind=package
    title: Choose another package ecosystem
  - path: /skills
    title: Browse skills
createdAt: 2026-09-07
updatedAt: 2026-09-07
---

## 1. Draft your Skill

::package-skill-setup{ecosystem="pypi"}
::

Point your agent at the package repository and its `pyproject.toml`.
Use the PyPI distribution name when identifying the package.
The Python import name can differ, so check the source before writing examples.
See Python's [distribution and import package guide](https://packaging.python.org/en/latest/discussions/distribution-package-vs-import-package/).

Ask for a draft in `skills/your-skill/SKILL.md`.
Describe public imports, supported Python versions, optional dependencies, and common failure cases.

## 2. Review the draft

Run the examples in an environment with your package's declared dependencies.
Check that imports use the public API and work on supported Python versions.
Remove generic advice and link version limits to your documentation.
Review the files before committing them.

## 3. Include the Skill in your distributions

Read `[build-system]` in `pyproject.toml` to identify your build backend.
Use that backend's file inclusion rules for both the wheel and source distribution.

With setuptools, files inside an import package can ship as package data.
A root `skills/` directory or `MANIFEST.in` entry alone does not guarantee wheel inclusion.
Choose a location inside your import package and configure package data when you need the Skill in the wheel.
See the [setuptools data files guide](https://setuptools.pypa.io/en/latest/userguide/datafiles.html).

Build using your project's normal environment:

```bash
python -m build
```

The [Python packaging tutorial](https://packaging.python.org/en/latest/tutorials/packaging-projects/#generating-distribution-archives) explains the build prerequisite and generated archives.
Inspect both files in `dist/`:

```bash
python -m zipfile -l dist/your_package-1.0.0-py3-none-any.whl
python -m tarfile -l dist/your_package-1.0.0.tar.gz
```

Replace the example filenames with your build output.
Confirm both archives contain `SKILL.md` and every linked local file.

## 4. Publish and share

Commit the reviewed Skill and publish through your normal PyPI release process.
Link to the Skill's repository directory from your documentation.
Installing the Python package does not automatically install the Skill into an agent.
Review the Skill when your public API or supported Python versions change.
