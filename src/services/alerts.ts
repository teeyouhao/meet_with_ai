import { getAuthToken } from './auth';

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
  detected_at: string;
}

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

function getHeaders(): Record<string, string> {
  const token = getAuthToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

/** Fetch current active deadline alerts from autonomous worker */
export async function fetchDeadlineAlerts(): Promise<DeadlineAlert[]> {
  try {
    const res = await fetch(`${API_BASE}/api/alerts`, {
      headers: getHeaders(),
      credentials: 'include'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.alerts || [];
  } catch {
    return [];
  }
}

/** Trigger on-demand deadline re-check */
export async function triggerDeadlineCheck(): Promise<DeadlineAlert[]> {
  try {
    const res = await fetch(`${API_BASE}/api/alerts/check`, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'include'
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.alerts || [];
  } catch {
    return [];
  }
}

/** Request Web Notification API permission */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission !== 'denied') {
    const res = await Notification.requestPermission();
    return res === 'granted';
  }
  return false;
}

/** Display browser native notification if permitted */
export function sendLocalNotification(title: string, options?: NotificationOptions) {
  if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
    try {
      new Notification(title, {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        ...options
      });
    } catch {
      // Non-blocking
    }
  }
}
