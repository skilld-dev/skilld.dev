-- npm-guides: LLM-synthesised migration guides, one canonical row per package
-- keyed on the package name (the URL slug). Generated locally by `skilld` and
-- ingested here; the page renders the markdown via mdxg. SEO top-of-funnel for
-- Loop 1 (anonymous discovery → install).
CREATE TABLE npm_guides (
  slug         TEXT PRIMARY KEY,        -- package name, e.g. 'drizzle-orm' or '@vueuse/core'
  package_name TEXT NOT NULL,
  version      TEXT NOT NULL,           -- canonical target (largest clean dist-tag version)
  tag          TEXT NOT NULL,           -- dist-tag the version came from (latest/beta/rc/…)
  prerelease   INTEGER NOT NULL DEFAULT 0,
  from_version TEXT,                    -- stable version migrated from, when distinct
  repo_url     TEXT,
  released_at  TEXT,
  title        TEXT NOT NULL,
  markdown     TEXT NOT NULL,
  supersedes   TEXT,                    -- JSON array of clean prior versions (301 sources)
  model        TEXT,
  generated_at TEXT NOT NULL
);

CREATE INDEX npm_guides_package ON npm_guides(package_name);
