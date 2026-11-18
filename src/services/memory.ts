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
  try {
    const res = await fetch(`${API_BASE}/api/memory/chat`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include',
      body: JSON.stringify({ message, meetingId, history })
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (err: any) {
    return {
      reply: 'Failed to contact AI service: ' + (err.message || 'Network error')
    };
  }
}
