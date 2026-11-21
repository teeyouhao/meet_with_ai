import {
  checkWebGPUSupport,
  checkGPUMemory,
  summarizeWithWebLLM,
  releaseWebLLMEngine,
  type SummaryData
} from './webllm';
import { supabase } from './supabase';
import { getStoredUser } from './auth';
import { getGroqApiKey } from './transcription';

export interface SummarizeOptions {
  transcript: string;
  title?: string;
  audioBlob?: Blob;
  audioDurationSeconds?: number;
  /** Called throughout the pipeline with human-readable status strings */
  onProgress?: (progressText: string, percent?: number) => void;
  /** Called with each streaming token from WebLLM (local fallback only) */
  onStreamToken?: (token: string, accumulated: string) => void;
}

export interface SummarizeResult {
  summary: SummaryData;
  /** cloud = Groq / OpenRouter succeeded; local = fell back to WebGPU; heuristic = offline fallback */
  tierUsed: 'cloud' | 'local-webgpu' | 'heuristic';
  audioUrl?: string;
  provider?: string;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '')).replace(/\/$/, '');
const MAX_SERVER_RETRIES = 2;

/** HTTP status codes that indicate quota/rate-limit exhaustion on the cloud side */
const QUOTA_STATUSES = new Set([429, 503]);

// ── Upload audio to Supabase Storage (non-blocking) ──────────────────────────

async function uploadAudio(blob: Blob, title: string): Promise<string | undefined> {
  try {
    const user = getStoredUser();
    const uid = user?.id ?? 'anon';
    const ts = Date.now();
    const ext = blob.type.includes('webm') ? 'webm' : 'mp4';
    const filename = `${uid}/${ts}-${title.replace(/\s+/g, '-').toLowerCase().slice(0, 40)}.${ext}`;

    const { error } = await supabase.storage
      .from('meeting-recordings')
      .upload(filename, blob, { contentType: blob.type, upsert: false });

    if (error) { console.warn('[Audio Upload] Storage error:', error.message); return undefined; }

    const { data: urlData } = supabase.storage.from('meeting-recordings').getPublicUrl(filename);
    return urlData?.publicUrl;
  } catch (err) {
    console.warn('[Audio Upload] Unexpected error:', err);
    return undefined;
  }
}

// ── Language Detection Helper ───────────────────────────────────────────────

export function isChineseTranscript(text: string): boolean {
  if (!text) return false;
  const hanChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const latinChars = (text.match(/[a-zA-Z]/g) || []).length;
  if (hanChars === 0) return false;
  if (latinChars === 0) return hanChars >= 5;
  return hanChars / (hanChars + latinChars) >= 0.35 && hanChars >= 8;
}

// ── Strict Prompt Builder ───────────────────────────────────────────────────

export function optimizeTranscriptForLlm(transcript: string, maxChars = 20000): string {
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

function buildExecutivePrompt(rawTranscript: string, title: string, maxChars = 20000): string {
  const transcript = optimizeTranscriptForLlm(rawTranscript, maxChars);
  const isZh = isChineseTranscript(transcript);

  const languageDirective = isZh
    ? `MANDATORY LANGUAGE RULE:
The meeting transcript is in CHINESE (中文).
You MUST generate ALL fields of the summary strictly in fluent, natural Simplified Chinese (简体中文):
- "overview": 必须使用中文撰写清晰凝练的高管核心概览（2-4句话，概括会议主题、核心背景和最终成果）。
- "key_points": 每一个要点必须使用中文撰写。
- "decisions": 每一项达成的决议必须使用中文撰写（若无明确决议则保持空数组 []）。
- "action_items": 任务内容 ("task") 和负责人 ("assignee"，如未明确指派则填 "未指定") 必须使用中文撰写。
Do NOT translate into English. Preserve any original English technical acronyms or specific names (e.g. AI, API, Supabase) as-is.`
    : `MANDATORY LANGUAGE RULE:
The meeting transcript is in ENGLISH.
You MUST generate ALL fields of the summary strictly in English.`;

  return `You are a world-class executive meeting intelligence analyst.
Analyze the following meeting transcript and produce a structured, high-value, and 100% ACCURATE executive summary.

${languageDirective}

STRICT ACCURACY & LOGIC RULES:
1. Executive Overview: Synthesize a cohesive 2-4 sentence summary of the session's core purpose, context, and key takeaway.
2. Key Discussion Points: Provide clear, coherent bullet points of the substantive topics discussed. Do NOT output raw transcript fragments or sentence splices.
3. Decisions Concluded: Output ONLY decisions that were explicitly agreed upon, resolved, or approved. IF NO EXPLICIT DECISIONS WERE CONCLUDED, RETURN AN EMPTY ARRAY []. NEVER fabricate generic decisions.
4. Assigned Action Items & Deliverables: Extract real tasks and accurately identify the responsible person, speaker, team, or group:
- STEREO SPEAKER TAG ATTRIBUTION:
  * If the transcript includes "[Host / You]" or "[You]" (the local user): when they commit to a deliverable or task (e.g. "I will submit the assignment"), assign it to "You" (or user name).
  * If the transcript includes "[Attendee / Remote]" or specific speaker names (e.g. "[Dr. Sue]"): attribute tasks committed by or assigned by the remote speaker accordingly.
- STRICT LOGIC: DISTINGUISH ASSIGNER VS. ASSIGNEE:
  * When an instructor, manager, or client assigns a deliverable to a cohort or group (e.g. "All students must create and submit an infographic poster by 21 October"), the assignee is the recipient team/group (e.g. "All students"), NOT the instructor.
  * When a specific person commits to their own task (e.g. "I will upload the detailed assignment instructions and sample infographic to Spectrum"), the assignee is that specific speaker (e.g. "Dr. Sue").
  * The assignee must be an actual entity, group, or person (e.g. "All students", "Dr. Sue", "Design Team", "Alex", "You"), NOT filler words like "The" or "Meanwhile". If no assignee is mentioned, use ${isZh ? '"未指定"' : '"Unassigned"'}. If no action items exist in the transcript, return an empty array [].

Respond ONLY with a valid JSON object matching this schema:
{
  "overview": "${isZh ? '凝练的高管核心概览 (2-4句话)' : 'Concise executive overview'}",
  "key_points": [${isZh ? '"实质性讨论要点1", "实质性讨论要点2"' : '"Substantive discussion point 1", "Substantive discussion point 2"'}],
  "decisions": [${isZh ? '"已达成一致的决议项 (若无则返回空数组 [])"' : '"Specific decision concluded (or leave array empty [] if none)"'}],
  "action_items": [
    {
      "task": "${isZh ? '明确可执行的任务交付物' : 'Concrete actionable deliverable'}",
      "assignee": "${isZh ? '实际负责的个人或团队 (若未提及填 未指定)' : "Responsible person or organization (or 'Unassigned')"}",
      "due_date": "${isZh ? '截止日期或时间' : 'Target timeframe if mentioned'}"
    }
  ]
}

Meeting Title: "${title}"
Transcript:
"""
${transcript.slice(0, 100_000)}
"""`;
}

// ── Robust JSON Parser from LLM Output ──────────────────────────────────────

function parseJsonFromLlm(text: string): Record<string, any> {
  const clean = text
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      const extracted = clean.substring(firstBrace, lastBrace + 1);
      return JSON.parse(extracted);
    }
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('Failed to parse valid JSON from AI response: ' + clean.slice(0, 160));
  }
}

// ── Robust Summary Data Normalizer ──────────────────────────────────────────

function validateSummaryData(parsed: Record<string, any>, isZh: boolean = false): SummaryData {
  const defaultAssignee = isZh ? '未指定' : 'Unassigned';

  // 1. Overview
  const overview = typeof parsed.overview === 'string' && parsed.overview.trim().length > 0
    ? parsed.overview.trim()
    : (isZh ? '已完成会议记录并提炼核心纪要。' : 'Summary synthesized from meeting transcript.');

  // 2. Key Points
  let key_points: string[] = [];
  if (Array.isArray(parsed.key_points)) {
    key_points = parsed.key_points
      .map((k: unknown) => (typeof k === 'string' ? k.trim() : ''))
      .filter(Boolean);
  } else if (typeof parsed.key_points === 'string') {
    key_points = parsed.key_points
      .split('\n')
      .map((s: string) => s.replace(/^[-*•\d.]\s*/, '').trim())
      .filter(Boolean);
  }

  // 3. Decisions
  let decisions: string[] = [];
  if (Array.isArray(parsed.decisions)) {
    decisions = parsed.decisions
      .map((d: unknown) => (typeof d === 'string' ? d.trim() : ''))
      .filter(Boolean);
  } else if (typeof parsed.decisions === 'string') {
    decisions = parsed.decisions
      .split('\n')
      .map((s: string) => s.replace(/^[-*•\d.]\s*/, '').trim())
      .filter(Boolean);
  }

  // 4. Action Items (Handles strings, tasks, descriptions, person, owner, deadlines)
  const action_items: Array<{ task: string; assignee: string; due_date?: string }> = [];
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

  return {
    overview,
    key_points,
    decisions,
    action_items
  };
}

// ── Groq Direct Call (openai/gpt-oss-120b, qwen/qwen3.8-27b, openai/gpt-oss-20b) ───

async function callGroqSummarize(
  apiKey: string,
  transcript: string,
  title: string
): Promise<{ summary: SummaryData; modelUsed: string }> {
  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  let maxChars = 20000;
  let lastError = '';

  for (const model of models) {
    const prompt = buildExecutivePrompt(transcript, title, maxChars);
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
              content: 'You are an elite executive intelligence analyst. You output ONLY valid JSON matching the exact schema requested. Never fabricate decisions.'
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
        console.warn(`[Groq] Model ${model} returned error:`, lastError);
        if (res.status === 413 || res.status === 429) {
          maxChars = Math.max(8000, Math.floor(maxChars * 0.65));
        }
        continue;
      }

      const data = await res.json();
      const rawContent: string | undefined = data.choices?.[0]?.message?.content?.trim();
      if (!rawContent) {
        lastError = `Empty response from Groq model ${model}`;
        continue;
      }

      const isZh = isChineseTranscript(transcript);
      const parsed = parseJsonFromLlm(rawContent);
      return {
        summary: validateSummaryData(parsed, isZh),
        modelUsed: model
      };
    } catch (err) {
      clearTimeout(timeoutId);
      lastError = err instanceof Error ? err.message : String(err);
      console.warn(`[Groq] Model ${model} failed:`, lastError);
    }
  }

  throw new Error(`Groq AI summarization failed: ${lastError}`);
}

// ── Secondary Cloud: Express Server Fallback ─────────────────────────────────

interface CloudResult {
  summary: SummaryData;
  provider: string;
  hitQuota: boolean;
}

async function callCloudSummarize(
  transcript: string,
  title: string,
  attempt = 0
): Promise<CloudResult> {
  const res = await fetch(`${API_BASE}/api/summarize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ transcript, title })
  });

  if (QUOTA_STATUSES.has(res.status)) {
    return { summary: {} as SummaryData, provider: '', hitQuota: true };
  }

  if (!res.ok) {
    if (attempt < MAX_SERVER_RETRIES) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 600));
      return callCloudSummarize(transcript, title, attempt + 1);
    }
    throw new Error(`Cloud summarization failed (HTTP ${res.status})`);
  }

  const data = await res.json();
  if (data.provider === 'heuristic-fallback') {
    return { summary: data.summary, provider: 'heuristic-fallback', hitQuota: false };
  }

  return { summary: data.summary, provider: data.provider ?? 'cloud', hitQuota: false };
}

// ── Local WebGPU via WebLLM ──────────────────────────────────────────────────

async function callLocalSummarize(
  transcript: string,
  title: string,
  onProgress?: (text: string, pct?: number) => void,
  onStreamToken?: (token: string, accumulated: string) => void
): Promise<SummaryData> {
  const progress = (text: string, pct?: number) => onProgress?.(text, pct);

  if (!checkWebGPUSupport()) {
    throw new Error('WebGPU not supported in this browser — cannot run local fallback.');
  }

  const hasMemory = await checkGPUMemory();
  if (!hasMemory) throw new Error('Insufficient GPU memory for local inference.');

  progress('Loading local AI model into WebGPU…', 55);

  const summary = await summarizeWithWebLLM(
    transcript,
    title,
    (report) => {
      const pct = Math.round((report.progress || 0) * 100);
      progress(`Local AI: ${report.text} (${pct}%)`, 55 + pct * 0.4);
    },
    onStreamToken
  );

  releaseWebLLMEngine();
  return summary;
}

// ── Client-side Failsafe Heuristic ───────────────────────────────────────────

function clientHeuristicSummarize(transcript: string, title?: string): SummaryData {
  // Strip markdown headers, metadata, and bullet artifacts from transcript
  const cleanedTranscript = transcript
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (/^#{1,6}\s+/i.test(line)) return false;
      if (/^generated via/i.test(line)) return false;
      if (/^-\s*#{1,6}\s+/i.test(line)) return false;
      if (/^-\s*generated via/i.test(line)) return false;
      return true;
    })
    .map((line) => line.replace(/^[-*•]\s+(\[[ xX]\]\s+)?/, '').trim())
    .join(' ');

  const isZh = isChineseTranscript(cleanedTranscript || transcript);
  const splitRegex = isZh ? /(?<=[。！？\n])\s*/ : /(?<=[.!?])\s+/;
  const sentences = (cleanedTranscript || transcript)
    .split(splitRegex)
    .map((s) => s.trim())
    .filter((s) => s.length > (isZh ? 8 : 20));

  const key_points = sentences.slice(0, 6);

  if (isZh) {
    return {
      overview: `会议“${title || '未命名会议'}”包含 ${sentences.length} 段讨论要点，已完成智能归档与分析。`,
      key_points: key_points.length > 0 ? key_points : ['记录了会议相关讨论要点。'],
      decisions: [],
      action_items: []
    };
  }

  return {
    overview: `Session "${title || 'Meeting'}" covered ${sentences.length} recorded discussion segments regarding scheduled topics.`,
    key_points: key_points.length > 0 ? key_points : ['Reviewed meeting discussion points.'],
    decisions: [],
    action_items: []
  };
}

// ── Main Entry Point ──────────────────────────────────────────────────────────

export async function summarizeMeeting(options: SummarizeOptions): Promise<SummarizeResult> {
  const {
    transcript,
    title = 'Meeting Recording',
    audioBlob,
    onProgress,
    onStreamToken
  } = options;

  const progress = (text: string, pct?: number) => onProgress?.(text, pct);

  // Clean away any deprecated Gemini keys from localStorage
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('gemini_api_key');
    } catch {
      // ignore
    }
  }

  // Upload audio in parallel (fire-and-forget)
  let audioUrlPromise: Promise<string | undefined> | undefined;
  if (audioBlob && audioBlob.size > 0) {
    audioUrlPromise = uploadAudio(audioBlob, title);
  }

  const groqApiKey = getGroqApiKey();

  // ── Tier 1: Groq AI (GPT-OSS-120B / Qwen 27B / GPT-OSS-20B - Ultra Fast) ─────
  if (groqApiKey) {
    try {
      progress('Analyzing transcript with Groq AI…', 35);
      const { summary, modelUsed } = await callGroqSummarize(groqApiKey, transcript, title);
      progress(`Executive summary generated ✓ (Groq ${modelUsed})`, 100);
      const audioUrl = await audioUrlPromise;
      return {
        summary,
        tierUsed: 'cloud',
        audioUrl,
        provider: `groq/${modelUsed}`
      };
    } catch (groqErr) {
      console.warn('[Groq AI encountered an issue, attempting backup tiers]:', groqErr);
    }
  }

  // ── Tier 1.5: Express Server (if running local backend with OpenRouter/Groq) ──
  try {
    progress('Sending transcript to cloud backend…', 55);
    const { summary, provider, hitQuota } = await callCloudSummarize(transcript, title);

    if (!hitQuota && provider !== 'heuristic-fallback') {
      progress(`Engine complete ✓ (${provider})`, 100);
      const audioUrl = await audioUrlPromise;
      return { summary, tierUsed: 'cloud', audioUrl, provider };
    }
  } catch (cloudErr: unknown) {
    console.warn('[Tier 1.5] Express backend unreachable (normal on Vercel):', cloudErr);
  }

  // ── Tier 2: Local WebGPU via WebLLM ─────────────────────────────────────────
  try {
    progress('Checking local AI engine…', 65);
    const summary = await callLocalSummarize(transcript, title, onProgress, onStreamToken);
    progress('Local processing complete ✓', 100);
    const audioUrl = await audioUrlPromise;
    return { summary, tierUsed: 'local-webgpu', audioUrl };
  } catch (localErr: unknown) {
    console.warn('[Tier 2] Local WebGPU unavailable, applying structured fallback:', localErr);
  }

  // ── Tier 3 (Failsafe): In-Browser Structured Parser ─────────────────────────
  progress('Generating structured summary…', 95);
  const fallbackSummary = clientHeuristicSummarize(transcript, title);
  progress('Summary complete ✓', 100);
  const audioUrl = await audioUrlPromise;
  return {
    summary: fallbackSummary,
    tierUsed: 'heuristic',
    audioUrl,
    provider: 'client-heuristic'
  };
}
