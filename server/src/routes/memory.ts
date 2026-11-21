import { Router } from 'express';
import type { Response } from 'express';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import {
  searchSemanticMemory,
  storeMeetingMemory,
  generateEmbedding
} from '../services/embeddingService.js';
import { supabaseAdmin } from '../utils/supabase.js';

const router = Router();

/**
 * POST /api/memory/search
 * Search past meetings semantically using vector embeddings
 */
router.post('/search', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { query, limit, threshold } = req.body;
    if (!query || typeof query !== 'string') {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const userId = req.user?.id || null;
    const results = await searchSemanticMemory(
      query,
      userId,
      typeof limit === 'number' ? limit : 6,
      typeof threshold === 'number' ? threshold : 0.30
    );

    return res.json({
      query,
      count: results.length,
      results
    });
  } catch (err: any) {
    console.error('[Memory Search] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to search semantic memory' });
  }
});

/**
 * POST /api/memory/index-all
 * Indexes all existing meetings in the database into semantic vector memory
 */
router.post('/index-all', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { data: meetings, error } = await supabaseAdmin
      .from('meetings')
      .select('id, title, user_id, summary, transcript');

    if (error) throw error;

    let totalChunksIndexed = 0;
    let meetingsProcessed = 0;

    for (const m of meetings || []) {
      if (m.summary && (m.summary.overview || m.summary.key_points || m.summary.decisions)) {
        const count = await storeMeetingMemory(m.id, m.user_id, {
          title: m.title,
          summary: m.summary,
          transcript: m.transcript
        });
        totalChunksIndexed += count;
        meetingsProcessed++;
      }
    }

    return res.json({
      success: true,
      meetingsProcessed,
      totalChunksIndexed
    });
  } catch (err: any) {
    console.error('[Memory Index-All] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to index meetings' });
  }
});

/**
 * GET /api/memory/stats
 * Overview of memory vault
 */
router.get('/stats', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id || null;
    let q = supabaseAdmin.from('meetings').select('id, summary');
    if (userId) {
      q = q.or(`user_id.eq.${userId},user_id.is.null`);
    }
    const { data, error } = await q;
    if (error) throw error;

    let totalChunks = 0;
    let indexedMeetings = 0;

    for (const m of data || []) {
      const mems = m.summary?.semantic_memory;
      if (Array.isArray(mems) && mems.length > 0) {
        totalChunks += mems.length;
        indexedMeetings++;
      }
    }

    return res.json({
      totalMeetings: data?.length || 0,
      indexedMeetings,
      totalMemoryChunks: totalChunks
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to get memory stats' });
  }
});

/**
 * POST /api/memory/chat
 * Interactive Q&A chatbox answering questions using meeting transcript and semantic memory
 */
router.post('/chat', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { message, meetingId, history } = req.body;
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userId = req.user?.id || null;
    let context = '';
    const citations: Array<{ title: string; text: string }> = [];

    if (meetingId) {
      // Chat about a specific meeting
      const { data: meeting } = await supabaseAdmin
        .from('meetings')
        .select('title, transcript, summary')
        .eq('id', meetingId)
        .single();

      if (meeting) {
        context = `Meeting Title: "${meeting.title}"\nOverview: ${meeting.summary?.overview || ''}\nKey Points: ${(meeting.summary?.key_points || []).join('; ')}\nDecisions: ${(meeting.summary?.decisions || []).join('; ')}\nTranscript Excerpt:\n${(meeting.transcript || '').slice(0, 15000)}`;
        citations.push({ title: meeting.title, text: meeting.summary?.overview || 'Meeting Overview' });
      }
    } else {
      // Global semantic memory chat across all meetings
      const memories = await searchSemanticMemory(message, userId, 5, 0.25);
      if (memories.length > 0) {
        context = 'Relevant memories from past meetings:\n' + memories.map(m => `- [${m.metadata?.title || 'Meeting'}]: ${m.chunk_text}`).join('\n');
        memories.forEach(m => citations.push({ title: m.metadata?.title || 'Past Meeting', text: m.chunk_text }));
      }
    }

    const groqKey = req.body.groqApiKey || req.body.apiKey || process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY || '';
    const openRouterKey = process.env.OPENROUTER_API_KEY || '';

    const conversationMessages = [
      {
        role: 'system',
        content: `You are MeetWithAI Executive Assistant. You answer user questions accurately, concisely, and insightfully based on the provided meeting context and semantic memories. If the user asks in Chinese, reply in fluent Simplified Chinese. If in English, reply in English. Keep answers clear, professional, bulleted where appropriate, and cite the meeting points.\n\n${context}`
      },
      ...((Array.isArray(history) ? history : []).slice(-6)),
      { role: 'user', content: message }
    ];

    let reply = '';

    // 1. Primary: Groq AI
    if (groqKey) {
      const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
      for (const model of GROQ_MODELS) {
        try {
          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${groqKey}`
            },
            body: JSON.stringify({
              model,
              messages: conversationMessages,
              temperature: 0.3,
              max_tokens: 1024
            })
          });

          if (groqRes.ok) {
            const data = await groqRes.json();
            reply = data.choices?.[0]?.message?.content || '';
            if (reply) break;
          }
        } catch (groqErr) {
          console.warn(`[Memory Chat] Groq model ${model} failed:`, groqErr);
        }
      }
    }

    // 2. Secondary: OpenRouter Fallback
    if (!reply && openRouterKey) {
      try {
        const orRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openRouterKey}`,
            'HTTP-Referer': 'https://meetwithai.vercel.app',
            'X-Title': 'MeetWithAI'
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: conversationMessages,
            temperature: 0.3,
            max_tokens: 1024
          })
        });

        if (orRes.ok) {
          const data = await orRes.json();
          reply = data.choices?.[0]?.message?.content || '';
        }
      } catch (orErr) {
        console.warn('[Memory Chat] OpenRouter fallback failed:', orErr);
      }
    }

    if (!reply && !groqKey && !openRouterKey) {
      return res.json({
        reply: "Groq AI is ready, but GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY to your Vercel Project Environment Variables, or enter your Groq API key in Settings.",
        citations
      });
    }

    return res.json({
      reply: reply || 'I reviewed the meeting records, but could not synthesize an answer.',
      citations
    });
  } catch (err: any) {
    console.error('[Memory Chat] Error:', err);
    return res.status(500).json({ error: err.message || 'Failed to chat with AI' });
  }
});

export default router;
