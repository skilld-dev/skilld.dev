-- Skill labels preserve the source SKILL.md name. Rows without a usable
-- source name use their registry slug unchanged.
UPDATE skills
SET display_name = CASE
  WHEN rendered_frontmatter IS NULL OR NOT json_valid(rendered_frontmatter)
    THEN name
  WHEN typeof(json_extract(rendered_frontmatter, '$.name')) <> 'text'
    THEN name
  WHEN trim(json_extract(rendered_frontmatter, '$.name')) = ''
    THEN name
  ELSE trim(json_extract(rendered_frontmatter, '$.name'))
END;
