-- Poster avatars on stored social posts. The X search and lookup endpoints
-- already pay for profile_image_url in user.fields, and Bluesky search results
-- already carry author.avatar; both were dropped at parse time, so a board
-- that names who spoke could never show a face.
ALTER TABLE x_posts ADD COLUMN author_avatar TEXT;
