import cron from 'node-cron';
import { EventEmitter } from 'events';
import { supabaseAdmin } from '../utils/supabase.js';

export interface DeadlineAlert {
  id: string;
  action_item_id: string;
  meeting_id?: string;
  meeting_title?: string;
  task: string;
  assignee: string;
  due_date: string;
  hours_remaining: number;
  level: 'upcoming' | 'urgent' | 'overdue';
  user_id?: string | null;
  detected_at: string;
}

export const deadlineEvents = new EventEmitter();

// In-memory active alert store (synchronized across cron ticks)
let activeAlerts: DeadlineAlert[] = [];
let isWorkerRunning = false;

/**
 * Evaluates all pending action items against the current time.
 * Identifies overdue items and items due within the next 24 hours.
 */
export async function evaluateDeadlines(): Promise<DeadlineAlert[]> {
  try {
    const { data: items, error } = await supabaseAdmin
      .from('action_items')
      .select('id, meeting_id, user_id, task, assignee, due_date, status')
      .neq('status', 'completed')
      .not('due_date', 'is', null);

    if (error || !items) {
      console.warn('[DeadlineWorker] Could not query action_items:', error?.message);
      return activeAlerts;
    }

    // Optionally fetch meeting titles
    const { data: meetings } = await supabaseAdmin
      .from('meetings')
      .select('id, title');
    const meetingTitleMap = new Map<string, string>();
    meetings?.forEach(m => meetingTitleMap.set(m.id, m.title));

    const now = Date.now();
    const alerts: DeadlineAlert[] = [];

    for (const item of items) {
      if (!item.due_date) continue;
      const dueTime = new Date(item.due_date).getTime();
      if (isNaN(dueTime)) continue;

      const diffMs = dueTime - now;
      const diffHours = Math.round(diffMs / (1000 * 60 * 60));

      // Overdue
      if (diffMs < 0) {
        alerts.push({
          id: `alert-overdue-${item.id}`,
          action_item_id: item.id,
          meeting_id: item.meeting_id,
          meeting_title: meetingTitleMap.get(item.meeting_id) || 'General Action Item',
          task: item.task,
          assignee: item.assignee || 'Unassigned',
          due_date: item.due_date,
          hours_remaining: diffHours,
          level: 'overdue',
          user_id: item.user_id,
          detected_at: new Date().toISOString()
        });
      }
      // Urgent (due within 24 hours)
      else if (diffHours <= 24) {
        alerts.push({
          id: `alert-urgent-${item.id}`,
          action_item_id: item.id,
          meeting_id: item.meeting_id,
          meeting_title: meetingTitleMap.get(item.meeting_id) || 'General Action Item',
          task: item.task,
          assignee: item.assignee || 'Unassigned',
          due_date: item.due_date,
          hours_remaining: diffHours,
          level: diffHours <= 6 ? 'urgent' : 'upcoming',
          user_id: item.user_id,
          detected_at: new Date().toISOString()
        });
      }
    }

    activeAlerts = alerts;
    deadlineEvents.emit('alerts:updated', activeAlerts);

    if (alerts.length > 0) {
      console.log(`[DeadlineWorker] Detected ${alerts.length} action item deadline alert(s).`);
    }

    return activeAlerts;
  } catch (err) {
    console.error('[DeadlineWorker] Error during deadline evaluation:', err);
    return activeAlerts;
  }
}

/** Get active alerts filtered by user */
export function getActiveAlerts(userId?: string | null): DeadlineAlert[] {
  if (!userId) return activeAlerts;
  return activeAlerts.filter(a => !a.user_id || a.user_id === userId);
}

/**
 * Initializes autonomous background schedule:
 * Runs once at startup, and repeats every 30 minutes.
 */
export function startDeadlineWorker(): void {
  if (isWorkerRunning) return;
  isWorkerRunning = true;

  console.log('[DeadlineWorker] Initialized autonomous event-driven deadline scheduler.');

  // Immediate initial check
  evaluateDeadlines().catch(e => console.error('[DeadlineWorker] Startup check error:', e));

  // Run every 30 minutes
  cron.schedule('*/30 * * * *', () => {
    console.log('[DeadlineWorker] Periodic deadline evaluation tick...');
    evaluateDeadlines().catch(e => console.error('[DeadlineWorker] Cron evaluation error:', e));
  });

  // Reactive listener for action item mutations
  deadlineEvents.on('action_item:mutated', () => {
    console.log('[DeadlineWorker] Event received: action_item mutated. Re-evaluating deadlines.');
    evaluateDeadlines().catch(e => console.error('[DeadlineWorker] Reactive evaluation error:', e));
  });
}
