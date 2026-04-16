import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

import { db, migrate, logActivity } from './db.js';
import { signToken, authRequired, requireRole } from './auth.js';
import { LIFECYCLES, listLifecycles } from './lifecycles.js';

migrate();

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));
app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(',') || true,
    credentials: true
  })
);

// ---------- helpers ----------
function row(...args) {
  return db.prepare(args[0]).get(...args.slice(1));
}
function rows(...args) {
  return db.prepare(args[0]).all(...args.slice(1));
}
function run(...args) {
  return db.prepare(args[0]).run(...args.slice(1));
}

function handle(fn) {
  return async (req, res) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err?.issues) return res.status(400).json({ error: 'Validation failed', issues: err.issues });
      console.error(err);
      res.status(500).json({ error: err.message || 'Internal error' });
    }
  };
}

function userPublic(u) {
  if (!u) return null;
  const { password_hash, ...rest } = u;
  return rest;
}

function isManager(user) {
  return user && (user.role === 'manager' || user.role === 'admin');
}

// ---------- health ----------
app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ---------- auth ----------
app.post(
  '/api/auth/register',
  handle(async (req, res) => {
    const body = z
      .object({
        email: z.string().email(),
        name: z.string().min(1),
        password: z.string().min(6),
        role: z.enum(['employee', 'lead', 'manager', 'admin']).optional(),
        title: z.string().optional()
      })
      .parse(req.body);

    const existing = row('SELECT id FROM users WHERE email = ?', body.email);
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const hash = bcrypt.hashSync(body.password, 10);
    const usersCount = row('SELECT COUNT(*) as c FROM users').c;
    const role = usersCount === 0 ? 'admin' : body.role || 'employee';

    const r = run(
      'INSERT INTO users (email, name, password_hash, role, title) VALUES (?, ?, ?, ?, ?)',
      body.email,
      body.name,
      hash,
      role,
      body.title || null
    );
    const user = row('SELECT * FROM users WHERE id = ?', r.lastInsertRowid);
    res.json({ token: signToken(user), user: userPublic(user) });
  })
);

app.post(
  '/api/auth/login',
  handle(async (req, res) => {
    const body = z.object({ email: z.string().email(), password: z.string() }).parse(req.body);
    const user = row('SELECT * FROM users WHERE email = ?', body.email);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    if (!bcrypt.compareSync(body.password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });
    res.json({ token: signToken(user), user: userPublic(user) });
  })
);

app.get(
  '/api/auth/me',
  authRequired,
  handle(async (req, res) => {
    const user = row('SELECT * FROM users WHERE id = ?', req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user: userPublic(user) });
  })
);

// ---------- users ----------
app.get(
  '/api/users',
  authRequired,
  handle(async (_req, res) => {
    res.json(rows('SELECT id, name, email, role, title FROM users ORDER BY name'));
  })
);

app.patch(
  '/api/users/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    if (!isManager(req.user) && req.user.id !== id)
      return res.status(403).json({ error: 'Forbidden' });
    const body = z
      .object({
        name: z.string().optional(),
        title: z.string().optional(),
        role: z.enum(['employee', 'lead', 'manager', 'admin']).optional()
      })
      .parse(req.body);
    if (body.role && !isManager(req.user))
      return res.status(403).json({ error: 'Only managers can change roles' });
    const current = row('SELECT * FROM users WHERE id = ?', id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    run(
      'UPDATE users SET name = ?, title = ?, role = ? WHERE id = ?',
      body.name ?? current.name,
      body.title ?? current.title,
      body.role ?? current.role,
      id
    );
    res.json(userPublic(row('SELECT * FROM users WHERE id = ?', id)));
  })
);

// ---------- teams ----------
app.get(
  '/api/teams',
  authRequired,
  handle(async (_req, res) => {
    const teams = rows(`
      SELECT t.*, u.name AS lead_name,
        (SELECT COUNT(*) FROM team_members m WHERE m.team_id = t.id) AS member_count,
        (SELECT COUNT(*) FROM projects p WHERE p.team_id = t.id) AS project_count
      FROM teams t LEFT JOIN users u ON u.id = t.lead_id
      ORDER BY t.name
    `);
    res.json(teams);
  })
);

app.post(
  '/api/teams',
  authRequired,
  requireRole('manager', 'admin', 'lead'),
  handle(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        description: z.string().optional(),
        lead_id: z.number().optional(),
        member_ids: z.array(z.number()).optional()
      })
      .parse(req.body);
    const r = run(
      'INSERT INTO teams (name, description, lead_id) VALUES (?, ?, ?)',
      body.name,
      body.description || null,
      body.lead_id || null
    );
    if (body.member_ids?.length) {
      const stmt = db.prepare(
        'INSERT OR IGNORE INTO team_members (team_id, user_id) VALUES (?, ?)'
      );
      for (const uid of body.member_ids) stmt.run(r.lastInsertRowid, uid);
    }
    if (body.lead_id)
      run(
        'INSERT OR IGNORE INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, ?)',
        r.lastInsertRowid,
        body.lead_id,
        'lead'
      );
    res.json(row('SELECT * FROM teams WHERE id = ?', r.lastInsertRowid));
  })
);

app.get(
  '/api/teams/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const team = row(
      `SELECT t.*, u.name AS lead_name FROM teams t LEFT JOIN users u ON u.id = t.lead_id WHERE t.id = ?`,
      id
    );
    if (!team) return res.status(404).json({ error: 'Not found' });
    const members = rows(
      `SELECT u.id, u.name, u.email, u.role, u.title, m.role_in_team
       FROM team_members m JOIN users u ON u.id = m.user_id
       WHERE m.team_id = ? ORDER BY u.name`,
      id
    );
    const projects = rows(
      `SELECT p.*, (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done
       FROM projects p WHERE p.team_id = ? ORDER BY p.created_at DESC`,
      id
    );
    res.json({ ...team, members, projects });
  })
);

app.post(
  '/api/teams/:id/members',
  authRequired,
  requireRole('manager', 'admin', 'lead'),
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const body = z
      .object({ user_id: z.number(), role_in_team: z.string().optional() })
      .parse(req.body);
    run(
      'INSERT OR REPLACE INTO team_members (team_id, user_id, role_in_team) VALUES (?, ?, ?)',
      id,
      body.user_id,
      body.role_in_team || 'member'
    );
    res.json({ ok: true });
  })
);

app.delete(
  '/api/teams/:id/members/:userId',
  authRequired,
  requireRole('manager', 'admin', 'lead'),
  handle(async (req, res) => {
    run(
      'DELETE FROM team_members WHERE team_id = ? AND user_id = ?',
      Number(req.params.id),
      Number(req.params.userId)
    );
    res.json({ ok: true });
  })
);

// team-wide progress: every active micro-task for the team
app.get(
  '/api/teams/:id/board',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const tasks = rows(
      `SELECT t.*, p.name AS project_name, p.code AS project_code, p.lifecycle,
              u.name AS assignee_name,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') AS subtasks_done
       FROM tasks t
       JOIN projects p ON p.id = t.project_id
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE p.team_id = ?
       ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 WHEN 'blocked' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END,
                t.due_date ASC`,
      id
    );
    res.json(tasks);
  })
);

// ---------- lifecycles ----------
app.get('/api/lifecycles', authRequired, (_req, res) => res.json(listLifecycles()));
app.get('/api/lifecycles/:key', authRequired, (req, res) => {
  const lc = LIFECYCLES[req.params.key];
  if (!lc) return res.status(404).json({ error: 'Unknown lifecycle' });
  res.json({ key: req.params.key, ...lc });
});

// ---------- projects ----------
app.get(
  '/api/projects',
  authRequired,
  handle(async (req, res) => {
    const { team_id, status, lifecycle, q } = req.query;
    const filters = [];
    const params = [];
    if (team_id) {
      filters.push('p.team_id = ?');
      params.push(Number(team_id));
    }
    if (status) {
      filters.push('p.status = ?');
      params.push(String(status));
    }
    if (lifecycle) {
      filters.push('p.lifecycle = ?');
      params.push(String(lifecycle));
    }
    if (q) {
      filters.push('(p.name LIKE ? OR p.code LIKE ? OR p.description LIKE ?)');
      const like = `%${q}%`;
      params.push(like, like, like);
    }
    const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
    const list = rows(
      `SELECT p.*, t.name AS team_name, u.name AS owner_name,
              (SELECT COUNT(*) FROM tasks x WHERE x.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks x WHERE x.project_id = p.id AND x.status = 'done') AS tasks_done
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN users u ON u.id = p.owner_id
       ${where}
       ORDER BY p.created_at DESC`,
      ...params
    );
    res.json(list);
  })
);

app.post(
  '/api/projects',
  authRequired,
  handle(async (req, res) => {
    const body = z
      .object({
        name: z.string().min(1),
        code: z.string().optional(),
        description: z.string().optional(),
        lifecycle: z.string().default('generic'),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        team_id: z.number().optional(),
        owner_id: z.number().optional(),
        start_date: z.string().optional(),
        due_date: z.string().optional(),
        gxp_impact: z.enum(['none', 'low', 'medium', 'high']).optional(),
        regulatory_refs: z.string().optional(),
        use_template: z.boolean().default(true)
      })
      .parse(req.body);

    const lc = LIFECYCLES[body.lifecycle] || LIFECYCLES.generic;
    const code =
      body.code ||
      `${body.lifecycle.toUpperCase()}-${new Date().getFullYear()}-${String(
        (row('SELECT COUNT(*) as c FROM projects').c || 0) + 1
      ).padStart(4, '0')}`;

    const tx = db.transaction(() => {
      const r = run(
        `INSERT INTO projects (code, name, description, lifecycle, priority, team_id, owner_id,
          start_date, due_date, gxp_impact, regulatory_refs)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        code,
        body.name,
        body.description || null,
        body.lifecycle,
        body.priority || 'medium',
        body.team_id || null,
        body.owner_id || req.user.id,
        body.start_date || null,
        body.due_date || null,
        body.gxp_impact || 'none',
        body.regulatory_refs || lc.regulatory_refs || null
      );
      const projectId = r.lastInsertRowid;
      logActivity({
        userId: req.user.id,
        entityType: 'project',
        entityId: projectId,
        action: 'created',
        details: `Created ${body.lifecycle} project: ${body.name}`
      });

      if (body.use_template) {
        let position = 0;
        for (const phase of lc.phases) {
          const pr = run(
            'INSERT INTO phases (project_id, name, position) VALUES (?, ?, ?)',
            projectId,
            phase.name,
            position++
          );
          for (const t of phase.tasks) {
            run(
              `INSERT INTO tasks (project_id, phase_id, title, task_type, gxp_critical, requires_qa_signoff, priority)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              projectId,
              pr.lastInsertRowid,
              t.title,
              t.type,
              t.gxp ? 1 : 0,
              t.qa ? 1 : 0,
              body.priority || 'medium'
            );
          }
        }
      }
      return projectId;
    });
    const id = tx();
    res.json(row('SELECT * FROM projects WHERE id = ?', id));
  })
);

app.get(
  '/api/projects/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const project = row(
      `SELECT p.*, t.name AS team_name, u.name AS owner_name
       FROM projects p
       LEFT JOIN teams t ON t.id = p.team_id
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = ?`,
      id
    );
    if (!project) return res.status(404).json({ error: 'Not found' });
    const phases = rows(
      'SELECT * FROM phases WHERE project_id = ? ORDER BY position',
      id
    );
    const tasks = rows(
      `SELECT t.*, u.name AS assignee_name,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') AS subtasks_done
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.project_id = ? ORDER BY t.phase_id, t.id`,
      id
    );
    const lifecycle = LIFECYCLES[project.lifecycle];
    res.json({
      ...project,
      lifecycle_meta: lifecycle
        ? { label: lifecycle.label, description: lifecycle.description, regulatory_refs: lifecycle.regulatory_refs }
        : null,
      phases,
      tasks
    });
  })
);

app.patch(
  '/api/projects/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const current = row('SELECT * FROM projects WHERE id = ?', id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const body = z
      .object({
        name: z.string().optional(),
        description: z.string().optional(),
        status: z.enum(['planning', 'in_progress', 'on_hold', 'completed', 'cancelled']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        team_id: z.number().nullable().optional(),
        owner_id: z.number().nullable().optional(),
        start_date: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        gxp_impact: z.enum(['none', 'low', 'medium', 'high']).optional(),
        regulatory_refs: z.string().optional()
      })
      .parse(req.body);

    const merged = { ...current, ...body };
    if (body.status === 'completed' && current.status !== 'completed') {
      merged.completed_at = new Date().toISOString();
    } else if (body.status && body.status !== 'completed') {
      merged.completed_at = null;
    }

    run(
      `UPDATE projects SET name=?, description=?, status=?, priority=?, team_id=?, owner_id=?,
         start_date=?, due_date=?, completed_at=?, gxp_impact=?, regulatory_refs=? WHERE id=?`,
      merged.name,
      merged.description,
      merged.status,
      merged.priority,
      merged.team_id,
      merged.owner_id,
      merged.start_date,
      merged.due_date,
      merged.completed_at,
      merged.gxp_impact,
      merged.regulatory_refs,
      id
    );
    logActivity({
      userId: req.user.id,
      entityType: 'project',
      entityId: id,
      action: 'updated',
      details: JSON.stringify(body)
    });
    res.json(row('SELECT * FROM projects WHERE id = ?', id));
  })
);

app.delete(
  '/api/projects/:id',
  authRequired,
  requireRole('manager', 'admin', 'lead'),
  handle(async (req, res) => {
    run('DELETE FROM projects WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  })
);

// ---------- tasks ----------
app.post(
  '/api/tasks',
  authRequired,
  handle(async (req, res) => {
    const body = z
      .object({
        project_id: z.number(),
        phase_id: z.number().optional(),
        title: z.string().min(1),
        description: z.string().optional(),
        assignee_id: z.number().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        task_type: z.string().optional(),
        gxp_critical: z.boolean().optional(),
        requires_qa_signoff: z.boolean().optional(),
        start_date: z.string().optional(),
        due_date: z.string().optional(),
        estimated_hours: z.number().optional()
      })
      .parse(req.body);
    const r = run(
      `INSERT INTO tasks (project_id, phase_id, title, description, assignee_id, priority, task_type,
         gxp_critical, requires_qa_signoff, start_date, due_date, estimated_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      body.project_id,
      body.phase_id || null,
      body.title,
      body.description || null,
      body.assignee_id || null,
      body.priority || 'medium',
      body.task_type || 'task',
      body.gxp_critical ? 1 : 0,
      body.requires_qa_signoff ? 1 : 0,
      body.start_date || null,
      body.due_date || null,
      body.estimated_hours ?? null
    );
    logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: r.lastInsertRowid,
      action: 'created',
      details: body.title
    });
    res.json(row('SELECT * FROM tasks WHERE id = ?', r.lastInsertRowid));
  })
);

app.get(
  '/api/tasks/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const task = row(
      `SELECT t.*, u.name AS assignee_name, q.name AS qa_signoff_name,
              p.name AS project_name, p.code AS project_code
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       LEFT JOIN users q ON q.id = t.qa_signoff_user_id
       JOIN projects p ON p.id = t.project_id
       WHERE t.id = ?`,
      id
    );
    if (!task) return res.status(404).json({ error: 'Not found' });
    const subtasks = rows(
      `SELECT s.*, u.name AS assignee_name
       FROM subtasks s LEFT JOIN users u ON u.id = s.assignee_id
       WHERE s.task_id = ? ORDER BY s.position, s.id`,
      id
    );
    const commentList = rows(
      `SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id
       WHERE c.task_id = ? ORDER BY c.created_at ASC`,
      id
    );
    res.json({ ...task, subtasks, comments: commentList });
  })
);

app.patch(
  '/api/tasks/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const current = row('SELECT * FROM tasks WHERE id = ?', id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const body = z
      .object({
        title: z.string().optional(),
        description: z.string().optional(),
        assignee_id: z.number().nullable().optional(),
        status: z.enum(['todo', 'in_progress', 'review', 'done', 'blocked']).optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        task_type: z.string().optional(),
        gxp_critical: z.boolean().optional(),
        requires_qa_signoff: z.boolean().optional(),
        start_date: z.string().nullable().optional(),
        due_date: z.string().nullable().optional(),
        estimated_hours: z.number().nullable().optional(),
        actual_hours: z.number().nullable().optional(),
        phase_id: z.number().nullable().optional()
      })
      .parse(req.body);

    const merged = { ...current, ...body };
    if (body.gxp_critical !== undefined) merged.gxp_critical = body.gxp_critical ? 1 : 0;
    if (body.requires_qa_signoff !== undefined)
      merged.requires_qa_signoff = body.requires_qa_signoff ? 1 : 0;

    // status transitions
    if (body.status === 'done' && current.status !== 'done') {
      merged.completed_at = new Date().toISOString();
    } else if (body.status && body.status !== 'done') {
      merged.completed_at = null;
    }

    run(
      `UPDATE tasks SET title=?, description=?, assignee_id=?, status=?, priority=?, task_type=?,
         gxp_critical=?, requires_qa_signoff=?, start_date=?, due_date=?, completed_at=?,
         estimated_hours=?, actual_hours=?, phase_id=? WHERE id=?`,
      merged.title,
      merged.description,
      merged.assignee_id,
      merged.status,
      merged.priority,
      merged.task_type,
      merged.gxp_critical,
      merged.requires_qa_signoff,
      merged.start_date,
      merged.due_date,
      merged.completed_at,
      merged.estimated_hours,
      merged.actual_hours,
      merged.phase_id,
      id
    );
    logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: id,
      action: body.status ? 'status_change' : 'updated',
      details: JSON.stringify(body)
    });
    res.json(row('SELECT * FROM tasks WHERE id = ?', id));
  })
);

app.post(
  '/api/tasks/:id/signoff',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const task = row('SELECT * FROM tasks WHERE id = ?', id);
    if (!task) return res.status(404).json({ error: 'Not found' });
    if (!task.requires_qa_signoff)
      return res.status(400).json({ error: 'Task does not require QA sign-off' });
    if (!['lead', 'manager', 'admin'].includes(req.user.role))
      return res.status(403).json({ error: 'Only QA lead/manager/admin can sign off' });
    run(
      `UPDATE tasks SET qa_signoff_user_id = ?, qa_signoff_at = ? WHERE id = ?`,
      req.user.id,
      new Date().toISOString(),
      id
    );
    logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: id,
      action: 'signed_off',
      details: `QA sign-off by ${req.user.name}`
    });
    res.json(row('SELECT * FROM tasks WHERE id = ?', id));
  })
);

app.delete(
  '/api/tasks/:id',
  authRequired,
  handle(async (req, res) => {
    run('DELETE FROM tasks WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  })
);

// ---------- subtasks ----------
app.post(
  '/api/tasks/:id/subtasks',
  authRequired,
  handle(async (req, res) => {
    const taskId = Number(req.params.id);
    const body = z
      .object({
        title: z.string().min(1),
        assignee_id: z.number().optional(),
        due_date: z.string().optional()
      })
      .parse(req.body);
    const pos = row('SELECT COALESCE(MAX(position), -1) + 1 AS p FROM subtasks WHERE task_id = ?', taskId).p;
    const r = run(
      'INSERT INTO subtasks (task_id, title, assignee_id, due_date, position) VALUES (?, ?, ?, ?, ?)',
      taskId,
      body.title,
      body.assignee_id || null,
      body.due_date || null,
      pos
    );
    res.json(row('SELECT * FROM subtasks WHERE id = ?', r.lastInsertRowid));
  })
);

app.patch(
  '/api/subtasks/:id',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const current = row('SELECT * FROM subtasks WHERE id = ?', id);
    if (!current) return res.status(404).json({ error: 'Not found' });
    const body = z
      .object({
        title: z.string().optional(),
        assignee_id: z.number().nullable().optional(),
        status: z.enum(['todo', 'in_progress', 'done']).optional(),
        due_date: z.string().nullable().optional()
      })
      .parse(req.body);
    const merged = { ...current, ...body };
    if (body.status === 'done' && current.status !== 'done')
      merged.completed_at = new Date().toISOString();
    else if (body.status && body.status !== 'done') merged.completed_at = null;
    run(
      `UPDATE subtasks SET title=?, assignee_id=?, status=?, due_date=?, completed_at=? WHERE id=?`,
      merged.title,
      merged.assignee_id,
      merged.status,
      merged.due_date,
      merged.completed_at,
      id
    );
    res.json(row('SELECT * FROM subtasks WHERE id = ?', id));
  })
);

app.delete(
  '/api/subtasks/:id',
  authRequired,
  handle(async (req, res) => {
    run('DELETE FROM subtasks WHERE id = ?', Number(req.params.id));
    res.json({ ok: true });
  })
);

// ---------- comments ----------
app.post(
  '/api/tasks/:id/comments',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const body = z.object({ body: z.string().min(1) }).parse(req.body);
    const r = run('INSERT INTO comments (task_id, user_id, body) VALUES (?, ?, ?)', id, req.user.id, body.body);
    logActivity({
      userId: req.user.id,
      entityType: 'task',
      entityId: id,
      action: 'commented',
      details: body.body.slice(0, 140)
    });
    const c = row(
      'SELECT c.*, u.name AS user_name FROM comments c JOIN users u ON u.id = c.user_id WHERE c.id = ?',
      r.lastInsertRowid
    );
    res.json(c);
  })
);

// ---------- my views ----------
app.get(
  '/api/me/tasks',
  authRequired,
  handle(async (req, res) => {
    const userId = req.user.id;
    const status = req.query.status ? String(req.query.status) : null;
    const params = [userId];
    let extra = '';
    if (status) {
      extra = ' AND t.status = ?';
      params.push(status);
    }
    const tasks = rows(
      `SELECT t.*, p.name AS project_name, p.code AS project_code, p.lifecycle,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id) AS subtask_count,
              (SELECT COUNT(*) FROM subtasks s WHERE s.task_id = t.id AND s.status = 'done') AS subtasks_done
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.assignee_id = ?${extra}
       ORDER BY CASE t.status WHEN 'in_progress' THEN 0 WHEN 'review' THEN 1 WHEN 'blocked' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END,
                CASE WHEN t.due_date IS NULL THEN 1 ELSE 0 END, t.due_date ASC`,
      ...params
    );
    const subtasks = rows(
      `SELECT s.*, t.title AS task_title, p.name AS project_name, p.code AS project_code
       FROM subtasks s JOIN tasks t ON t.id = s.task_id JOIN projects p ON p.id = t.project_id
       WHERE s.assignee_id = ? ORDER BY s.status, s.due_date ASC`,
      userId
    );
    res.json({ tasks, subtasks });
  })
);

app.get(
  '/api/me/summary',
  authRequired,
  handle(async (req, res) => {
    const userId = req.user.id;
    const base = rows(
      `SELECT status, COUNT(*) as c FROM tasks WHERE assignee_id = ? GROUP BY status`,
      userId
    );
    const byStatus = Object.fromEntries(base.map((r) => [r.status, r.c]));
    const overdue = row(
      `SELECT COUNT(*) as c FROM tasks WHERE assignee_id = ? AND status != 'done'
         AND due_date IS NOT NULL AND date(due_date) < date('now')`,
      userId
    ).c;
    const dueThisWeek = row(
      `SELECT COUNT(*) as c FROM tasks WHERE assignee_id = ? AND status != 'done'
         AND due_date IS NOT NULL AND date(due_date) BETWEEN date('now') AND date('now', '+7 days')`,
      userId
    ).c;
    const completed = row(
      `SELECT COUNT(*) as c FROM tasks WHERE assignee_id = ? AND status = 'done'`,
      userId
    ).c;
    const totalAssigned = row(`SELECT COUNT(*) as c FROM tasks WHERE assignee_id = ?`, userId).c;
    res.json({
      byStatus,
      overdue,
      dueThisWeek,
      completed,
      totalAssigned,
      completionRate: totalAssigned ? Math.round((completed / totalAssigned) * 100) : 0
    });
  })
);

// ---------- analytics: per-user yearly view with early completion ----------
// Counts:
//  - Big tasks (macro): tasks where gxp_critical=1 OR requires_qa_signoff=1 OR task_type in (approval, audit_finding)
//  - Micro tasks: all tasks / subtasks
//  - Early-completion: completed_at < due_date by > 0 days (extra effort)
app.get(
  '/api/analytics/user/:id/year',
  authRequired,
  handle(async (req, res) => {
    const userId = Number(req.params.id);
    const year = Number(req.query.year) || new Date().getFullYear();
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;

    const completedTasks = rows(
      `SELECT t.*, p.name AS project_name, p.code AS project_code, p.lifecycle,
              CAST(julianday(t.due_date) - julianday(t.completed_at) AS INTEGER) AS days_early
       FROM tasks t JOIN projects p ON p.id = t.project_id
       WHERE t.assignee_id = ? AND t.status = 'done'
             AND date(t.completed_at) BETWEEN date(?) AND date(?)
       ORDER BY t.completed_at DESC`,
      userId,
      start,
      end
    );
    const completedSubtasks = rows(
      `SELECT s.*, t.title AS task_title, p.name AS project_name, p.code AS project_code,
              CAST(julianday(s.due_date) - julianday(s.completed_at) AS INTEGER) AS days_early
       FROM subtasks s JOIN tasks t ON t.id = s.task_id JOIN projects p ON p.id = t.project_id
       WHERE s.assignee_id = ? AND s.status = 'done'
             AND date(s.completed_at) BETWEEN date(?) AND date(?)`,
      userId,
      start,
      end
    );

    const bigTasks = completedTasks.filter(
      (t) =>
        t.gxp_critical ||
        t.requires_qa_signoff ||
        ['approval', 'audit_finding'].includes(t.task_type)
    );

    const early = [...completedTasks, ...completedSubtasks].filter(
      (x) => x.due_date && x.completed_at && x.days_early > 0
    );

    // monthly breakdown
    const months = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      completed: 0,
      early: 0,
      big: 0
    }));
    for (const t of completedTasks) {
      const m = new Date(t.completed_at).getMonth();
      months[m].completed++;
      if (t.due_date && t.days_early > 0) months[m].early++;
      if (
        t.gxp_critical ||
        t.requires_qa_signoff ||
        ['approval', 'audit_finding'].includes(t.task_type)
      )
        months[m].big++;
    }
    for (const s of completedSubtasks) {
      const m = new Date(s.completed_at).getMonth();
      months[m].completed++;
      if (s.due_date && s.days_early > 0) months[m].early++;
    }

    const extraEffortScore = early.reduce((a, x) => a + Math.min(30, x.days_early), 0);

    res.json({
      year,
      user_id: userId,
      totals: {
        tasks_completed: completedTasks.length,
        subtasks_completed: completedSubtasks.length,
        big_tasks_completed: bigTasks.length,
        early_completions: early.length,
        extra_effort_score: extraEffortScore
      },
      months,
      big_tasks: bigTasks.slice(0, 25),
      early_completions: early
        .sort((a, b) => b.days_early - a.days_early)
        .slice(0, 25)
    });
  })
);

// Team-level progress (for higher-level view)
app.get(
  '/api/analytics/team/:id/progress',
  authRequired,
  handle(async (req, res) => {
    const id = Number(req.params.id);
    const projects = rows(
      `SELECT p.id, p.name, p.code, p.status, p.lifecycle, p.due_date,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
              (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS tasks_done
       FROM projects p WHERE p.team_id = ?`,
      id
    );
    const members = rows(
      `SELECT u.id, u.name, u.title,
              (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
                 WHERE t.assignee_id = u.id AND p.team_id = ?) AS assigned,
              (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
                 WHERE t.assignee_id = u.id AND p.team_id = ? AND t.status = 'done') AS done,
              (SELECT COUNT(*) FROM tasks t JOIN projects p ON p.id = t.project_id
                 WHERE t.assignee_id = u.id AND p.team_id = ? AND t.status != 'done'
                   AND t.due_date IS NOT NULL AND date(t.due_date) < date('now')) AS overdue
       FROM team_members m JOIN users u ON u.id = m.user_id WHERE m.team_id = ?`,
      id,
      id,
      id,
      id
    );
    res.json({ projects, members });
  })
);

// Organization-level overview for managers
app.get(
  '/api/analytics/org/overview',
  authRequired,
  handle(async (_req, res) => {
    const totals = {
      users: row('SELECT COUNT(*) AS c FROM users').c,
      teams: row('SELECT COUNT(*) AS c FROM teams').c,
      projects: row('SELECT COUNT(*) AS c FROM projects').c,
      active_projects: row(`SELECT COUNT(*) AS c FROM projects WHERE status = 'in_progress'`).c,
      tasks_open: row(`SELECT COUNT(*) AS c FROM tasks WHERE status != 'done'`).c,
      tasks_overdue: row(
        `SELECT COUNT(*) AS c FROM tasks WHERE status != 'done'
           AND due_date IS NOT NULL AND date(due_date) < date('now')`
      ).c,
      gxp_critical_open: row(
        `SELECT COUNT(*) AS c FROM tasks WHERE status != 'done' AND gxp_critical = 1`
      ).c,
      qa_signoff_pending: row(
        `SELECT COUNT(*) AS c FROM tasks WHERE requires_qa_signoff = 1 AND qa_signoff_at IS NULL AND status = 'done'`
      ).c
    };
    const projectsByStatus = rows(
      `SELECT status, COUNT(*) AS c FROM projects GROUP BY status`
    );
    const projectsByLifecycle = rows(
      `SELECT lifecycle, COUNT(*) AS c FROM projects GROUP BY lifecycle`
    );
    const teamProgress = rows(
      `SELECT t.id, t.name,
              (SELECT COUNT(*) FROM tasks x JOIN projects p ON p.id = x.project_id WHERE p.team_id = t.id) AS tasks,
              (SELECT COUNT(*) FROM tasks x JOIN projects p ON p.id = x.project_id WHERE p.team_id = t.id AND x.status = 'done') AS done
       FROM teams t ORDER BY t.name`
    );
    res.json({ totals, projectsByStatus, projectsByLifecycle, teamProgress });
  })
);

// Static fallback: serve built client if present
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, '../../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
  console.log(`[micromacro] API listening on http://localhost:${port}`);
});
