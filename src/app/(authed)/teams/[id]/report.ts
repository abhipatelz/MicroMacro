// Client-side team report generator (#9).
//
// Builds a self-contained, presentation-ready HTML document from data already
// loaded on the team detail page (team meta, per-project + per-member progress,
// and the full task board) and triggers a download. Self-contained HTML keeps
// it "presentable" — it opens cleanly in any browser, prints straight to PDF,
// and drops into a meeting deck — without pulling in a heavy PDF dependency.

function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmtDate(d: any): string {
  if (!d) return '—';
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

const STATUS_LABEL: Record<string, string> = {
  todo: 'To do', in_progress: 'In progress', review: 'Review', blocked: 'Blocked', done: 'Done',
};
const STATUS_COLOR: Record<string, string> = {
  todo: '#94a3b8', in_progress: '#3b82f6', review: '#8b5cf6', blocked: '#ef4444', done: '#22c55e',
};

function bar(pct: number): string {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = clamped >= 90 ? '#22c55e' : clamped >= 60 ? '#3b82f6' : clamped >= 30 ? '#f59e0b' : '#94a3b8';
  return `<div class="bar"><div class="bar-fill" style="width:${clamped}%;background:${color}"></div></div>`;
}

export function buildTeamReportHtml(team: any, progress: any, board: any[]): string {
  const generated = new Date().toLocaleString();
  const projects: any[] = progress?.projects || team?.projects || [];
  const members: any[] = progress?.members || team?.members || [];
  const tasks: any[] = board || [];

  const now = new Date();
  const soonCutoff = new Date(now.getTime() + 14 * 86400000); // next 14 days

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter((t) => t.status === 'done').length;
  const overdueTasks = tasks.filter((t) => t.dueDate && new Date(t.dueDate) < now && t.status !== 'done');
  const overdue = overdueTasks.length;
  const blocked = tasks.filter((t) => t.status === 'blocked').length;
  const overallPct = totalTasks ? Math.round((doneTasks / totalTasks) * 100) : 0;
  const activeProjects = projects.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length;

  // Upcoming deadlines — open tasks due within the next 14 days. This is the
  // forward-looking list a lead actually drives the meeting from.
  const upcomingTasks = tasks
    .filter((t) => t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

  // Per-project signal roll-up (keyed by project code) so the Projects table
  // can show health, overdue and blocked at a glance across many projects.
  const projStats = new Map<string, { overdue: number; blocked: number; dueSoon: number }>();
  for (const t of tasks) {
    const key = t.projectCode || t.projectName || '—';
    const s = projStats.get(key) || { overdue: 0, blocked: 0, dueSoon: 0 };
    if (t.status !== 'done' && t.dueDate && new Date(t.dueDate) < now) s.overdue++;
    if (t.status === 'blocked') s.blocked++;
    if (t.status !== 'done' && t.dueDate && new Date(t.dueDate) >= now && new Date(t.dueDate) <= soonCutoff) s.dueSoon++;
    projStats.set(key, s);
  }
  // Health from the signals: a simple, explainable RAG rule.
  function projHealth(code: string, pct: number): { label: string; color: string; bg: string } {
    const s = projStats.get(code) || { overdue: 0, blocked: 0, dueSoon: 0 };
    if (s.overdue >= 3 || (s.overdue >= 1 && s.blocked >= 1)) return { label: 'Critical', color: '#b91c1c', bg: '#fef2f2' };
    if (s.overdue >= 1 || s.blocked >= 1) return { label: 'At risk', color: '#b45309', bg: '#fffbeb' };
    return { label: 'On track', color: '#15803d', bg: '#f0fdf4' };
  }
  const atRiskProjects = projects.filter((p) => {
    const s = projStats.get(p.code || p.name || '—') || { overdue: 0, blocked: 0, dueSoon: 0 };
    return s.overdue >= 1 || s.blocked >= 1;
  }).length;

  // Status distribution for the visual breakdown bar.
  const order = ['todo', 'in_progress', 'review', 'blocked', 'done'];
  const counts: Record<string, number> = {};
  for (const s of order) counts[s] = 0;
  for (const t of tasks) counts[t.status] = (counts[t.status] || 0) + 1;
  const distSegments = order
    .filter((s) => counts[s] > 0)
    .map((s) => `<div class="seg" title="${STATUS_LABEL[s]}: ${counts[s]}" style="flex:${counts[s]};background:${STATUS_COLOR[s]}"></div>`)
    .join('');
  const distLegend = order.map((s) =>
    `<span class="lg"><i style="background:${STATUS_COLOR[s]}"></i>${STATUS_LABEL[s]} <b>${counts[s]}</b></span>`
  ).join('');

  // ── Executive summary auto-narrative — the line a lead reads aloud. ──
  const summaryBits: string[] = [];
  summaryBits.push(`The team is <b>${overallPct}%</b> complete across <b>${projects.length}</b> project${projects.length === 1 ? '' : 's'} (${activeProjects} active).`);
  if (overdue > 0) summaryBits.push(`<b style="color:#b91c1c">${overdue} task${overdue === 1 ? '' : 's'} overdue</b> and need attention.`);
  else summaryBits.push(`Nothing is overdue — the team is on schedule.`);
  if (blocked > 0) summaryBits.push(`<b style="color:#b91c1c">${blocked} blocked</b>.`);
  if (atRiskProjects > 0) summaryBits.push(`<b style="color:#b45309">${atRiskProjects} project${atRiskProjects === 1 ? '' : 's'} at risk.</b>`);
  if (upcomingTasks.length > 0) summaryBits.push(`<b>${upcomingTasks.length}</b> deadline${upcomingTasks.length === 1 ? '' : 's'} in the next 14 days.`);

  const projectRows = projects.map((p) => {
    const pct = p.taskCount ? Math.round((p.tasksDone / p.taskCount) * 100) : 0;
    const code = p.code || p.name || '—';
    const s = projStats.get(code) || { overdue: 0, blocked: 0, dueSoon: 0 };
    const h = projHealth(code, pct);
    return `<tr>
      <td><strong>${esc(p.code || '')}</strong> ${esc(p.name || '')}</td>
      <td><span class="pill" style="background:${h.bg};color:${h.color};font-weight:700">${h.label}</span></td>
      <td style="text-align:right">${esc(p.tasksDone ?? 0)}/${esc(p.taskCount ?? 0)}</td>
      <td style="text-align:right;${s.overdue ? 'color:#b91c1c;font-weight:700' : 'color:#94a3b8'}">${s.overdue || '—'}</td>
      <td style="text-align:right;${s.blocked ? 'color:#b91c1c;font-weight:700' : 'color:#94a3b8'}">${s.blocked || '—'}</td>
      <td style="width:140px">${bar(pct)}</td>
      <td style="text-align:right;font-weight:700">${pct}%</td>
    </tr>`;
  }).join('');

  // Upcoming deadlines rows — the next-14-days action list.
  const upcomingRows = upcomingTasks.map((t) => {
    const days = Math.ceil((new Date(t.dueDate).getTime() - now.getTime()) / 86400000);
    const when = days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days}d`;
    return `<tr>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.projectCode || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td><span class="dot" style="background:${STATUS_COLOR[t.status] || '#94a3b8'}"></span>${esc(STATUS_LABEL[t.status] || t.status || '')}</td>
      <td style="font-weight:600;${days <= 2 ? 'color:#b45309' : ''}">${fmtDate(t.dueDate)} <span class="muted">· ${when}</span></td>
    </tr>`;
  }).join('');

  const memberRows = members.map((m) => {
    const pct = m.assigned ? Math.round((m.done / m.assigned) * 100) : 0;
    return `<tr>
      <td>${esc(m.name || '')}${m.title ? ` <span class="muted">· ${esc(m.title)}</span>` : ''}</td>
      <td style="text-align:right">${esc(m.assigned ?? 0)}</td>
      <td style="text-align:right">${esc(m.done ?? 0)}</td>
      <td style="text-align:right;${(m.overdue ?? 0) > 0 ? 'color:#b91c1c;font-weight:700' : ''}">${esc(m.overdue ?? 0)}</td>
      <td style="width:140px">${bar(pct)}</td>
      <td style="text-align:right;font-weight:700">${pct}%</td>
    </tr>`;
  }).join('');

  // Overdue / at-risk section — the meeting's action list.
  const overdueRows = overdueTasks
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
    .map((t) => `<tr>
      <td>${esc(t.title || '')}</td>
      <td>${esc(t.projectCode || '')}</td>
      <td>${esc(t.assigneeName || 'Unassigned')}</td>
      <td style="color:#b91c1c;font-weight:600">${fmtDate(t.dueDate)}</td>
    </tr>`).join('');

  // All tasks grouped by project for a clean, readable backlog.
  const byProject = new Map<string, any[]>();
  for (const t of tasks) {
    const key = t.projectCode || t.projectName || 'Unassigned';
    if (!byProject.has(key)) byProject.set(key, []);
    byProject.get(key)!.push(t);
  }
  const groupedTasks = [...byProject.entries()].map(([code, ts]) => {
    const rows = ts.map((t) => {
      const od = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';
      return `<tr>
        <td>${esc(t.title || '')}</td>
        <td>${esc(t.assigneeName || 'Unassigned')}</td>
        <td><span class="dot" style="background:${STATUS_COLOR[t.status] || '#94a3b8'}"></span>${esc(STATUS_LABEL[t.status] || t.status || '')}</td>
        <td style="${od ? 'color:#b91c1c;font-weight:600' : ''}">${fmtDate(t.dueDate)}</td>
      </tr>`;
    }).join('');
    return `<h3>${esc(code)} <span class="muted">· ${ts.length} task${ts.length === 1 ? '' : 's'}</span></h3>
      <table><thead><tr><th>Task</th><th>Assignee</th><th>Status</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${esc(team?.name || 'Team')} — Team Report</title>
<style>
  * { box-sizing:border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; color:#0f172a; margin:0; background:#f8fafc; }
  .page { max-width:900px; margin:0 auto; padding:40px; background:#fff; }
  .brand { display:flex; align-items:center; justify-content:space-between; border-bottom:3px solid #1565C0; padding-bottom:14px; margin-bottom:8px; }
  .brand .mark { display:flex; align-items:center; gap:10px; }
  .brand .mark svg { display:block; }
  .brand .logo { font-size:13px; font-weight:900; letter-spacing:.18em; color:#1565C0; text-transform:uppercase; line-height:1.2; }
  .brand .logo small { display:block; font-size:9px; font-weight:700; letter-spacing:.12em; color:#94a3b8; }
  .brand .gen { font-size:11px; color:#94a3b8; text-align:right; }
  h1 { font-size:26px; margin:14px 0 2px; }
  h2 { font-size:14px; margin:30px 0 10px; text-transform:uppercase; letter-spacing:.08em; color:#1565C0; border-bottom:1px solid #e2e8f0; padding-bottom:5px; }
  h3 { font-size:13px; margin:18px 0 6px; color:#334155; }
  .muted { color:#94a3b8; font-weight:400; }
  .sub { color:#64748b; margin:0; font-size:13px; }
  .summary { background:#f1f5f9; border-left:4px solid #1565C0; border-radius:8px; padding:14px 16px; margin:18px 0; font-size:14px; line-height:1.6; }
  .kpis { display:flex; gap:10px; flex-wrap:wrap; margin:16px 0; }
  .kpi { border:1px solid #e2e8f0; border-radius:12px; padding:12px 16px; min-width:110px; flex:1; }
  .kpi .n { font-size:24px; font-weight:800; }
  .kpi .l { font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:#64748b; margin-top:2px; }
  .dist { display:flex; height:14px; border-radius:7px; overflow:hidden; margin:6px 0 10px; border:1px solid #e2e8f0; }
  .dist .seg { min-width:2px; }
  .legend { display:flex; gap:14px; flex-wrap:wrap; font-size:11px; color:#475569; margin-bottom:6px; }
  .legend .lg { display:inline-flex; align-items:center; gap:5px; }
  .legend i { width:9px; height:9px; border-radius:2px; display:inline-block; }
  table { width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:8px; }
  th, td { text-align:left; padding:7px 9px; border-bottom:1px solid #eef2f7; vertical-align:middle; }
  th { font-size:10px; text-transform:uppercase; letter-spacing:.05em; color:#64748b; background:#fafbfd; }
  .pill { font-size:11px; padding:2px 8px; border-radius:99px; background:#eef2f7; color:#475569; text-transform:capitalize; }
  .bar { height:7px; background:#eef2f7; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; }
  .dot { display:inline-block; width:8px; height:8px; border-radius:99px; margin-right:6px; vertical-align:middle; }
  .risk { border:1px solid #fecaca; background:#fef2f2; border-radius:10px; padding:4px 12px 10px; }
  .footer { margin-top:36px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center; }
  @media print { body { background:#fff; } .page { padding:16px; max-width:none; } h2 { break-after:avoid; } table { break-inside:auto; } tr { break-inside:avoid; } }
</style></head>
<body>
  <div class="page">
    <div class="brand">
      <span class="mark">
        <svg width="34" height="34" viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <linearGradient id="pg" x1="0" y1="0" x2="34" y2="34" gradientUnits="userSpaceOnUse">
              <stop stop-color="#1565C0"/><stop offset="1" stop-color="#2B8C47"/>
            </linearGradient>
          </defs>
          <rect width="34" height="34" rx="9" fill="url(#pg)"/>
          <path d="M11 24V10h6.2c3 0 4.9 1.8 4.9 4.5S20.2 19 17.2 19H14v5h-3Zm3-7.6h2.9c1.4 0 2.2-.7 2.2-1.9s-.8-1.9-2.2-1.9H14v3.8Z" fill="#fff"/>
        </svg>
        <span class="logo">Pragati<small>Quality Informatics</small></span>
      </span>
      <span class="gen">Team report<br>Generated ${esc(generated)}</span>
    </div>

    <h1>${esc(team?.name || 'Team')}</h1>
    <p class="sub">${esc(team?.description || 'Team performance & delivery report')}${team?.function ? ` · Function: ${esc(team.function)}` : ''}${team?.leadName ? ` · Lead: ${esc(team.leadName)}` : ''}</p>

    <div class="summary">${summaryBits.join(' ')}</div>

    <div class="kpis">
      <div class="kpi"><div class="n">${projects.length}</div><div class="l">Projects</div></div>
      <div class="kpi"><div class="n">${members.length}</div><div class="l">Members</div></div>
      <div class="kpi"><div class="n">${doneTasks}/${totalTasks}</div><div class="l">Tasks done</div></div>
      <div class="kpi"><div class="n">${overallPct}%</div><div class="l">Completion</div></div>
      <div class="kpi"><div class="n" style="${overdue ? 'color:#b91c1c' : ''}">${overdue}</div><div class="l">Overdue</div></div>
      <div class="kpi"><div class="n" style="${blocked ? 'color:#b91c1c' : ''}">${blocked}</div><div class="l">Blocked</div></div>
      <div class="kpi"><div class="n" style="${atRiskProjects ? 'color:#b45309' : ''}">${atRiskProjects}</div><div class="l">At-risk projects</div></div>
      <div class="kpi"><div class="n">${upcomingTasks.length}</div><div class="l">Due ≤ 14d</div></div>
    </div>

    <h2>Status distribution</h2>
    <div class="legend">${distLegend}</div>
    <div class="dist">${distSegments || '<div class="seg" style="flex:1;background:#eef2f7"></div>'}</div>

    <h2>Projects — health &amp; progress</h2>
    <table><thead><tr><th>Project</th><th>Health</th><th style="text-align:right">Tasks</th><th style="text-align:right">Overdue</th><th style="text-align:right">Blocked</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${projectRows || '<tr><td colspan="7" class="muted">No projects.</td></tr>'}</tbody></table>

    ${upcomingTasks.length > 0 ? `<h2>Upcoming deadlines — next 14 days</h2>
    <table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Status</th><th>Due</th></tr></thead>
    <tbody>${upcomingRows}</tbody></table>` : ''}

    <h2>Member workload</h2>
    <table><thead><tr><th>Member</th><th style="text-align:right">Assigned</th><th style="text-align:right">Done</th><th style="text-align:right">Overdue</th><th>Progress</th><th style="text-align:right">%</th></tr></thead>
    <tbody>${memberRows || '<tr><td colspan="6" class="muted">No members.</td></tr>'}</tbody></table>

    ${overdue > 0 ? `<h2>⚠ Overdue — needs attention</h2>
    <div class="risk"><table><thead><tr><th>Task</th><th>Project</th><th>Assignee</th><th>Due</th></tr></thead>
    <tbody>${overdueRows}</tbody></table></div>` : ''}

    <h2>Task backlog by project</h2>
    ${groupedTasks || '<p class="muted">No tasks.</p>'}

    <div class="footer">Confidential · Generated by Pragati for internal team review · ${esc(generated)}</div>
  </div>
</body></html>`;
}

// ── CSV export ───────────────────────────────────────────────────────────────
// A flat, spreadsheet-friendly dump of the task backlog so a lead can pivot,
// filter, or paste it into a tracker. Complements the visual HTML/PDF report.
function csvCell(v: any): string {
  const s = String(v ?? '');
  // Quote anything containing a comma, quote, or newline; double embedded quotes.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function buildTeamReportCsv(team: any, board: any[]): string {
  const tasks: any[] = board || [];
  const header = [
    'Project Code', 'Project', 'Task', 'Assignee', 'Status', 'Priority', 'Due Date', 'Overdue',
  ];
  const rows = tasks.map((t) => {
    const overdue = t.dueDate && new Date(t.dueDate) < new Date() && t.status !== 'done';
    return [
      t.projectCode || '',
      t.projectName || '',
      t.title || '',
      t.assigneeName || 'Unassigned',
      STATUS_LABEL[t.status] || t.status || '',
      t.priority || '',
      fmtDate(t.dueDate),
      overdue ? 'Yes' : 'No',
    ].map(csvCell).join(',');
  });
  // Prepend a BOM so Excel opens UTF-8 cleanly.
  return '﻿' + [header.map(csvCell).join(','), ...rows].join('\r\n');
}

function triggerDownload(content: string, mime: string, filename: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadTeamCsv(team: any, board: any[]) {
  const safeName = String(team?.name || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  triggerDownload(
    buildTeamReportCsv(team, board),
    'text/csv;charset=utf-8',
    `${safeName}-tasks-${new Date().toISOString().slice(0, 10)}.csv`,
  );
}

export function downloadTeamReport(team: any, progress: any, board: any[]) {
  const html = buildTeamReportHtml(team, progress, board);
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const safeName = String(team?.name || 'team').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  a.href = url;
  a.download = `${safeName}-report-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Open the report in a new tab and trigger the browser's print dialog so a lead
// can save it as PDF or print it for a meeting in one click.
export function printTeamReport(team: any, progress: any, board: any[]) {
  const html = buildTeamReportHtml(team, progress, board);
  const w = window.open('', '_blank');
  if (!w) { downloadTeamReport(team, progress, board); return; }
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 400);
}
