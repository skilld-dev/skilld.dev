-- Correct nine source-checked false positives from the October 5 rehearsal.
-- Guard each source SHA. Changed sources remain eligible for the hourly classifier.
WITH corrections(owner, repo, name, sha, payload) AS (VALUES
  ('austintgriffith', 'ethskills', 'gas', '3274aedac133237168fdc997ac477f7353c57d4a', '{"kind":"package-specific","package":"ethereum","category":"documentation","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('clickhouse', 'agent-skills', 'clickhouse-architecture-advisor', 'c8516f71253cb81f7d58aab12885ac6ebd23727c', '{"kind":"package-specific","package":"clickhouse","category":"software-design","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('ctsstc', 'get-shit-done-skills', 'add-phase', '909bdb8a9277b625012ef23b20d147706ba0160a', '{"kind":"package-specific","package":"gsd","category":"project-management","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('launchdarkly', 'agent-skills', 'aiconfig-agent-graphs', '834694309e3467cf7984fc49c40307d3194bcc17', '{"kind":"package-specific","package":"launchdarkly","category":"documentation","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('github', 'awesome-copilot', 'readme-blueprint-generator', '76982e2b9b3c2de35a00dbb06087be43051a60c2', '{"kind":"package-specific","package":"github","category":"documentation","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('launchdarkly', 'agent-skills', 'aiconfig-snippets', 'a060fe5117d9ac8b8d5f0b53851d7b7e962b0e76', '{"kind":"package-specific","package":"launchdarkly","category":"documentation","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('launchdarkly', 'agent-skills', 'aiconfig-create', '8a5a2ba66402e9ee5f8a2f15746b86f06d713ff6', '{"kind":"package-specific","package":"launchdarkly","category":"documentation","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('supabase', 'agent-skills', 'supabase-postgres-best-practices', '6400792389dfcc82c81953054e546bd72ebcd259', '{"kind":"package-specific","package":"postgres","category":"performance","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}'),
  ('wix', 'skills', 'wix-headless-cold-start', 'de51cf3304cabc4451b6247a65ede4964bf38692', '{"kind":"package-specific","package":"wix","category":"deployment","model":"@cf/meta/llama-3.3-70b-instruct-fp8-fast","promptVersion":"2026-10-05-v6"}')
)
INSERT INTO skill_generated(owner, repo, name, kind, sha, payload, generated_at)
SELECT s.owner, s.repo, s.name, 'abstractness', c.sha, c.payload,
       strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
FROM corrections c
JOIN skills s ON s.owner=c.owner AND s.repo=c.repo AND s.name=c.name
WHERE s.current_sha=c.sha
ON CONFLICT(owner, repo, name, kind) DO UPDATE SET
  sha=excluded.sha, payload=excluded.payload, generated_at=excluded.generated_at;

UPDATE skills
SET is_abstract=0,
    target_package=(SELECT json_extract(g.payload, '$.package') FROM skill_generated g
      WHERE g.owner=skills.owner AND g.repo=skills.repo AND g.name=skills.name AND g.kind='abstractness'),
    abstractness_category=(SELECT json_extract(g.payload, '$.category') FROM skill_generated g
      WHERE g.owner=skills.owner AND g.repo=skills.repo AND g.name=skills.name AND g.kind='abstractness')
WHERE (owner, repo, name) IN (
  ('austintgriffith', 'ethskills', 'gas'),
  ('clickhouse', 'agent-skills', 'clickhouse-architecture-advisor'),
  ('ctsstc', 'get-shit-done-skills', 'add-phase'),
  ('launchdarkly', 'agent-skills', 'aiconfig-agent-graphs'),
  ('github', 'awesome-copilot', 'readme-blueprint-generator'),
  ('launchdarkly', 'agent-skills', 'aiconfig-snippets'),
  ('launchdarkly', 'agent-skills', 'aiconfig-create'),
  ('supabase', 'agent-skills', 'supabase-postgres-best-practices'),
  ('wix', 'skills', 'wix-headless-cold-start')
)
AND EXISTS (SELECT 1 FROM skill_generated g
  WHERE g.owner=skills.owner AND g.repo=skills.repo AND g.name=skills.name
    AND g.kind='abstractness' AND g.sha=skills.current_sha
    AND json_extract(g.payload, '$.promptVersion')='2026-10-05-v6'
    AND json_extract(g.payload, '$.kind')='package-specific');
