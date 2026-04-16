'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/client/api';
import { Card, RISK_COLORS, PriorityTag, formatDate } from '@/components/ui';
import { AlertTriangle } from 'lucide-react';

export default function DeadlineRiskPage() {
  const [data, setData] = useState<any>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [teamId, setTeamId] = useState('');
  const [userId, setUserId] = useState('');
  const [openRow, setOpenRow] = useState<string | null>(null);

  useEffect(() => {
    api<any[]>('/teams').then(setTeams);
    api<any[]>('/users').then(setUsers);
  }, []);

  useEffect(() => {
    const p = new URLSearchParams();
    if (teamId) p.set('teamId', teamId);
    if (userId) p.set('userId', userId);
    api<any>(`/ai/risk?${p.toString()}`).then(setData);
  }, [teamId, userId]);

  const buckets = useMemo(() => {
    if (!data) return { high: [], medium: [], low: [] };
    const b = { high: [] as any[], medium: [] as any[], low: [] as any[] };
    for (const t of data.tasks) b[t.label as 'high' | 'medium' | 'low'].push(t);
    return b;
  }, [data]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <AlertTriangle className="text-brand-600" size={24} />
          Deadline Risk (ML)
        </h1>
        <p className="text-sm text-slate-500">
          A logistic-style model learned from your historical completions predicts, for each open
          task, how likely it is to miss its deadline — with the feature contributions so you can
          act on the prediction, not just trust it.
        </p>
      </div>

      <Card>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="label">Filter by team</label>
            <select className="select" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">All teams</option>
              {teams.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Filter by assignee</label>
            <select className="select" value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Anyone</option>
              {users.map((u: any) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          {data?.model && (
            <div className="md:col-span-2 text-xs text-slate-500">
              Model trained on {data.model.trainedOn} historical completions · org base
              miss-rate {Math.round(data.model.baseRate * 100)}%
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {(['high', 'medium', 'low'] as const).map((key) => (
          <Card
            key={key}
            title={
              <span className="flex items-center gap-2">
                <span className={`tag ${RISK_COLORS[key]}`}>{key} risk</span>
                <span className="text-xs text-slate-500 font-normal">
                  ({buckets[key].length})
                </span>
              </span>
            }
          >
            {buckets[key].length === 0 ? (
              <div className="text-xs text-slate-500">Nothing here — good news.</div>
            ) : (
              <div className="space-y-2">
                {buckets[key].slice(0, 20).map((t: any) => (
                  <div
                    key={t.taskId}
                    className="border border-slate-200 rounded-md p-2 text-sm hover:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/tasks/${t.taskId}`}
                        className="font-medium text-brand-700 hover:underline line-clamp-1"
                      >
                        {t.title}
                      </Link>
                      <span className={`tag ${RISK_COLORS[t.label as 'high' | 'medium' | 'low']}`}>
                        {Math.round(t.probability * 100)}%
                      </span>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap gap-2 mt-1">
                      {t.projectCode && (
                        <Link
                          href={`/projects/${t.projectId}`}
                          className="font-mono hover:underline"
                        >
                          {t.projectCode}
                        </Link>
                      )}
                      <span>·</span>
                      <span>{t.assigneeName || 'Unassigned'}</span>
                      {t.dueDate && (
                        <>
                          <span>·</span>
                          <span>due {formatDate(t.dueDate)}</span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 italic">
                      {t.recommendation}
                    </div>
                    <button
                      onClick={() =>
                        setOpenRow(openRow === t.taskId ? null : t.taskId)
                      }
                      className="text-[11px] text-brand-700 hover:underline mt-1"
                    >
                      {openRow === t.taskId ? 'Hide features' : 'Why this score?'}
                    </button>
                    {openRow === t.taskId && (
                      <div className="mt-2 bg-slate-50 rounded p-2 text-[11px] space-y-1">
                        {t.features.map((f: any, i: number) => (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="text-slate-700">{f.explanation}</span>
                            <span
                              className={`font-mono ${
                                f.contribution > 0
                                  ? 'text-red-600'
                                  : f.contribution < 0
                                    ? 'text-emerald-600'
                                    : 'text-slate-500'
                              }`}
                            >
                              {f.contribution >= 0 ? '+' : ''}
                              {f.contribution.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        ))}
      </div>

      {data?.tasks?.length === 0 && (
        <Card>
          <div className="text-sm text-slate-500">
            No open tasks to score.
          </div>
        </Card>
      )}
    </div>
  );
}
