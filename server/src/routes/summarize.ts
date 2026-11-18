import { Router } from 'express';
import type { Request, Response } from 'express';
import { optionalAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { getAdaptiveContextForTranscript, storeMeetingMemory } from '../services/embeddingService.js';

const router = Router();

interface SummaryResult {
  overview: string;
  key_points: string[];
  decisions: string[];
  action_items: Array<{
    task: string;
    assignee: string;
    due_date?: string;
  }>;
}

const FREE_MODELS = [
  'meta-llama/llama-3.2-3b-instruct:free',
  'meta-llama/llama-3.1-8b-instruct:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-2-9b-it:free'
] as const;

const OPENROUTER_API = 'https://openrouter.ai/api/v1/chat/completions';
const SITE_URL = process.env.SITE_URL || process.env.CLIENT_URL || '';
const SITE_NAME = 'MeetWithAI';

// ── Language Detection Helper ─────────────────────────────────────────────────

function isChineseText(text: string): boolean {
  if (!text) return false;
  const hanChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  if (hanChars === 0) return false;
  if (latinChars === 0) return hanChars >= 5;
  return hanChars / (hanChars + latinChars) >= 0.35 && hanChars >= 8;
}

// ── Heuristic fallback ────────────────────────────────────────────────────────

function heuristicSummarize(transcript: string, title?: string): SummaryResult {
  const isZh = isChineseText(transcript);
  const splitRegex = isZh ? /\r?\n|[。！？]+/ : /\r?\n|[.!?]+/;
  const lines = transcript
    .split(splitRegex)
    .map((s) => s.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^#{1,6}\s+/i.test(line)) return false;
      if (/^generated via/i.test(line)) return false;
      if (/^-\s*#{1,6}\s+/i.test(line)) return false;
      if (/^-\s*generated via/i.test(line)) return false;
      return true;
    });

  const actionKeywords = isZh
    ? ['需要', '必须', '负责', '跟进', '安排', '待办', '计划', '完成', '提交', '对接']
    : ['will', 'need to', 'must', 'action', 'todo', 'follow up', 'assign', 'by tomorrow', 'by friday', 'schedule', 'review', 'please'];

  const decisionKeywords = isZh
    ? ['决定', '同意', '通过', '确认', '定下', '决议', '批准', '确定']
    : ['decided', 'agreed', 'decision', 'concluded', 'approved', 'chosen', 'finalized', 'resolved'];

  const action_items: SummaryResult['action_items'] = [];
  const decisions: string[] = [];
  const key_points: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (decisionKeywords.some((k) => lower.includes(k))) {
      if (decisions.length < 8) decisions.push(line);
    } else if (actionKeywords.some((k) => lower.includes(k))) {
      if (action_items.length < 10) {
        const assigneeMatch = isZh ? null : line.match(/\b([A-Z][a-z]{2,})\b/);
        action_items.push({
          task: line,
          assignee: assigneeMatch ? assigneeMatch[1] : (isZh ? '团队成员' : 'Unassigned'),
          due_date: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().split('T')[0]
        });
      }
    } else if (key_points.length < 6 && line.length > (isZh ? 10 : 25)) {
      key_points.push(line);
    }
  }

  if (isZh) {
    return {
      overview: `会议“${title || '会议纪要'}”包含 ${lines.length} 段讨论要点，已智能归纳重点事项与行动项。`,
      key_points: key_points.length > 0 ? key_points : ['回顾了项目路线图与关键里程碑。'],
      decisions: decisions.length > 0 ? decisions : ['同意按既定计划推进交付。'],
      action_items:
        action_items.length > 0
          ? action_items
          : [
              {
                task: '跟进落实本次会议确定的事项',
                assignee: '负责人',
                due_date: new Date().toISOString().split('T')[0]
              }
            ]
    };
  }

  return {
    overview: `Meeting "${title || 'Session'}" covered ${lines.length} discussion segments. Key priorities and action items were identified and recorded for the team.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed project roadmap and upcoming milestones.'],
    decisions: decisions.length > 0 ? decisions : ['Agreed to proceed with scheduled deliverables.'],
    action_items:
      action_items.length > 0
        ? action_items
        : [
            {
              task: 'Follow up on meeting deliverables',
              assignee: 'Team Lead',
              due_date: new Date().toISOString().split('T')[0]
            }
          ]
  };
}

// ── Build prompt ──────────────────────────────────────────────────────────────

function optimizeTranscriptForLlm(transcript: string, maxChars = 20000): string {
  if (!transcript || transcript.length <= maxChars) {
    return transcript;
  }
  // Smart windowing: Header/Agenda (35%), Core Discussion (20%), Final Decisions & Actions (45%)
  const headLen = Math.floor(maxChars * 0.35);
  const midLen = Math.floor(maxChars * 0.20);
  const tailLen = Math.floor(maxChars * 0.45);

  const head = transcript.slice(0, headLen);
  const midStart = Math.floor((transcript.length - midLen) / 2);
  const mid = transcript.slice(midStart, midStart + midLen);
  const tail = transcript.slice(transcript.length - tailLen);

  return `${head}\n\n[... middle discussion section summarized ...]\n\n${mid}\n\n[... discussion continues ...]\n\n${tail}`;
}

function buildPrompt(rawTranscript: string, title: string, maxChars = 20000, adaptiveContext = ''): string {
  const transcript = optimizeTranscriptForLlm(rawTranscript, maxChars);
  const isZh = isChineseText(transcript);
  const langRule = isZh
    ? `CRITICAL LANGUAGE REQUIREMENT:
The transcript is in CHINESE (中文).
You MUST write all output fields ("overview", "key_points", "decisions", "action_items.task", "action_items.assignee") strictly in fluent, natural Simplified Chinese (简体中文). Do NOT translate into English.`
    : `CRITICAL LANGUAGE REQUIREMENT:
The transcript is in ENGLISH.
You MUST write all output fields strictly in English.`;

  const memorySection = adaptiveContext ? `${adaptiveContext}\n` : '';

  return `You are an expert executive meeting assistant.
Analyze the following meeting transcript and produce a structured, high-value executive summary.

${langRule}
${memorySection}
Respond ONLY with a valid JSON object matching this schema exactly:
{
  "overview": "${isZh ? '凝练的高管核心概览 (2-4句话)' : 'Concise executive overview (2-4 clear sentences highlighting the main purpose, tone, and final conclusion)'}",
  "key_points": [${isZh ? '"讨论要点1", "讨论要点2"' : '"Key discussion point 1", "Key discussion point 2"'}],
  "decisions": [${isZh ? '"已达成一致的决议项 (若无则返回空数组 [])"' : '"Final decision or agreement 1", "Final decision 2"'}],
  "action_items": [
    {
      "task": "${isZh ? '具体可执行的任务描述' : 'Concrete actionable task description'}",
      "assignee": "${isZh ? '实际负责的个人或团队' : 'Person, role, or team responsible'}",
      "due_date": "${isZh ? '目标时间' : 'Target date or timeframe if mentioned, otherwise leave as Ongoing or Soon'}"
    }
  ]
}

Meeting Title: "${title}"
Transcript:
"""
${transcript}
"""`;
}

// ── Normalize summary response ────────────────────────────────────────────────

function normalizeSummary(parsed: Record<string, any>, isZh: boolean = false): SummaryResult {
  const defaultAssignee = isZh ? '未指定' : 'Unassigned';

  const overview = typeof parsed.overview === 'string' && parsed.overview.trim().length > 0
    ? parsed.overview.trim()
    : (isZh ? '已完成会议记录并提炼核心纪要。' : 'Summary synthesized from meeting transcript.');

  let key_points: string[] = [];
  if (Array.isArray(parsed.key_points)) {
    key_points = parsed.key_points
      .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
      .filter(Boolean);
  } else if (typeof parsed.key_points === 'string') {
    key_points = parsed.key_points.split('\n').map((s: string) => s.replace(/^[-*•\d.]\s*/, '').trim()).filter(Boolean);
  }

  let decisions: string[] = [];
  if (Array.isArray(parsed.decisions)) {
    decisions = parsed.decisions
      .map((d: unknown) => (typeof d === 'string' ? d.trim() : ''))
      .filter(Boolean);
  } else if (typeof parsed.decisions === 'string') {
    decisions = parsed.decisions.split('\n').map((s: string) => s.replace(/^[-*•\d.]\s*/, '').trim()).filter(Boolean);
  }

  const action_items: SummaryResult['action_items'] = [];
  if (Array.isArray(parsed.action_items)) {
    for (const item of parsed.action_items) {
      if (!item) continue;
      if (typeof item === 'string') {
        const trimmed = item.replace(/^[-*•\d.]\s*/, '').trim();
        if (trimmed) {
          action_items.push({
            task: trimmed,
            assignee: defaultAssignee
          });
        }
        continue;
      }
      if (typeof item === 'object') {
        const rawTask = (item.task || item.description || item.action || item.item || item.deliverable || item.todo || '').toString().trim();
        if (!rawTask) continue;

        let rawAssignee = (item.assignee || item.owner || item.person || item.assigned_to || item.who || '').toString().trim();
        if (!rawAssignee || /^(the|meanwhile|then|and|also|a|an|in|on|at|by|for|with)$/i.test(rawAssignee)) {
          rawAssignee = defaultAssignee;
        }

        const rawDueDate = (item.due_date || item.due || item.deadline || item.target_date || item.target || '').toString().trim();
        action_items.push({
          task: rawTask,
          assignee: rawAssignee,
          due_date: rawDueDate || undefined
        });
      }
    }
  }

  return { overview, key_points, decisions, action_items };
}

// ── Parse JSON safely ─────────────────────────────────────────────────────────

function parseLlmJson(rawText: string): Record<string, any> {
  const clean = rawText
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(clean.substring(firstBrace, lastBrace + 1));
    }
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('No valid JSON found in response');
  }
}

// ── Call Groq AI ──────────────────────────────────────────────────────────────

async function callGroq(
  apiKey: string,
  transcript: string,
  title: string,
  adaptiveContext = ''
): Promise<{ summary: SummaryResult; modelUsed: string }> {
  const GROQ_MODELS = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  let maxChars = 20000;
  let lastError = '';

  for (const model of GROQ_MODELS) {
    const prompt = buildPrompt(transcript, title, maxChars, adaptiveContext);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 35000);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an elite executive intelligence analyst. You output ONLY valid JSON matching the exact schema requested.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1
        })
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        lastError = `Groq ${model} HTTP ${res.status}: ${errText}`;
        console.warn(`[Groq] ${model} returned error:`, lastError);
        if (res.status === 413 || res.status === 429) {
          maxChars = Math.max(8000, Math.floor(maxChars * 0.65));
        }
        continue;
      }

      const data = (await res.json()) as any;
      const content: string = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseLlmJson(content);
      const isZh = isChineseText(transcript);
      return { summary: normalizeSummary(parsed, isZh), modelUsed: model };
    } catch (err: any) {
      clearTimeout(timeoutId);
      lastError = err.message;
      console.warn(`[Groq] Model ${model} failed:`, err.message);
    }
  }

  throw new Error(`All Groq models failed: ${lastError}`);
}

// ── Call OpenRouter ───────────────────────────────────────────────────────────

async function callOpenRouter(
  apiKey: string,
  transcript: string,
  title: string,
  adaptiveContext = ''
): Promise<{ summary: SummaryResult; modelUsed: string }> {
  const prompt = buildPrompt(transcript, title, 20000, adaptiveContext);
  const isZh = isChineseText(transcript);

  for (const model of FREE_MODELS) {
    try {
      const res = await fetch(OPENROUTER_API, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': SITE_URL,
          'X-Title': SITE_NAME
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: 'system',
              content: 'You are an executive assistant. Respond ONLY with valid JSON. Never output markdown code blocks or prose outside the JSON object.'
            },
            {
              role: 'user',
              content: prompt
            }
          ],
          temperature: 0.2
        })
      });

      if (!res.ok) continue;

      const data = (await res.json()) as any;
      const content: string = data.choices?.[0]?.message?.content ?? '';
      const parsed = parseLlmJson(content);
      return { summary: normalizeSummary(parsed, isZh), modelUsed: model };
    } catch {
      // try next
    }
  }

  throw new Error('All OpenRouter free models failed or returned invalid JSON.');
}

// ── Route handler ─────────────────────────────────────────────────────────────

router.post('/', optionalAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { transcript, title, meetingId } = req.body as { transcript?: string; title?: string; meetingId?: string };

  if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
    return res.status(400).json({ error: 'A non-empty transcript string is required.' });
  }

  const meetingTitle = (title ?? 'Meeting').slice(0, 200);
  const groqApiKey = process.env.GROQ_API_KEY || '';
  const openRouterApiKey = process.env.OPENROUTER_API_KEY || '';
  const userId = req.user?.id || null;

  // Retrieve adaptive semantic context from past meetings
  let adaptiveContext = '';
  try {
    adaptiveContext = await getAdaptiveContextForTranscript(transcript, userId);
    if (adaptiveContext) {
      console.log(`[Summarize] Injected adaptive historical context (${adaptiveContext.length} chars)`);
    }
  } catch (err) {
    console.warn('[Summarize] Failed to query adaptive context:', err);
  }

  let finalSummary: SummaryResult | null = null;
  let finalProvider = '';

  // 1. Primary: Groq AI (Ultra fast, verified high-capacity)
  if (groqApiKey) {
    try {
      const { summary, modelUsed } = await callGroq(groqApiKey, transcript, meetingTitle, adaptiveContext);
      finalSummary = summary;
      finalProvider = `groq/${modelUsed}`;
    } catch (err: any) {
      console.warn('[Summarize] Groq AI encountered an error, trying secondary:', err.message);
    }
  }

  // 2. Secondary: OpenRouter
  if (!finalSummary && openRouterApiKey) {
    try {
      const { summary, modelUsed } = await callOpenRouter(openRouterApiKey, transcript, meetingTitle, adaptiveContext);
      finalSummary = summary;
      finalProvider = `openrouter/${modelUsed}`;
    } catch (err: any) {
      console.warn('[Summarize] OpenRouter failed, falling back to heuristic:', err.message);
    }
  }

  // 3. Graceful offline heuristic fallback
  if (!finalSummary) {
    console.info('[Summarize] Using heuristic fallback.');
    finalSummary = heuristicSummarize(transcript, meetingTitle);
    finalProvider = 'heuristic-fallback';
  }

  // Asynchronously index newly created meeting into vector memory if meetingId exists
  if (meetingId && finalSummary) {
    storeMeetingMemory(meetingId, userId, {
      title: meetingTitle,
      summary: finalSummary,
      transcript
    }).catch(e => console.warn('[Summarize] Async memory indexing error:', e));
  }

  return res.json({ provider: finalProvider, summary: finalSummary });
});

export default router;
