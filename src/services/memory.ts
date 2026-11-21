import { getAuthToken } from './auth';

const API_BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:5000' : '')).replace(/\/$/, '');

export interface SemanticMemoryMatch {
  id?: string;
  meeting_id: string;
  chunk_text: string;
  chunk_type: 'summary' | 'key_point' | 'decision' | 'action_item' | 'topic';
  similarity: number;
  metadata?: {
    title?: string;
    assignee?: string;
    due_date?: string;
    [key: string]: any;
  };
}

export interface MemoryStats {
  totalMeetings: number;
  indexedMeetings: number;
  totalMemoryChunks: number;
}

function getHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Search past meetings semantically using deep vector embeddings */
export async function searchSemanticMemory(
  query: string,
  limit = 6,
  threshold = 0.30
): Promise<SemanticMemoryMatch[]> {
  try {
    const res = await fetch(`${API_BASE}/api/memory/search`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ query, limit, threshold })
    });

    if (!res.ok) {
      console.warn('[MemoryService] Search error:', await res.text());
      return [];
    }

    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.error('[MemoryService] Network error during semantic search:', err);
    return [];
  }
}

/** Trigger indexing of all meetings into vector memory */
export async function indexAllMeetings(): Promise<{ meetingsProcessed: number; totalChunksIndexed: number }> {
  try {
    const res = await fetch(`${API_BASE}/api/memory/index-all`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include'
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (err) {
    console.error('[MemoryService] Index-all error:', err);
    return { meetingsProcessed: 0, totalChunksIndexed: 0 };
  }
}

/** Get vector memory storage statistics */
export async function getMemoryStats(): Promise<MemoryStats> {
  try {
    const res = await fetch(`${API_BASE}/api/memory/stats`, {
      headers: getHeaders(),
      credentials: 'include'
    });
    if (!res.ok) return { totalMeetings: 0, indexedMeetings: 0, totalMemoryChunks: 0 };
    return await res.json();
  } catch {
    return { totalMeetings: 0, indexedMeetings: 0, totalMemoryChunks: 0 };
  }
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  reply: string;
  citations?: Array<{ title: string; text: string }>;
}

/** Interactive Q&A chatbox answering questions using meeting transcript or semantic memory */
export async function chatWithAi(
  message: string,
  meetingId?: string,
  history?: ChatMessage[]
): Promise<ChatResponse> {
  const clientGroqKey = (
    localStorage.getItem('groq_api_key') ||
    import.meta.env.VITE_GROQ_API_KEY ||
    ''
  ).trim();

  try {
    const res = await fetch(`${API_BASE}/api/memory/chat`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({
        message,
        meetingId,
        history,
        groqApiKey: clientGroqKey || undefined
      })
    });

    if (res.ok) {
      const data = await res.json();
      // If server responded with key missing prompt and we have a client key, fallback to direct client call
      if (
        data.reply &&
        data.reply.includes('GROQ_API_KEY is not configured on the server') &&
        clientGroqKey
      ) {
        return await callGroqClientDirect(clientGroqKey, message, history, data.citations);
      }
      return data;
    }
  } catch (err) {
    console.warn('[MemoryService] Server chat error, attempting direct client fallback:', err);
  }

  // Fallback: If server is offline or errored, and client has Groq API key
  if (clientGroqKey) {
    return await callGroqClientDirect(clientGroqKey, message, history);
  }

  return {
    reply:
      'Groq AI is ready, but GROQ_API_KEY is not configured on the server. Please add GROQ_API_KEY in your Vercel Project Settings > Environment Variables, or enter your Groq API Key in Settings.'
  };
}

/** Direct browser fallback to Groq AI if backend environment variable is absent */
async function callGroqClientDirect(
  apiKey: string,
  message: string,
  history?: ChatMessage[],
  citations?: Array<{ title: string; text: string }>
): Promise<ChatResponse> {
  const models = ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b', 'openai/gpt-oss-20b'];
  const conversationMessages = [
    {
      role: 'system',
      content:
        'You are MeetWithAI Executive Assistant. Answer user questions clearly, accurately, and insightfully. If asked in Chinese, respond in Chinese. If in English, respond in English.'
    },
    ...((Array.isArray(history) ? history : []).slice(-6)),
    { role: 'user', content: message }
  ];

  for (const model of models) {
    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages: conversationMessages,
          temperature: 0.3,
          max_tokens: 1024
        })
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.choices?.[0]?.message?.content;
        if (reply) {
          return { reply, citations };
        }
      }
    } catch (e) {
      console.warn(`[Client Groq] Model ${model} failed:`, e);
    }
  }

  return {
    reply: 'Could not connect to Groq AI. Please check your Groq API key and network connection.',
    citations
  };
}
