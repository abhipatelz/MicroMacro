import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.resolve(__dirname, '../data/micromacro.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

export const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function migrate() {
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'employee', -- employee | lead | manager | admin
    title TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    lead_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS team_members (
    team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_in_team TEXT NOT NULL DEFAULT 'member',
    PRIMARY KEY (team_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE, -- e.g. CSV-2026-001
    name TEXT NOT NULL,
    description TEXT,
    lifecycle TEXT NOT NULL DEFAULT 'generic', -- csv | sop | deviation_capa | change_control | audit | validation | generic
    status TEXT NOT NULL DEFAULT 'planning', -- planning | in_progress | on_hold | completed | cancelled
    priority TEXT NOT NULL DEFAULT 'medium', -- low | medium | high | critical
    team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL,
    owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    start_date TEXT,
    due_date TEXT,
    completed_at TEXT,
    gxp_impact TEXT, -- none | low | medium | high
    regulatory_refs TEXT, -- comma separated e.g. "21 CFR Part 11, EU Annex 11"
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS phases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', -- pending | in_progress | completed
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    phase_id INTEGER REFERENCES phases(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo', -- todo | in_progress | review | done | blocked
    priority TEXT NOT NULL DEFAULT 'medium',
    task_type TEXT NOT NULL DEFAULT 'task', -- task | review | approval | test | deviation | capa | audit_finding
    gxp_critical INTEGER NOT NULL DEFAULT 0,
    requires_qa_signoff INTEGER NOT NULL DEFAULT 0,
    qa_signoff_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    qa_signoff_at TEXT,
    start_date TEXT,
    due_date TEXT,
    completed_at TEXT,
    estimated_hours REAL,
    actual_hours REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS subtasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'todo',
    due_date TEXT,
    completed_at TEXT,
    position INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    entity_type TEXT NOT NULL, -- project | task | subtask
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL, -- created | updated | status_change | completed | signed_off | commented
    details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
  CREATE INDEX IF NOT EXISTS idx_subtasks_task ON subtasks(task_id);
  CREATE INDEX IF NOT EXISTS idx_subtasks_assignee ON subtasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_projects_team ON projects(team_id);
  CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_log(entity_type, entity_id);
  `);
}

export function logActivity({ userId, entityType, entityId, action, details }) {
  db.prepare(
    `INSERT INTO activity_log (user_id, entity_type, entity_id, action, details)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId ?? null, entityType, entityId, action, details ?? null);
}
