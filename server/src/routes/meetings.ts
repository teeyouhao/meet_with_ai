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
 * GET /api/meetings/action-items
 * Returns all action items for current user
 */
router.get('/action-items', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    let query = supabaseAdmin
      .from('action_items')
      .select('*')
      .order('created_at', { ascending: false });

    if (userId) {
      query = query.or(`user_id.eq.${userId},user_id.is.null`);
    }

    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    return res.json({ actionItems: data || [] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/meetings/:id/title
 * Updates meeting title
 */
router.patch('/:id/title', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string') {
      return res.status(400).json({ error: 'Title string is required' });
    }

    const { error } = await supabaseAdmin
      .from('meetings')
      .update({ title: title.trim(), updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * PATCH /api/meetings/action-items/:id
 * Updates action item status
 */
router.patch('/action-items/:id', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { status } = req.body;
    const { error } = await supabaseAdmin
      .from('action_items')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/meetings/action-items/:id
 * Deletes action item
 */
router.delete('/action-items/:id', optionalAuth, async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const { error } = await supabaseAdmin
      .from('action_items')
      .delete()
      .eq('id', _req.params.id);

    if (error) return res.status(500).json({ error: error.message });
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
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
