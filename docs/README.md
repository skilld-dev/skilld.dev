# Documentation

Start with the root filters: [VISION](../VISION.md), [DESIGN](../DESIGN.md), [COPY](../COPY.md), and [GLOSSARY](../GLOSSARY.md).

| Need | Read |
| --- | --- |
| System boundaries and handler shapes | [Architecture](arch/README.md) |
| Decisions and their reasons | [ADRs](adr/) |
| Current work and acceptance checks | [Open work](work/README.md) |
| Operating procedures | [Runbooks](runbooks/) |
| Deploy safety and measured evidence | [Operations](ops/) |
| Sources and claims behind published articles | [Editorial evidence](editorial/) |

## Keep a document when it has a reader

Keep decisions, procedures, active briefs, and evidence that supports a claim or measurement.
Each concern has one owner. Link to that owner instead of copying its instructions.
Root filters own product, design, copy, and vocabulary. Architecture owns boundaries. Briefs own acceptance checks.

Git history retains superseded plans and completed task records.
ADRs remain immutable. Preserve editorial sources while published articles rely on them.

## Local output

Daily check-in archives and state stay in the ignored `docs/ops/checkins/` directory.
The check-in runner creates them when saving a report.
Keep screenshots, database backups, agent job records, and one-off reports in `~/scratch/`.
Keep local scripts in the ignored `scripts/scratchpad/` directory.
