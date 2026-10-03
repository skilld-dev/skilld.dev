import Database from 'better-sqlite3'
import { SKILLS_DIRECTORY_FOCUS_SQL } from '../../layers/registry/server/utils/skills-directory-focus'

it('shows only confident Skills-focused repositories from individual maintainers', () => {
  const db = new Database(':memory:')
  db.exec(`
    CREATE TABLE owners (owner TEXT PRIMARY KEY, kind TEXT);
    CREATE TABLE skill_repo_eligibility (owner TEXT, repo TEXT, status TEXT);
    CREATE TABLE skill_repo_focus (owner TEXT, repo TEXT, probability REAL);
    CREATE TABLE skills (owner TEXT, repo TEXT);
    INSERT INTO owners VALUES ('antfu','user'), ('vinta','user'), ('unknown','user'), ('org','org'), ('rejected','user'), ('uncertain','user');
    INSERT INTO skills VALUES ('antfu','skills'), ('antfu','vite'), ('vinta','awesome-python'), ('unknown','skills'), ('org','skills'), ('rejected','skills'), ('uncertain','skills');
    INSERT INTO skill_repo_focus VALUES ('antfu','skills',0.95), ('antfu','vite',0.1), ('vinta','awesome-python',0.02), ('org','skills',0.99), ('rejected','skills',0.99), ('uncertain','skills',0.79);
    INSERT INTO skill_repo_eligibility VALUES ('rejected','skills','rejected');
  `)
  try {
    const visible = db.prepare(`SELECT s.owner,s.repo FROM skills s WHERE ${SKILLS_DIRECTORY_FOCUS_SQL}`).all()
    expect(visible).toEqual([{ owner: 'antfu', repo: 'skills' }])
  }
  finally {
    db.close()
  }
})
