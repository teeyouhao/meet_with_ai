import type { MeetingRecord, ActionItemRecord, InsightTaskRecord, ActionItemInput } from './supabase';

const DB_NAME = 'MeetWithAI_Guest_DB';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this browser environment.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains('meetings')) {
        const meetingStore = db.createObjectStore('meetings', { keyPath: 'id' });
        meetingStore.createIndex('created_at', 'created_at', { unique: false });
      }
      if (!db.objectStoreNames.contains('action_items')) {
        const itemStore = db.createObjectStore('action_items', { keyPath: 'id' });
        itemStore.createIndex('meeting_id', 'meeting_id', { unique: false });
      }
      if (!db.objectStoreNames.contains('insight_tasks')) {
        const taskStore = db.createObjectStore('insight_tasks', { keyPath: 'id' });
        taskStore.createIndex('status', 'status', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function generateGuestId(prefix = 'guest'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

// ── Guest Meetings ──────────────────────────────────────────────────────────

export async function getGuestMeetings(): Promise<MeetingRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('meetings', 'readonly');
      const store = tx.objectStore('meetings');
      const request = store.getAll();

      request.onsuccess = () => {
        const list = (request.result || []) as MeetingRecord[];
        // Sort newest first
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(list);
      };

      request.onerror = () => {
        console.warn('[IndexedDB] Failed to fetch guest meetings');
        resolve([]);
      };
    });
  } catch (err) {
    console.warn('[IndexedDB] Error in getGuestMeetings:', err);
    return [];
  }
}

export async function saveGuestMeeting(
  meeting: Partial<MeetingRecord>,
  actionItems?: ActionItemInput[]
): Promise<MeetingRecord> {
  const db = await openDB();
  const meetingId = meeting.id || generateGuestId('meet');
  const now = new Date().toISOString();

  // Normalize action items for embedded summary
  const normalizedActionItems = (actionItems || []).map((item) => ({
    task: item.task,
    assignee: item.assignee || 'Unassigned',
    due_date: item.due_date,
    status: 'pending' as const
  }));

  const fullMeeting: MeetingRecord = {
    id: meetingId,
    user_id: 'guest',
    title: meeting.title || 'Guest Meeting Recording',
    date: meeting.date || now,
    duration_seconds: meeting.duration_seconds || 0,
    source: meeting.source || 'live',
    transcript: meeting.transcript || '',
    summary: {
      overview: meeting.summary?.overview || '',
      key_points: meeting.summary?.key_points || [],
      decisions: meeting.summary?.decisions || [],
      action_items: meeting.summary?.action_items && meeting.summary.action_items.length > 0
        ? meeting.summary.action_items
        : normalizedActionItems
    },
    status: 'completed',
    audio_url: meeting.audio_url,
    created_at: meeting.created_at || now
  };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meetings', 'action_items', 'insight_tasks'], 'readwrite');
    const meetingStore = tx.objectStore('meetings');
    const itemStore = tx.objectStore('action_items');
    const taskStore = tx.objectStore('insight_tasks');

    meetingStore.put(fullMeeting);

    // Save individual action items
    if (normalizedActionItems.length > 0) {
      for (const item of normalizedActionItems) {
        const itemId = generateGuestId('act');
        const actRecord: ActionItemRecord = {
          id: itemId,
          meeting_id: meetingId,
          user_id: 'guest',
          task: item.task,
          assignee: item.assignee,
          due_date: item.due_date,
          status: 'pending',
          created_at: now
        };
        itemStore.put(actRecord);

        // Also add to insight_tasks store for Analytics widgets
        const insightTask: InsightTaskRecord = {
          id: itemId,
          user_id: 'guest',
          task: item.task,
          assignee: item.assignee,
          due_date: item.due_date,
          status: 'pending',
          created_at: now
        };
        taskStore.put(insightTask);
      }
    }

    tx.oncomplete = () => resolve(fullMeeting);
    tx.onerror = () => reject(tx.error);
  });
}

export async function deleteGuestMeeting(meetingId: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['meetings', 'action_items', 'insight_tasks'], 'readwrite');
      tx.objectStore('meetings').delete(meetingId);

      // Clean up linked action items
      const itemStore = tx.objectStore('action_items');
      const itemIndex = itemStore.index('meeting_id');
      const req = itemIndex.openCursor(IDBKeyRange.only(meetingId));
      req.onsuccess = (e) => {
        const cursor = (e.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function updateGuestMeetingTitle(meetingId: string, title: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('meetings', 'readwrite');
      const store = tx.objectStore('meetings');
      const getReq = store.get(meetingId);

      getReq.onsuccess = () => {
        const data = getReq.result as MeetingRecord | undefined;
        if (data) {
          data.title = title;
          store.put(data);
          resolve(true);
        } else {
          resolve(false);
        }
      };
      getReq.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function updateGuestMeetingActionItems(
  meetingId: string,
  actionItems: Array<{ task: string; assignee: string; due_date?: string; status?: 'pending' | 'completed' }>
): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction(['meetings', 'action_items', 'insight_tasks'], 'readwrite');
      const meetingStore = tx.objectStore('meetings');
      const getReq = meetingStore.get(meetingId);

      getReq.onsuccess = () => {
        const data = getReq.result as MeetingRecord | undefined;
        if (data) {
          if (!data.summary) {
            data.summary = { overview: '', key_points: [], decisions: [] };
          }
          data.summary.action_items = actionItems;
          meetingStore.put(data);
        }
      };

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

// ── Guest Action Items & Insight Tasks ──────────────────────────────────────

export async function getGuestActionItems(meetingId?: string): Promise<ActionItemRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('action_items', 'readonly');
      const store = tx.objectStore('action_items');

      if (meetingId) {
        const index = store.index('meeting_id');
        const req = index.getAll(IDBKeyRange.only(meetingId));
        req.onsuccess = () => resolve((req.result || []) as ActionItemRecord[]);
        req.onerror = () => resolve([]);
      } else {
        const req = store.getAll();
        req.onsuccess = () => resolve((req.result || []) as ActionItemRecord[]);
        req.onerror = () => resolve([]);
      }
    });
  } catch {
    return [];
  }
}

export async function getGuestInsightTasks(): Promise<InsightTaskRecord[]> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('insight_tasks', 'readonly');
      const store = tx.objectStore('insight_tasks');
      const req = store.getAll();
      req.onsuccess = () => {
        const list = (req.result || []) as InsightTaskRecord[];
        list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        resolve(list);
      };
      req.onerror = () => resolve([]);
    });
  } catch {
    return [];
  }
}

export async function createGuestInsightTask(task: {
  task: string;
  assignee?: string;
  due_date?: string;
}): Promise<InsightTaskRecord | null> {
  try {
    const db = await openDB();
    const id = generateGuestId('task');
    const now = new Date().toISOString();
    const newRecord: InsightTaskRecord = {
      id,
      user_id: 'guest',
      task: task.task,
      assignee: task.assignee,
      due_date: task.due_date,
      status: 'pending',
      created_at: now
    };

    return new Promise((resolve) => {
      const tx = db.transaction('insight_tasks', 'readwrite');
      tx.objectStore('insight_tasks').put(newRecord);
      tx.oncomplete = () => resolve(newRecord);
      tx.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

export async function updateGuestInsightTaskStatus(
  id: string,
  status: 'pending' | 'completed'
): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('insight_tasks', 'readwrite');
      const store = tx.objectStore('insight_tasks');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result as InsightTaskRecord | undefined;
        if (item) {
          item.status = status;
          store.put(item);
          resolve(true);
        } else {
          resolve(false);
        }
      };
      getReq.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export async function deleteGuestInsightTask(id: string): Promise<boolean> {
  try {
    const db = await openDB();
    return new Promise((resolve) => {
      const tx = db.transaction('insight_tasks', 'readwrite');
      tx.objectStore('insight_tasks').delete(id);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}
