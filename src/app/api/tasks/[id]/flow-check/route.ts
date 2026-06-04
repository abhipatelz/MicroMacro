import { NextRequest, NextResponse } from 'next/server';
import mongoose from 'mongoose';
import { z } from 'zod';
import { connectDB } from '@/lib/db';
import { Task } from '@/models/Task';
import { Project } from '@/models/Project';
import { requireUser } from '@/lib/auth';
import { getTaskAccess, canActOnOwnTask } from '@/lib/taskAccess';
import { handleError, readBody } from '@/lib/http';
import { rateLimit } from '@/lib/rateLimit';
import { logOperation } from '@/lib/audit';
import { notify } from '@/lib/notify';
import { recordTaskFlowEvent } from '@/lib/flow/events';
import type { FlowEventType } from '@/lib/flow/events';

export const runtime = 'nodejs';

/**
 * POST /api/tasks/[id]/flow-check
 *
 * Bounded endpoint for the Quick-check / Needs-attention strip. Every action
 * is a small enum — there is no free-form prompt-text generation here, and
 * the optional `detail` string is bounded + sanitised before it touches the
 * task document.
 *
 * Permission model:
 *   - still_moving / waiting_* / decision_needed / help_needed / dismiss:
 *       the task's assignee (or any lead/admin who can see the task) may
 *       respond. Contributors cannot respond for someone else.
 *   - resolve:
 *       lead/admin only, OR the same user who originally confirmed the
 *       waiting state (so an IC can clear their own report once unblocked).
 *
 * Privacy:
 *   - Personal projects + private task overlays must never leak. We delegate
 *     visibility to getTaskAccess which already enforces both.
 *   - Notifications fire to project owner only when the project is shared
 *     and non-personal; private/personal tasks notify nobody.
 *   - logOperation drops personal-project entries automatically.
 */

const Body = z.object({
  action: z.enum([
    'still_moving',
    'waiting_approval',
    'waiting_another_team',
    'waiting_person',
    'waiting_other',
    'decision_needed',
    'help_needed',
    'dismiss',
    'resolve',
  ]),
  detail: z.string().trim().max(160).optional(),
});

type Action = z.infer<typeof Body>['action'];

const PENDING_TYPE_BY_ACTION: Partial<Record<Action, 'approval' | 'another_team' | 'person' | 'other' | 'decision' | 'help'>> = {
  waiting_approval:     'approval',
  waiting_another_team: 'another_team',
  waiting_person:       'person',
  waiting_other:        'other',
  decision_needed:      'decision',
  help_needed:          'help',
};

const EVENT_BY_ACTION: Record<Action, FlowEventType> = {
  still_moving:         'still_moving_confirmed',
  waiting_approval:     'waiting_confirmed',
  waiting_another_team: 'waiting_confirmed',
  waiting_person:       'waiting_confirmed',
  waiting_other:        'waiting_confirmed',
  decision_needed:      'decision_requested',
  help_needed:          'help_requested',
  dismiss:              'prompt_dismissed',
  resolve:              'waiting_cleared',
};

const NEUTRAL_SUMMARY: Record<Action, string> = {
  still_moving:         'Confirmed task is still moving',
  waiting_approval:     'Confirmed waiting on approval',
  waiting_another_team: 'Confirmed waiting on another team',
  waiting_person:       'Confirmed waiting on a person',
  waiting_other:        'Confirmed waiting',
  decision_needed:      'Requested a decision',
  help_needed:          'Requested help',
  dismiss:              'Dismissed quick check',
  resolve:              'Marked waiting item resolved',
};

const AUDIT_ACTION: Record<Action, string> = {
  still_moving:         'flow.quick_check.still_moving',
  waiting_approval:     'flow.waiting.confirmed',
  waiting_another_team: 'flow.waiting.confirmed',
  waiting_person:       'flow.waiting.confirmed',
  waiting_other:        'flow.waiting.confirmed',
  decision_needed:      'flow.decision.requested',
  help_needed:          'flow.help.requested',
  dismiss:              'flow.quick_check.dismissed',
  resolve:              'flow.waiting.resolved',
};

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { error, user } = await requireUser(req);
    if (error) return error;
    if (!mongoose.isValidObjectId(params.id)) {
      return NextResponse.json({ error: 'Invalid task id' }, { status: 400 });
    }

    // Per-user-per-task throttle: a runaway client must not be able to spray
    // confirmations. 20/minute per (user,task) is generous for a human and
    // tight enough to bound abuse.
    if (!rateLimit(`flow:${user!.sub}:${params.id}`, 20, 60_000)) {
      return NextResponse.json(
        { error: 'Too many quick-check actions. Wait a minute.' },
        { status: 429 },
      );
    }

    await connectDB();
    const body = await readBody(req, Body);
    const action = body.action;

    const access = await getTaskAccess(params.id, user!.sub, user!.role);
    if (!access.task || !access.visible) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const t = await Task.findById(params.id);
    if (!t) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Authorisation per action.
    //   - resolve  : lead/admin, OR the user who first confirmed it.
    //   - dismiss/still_moving: assignee or lead (canActOnOwnTask).
    //   - waiting/decision/help: assignee or lead (canActOnOwnTask).
    const ownsConfirmation =
      !!(t as any).flowPendingConfirmedByUserId &&
      String((t as any).flowPendingConfirmedByUserId) === String(user!.sub);
    if (action === 'resolve') {
      if (!access.isLead && !ownsConfirmation) {
        return NextResponse.json(
          { error: 'Only a lead or the original reporter can mark this resolved.' },
          { status: 403 },
        );
      }
    } else if (!canActOnOwnTask(access)) {
      return NextResponse.json(
        { error: 'You can only respond to checks on a task assigned to you.' },
        { status: 403 },
      );
    }

    const now = new Date();
    const pendingType = PENDING_TYPE_BY_ACTION[action] || null;
    // Strip ASCII control characters from the optional detail. Built from
    // \u escapes so the source file stays safely ASCII.
    const CTRL = new RegExp('[\\u0000-\\u001F\\u007F]', 'g');
    const safeDetail = (body.detail || '').replace(CTRL, '').trim().slice(0, 160);

    // Apply state changes.
    const set: Record<string, unknown> = { flowPromptLastShownAt: now };
    const inc: Record<string, number> = {};

    if (action === 'still_moving') {
      set.flowHumanConfirmedMovingAt = now;
      // 24h snooze on inferred prompts. Does NOT touch
      // lastMeaningfulActivityAt — the user's reassurance is recorded
      // separately so the baseline can't be self-attested.
      set.flowPromptSnoozedUntil     = new Date(now.getTime() + 1000 * 60 * 60 * 24);
      set.flowPromptLastReasonCodes  = ['still_moving'];
    } else if (pendingType) {
      // Confirmed waiting / decision / help. flowStateVersion increments so
      // a later resolve can be checked against the version the client saw.
      set.flowPendingType        = pendingType;
      set.flowPendingDetail      = safeDetail;
      set.flowPendingSince       = (t as any).flowPendingSince || now;
      set.flowPendingConfirmedAt = now;
      set.flowPendingConfirmedByUserId = user!.sub;
      set.flowResolvedAt         = null;
      set.flowPromptLastReasonCodes = [pendingType];
      inc.flowStateVersion = 1;
    } else if (action === 'dismiss') {
      set.flowPromptSnoozedUntil    = new Date(now.getTime() + 1000 * 60 * 60 * 6); // 6h snooze
      set.flowPromptLastReasonCodes = ['dismiss'];
    } else if (action === 'resolve') {
      set.flowPendingType        = null;
      set.flowPendingDetail      = '';
      set.flowPendingSince       = null;
      set.flowPendingConfirmedAt = null;
      set.flowPendingConfirmedByUserId = null;
      set.flowResolvedAt         = now;
      set.flowPromptLastReasonCodes = ['resolved'];
      inc.flowStateVersion = 1;
    }

    await Task.updateOne(
      { _id: params.id },
      { $set: set, ...(Object.keys(inc).length ? { $inc: inc } : {}) },
    );

    // Flow event stream — bounded metadata only.
    void recordTaskFlowEvent({
      taskId: params.id,
      projectId: String((t as any).projectId || ''),
      eventType: EVENT_BY_ACTION[action],
      actorId: user!.sub,
      stateAfter: pendingType || (action === 'resolve' ? 'resolved' : undefined),
      taskType: (t as any)?.taskType || undefined,
      metadata: { action, hasDetail: !!safeDetail },
    });

    // Privacy gates: notify + audit only for shared, non-personal tasks.
    const proj = await Project.findById((t as any).projectId).select('isPersonal code ownerId name').lean();
    const isPrivateTask  = !!(t as any).privateToUserId;
    const isPersonalProj =
      !!proj && (!!(proj as any).isPersonal || String((proj as any).code || '').startsWith('PRSN-'));

    if (!isPrivateTask && !isPersonalProj) {
      // Notify the project owner once when a NEW confirmed blocker appears.
      if (pendingType || action === 'help_needed' || action === 'decision_needed') {
        const ownerId = (proj as any)?.ownerId;
        if (ownerId && String(ownerId) !== String(user!.sub)) {
          await notify({
            userId:    String(ownerId),
            actorId:   user!.sub,
            type:      'task_waiting',
            title:     headlineForOwner(pendingType, action),
            body:      ((t as any).title || '').slice(0, 200),
            taskId:    params.id,
            projectId: String((t as any).projectId || ''),
          });
        }
      }

      await logOperation({
        action:      AUDIT_ACTION[action],
        category:    'task',
        actor:       user,
        targetType:  'task',
        targetId:    params.id,
        targetLabel: (t as any).title || '',
        summary:     NEUTRAL_SUMMARY[action],
        meta: {
          projectId: String((t as any).projectId || ''),
          pendingType,
          gxpCritical: !!(t as any).gxpCritical,
        },
      });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleError(e);
  }
}

/** Concise neutral headline shown in the bell to the project owner / lead. */
function headlineForOwner(
  pendingType: 'approval' | 'another_team' | 'person' | 'other' | 'decision' | 'help' | null,
  action: Action,
): string {
  if (action === 'help_needed')     return 'Help requested';
  if (action === 'decision_needed') return 'Decision requested';
  switch (pendingType) {
    case 'approval':     return 'Waiting on approval';
    case 'another_team': return 'Waiting on another team';
    case 'person':       return 'Waiting on a person';
    case 'other':        return 'Waiting on something';
    case 'decision':     return 'Decision requested';
    case 'help':         return 'Help requested';
    default:             return 'Needs attention';
  }
}
