-- Retire the `skills_v` correctness shim from 0035. Every read site now
-- JOINs `skills s JOIN repos r` explicitly (see the post-migration closeout
-- branch). The view's only purpose was to spare 28 read sites from rewriting
-- their FROM clause after 0034 split repo facts onto `repos`; once those
-- sites were updated, the view became dead indirection.
DROP VIEW IF EXISTS skills_v;
