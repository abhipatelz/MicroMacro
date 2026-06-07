import { NextRequest, NextResponse } from 'next/server';
import { connectDB } from '@/lib/db';
import { Project } from '@/models/Project';
import { Task } from '@/models/Task';
import { User } from '@/models/User';
import { isLead, requireUser } from '@/lib/auth';
import { getLeadScope, projectsVisibleFilter } from '@/lib/leadScope';
import { rateLimit } from '@/lib/rateLimit';
import { handleError } from '@/lib/http';
import ExcelJS from 'exceljs';

export const runtime = 'nodejs';

/* ── Colour palette ─────────────────────────────────────────────────────── */
const C = {
  // Brand
  brandBlue:   'FF1565C0',
  brandDark:   'FF0D47A1',
  brandLight:  'FFE3F2FD',
  // Status
  done:        'FF22C55E',
  doneBg:      'FFF0FDF4',
  inProgress:  'FF1565C0',
  inProgressBg:'FFEFF6FF',
  todo:        'FF94A3B8',
  todoBg:      'FFF8FAFC',
  review:      'FF7C3AED',
  reviewBg:    'FFF5F3FF',
  blocked:     'FFDC2626',
  blockedBg:   'FFFEF2F2',
  onHold:      'FFF59E0B',
  // Priority
  critical:    'FFEF4444',
  criticalBg:  'FFFEF2F2',
  high:        'FFF97316',
  highBg:      'FFFFF7ED',
  medium:      'FF0EA5E9',
  mediumBg:    'FFF0F9FF',
  // Health
  healthGood:  'FF22C55E',
  healthRisk:  'FFF59E0B',
  healthCrit:  'FFEF4444',
  // Neutral
  headerBg:    'FF0B1628',
  headerFg:    'FFFFFFFF',
  sectionBg:   'FF1E3A5F',
  sectionFg:   'FFFFFFFF',
  subHeaderBg: 'FFE8EDF4',
  subHeaderFg: 'FF0F172A',
  rowAlt:      'FFF8FAFC',
  border:      'FFD2DAE4',
  textMuted:   'FF64748B',
  white:       'FFFFFFFF',
};

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function daysOverdue(dueDate: string | null | undefined): number | null {
  if (!dueDate) return null;
  const d = new Date(dueDate + (dueDate.length === 10 ? 'T12:00:00' : ''));
  return Math.round((Date.now() - d.getTime()) / 86400000);
}

function fmt(d: string | Date | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(s: string): string {
  return ({ todo: 'To Do', in_progress: 'In Progress', review: 'Review', blocked: 'Blocked', done: 'Done', planning: 'Planning', on_hold: 'On Hold', completed: 'Completed', cancelled: 'Cancelled' })[s] ?? s;
}

function lcLabel(lc: string): string {
  return lc.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function applyBorder(ws: ExcelJS.Worksheet, row: number, colStart: number, colEnd: number) {
  for (let c = colStart; c <= colEnd; c++) {
    const cell = ws.getCell(row, c);
    cell.border = {
      top:    { style: 'thin', color: { argb: C.border } },
      bottom: { style: 'thin', color: { argb: C.border } },
      left:   { style: 'thin', color: { argb: C.border } },
      right:  { style: 'thin', color: { argb: C.border } },
    };
  }
}

function hdr(ws: ExcelJS.Worksheet, row: number, cols: number, text: string, bg = C.sectionBg, fg = C.sectionFg, fontSize = 11) {
  const cell = ws.getCell(row, 1);
  cell.value = text;
  cell.font = { bold: true, color: { argb: fg }, size: fontSize, name: 'Calibri' };
  cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
  cell.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  ws.mergeCells(row, 1, row, cols);
  ws.getRow(row).height = 22;
}

function colHdr(ws: ExcelJS.Worksheet, row: number, cols: string[]) {
  const r = ws.getRow(row);
  r.height = 20;
  cols.forEach((text, i) => {
    const cell = r.getCell(i + 1);
    cell.value = text;
    cell.font = { bold: true, color: { argb: C.subHeaderFg }, size: 10, name: 'Calibri' };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.subHeaderBg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top:    { style: 'medium', color: { argb: C.brandBlue } },
      bottom: { style: 'medium', color: { argb: C.brandBlue } },
      left:   { style: 'thin',   color: { argb: C.border } },
      right:  { style: 'thin',   color: { argb: C.border } },
    };
  });
}

/**
 * Sanitize string values before writing to a spreadsheet cell to prevent
 * CSV / formula injection (CWE-1236). A title like `=cmd|'/c calc'!A1`
 * would otherwise execute as a formula when the recipient opens the
 * file in Excel / LibreOffice. Numbers, dates, and booleans pass through
 * unchanged — only strings beginning with =, +, -, @, \t, or \r are
 * defanged with a leading single quote.
 */
function safeCellValue(value: any): any {
  if (typeof value !== 'string') return value;
  if (value.length === 0) return value;
  const first = value.charCodeAt(0);
  if (first === 0x3D /* = */ || first === 0x2B /* + */ || first === 0x2D /* - */ ||
      first === 0x40 /* @ */ || first === 0x09 /* TAB */ || first === 0x0D /* CR */) {
    return `'${value}`;
  }
  return value;
}

function setVal(ws: ExcelJS.Worksheet, row: number, col: number, value: any, opts: {
  bold?: boolean; color?: string; bg?: string; align?: ExcelJS.Alignment['horizontal']; size?: number; wrapText?: boolean;
} = {}) {
  const cell = ws.getCell(row, col);
  cell.value = safeCellValue(value ?? '—');
  cell.font = { name: 'Calibri', size: opts.size ?? 10, bold: opts.bold, color: { argb: opts.color ?? C.subHeaderFg } };
  if (opts.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: opts.bg } };
  cell.alignment = { vertical: 'middle', horizontal: opts.align ?? 'left', indent: opts.align === 'center' ? 0 : 1, wrapText: opts.wrapText };
}

function progressBar(ws: ExcelJS.Worksheet, row: number, col: number, pct: number) {
  const filled = Math.round(pct / 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = pct >= 80 ? C.done : pct >= 50 ? C.brandBlue : pct >= 20 ? C.onHold : C.critical;
  const cell = ws.getCell(row, col);
  cell.value = `${bar}  ${pct}%`;
  cell.font = { name: 'Consolas', size: 10, bold: true, color: { argb: color } };
  cell.alignment = { vertical: 'middle', horizontal: 'left' };
}

/* ════════════════════════════════════════════════════════════════════════════
   SHEET 1 — Executive Summary
════════════════════════════════════════════════════════════════════════════ */
function buildSummarySheet(wb: ExcelJS.Workbook, project: any, tasks: any[], phaseMap: Map<string, string>) {
  const ws = wb.addWorksheet('📋 Executive Summary', { properties: { tabColor: { argb: C.brandBlue } } });
  ws.views = [{ showGridLines: false }];

  const COLS = 8;
  ws.columns = [
    { width: 22 }, { width: 18 }, { width: 18 }, { width: 18 },
    { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 },
  ];

  // Title banner
  let r = 1;
  ws.mergeCells(r, 1, r, COLS);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = '  PROJECT INTELLIGENCE REPORT  —  PRAGATI';
  titleCell.font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.headerFg } };
  titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(r).height = 30;

  r++;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = `  Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}`;
  ws.getCell(r, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.textMuted } };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF2F8' } };
  ws.getRow(r).height = 16;

  r += 2;
  hdr(ws, r, COLS, '  PROJECT DETAILS', C.brandDark, C.headerFg, 12);
  r++;

  const details = [
    ['Project Name', project.name, 'Project Code', project.code],
    ['Status',       statusLabel(project.status), 'Priority', (project.priority || 'medium').toUpperCase()],
    ['Lifecycle',    lcLabel(project.lifecycle || 'generic'), 'GxP Impact', (project.gxpImpact || 'none').toUpperCase()],
    ['Start Date',   fmt(project.startDate), 'Due Date', fmt(project.dueDate)],
    ['Team',         project.teamName || '—', 'Owner', project.ownerName || '—'],
  ];

  for (const [k1, v1, k2, v2] of details) {
    ws.getRow(r).height = 18;
    setVal(ws, r, 1, k1, { bold: true, color: C.textMuted });
    ws.mergeCells(r, 2, r, 4);
    setVal(ws, r, 2, v1, { bold: true, color: C.brandDark });
    setVal(ws, r, 5, k2, { bold: true, color: C.textMuted });
    ws.mergeCells(r, 6, r, 8);
    setVal(ws, r, 6, v2, { bold: true, color: C.brandDark });
    applyBorder(ws, r, 1, COLS);
    r++;
  }

  if (project.description) {
    ws.getRow(r).height = 30;
    setVal(ws, r, 1, 'Description', { bold: true, color: C.textMuted });
    ws.mergeCells(r, 2, r, COLS);
    setVal(ws, r, 2, project.description, { wrapText: true });
    applyBorder(ws, r, 1, COLS);
    r++;
  }

  // KPI strip
  r++;
  hdr(ws, r, COLS, '  KEY METRICS AT A GLANCE', C.brandDark, C.headerFg, 12);
  r++;

  const done      = tasks.filter(t => t.status === 'done').length;
  const overdue   = tasks.filter(t => t.status !== 'done' && daysOverdue(t.dueDate) !== null && daysOverdue(t.dueDate)! > 0).length;
  const blocked   = tasks.filter(t => t.status === 'blocked').length;
  const inProg    = tasks.filter(t => t.status === 'in_progress').length;
  const total     = tasks.length;
  const pct       = total ? Math.round(done / total * 100) : 0;
  const critical  = tasks.filter(t => t.priority === 'critical' && t.status !== 'done').length;
  const high      = tasks.filter(t => t.priority === 'high' && t.status !== 'done').length;

  const kpis: [string, string | number, string][] = [
    ['Total Tasks',      total,    C.subHeaderBg],
    ['Completed',        done,     C.doneBg],
    ['In Progress',      inProg,   C.inProgressBg],
    ['Overdue',          overdue,  overdue > 0 ? C.criticalBg : C.doneBg],
    ['Blocked',          blocked,  blocked > 0 ? C.blockedBg  : C.doneBg],
    ['Critical Priority', critical, critical > 0 ? C.criticalBg : C.doneBg],
    ['High Priority',    high,     high > 0 ? C.highBg : C.doneBg],
    ['Completion %',     `${pct}%`, pct >= 80 ? C.doneBg : pct >= 50 ? C.inProgressBg : C.criticalBg],
  ];

  // KPI row — labels
  ws.getRow(r).height = 18;
  kpis.forEach(([label, , bg], i) => {
    setVal(ws, r, i + 1, label, { bold: true, size: 9, color: C.textMuted, bg, align: 'center' });
  });
  applyBorder(ws, r, 1, COLS);
  r++;

  // KPI row — values (big numbers)
  ws.getRow(r).height = 30;
  kpis.forEach(([, value, bg], i) => {
    const cell = ws.getCell(r, i + 1);
    cell.value = value;
    cell.font = { name: 'Calibri', size: 16, bold: true, color: { argb: C.brandDark } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = { bottom: { style: 'medium', color: { argb: C.brandBlue } }, left: { style: 'thin', color: { argb: C.border } }, right: { style: 'thin', color: { argb: C.border } } };
  });
  r++;

  // Progress visual
  r++;
  hdr(ws, r, COLS, '  OVERALL PROGRESS', C.sectionBg, C.sectionFg);
  r++;
  ws.getRow(r).height = 22;
  ws.mergeCells(r, 1, r, 2);
  setVal(ws, r, 1, 'Completion', { bold: true });
  ws.mergeCells(r, 3, r, COLS);
  progressBar(ws, r, 3, pct);
  applyBorder(ws, r, 1, COLS);

  // Phase progress
  r += 2;
  hdr(ws, r, COLS, '  PROGRESS BY PHASE', C.sectionBg, C.sectionFg);
  r++;
  colHdr(ws, r, ['Phase', 'Total Tasks', 'Done', 'In Progress', 'Blocked', 'Overdue', '% Complete', 'Progress']);
  r++;

  const phases = project.phases || [];
  for (const phase of phases) {
    const pTasks = tasks.filter(t => String(t.phaseId) === String(phase._id));
    if (!pTasks.length) continue;
    const pDone    = pTasks.filter(t => t.status === 'done').length;
    const pInProg  = pTasks.filter(t => t.status === 'in_progress').length;
    const pBlocked = pTasks.filter(t => t.status === 'blocked').length;
    const pOverdue = pTasks.filter(t => t.status !== 'done' && daysOverdue(t.dueDate) !== null && daysOverdue(t.dueDate)! > 0).length;
    const pPct     = pTasks.length ? Math.round(pDone / pTasks.length * 100) : 0;

    ws.getRow(r).height = 20;
    setVal(ws, r, 1, phase.name, { bold: true });
    setVal(ws, r, 2, pTasks.length, { align: 'center' });
    setVal(ws, r, 3, pDone,    { align: 'center', color: pDone > 0 ? C.done : C.textMuted, bold: pDone > 0 });
    setVal(ws, r, 4, pInProg,  { align: 'center', color: C.inProgress });
    setVal(ws, r, 5, pBlocked, { align: 'center', color: pBlocked > 0 ? C.blocked : C.textMuted, bold: pBlocked > 0 });
    setVal(ws, r, 6, pOverdue, { align: 'center', color: pOverdue > 0 ? C.critical : C.textMuted, bold: pOverdue > 0 });
    setVal(ws, r, 7, `${pPct}%`, { align: 'center', bold: true, color: pPct >= 80 ? C.done : pPct >= 50 ? C.inProgress : C.critical });
    progressBar(ws, r, 8, pPct);
    applyBorder(ws, r, 1, COLS);
    if (r % 2 === 0) {
      for (let c = 1; c <= COLS; c++) {
        const cell = ws.getCell(r, c);
        if (!cell.fill || (cell.fill as any).fgColor?.argb === C.white) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.rowAlt } };
        }
      }
    }
    r++;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SHEET 2 — All Tasks (by phase)
════════════════════════════════════════════════════════════════════════════ */
function buildTasksSheet(wb: ExcelJS.Workbook, project: any, tasks: any[], users: any[]) {
  const ws = wb.addWorksheet('📝 All Tasks', { properties: { tabColor: { argb: C.brandBlue } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 5 }, { width: 38 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
  ];

  const COLS = 8;
  const userMap = new Map(users.map(u => [String(u._id), u.name]));

  let r = 1;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = `  ${project.name.toUpperCase()}  —  FULL TASK LIST`;
  ws.getCell(r, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.headerFg } };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
  ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(r).height = 28;
  r += 2;

  const phases = project.phases || [];
  for (const phase of phases) {
    const pTasks = tasks.filter(t => String(t.phaseId) === String(phase._id));
    if (!pTasks.length) continue;

    // Phase header
    hdr(ws, r, COLS, `  PHASE: ${phase.name.toUpperCase()}  (${pTasks.filter(t => t.status === 'done').length}/${pTasks.length} done)`, C.sectionBg, C.sectionFg, 11);
    r++;
    colHdr(ws, r, ['#', 'Task Title', 'Assignee', 'Status', 'Priority', 'Due Date', 'Days Late', 'GxP']);
    r++;

    pTasks.forEach((task, idx) => {
      const late = daysOverdue(task.dueDate);
      const isLate = task.status !== 'done' && late !== null && late > 0;
      const isBlocked = task.status === 'blocked';
      const rowBg = isBlocked ? C.blockedBg : isLate ? C.criticalBg : task.status === 'done' ? C.doneBg : idx % 2 === 0 ? C.white : C.rowAlt;

      ws.getRow(r).height = 18;
      setVal(ws, r, 1, idx + 1, { align: 'center', bg: rowBg, color: C.textMuted });
      setVal(ws, r, 2, task.title, { bg: rowBg, bold: isBlocked || isLate });
      setVal(ws, r, 3, userMap.get(String(task.assigneeId)) || '—', { bg: rowBg, align: 'center' });

      // Status cell with colour
      const sBg: Record<string, string> = { done: C.doneBg, in_progress: C.inProgressBg, review: C.reviewBg, blocked: C.blockedBg, todo: C.todoBg };
      const sCol: Record<string, string> = { done: C.done, in_progress: C.inProgress, review: C.review, blocked: C.blocked, todo: C.todo };
      setVal(ws, r, 4, statusLabel(task.status), { bg: sBg[task.status] ?? rowBg, color: sCol[task.status] ?? C.subHeaderFg, bold: true, align: 'center' });

      // Priority cell
      const pBg: Record<string, string> = { critical: C.criticalBg, high: C.highBg, medium: C.mediumBg };
      const pCol: Record<string, string> = { critical: C.critical, high: C.high, medium: C.medium };
      const pri = task.priority || 'low';
      setVal(ws, r, 5, pri.toUpperCase(), { bg: pBg[pri] ?? rowBg, color: pCol[pri] ?? C.textMuted, bold: pri === 'critical' || pri === 'high', align: 'center' });

      setVal(ws, r, 6, fmt(task.dueDate), { bg: rowBg, align: 'center' });
      setVal(ws, r, 7, task.status === 'done' ? 'Done' : late !== null && late > 0 ? `${late}d` : late === 0 ? 'Today' : '—',
        { bg: rowBg, color: isLate ? C.critical : C.textMuted, bold: isLate, align: 'center' });
      setVal(ws, r, 8, task.gxpCritical ? '⚠ GxP' : '—', { bg: rowBg, align: 'center', color: task.gxpCritical ? C.review : C.textMuted });
      applyBorder(ws, r, 1, COLS);
      r++;
    });
    r++;
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SHEET 3 — Blockers & Bottlenecks (meeting-ready)
════════════════════════════════════════════════════════════════════════════ */
function buildBottleneckSheet(wb: ExcelJS.Workbook, project: any, tasks: any[], users: any[]) {
  const ws = wb.addWorksheet('🚨 Blockers & Bottlenecks', { properties: { tabColor: { argb: C.critical } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 5 }, { width: 38 }, { width: 16 }, { width: 16 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 22 },
  ];

  const COLS = 8;
  const userMap = new Map(users.map(u => [String(u._id), u.name]));
  const phaseMap = new Map((project.phases || []).map((p: any) => [String(p._id), p.name]));

  let r = 1;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = `  BLOCKERS & BOTTLENECKS  —  ${project.name.toUpperCase()}`;
  ws.getCell(r, 1).font = { name: 'Calibri', size: 14, bold: true, color: { argb: C.headerFg } };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(r).height = 30;
  r++;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = '  Use this sheet for stand-up / review meeting discussions. Focus on items with highest impact.';
  ws.getCell(r, 1).font = { name: 'Calibri', size: 9, italic: true, color: { argb: C.textMuted } };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F2' } };
  ws.getRow(r).height = 16;
  r += 2;

  // ── Section A: BLOCKED tasks ──
  const blockedTasks = tasks.filter(t => t.status === 'blocked');
  hdr(ws, r, COLS, `  🔴  BLOCKED TASKS  (${blockedTasks.length})  —  Cannot proceed without resolution`, 'FFDC2626', C.headerFg, 11);
  r++;
  if (blockedTasks.length === 0) {
    ws.getRow(r).height = 18;
    ws.mergeCells(r, 1, r, COLS);
    setVal(ws, r, 1, '  ✅  No blocked tasks — looking good!', { color: C.done, bold: true });
    r++;
  } else {
    colHdr(ws, r, ['#', 'Task Title', 'Phase', 'Assignee', 'Priority', 'Due Date', 'Days Late', 'Action Needed']);
    r++;
    blockedTasks.forEach((task, i) => {
      const late = daysOverdue(task.dueDate);
      ws.getRow(r).height = 20;
      setVal(ws, r, 1, i + 1, { align: 'center', bg: C.blockedBg });
      setVal(ws, r, 2, task.title, { bg: C.blockedBg, bold: true, color: C.blocked });
      setVal(ws, r, 3, phaseMap.get(String(task.phaseId)) || '—', { bg: C.blockedBg, align: 'center' });
      setVal(ws, r, 4, userMap.get(String(task.assigneeId)) || '—', { bg: C.blockedBg, align: 'center' });
      setVal(ws, r, 5, (task.priority || 'low').toUpperCase(), { bg: C.criticalBg, color: C.critical, bold: true, align: 'center' });
      setVal(ws, r, 6, fmt(task.dueDate), { bg: C.blockedBg, align: 'center' });
      setVal(ws, r, 7, late !== null && late > 0 ? `${late}d overdue` : '—', { bg: C.blockedBg, color: C.critical, bold: late !== null && late > 0, align: 'center' });
      setVal(ws, r, 8, 'Resolve blocker →', { bg: C.criticalBg, color: C.critical, bold: true });
      applyBorder(ws, r, 1, COLS);
      r++;
    });
  }

  // ── Section B: OVERDUE tasks ──
  r++;
  const overdueTasks = tasks.filter(t => t.status !== 'done' && daysOverdue(t.dueDate) !== null && daysOverdue(t.dueDate)! > 0)
    .sort((a, b) => daysOverdue(b.dueDate)! - daysOverdue(a.dueDate)!);
  hdr(ws, r, COLS, `  🟠  OVERDUE TASKS  (${overdueTasks.length})  —  Past deadline, sorted by most overdue first`, 'FFF97316', C.headerFg, 11);
  r++;
  if (overdueTasks.length === 0) {
    ws.getRow(r).height = 18;
    ws.mergeCells(r, 1, r, COLS);
    setVal(ws, r, 1, '  ✅  No overdue tasks — all on schedule!', { color: C.done, bold: true });
    r++;
  } else {
    colHdr(ws, r, ['#', 'Task Title', 'Phase', 'Assignee', 'Status', 'Due Date', 'Days Overdue', 'Priority']);
    r++;
    overdueTasks.forEach((task, i) => {
      const late = daysOverdue(task.dueDate)!;
      const bg = late > 14 ? C.criticalBg : C.highBg;
      ws.getRow(r).height = 20;
      setVal(ws, r, 1, i + 1, { align: 'center', bg });
      setVal(ws, r, 2, task.title, { bg, bold: late > 7 });
      setVal(ws, r, 3, phaseMap.get(String(task.phaseId)) || '—', { bg, align: 'center' });
      setVal(ws, r, 4, userMap.get(String(task.assigneeId)) || '—', { bg, align: 'center' });
      setVal(ws, r, 5, statusLabel(task.status), { bg, align: 'center' });
      setVal(ws, r, 6, fmt(task.dueDate), { bg, align: 'center' });
      setVal(ws, r, 7, `${late}d overdue`, { bg: C.criticalBg, color: C.critical, bold: true, align: 'center' });
      setVal(ws, r, 8, (task.priority || 'low').toUpperCase(), { bg, bold: true, align: 'center' });
      applyBorder(ws, r, 1, COLS);
      r++;
    });
  }

  // ── Section C: High/Critical open tasks ──
  r++;
  const criticalOpen = tasks.filter(t => t.status !== 'done' && (t.priority === 'critical' || t.priority === 'high'));
  hdr(ws, r, COLS, `  🟡  HIGH & CRITICAL OPEN TASKS  (${criticalOpen.length})  —  Top priority items requiring attention`, 'FFF59E0B', 'FF0F172A', 11);
  r++;
  if (criticalOpen.length === 0) {
    ws.getRow(r).height = 18;
    ws.mergeCells(r, 1, r, COLS);
    setVal(ws, r, 1, '  ✅  No critical/high priority open items!', { color: C.done, bold: true });
    r++;
  } else {
    colHdr(ws, r, ['#', 'Task Title', 'Phase', 'Assignee', 'Status', 'Priority', 'Due Date', 'GxP']);
    r++;
    criticalOpen.forEach((task, i) => {
      const isCrit = task.priority === 'critical';
      const bg = isCrit ? C.criticalBg : C.highBg;
      ws.getRow(r).height = 20;
      setVal(ws, r, 1, i + 1, { align: 'center', bg });
      setVal(ws, r, 2, task.title, { bg, bold: isCrit });
      setVal(ws, r, 3, phaseMap.get(String(task.phaseId)) || '—', { bg, align: 'center' });
      setVal(ws, r, 4, userMap.get(String(task.assigneeId)) || '—', { bg, align: 'center' });
      setVal(ws, r, 5, statusLabel(task.status), { bg, align: 'center' });
      setVal(ws, r, 6, task.priority.toUpperCase(), { bg: isCrit ? C.criticalBg : C.highBg, color: isCrit ? C.critical : C.high, bold: true, align: 'center' });
      setVal(ws, r, 7, fmt(task.dueDate), { bg, align: 'center' });
      setVal(ws, r, 8, task.gxpCritical ? '⚠ GxP' : '—', { bg, align: 'center', color: task.gxpCritical ? C.review : C.textMuted });
      applyBorder(ws, r, 1, COLS);
      r++;
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   SHEET 4 — Team & Schedule (workload per person + next-14-day deadlines)
════════════════════════════════════════════════════════════════════════════ */
function buildTeamScheduleSheet(wb: ExcelJS.Workbook, project: any, tasks: any[], users: any[]) {
  const ws = wb.addWorksheet('👥 Team & Schedule', { properties: { tabColor: { argb: C.healthGood } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [
    { width: 5 }, { width: 30 }, { width: 14 }, { width: 14 },
    { width: 14 }, { width: 14 }, { width: 16 }, { width: 18 },
  ];
  const COLS = 8;
  const userMap = new Map(users.map(u => [String(u._id), u.name]));
  const phaseMap = new Map((project.phases || []).map((p: any) => [String(p._id), p.name]));

  let r = 1;
  ws.mergeCells(r, 1, r, COLS);
  ws.getCell(r, 1).value = `  TEAM WORKLOAD & SCHEDULE  —  ${project.name.toUpperCase()}`;
  ws.getCell(r, 1).font = { name: 'Calibri', size: 13, bold: true, color: { argb: C.headerFg } };
  ws.getCell(r, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.headerBg } };
  ws.getCell(r, 1).alignment = { vertical: 'middle', horizontal: 'center' };
  ws.getRow(r).height = 28;
  r += 2;

  // ── Section A: workload by person ──
  hdr(ws, r, COLS, '  WORKLOAD BY PERSON  —  who is carrying what', C.sectionBg, C.sectionFg);
  r++;
  colHdr(ws, r, ['#', 'Assignee', 'Assigned', 'Done', 'In Progress', 'Overdue', '% Complete', 'Progress']);
  r++;

  // Group open + done tasks by assignee (including an Unassigned bucket).
  const buckets = new Map<string, any[]>();
  for (const t of tasks) {
    const key = t.assigneeId ? String(t.assigneeId) : '__unassigned__';
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }
  const rows = Array.from(buckets.entries()).map(([key, ts]) => {
    const done    = ts.filter(t => t.status === 'done').length;
    const inProg  = ts.filter(t => t.status === 'in_progress').length;
    const overdue = ts.filter(t => t.status !== 'done' && daysOverdue(t.dueDate) !== null && daysOverdue(t.dueDate)! > 0).length;
    return {
      name: key === '__unassigned__' ? 'Unassigned' : (userMap.get(key) || 'Unknown'),
      assigned: ts.length, done, inProg, overdue,
      pct: ts.length ? Math.round(done / ts.length * 100) : 0,
    };
  }).sort((a, b) => b.assigned - a.assigned);

  rows.forEach((m, i) => {
    const bg = i % 2 === 0 ? C.white : C.rowAlt;
    ws.getRow(r).height = 19;
    setVal(ws, r, 1, i + 1, { align: 'center', bg, color: C.textMuted });
    setVal(ws, r, 2, m.name, { bg, bold: true });
    setVal(ws, r, 3, m.assigned, { align: 'center', bg });
    setVal(ws, r, 4, m.done, { align: 'center', bg, color: m.done ? C.done : C.textMuted, bold: m.done > 0 });
    setVal(ws, r, 5, m.inProg, { align: 'center', bg, color: C.inProgress });
    setVal(ws, r, 6, m.overdue, { align: 'center', bg, color: m.overdue ? C.critical : C.textMuted, bold: m.overdue > 0 });
    setVal(ws, r, 7, `${m.pct}%`, { align: 'center', bg, bold: true, color: m.pct >= 80 ? C.done : m.pct >= 50 ? C.inProgress : C.critical });
    progressBar(ws, r, 8, m.pct);
    applyBorder(ws, r, 1, COLS);
    r++;
  });
  if (rows.length === 0) {
    ws.getRow(r).height = 18;
    ws.mergeCells(r, 1, r, COLS);
    setVal(ws, r, 1, '  No tasks yet.', { color: C.textMuted, bold: true });
    r++;
  }

  // ── Section B: upcoming deadlines (next 14 days) ──
  r += 2;
  const now = Date.now();
  const soon = now + 14 * 86400000;
  const upcoming = tasks
    .filter(t => t.status !== 'done' && t.dueDate && new Date(t.dueDate).getTime() >= now && new Date(t.dueDate).getTime() <= soon)
    .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  hdr(ws, r, COLS, `  UPCOMING DEADLINES  (${upcoming.length})  —  due in the next 14 days`, C.brandDark, C.headerFg, 11);
  r++;
  if (upcoming.length === 0) {
    ws.getRow(r).height = 18;
    ws.mergeCells(r, 1, r, COLS);
    setVal(ws, r, 1, '  Nothing due in the next two weeks.', { color: C.textMuted, bold: true });
    r++;
  } else {
    colHdr(ws, r, ['#', 'Task Title', 'Phase', 'Assignee', 'Status', 'Priority', 'Due Date', 'Due In']);
    r++;
    upcoming.forEach((task, i) => {
      const days = Math.ceil((new Date(task.dueDate).getTime() - now) / 86400000);
      const urgent = days <= 2;
      const bg = urgent ? C.highBg : i % 2 === 0 ? C.white : C.rowAlt;
      ws.getRow(r).height = 19;
      setVal(ws, r, 1, i + 1, { align: 'center', bg });
      setVal(ws, r, 2, task.title, { bg, bold: urgent });
      setVal(ws, r, 3, (phaseMap.get(String(task.phaseId)) as string) || '—', { bg, align: 'center' });
      setVal(ws, r, 4, userMap.get(String(task.assigneeId)) || '—', { bg, align: 'center' });
      setVal(ws, r, 5, statusLabel(task.status), { bg, align: 'center' });
      setVal(ws, r, 6, (task.priority || 'low').toUpperCase(), { bg, align: 'center', bold: task.priority === 'critical' || task.priority === 'high' });
      setVal(ws, r, 7, fmt(task.dueDate), { bg, align: 'center' });
      setVal(ws, r, 8, days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days} days`, { bg, align: 'center', color: urgent ? C.high : C.textMuted, bold: urgent });
      applyBorder(ws, r, 1, COLS);
      r++;
    });
  }
}

/* ════════════════════════════════════════════════════════════════════════════
   ROUTE HANDLER
════════════════════════════════════════════════════════════════════════════ */
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!isLead(user.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }
    // 4-sheet xlsx generation hits Task.find + User.find({}) every call.
    // Cap at 6/min/user so a single lead can't keep the worker pegged.
    if (!rateLimit(`export:${user.sub}`, 6, 60_000)) {
      return NextResponse.json(
        { error: 'Too many exports in a short time. Wait a minute and try again.' },
        { status: 429 },
      );
    }
    await connectDB();

    // Scope to what this lead/admin can actually see — personal projects are
    // owner-only and must be unreachable through export, exactly like a 404.
    const scope = await getLeadScope(user.sub, user.role);
    const project = await Project.findOne({ _id: params.id, ...projectsVisibleFilter(scope) }).lean();
    if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const [tasks, users] = await Promise.all([
      Task.find({ projectId: project._id }).sort({ createdAt: 1 }).lean(),
      User.find({}, 'name _id').lean(),
    ]);

    const phaseMap = new Map<string, string>(
      ((project as any).phases || []).map((p: any) => [String(p._id), p.name])
    );

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Pragati — Project Intelligence Platform';
    wb.lastModifiedBy = 'Pragati Export';
    wb.created = new Date();
    wb.modified = new Date();
    wb.properties.date1904 = false;

    buildSummarySheet(wb, project, tasks as any[], phaseMap);
    buildTasksSheet(wb, project, tasks as any[], users as any[]);
    buildTeamScheduleSheet(wb, project, tasks as any[], users as any[]);
    buildBottleneckSheet(wb, project, tasks as any[], users as any[]);

    const buf = await wb.xlsx.writeBuffer();
    const filename = `Pragati_${(project as any).code || 'Project'}_${new Date().toISOString().slice(0, 10)}.xlsx`;

    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': buf.byteLength.toString(),
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
