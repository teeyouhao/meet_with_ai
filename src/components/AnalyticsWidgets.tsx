import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Clock,
  Check,
  Trash2,
  Plus,
  ListTodo,
  CheckSquare,
  AlertCircle,
  Calendar,
  User,
  Search,
  Bell,
  Sparkles,
  Brain,
  ShieldAlert
} from 'lucide-react';
import {
  fetchMeetings,
  fetchInsightTasks,
  createInsightTask,
  updateInsightTaskStatus,
  deleteInsightTask,
  type MeetingRecord,
  type InsightTaskRecord
} from '../services/supabase';
import { fetchDeadlineAlerts, requestNotificationPermission, type DeadlineAlert } from '../services/alerts';
import { searchSemanticMemory, indexAllMeetings, type SemanticMemoryMatch } from '../services/memory';
import { useLanguage } from '../context/LanguageContext';
import { AiChatBox } from './AiChatBox';

export const AnalyticsWidgets: React.FC = () => {
  const { t, language } = useLanguage();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [tasks, setTasks] = useState<InsightTaskRecord[]>([]);
  const [alerts, setAlerts] = useState<DeadlineAlert[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [notificationsGranted, setNotificationsGranted] = useState(
    typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted'
  );

  // Vector memory search state
  const [memoryQuery, setMemoryQuery] = useState('');
  const [memoryResults, setMemoryResults] = useState<SemanticMemoryMatch[]>([]);
  const [isSearchingMemory, setIsSearchingMemory] = useState(false);
  const [hasSearchedMemory, setHasSearchedMemory] = useState(false);
  const [isIndexingMemory, setIsIndexingMemory] = useState(false);
  const [memoryIndexMessage, setMemoryIndexMessage] = useState<string | null>(null);

  // Form input state
  const [newTaskText, setNewTaskText] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');

  // Table filter and search
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    let ignore = false;
    Promise.all([fetchMeetings(), fetchInsightTasks(), fetchDeadlineAlerts()])
      .then(([meetingsData, insightTasks, alertsData]) => {
        if (ignore) return;
        setMeetings(meetingsData || []);
        setTasks(insightTasks || []);
        setAlerts(alertsData || []);
        setIsLoading(false);
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('Failed to load insight analytics:', err);
          setIsLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  const handleRequestNotifications = async () => {
    const granted = await requestNotificationPermission();
    setNotificationsGranted(granted);
  };

  const handleSearchMemory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!memoryQuery.trim()) return;
    setIsSearchingMemory(true);
    setHasSearchedMemory(true);
    try {
      const results = await searchSemanticMemory(memoryQuery.trim());
      setMemoryResults(results);
    } finally {
      setIsSearchingMemory(false);
    }
  };

  const handleReindexMemory = async () => {
    setIsIndexingMemory(true);
    setMemoryIndexMessage(null);
    try {
      const res = await indexAllMeetings();
      setMemoryIndexMessage(
        language === 'zh'
          ? `已成功索引 ${res.meetingsProcessed} 场会议（共 ${res.totalChunksIndexed} 个语义向量块）`
          : `Indexed ${res.meetingsProcessed} meetings (${res.totalChunksIndexed} vector memory chunks)`
      );
      setTimeout(() => setMemoryIndexMessage(null), 5000);
    } catch {
      setMemoryIndexMessage('Indexing failed.');
    } finally {
      setIsIndexingMemory(false);
    }
  };

  // Toggle action item completion
  const toggleTask = async (task: InsightTaskRecord) => {
    const nextStatus: 'pending' | 'completed' = task.status === 'completed' ? 'pending' : 'completed';

    // Optimistic UI update
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t))
    );

    await updateInsightTaskStatus(task.id, nextStatus);
  };

  // Add new insight action item
  const handleAddTask = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newTaskText.trim() || isSubmitting) return;

    const taskText = newTaskText.trim();
    const assigneeVal = newAssignee.trim() || undefined;
    const dueDateVal = newDueDate.trim() || undefined;

    setIsSubmitting(true);
    try {
      const saved = await createInsightTask(taskText, assigneeVal, dueDateVal);
      if (saved) {
        setTasks((prev) => [saved, ...prev.filter((t) => t.id !== saved.id)]);
      }
      setNewTaskText('');
      setNewAssignee('');
      setNewDueDate('');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete insight action item
  const handleDeleteTask = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setTasks((prev) => prev.filter((t) => t.id !== id));
    await deleteInsightTask(id);
  };

  // Helper to reliably compute meeting duration in minutes
  const getMeetingMinutes = (m: MeetingRecord): number => {
    if (m.duration_seconds && m.duration_seconds > 0) {
      return Math.max(1, Math.round(m.duration_seconds / 60));
    }
    const wordCount = (m.transcript || '').trim().split(/\s+/).filter(Boolean).length;
    if (wordCount > 0) {
      return Math.max(1, Math.round(wordCount / 130));
    }
    return 1;
  };

  const isSameCalendarDay = (d1: Date, d2: Date) => {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  };

  const totalMinutes = meetings.reduce((acc, m) => acc + getMeetingMinutes(m), 0);
  const avgMinutes = meetings.length > 0 ? Math.round(totalMinutes / meetings.length) : 0;

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const pendingCount = tasks.filter((t) => t.status !== 'completed').length;
  const completionPercent = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Filter tasks for table
  const filteredTasks = tasks.filter((t) => {
    const matchesFilter =
      filterStatus === 'all'
        ? true
        : filterStatus === 'completed'
        ? t.status === 'completed'
        : t.status !== 'completed';

    const matchesSearch =
      !searchQuery.trim() ||
      t.task.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.assignee && t.assignee.toLowerCase().includes(searchQuery.toLowerCase()));

    return matchesFilter && matchesSearch;
  });

  // Real 7-Day breakdown grouped by actual calendar dates
  const past7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    d.setHours(0, 0, 0, 0);
    return d;
  });

  const weeklyActivity = past7Days.map((d) => {
    const dayMeetings = meetings.filter((m) => {
      const meetDate = new Date(m.date || m.created_at);
      return isSameCalendarDay(meetDate, d);
    });

    const dayMinutes = dayMeetings.reduce((acc, m) => acc + getMeetingMinutes(m), 0);

    return {
      day: d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { weekday: 'short' }),
      dateStr: d.toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { month: 'short', day: 'numeric' }),
      minutes: dayMinutes,
      count: dayMeetings.length
    };
  });

  const maxRecordedMinutes = Math.max(...weeklyActivity.map((d) => d.minutes), 5);

  return (
    <div style={{ maxWidth: '1040px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
      {/* Page Header */}
      <div style={{ marginBottom: '24px' }}>
        <h1 className="ios-large-title" style={{ marginBottom: '6px' }}>
          {t.insights.title}
        </h1>
        <p style={{ fontSize: '13.5px', color: 'var(--text-muted)' }}>
          {t.insights.subtitle}
        </p>
      </div>

      {/* Autonomous Deadline Alert Banner (Event-Driven Worker) */}
      {alerts.length > 0 && (
        <div
          className="glass-panel"
          style={{
            padding: '18px 20px',
            marginBottom: '24px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.08) 0%, rgba(245, 158, 11, 0.08) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.3)',
            boxShadow: '0 8px 32px rgba(239, 68, 68, 0.12)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '14px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'rgba(239, 68, 68, 0.2)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Bell size={18} color="#ef4444" />
              </div>
              <div>
                <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                  {t.insights.deadlineAlertTitle}
                </h3>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                  {alerts.length} {language === 'zh' ? '个待办事项临近截止或已逾期' : 'item(s) nearing deadline or overdue'}
                </span>
              </div>
            </div>

            {!notificationsGranted && (
              <button
                type="button"
                onClick={handleRequestNotifications}
                className="btn-secondary"
                style={{ fontSize: '12px', padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ShieldAlert size={14} />
                {t.insights.enableNotifications}
              </button>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {alerts.map((alert) => {
              const isOverdue = alert.level === 'overdue';
              return (
                <div
                  key={alert.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '10px',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: isOverdue ? 'rgba(239, 68, 68, 0.12)' : 'rgba(245, 158, 11, 0.12)',
                    border: `1px solid ${isOverdue ? 'rgba(239, 68, 68, 0.25)' : 'rgba(245, 158, 11, 0.25)'}`
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: '220px', flex: 1 }}>
                    <AlertCircle size={16} color={isOverdue ? '#ef4444' : '#f59e0b'} />
                    <div>
                      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {alert.task}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        {alert.meeting_title} • {alert.assignee}
                      </div>
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '11.5px',
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: '12px',
                      background: isOverdue ? '#ef4444' : '#f59e0b',
                      color: '#ffffff',
                      letterSpacing: '0.2px'
                    }}
                  >
                    {isOverdue
                      ? t.insights.overdueHours.replace('{h}', String(Math.abs(alert.hours_remaining)))
                      : t.insights.dueInHours.replace('{h}', String(alert.hours_remaining))}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Real Metric Cards Grid */}
      <div className="insight-metrics-grid" style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        {/* Metric 1: Sessions */}
        <div className="glass-panel insight-metrics-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t.insights.vaultSessions}
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(99, 102, 241, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Clock size={16} color="var(--accent-primary)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : meetings.length}
          </div>
          <span style={{ fontSize: '11.5px', color: meetings.length > 0 ? 'var(--accent-emerald)' : 'var(--text-muted)', fontWeight: 600 }}>
            {language === 'zh'
              ? `${meetings.length} ${t.insights.sessionPlural}`
              : meetings.length === 1
              ? t.insights.sessionSingular
              : `${meetings.length} ${t.insights.sessionPlural}`}
          </span>
        </div>

        {/* Metric 2: Duration */}
        <div className="glass-panel insight-metrics-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t.insights.recordedTime}
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(6, 182, 212, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <TrendingUp size={16} color="var(--accent-cyan)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : totalMinutes} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)' }}>{t.insights.minUnit}</span>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
            {t.insights.avgPerSession.replace('{m}', String(avgMinutes))}
          </span>
        </div>

        {/* Metric 3: Insight Tasks */}
        <div className="glass-panel insight-metrics-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t.insights.insightTasks}
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(139, 92, 246, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <ListTodo size={16} color="var(--accent-purple)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : tasks.length} <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-muted)' }}>{t.insights.totalUnit}</span>
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--accent-purple)', fontWeight: 600 }}>
            {pendingCount} {t.insights.pendingCompletion}
          </span>
        </div>

        {/* Metric 4: Completion Rate */}
        <div className="glass-panel insight-metrics-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
              {t.insights.completionRate}
            </span>
            <div style={{
              width: '32px', height: '32px', borderRadius: '10px',
              background: 'rgba(16, 185, 129, 0.12)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckSquare size={16} color="var(--accent-emerald)" />
            </div>
          </div>
          <div style={{ fontSize: '28px', fontWeight: 800, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
            {isLoading ? '…' : `${completionPercent}%`}
          </div>
          <span style={{ fontSize: '11.5px', color: 'var(--accent-emerald)', fontWeight: 600 }}>
            {language === 'zh'
              ? `${completedCount} / ${tasks.length} ${t.insights.resolvedOf}`
              : `${completedCount} of ${tasks.length} ${t.insights.resolvedOf}`}
          </span>
        </div>
      </div>

      {/* Weekly Activity Volume Chart */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <h3 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {t.insights.weeklyVolume}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              {t.insights.weeklyDesc}
            </p>
          </div>
          <span className="badge badge-source" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981', boxShadow: '0 0 8px #10b981' }} />
            {t.insights.sevenDayActivity}
          </span>
        </div>

        {/* Interactive Shimmering Bar Chart */}
        <div className="insight-weekly-bars" style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          height: '180px',
          paddingTop: '20px',
          paddingBottom: '6px',
          borderBottom: '1px solid var(--glass-border)'
        }}>
          {weeklyActivity.map((item, idx) => {
            const heightPercent = item.minutes > 0
              ? Math.max((item.minutes / maxRecordedMinutes) * 100, 16)
              : 4;
            const isHovered = hoveredDay === idx;

            return (
              <div
                key={item.day + idx}
                className="insight-weekly-bar-item"
                onMouseEnter={() => setHoveredDay(idx)}
                onMouseLeave={() => setHoveredDay(null)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '8px',
                  flex: 1,
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                {/* Tooltip on Hover */}
                {isHovered && (
                  <div style={{
                    position: 'absolute',
                    top: '-46px',
                    background: 'var(--island-bg)',
                    border: '1px solid var(--glass-border)',
                    padding: '5px 10px',
                    borderRadius: '8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: 'var(--text-primary)',
                    boxShadow: 'var(--glass-shadow-float)',
                    whiteSpace: 'nowrap',
                    zIndex: 30,
                    pointerEvents: 'none'
                  }}>
                    {item.dateStr}: {item.minutes}{t.insights.minUnit} ({item.count} {language === 'zh' ? '场会议' : item.count !== 1 ? 'sessions' : 'session'})
                  </div>
                )}

                {/* Value badge pill on top of bar track */}
                <span style={{
                  fontSize: '11px',
                  fontWeight: 700,
                  padding: '2px 6px',
                  borderRadius: '6px',
                  background: item.minutes > 0 ? 'rgba(99, 102, 241, 0.12)' : 'transparent',
                  color: item.minutes > 0 ? 'var(--accent-primary)' : 'var(--text-muted)',
                  transition: 'all 0.2s ease'
                }}>
                  {item.minutes > 0 ? `${item.minutes}${t.insights.minUnit}` : `0${t.insights.minUnit}`}
                </span>

                {/* Equalizer track column */}
                <div style={{
                  width: '32px',
                  height: '110px',
                  borderRadius: '10px',
                  background: 'var(--glass-surface-subtle)',
                  border: '1px solid var(--glass-border)',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'flex-end',
                  padding: '3px',
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: isHovered ? '0 0 0 1px var(--accent-primary)' : 'none',
                  transition: 'all 0.2s ease'
                }}>
                  <div
                    className={item.minutes > 0 ? 'shimmer-bar-active' : ''}
                    style={{
                      width: '100%',
                      height: `${heightPercent}%`,
                      borderRadius: '6px',
                      background: item.minutes > 0
                        ? (isHovered
                            ? 'linear-gradient(180deg, #06b6d4 0%, #6366f1 60%, #a855f7 100%)'
                            : 'linear-gradient(180deg, #6366f1 0%, #a855f7 50%, #ec4899 100%)')
                        : 'var(--glass-border)',
                      borderTop: item.minutes > 0 ? '1px solid rgba(255, 255, 255, 0.7)' : 'none',
                      transition: 'height 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.2s ease'
                    }}
                  />
                </div>

                <span style={{
                  fontSize: '11.5px',
                  fontWeight: isHovered ? 700 : 500,
                  color: isHovered ? 'var(--text-primary)' : 'var(--text-muted)',
                  transition: 'color 0.2s ease'
                }}>
                  {item.day}
                </span>
              </div>
            );
          })}
        </div>

        <div style={{ marginTop: '12px', fontSize: '11.5px', color: 'var(--text-muted)' }}>
          <span>{t.insights.totalSevenDay}: {weeklyActivity.reduce((acc, d) => acc + d.minutes, 0)} {t.insights.minUnit} ({weeklyActivity.reduce((acc, d) => acc + d.count, 0)} {language === 'zh' ? '场会议' : weeklyActivity.reduce((acc, d) => acc + d.count, 0) !== 1 ? 'sessions' : 'session'})</span>
        </div>
      </div>

      {/* DEEP INTELLIGENCE: SEMANTIC VECTOR MEMORY (TRACK 2) */}
      <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '34px',
              height: '34px',
              borderRadius: '9px',
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.25) 0%, rgba(168, 85, 247, 0.25) 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Brain size={20} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, fontFamily: 'var(--font-heading)' }}>
                {t.insights.vectorMemoryTitle}
              </h2>
              <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', margin: '2px 0 0 0' }}>
                {t.insights.vectorMemorySubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleReindexMemory}
            disabled={isIndexingMemory}
            className="btn-secondary"
            style={{ fontSize: '12px', padding: '7px 14px', display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Sparkles size={14} color="var(--accent-purple)" />
            {isIndexingMemory ? t.insights.reindexing : t.insights.reindexMemory}
          </button>
        </div>

        {memoryIndexMessage && (
          <div style={{
            fontSize: '12px',
            color: 'var(--accent-emerald)',
            background: 'rgba(16, 185, 129, 0.1)',
            padding: '8px 12px',
            borderRadius: '6px',
            marginBottom: '14px',
            border: '1px solid rgba(16, 185, 129, 0.2)'
          }}>
            {memoryIndexMessage}
          </div>
        )}

        {/* Semantic Query Input */}
        <form onSubmit={handleSearchMemory} style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
            <Search
              size={16}
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
                pointerEvents: 'none'
              }}
            />
            <input
              type="text"
              value={memoryQuery}
              onChange={(e) => setMemoryQuery(e.target.value)}
              placeholder={t.insights.searchMemoryPlaceholder}
              className="search-input"
              style={{
                width: '100%',
                paddingLeft: '36px',
                paddingRight: '12px',
                height: '38px',
                borderRadius: '8px',
                fontSize: '13px'
              }}
            />
          </div>
          <button
            type="submit"
            disabled={isSearchingMemory || !memoryQuery.trim()}
            className="btn-primary"
            style={{
              padding: '0 18px',
              height: '38px',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Sparkles size={14} />
            {isSearchingMemory ? (language === 'zh' ? '正在匹配…' : 'Querying…') : (language === 'zh' ? '智能检索' : 'Search Memory')}
          </button>
        </form>

        {/* Semantic Matches List */}
        {hasSearchedMemory && (
          <div style={{ marginTop: '12px' }}>
            {memoryResults.length === 0 ? (
              <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '16px', textAlign: 'center' }}>
                {t.insights.noMemoryFound}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {memoryResults.map((match, idx) => {
                  const simPct = Math.round((match.similarity || 0) * 100);
                  const typeColors: Record<string, string> = {
                    decision: '#10b981',
                    key_point: '#6366f1',
                    action_item: '#f59e0b',
                    summary: '#a855f7'
                  };
                  const color = typeColors[match.chunk_type] || 'var(--accent-primary)';

                  return (
                    <div
                      key={match.id || idx}
                      style={{
                        padding: '12px 14px',
                        borderRadius: '8px',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--glass-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span
                            style={{
                              fontSize: '10.5px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: `${color}20`,
                              color: color,
                              border: `1px solid ${color}40`
                            }}
                          >
                            {match.chunk_type.replace('_', ' ')}
                          </span>
                          {match.metadata?.title && (
                            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>
                              {match.metadata.title}
                            </span>
                          )}
                        </div>

                        <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--accent-emerald)' }}>
                          {simPct}% match
                        </span>
                      </div>

                      <div style={{ fontSize: '13px', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                        {match.chunk_text}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cross-Meeting AI Chatbox */}
      <AiChatBox defaultExpanded={false} />

      {/* DEDICATED ACTION ITEMS TABLE SECTION (INSIGHT TAB) */}
      <div className="glass-panel" style={{ padding: '26px' }}>
        {/* Table Header & Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ListTodo size={20} color="var(--accent-purple)" />
              <h2 style={{ fontSize: '18px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
                {t.insights.tableTitle}
              </h2>
            </div>
            <p style={{ fontSize: '12.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
              {t.insights.tableSubtitle}
            </p>
          </div>

          {/* Controls: Search, Filters & Completion */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              padding: '6px 12px',
              borderRadius: '10px'
            }}>
              <Search size={14} color="var(--text-muted)" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.insights.searchPlaceholder}
                style={{
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                  width: '140px'
                }}
              />
            </div>

            {/* Filter Pills */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              background: 'var(--glass-surface-subtle)',
              padding: '3px',
              borderRadius: '10px',
              border: '1px solid var(--glass-border)'
            }}>
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                style={{
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: filterStatus === 'all' ? 700 : 500,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: filterStatus === 'all' ? 'var(--accent-primary)' : 'transparent',
                  color: filterStatus === 'all' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.insights.filterAll} ({tasks.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                style={{
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: filterStatus === 'pending' ? 700 : 500,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: filterStatus === 'pending' ? 'var(--accent-purple)' : 'transparent',
                  color: filterStatus === 'pending' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.insights.filterPending} ({pendingCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('completed')}
                style={{
                  padding: '5px 10px',
                  fontSize: '11.5px',
                  fontWeight: filterStatus === 'completed' ? 700 : 500,
                  borderRadius: '7px',
                  border: 'none',
                  cursor: 'pointer',
                  background: filterStatus === 'completed' ? 'var(--accent-emerald)' : 'transparent',
                  color: filterStatus === 'completed' ? '#ffffff' : 'var(--text-secondary)',
                  transition: 'all 0.15s ease'
                }}
              >
                {t.insights.filterDone} ({completedCount})
              </button>
            </div>
          </div>
        </div>

        {/* Add New Action Item Bar */}
        <form
          className="insight-task-form"
          onSubmit={handleAddTask}
          style={{
            display: 'flex',
            gap: '10px',
            marginBottom: '16px',
            flexWrap: 'wrap',
            background: 'var(--glass-surface-subtle)',
            padding: '12px 14px',
            borderRadius: '12px',
            border: '1px solid var(--glass-border)'
          }}
        >
          <input
            type="text"
            value={newTaskText}
            onChange={(e) => setNewTaskText(e.target.value)}
            placeholder={t.insights.addTaskPlaceholder}
            disabled={isSubmitting}
            style={{
              flex: '2 1 240px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '9px',
              padding: '9px 13px',
              fontSize: '13px',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          />

          <input
            type="text"
            value={newAssignee}
            onChange={(e) => setNewAssignee(e.target.value)}
            placeholder={t.insights.assigneePlaceholder}
            disabled={isSubmitting}
            style={{
              flex: '1 1 120px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '9px',
              padding: '9px 12px',
              fontSize: '12.5px',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          />

          <input
            type="date"
            value={newDueDate}
            onChange={(e) => setNewDueDate(e.target.value)}
            title={t.insights.targetDueDate}
            disabled={isSubmitting}
            style={{
              width: '135px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              borderRadius: '9px',
              padding: '9px 10px',
              fontSize: '12px',
              color: 'var(--text-primary)',
              outline: 'none',
              transition: 'all 0.2s ease'
            }}
          />

          <button
            type="submit"
            disabled={!newTaskText.trim() || isSubmitting}
            className="btn-primary"
            style={{
              padding: '9px 18px',
              fontSize: '12.5px',
              borderRadius: '9px',
              opacity: newTaskText.trim() && !isSubmitting ? 1 : 0.55,
              cursor: newTaskText.trim() && !isSubmitting ? 'pointer' : 'not-allowed',
              flexShrink: 0
            }}
          >
            <Plus size={15} />
            {isSubmitting ? t.insights.addingDeliverable : t.insights.btnAddDeliverable}
          </button>
        </form>

        {/* Dedicated Insight Tasks HTML Table */}
        <div className="insight-table-container">
          <table className="insight-table">
            <thead>
              <tr>
                <th style={{ width: '130px' }}>{t.insights.colStatus}</th>
                <th>{t.insights.colTask}</th>
                <th style={{ width: '160px' }}>{t.insights.colAssignee}</th>
                <th style={{ width: '140px' }}>{t.insights.colDueDate}</th>
                <th style={{ width: '70px', textAlign: 'center' }}>{t.insights.colAction}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-muted)' }}>
                    {t.insights.queryingDatabase}
                  </td>
                </tr>
              ) : filteredTasks.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '36px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', color: 'var(--text-muted)' }}>
                      <AlertCircle size={22} style={{ opacity: 0.7 }} />
                      <span style={{ fontSize: '13px' }}>
                        {searchQuery
                          ? (language === 'zh' ? `未找到匹配 "${searchQuery}" 的事项。` : t.insights.noMatchSearch.replace('{query}', searchQuery))
                          : filterStatus !== 'all'
                          ? (language === 'zh'
                              ? `暂无${filterStatus === 'pending' ? '待处理' : '已完成'}的行动项。`
                              : t.insights.noFilterMatch.replace('{status}', filterStatus))
                          : t.insights.noTasksRecorded}
                      </span>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTasks.map((item) => {
                  const isDone = item.status === 'completed';
                  return (
                    <tr
                      key={item.id}
                      onClick={() => toggleTask(item)}
                      style={{ cursor: 'pointer' }}
                    >
                      {/* Status Column */}
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{
                            width: '18px',
                            height: '18px',
                            borderRadius: '6px',
                            background: isDone ? 'var(--accent-emerald)' : 'transparent',
                            border: `1.5px solid ${isDone ? 'var(--accent-emerald)' : 'var(--text-muted)'}`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            transition: 'all 0.18s ease'
                          }}>
                            {isDone && <Check size={12} color="#ffffff" strokeWidth={3} />}
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: 700,
                            textTransform: 'uppercase',
                            letterSpacing: '0.4px',
                            color: isDone ? 'var(--accent-emerald)' : 'var(--accent-purple)'
                          }}>
                            {isDone ? t.insights.statusDone : t.insights.statusPending}
                          </span>
                        </div>
                      </td>

                      {/* Task / Deliverable Column */}
                      <td>
                        <span style={{
                          fontSize: '13.5px',
                          color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                          textDecoration: isDone ? 'line-through' : 'none',
                          fontWeight: isDone ? 400 : 500,
                          lineHeight: 1.5
                        }}>
                          {item.task}
                        </span>
                      </td>

                      {/* Assignee Column */}
                      <td>
                        {item.assignee && item.assignee !== 'Unassigned' ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11.5px',
                            fontWeight: 600,
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: 'var(--accent-primary)',
                            padding: '3px 8px',
                            borderRadius: '6px'
                          }}>
                            <User size={12} />
                            {item.assignee}
                          </span>
                        ) : (
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* Due Date Column */}
                      <td>
                        {item.due_date ? (
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            fontSize: '11.5px',
                            color: 'var(--text-secondary)'
                          }}>
                            <Calendar size={12} color="var(--text-muted)" />
                            {new Date(item.due_date).toLocaleDateString(language === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        ) : (
                          <span style={{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
                            {new Date(item.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : undefined, { month: 'short', day: 'numeric' })}
                          </span>
                        )}
                      </td>

                      {/* Action Column */}
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTask(e, item.id)}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            background: 'transparent',
                            border: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            transition: 'color 0.15s ease'
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-rose)')}
                          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                          title={t.insights.deleteTooltip}
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Responsive Mobile Cards View (Visible on <= 640px) */}
        <div className="insight-cards-mobile">
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '13px' }}>
              {t.insights.queryingDatabase}
            </div>
          ) : filteredTasks.length === 0 ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
              padding: '24px', color: 'var(--text-muted)', background: 'var(--glass-surface-subtle)',
              borderRadius: '12px', border: '1px solid var(--glass-border)'
            }}>
              <AlertCircle size={20} style={{ opacity: 0.7 }} />
              <span style={{ fontSize: '12.5px', textAlign: 'center' }}>
                {searchQuery
                  ? (language === 'zh' ? `未找到匹配 "${searchQuery}" 的事项。` : t.insights.noMatchSearch.replace('{query}', searchQuery))
                  : filterStatus !== 'all'
                  ? (language === 'zh'
                      ? `暂无${filterStatus === 'pending' ? '待处理' : '已完成'}的行动项。`
                      : t.insights.noFilterMatch.replace('{status}', filterStatus))
                  : t.insights.noTasksRecorded}
              </span>
            </div>
          ) : (
            filteredTasks.map((item) => {
              const isDone = item.status === 'completed';
              return (
                <div
                  key={'m-' + item.id}
                  onClick={() => toggleTask(item)}
                  style={{
                    padding: '14px 16px',
                    borderRadius: '14px',
                    background: isDone ? 'rgba(255, 255, 255, 0.02)' : 'var(--glass-surface-subtle)',
                    border: `1px solid ${isDone ? 'rgba(255, 255, 255, 0.06)' : 'var(--glass-border)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                      <div style={{
                        width: '22px',
                        height: '22px',
                        borderRadius: '7px',
                        background: isDone ? 'var(--accent-emerald)' : 'transparent',
                        border: `1.5px solid ${isDone ? 'var(--accent-emerald)' : 'var(--text-muted)'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        {isDone && <Check size={14} color="#ffffff" strokeWidth={3} />}
                      </div>
                      <span style={{
                        fontSize: '14px',
                        fontWeight: isDone ? 400 : 600,
                        color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                        textDecoration: isDone ? 'line-through' : 'none',
                        lineHeight: 1.4
                      }}>
                        {item.task}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => handleDeleteTask(e, item.id)}
                      style={{
                        background: 'transparent',
                        border: 'none',
                        color: 'var(--text-muted)',
                        padding: '4px',
                        cursor: 'pointer'
                      }}
                      title={t.insights.deleteTooltip}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', paddingLeft: '32px' }}>
                    <span style={{
                      fontSize: '10.5px',
                      fontWeight: 700,
                      textTransform: 'uppercase',
                      letterSpacing: '0.4px',
                      padding: '2px 7px',
                      borderRadius: '5px',
                      background: isDone ? 'rgba(16, 185, 129, 0.12)' : 'rgba(139, 92, 246, 0.12)',
                      color: isDone ? 'var(--accent-emerald)' : 'var(--accent-purple)'
                    }}>
                      {isDone ? t.insights.statusDone : t.insights.statusPending}
                    </span>

                    {item.assignee && item.assignee !== 'Unassigned' && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        fontWeight: 600,
                        background: 'rgba(99, 102, 241, 0.12)',
                        color: 'var(--accent-primary)',
                        padding: '2px 7px',
                        borderRadius: '5px'
                      }}>
                        <User size={11} />
                        {item.assignee}
                      </span>
                    )}

                    {item.due_date && (
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '11px',
                        color: 'var(--text-muted)',
                        background: 'var(--glass-surface-subtle)',
                        padding: '2px 7px',
                        borderRadius: '5px',
                        border: '1px solid var(--glass-border)'
                      }}>
                        <Calendar size={11} />
                        {item.due_date.split('T')[0]}
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
