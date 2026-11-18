import { Router } from 'express';
import type { Response } from 'express';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getActiveAlerts, evaluateDeadlines } from '../workers/deadlineWorker.js';

const router = Router();

/**
 * GET /api/alerts
 * Returns active deadline alerts for the current user
 */
router.get('/', optionalAuth, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id || null;
  const alerts = getActiveAlerts(userId);
  return res.json({
    count: alerts.length,
    alerts
  });
});

/**
 * POST /api/alerts/check
 * Triggers immediate deadline re-evaluation
 */
router.post('/check', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const alerts = await evaluateDeadlines();
    const userId = req.user?.id || null;
    const userAlerts = getActiveAlerts(userId);
    return res.json({
      success: true,
      count: userAlerts.length,
      alerts: userAlerts
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to evaluate deadlines' });
  }
});

export default router;
