import { Router } from 'express';
import { supabaseAdmin } from '../utils/supabase.js';
import type { Response } from 'express';
import { optionalAuth, requireAuth, type AuthenticatedRequest } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/meetings/save
 * Persists a live-recorded meeting with transcript, summary, and action items.
 */
router.post('/save', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || null;
    const { title, duration_seconds, source, transcript, summary, action_items } = req.body;

    const { data: meeting, error: meetingError } = await supabaseAdmin
      .from('meetings')
      .insert({
        user_id: userId,
        title: title || 'Meeting Recording',
        duration_seconds: duration_seconds || 0,
        source: source || 'live',
        transcript: transcript || '',
        summary: summary || {},
        status: 'completed'
      })
      .select()
      .single();

    if (meetingError) {
      console.error('Error inserting meeting:', meetingError);
      return res.status(500).json({ error: 'Database meeting insert error' });
    }

    if (action_items && Array.isArray(action_items) && action_items.length > 0) {
      const itemsToInsert = action_items.map((item: any) => ({
        meeting_id: meeting.id,
        user_id: userId,
        task: item.task || 'Task',
        assignee: item.assignee || 'Unassigned',
        due_date: item.due_date ? new Date(item.due_date).toISOString() : null,
        status: 'pending'
      }));

      await supabaseAdmin.from('action_items').insert(itemsToInsert);
    }

    return res.status(201).json({ meeting });
  } catch (err) {
    console.error('Error in /api/meetings/save:', err);
    return res.status(500).json({ error: 'Failed to save meeting record' });
  }
});

/**
 * GET /api/meetings
 * Returns meetings for current user (or public/unassigned demo meetings)
 */
router.get('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    let query = supabaseAdmin
      .from('meetings')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      // Query meetings belonging to user or unassigned meetings
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ meetings: data || [] });
  } catch {
    return res.status(500).json({ error: 'Failed to retrieve meetings' });
  }
});

/**
 * DELETE /api/meetings/:id
 * Deletes a meeting and its associated action items.
 */
router.delete('/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    let query = supabaseAdmin
      .from('meetings')
      .delete()
      .eq('id', req.params.id);

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { error } = await query;

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch {
    return res.status(500).json({ error: 'Failed to delete meeting' });
  }
});

export default router;
