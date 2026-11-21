import React, { useState, useEffect } from 'react';
import {
  Search,
  ArrowRight,
  Database,
  RefreshCw,
  Trash2,
  Play,
  Pause,
  Pencil,
  Check,
  X,
  ListTodo,
  Plus
} from 'lucide-react';
import {
  fetchMeetings,
  deleteMeeting,
  updateMeetingTitle,
  updateMeetingActionItems,
  type MeetingRecord
} from '../services/supabase';
import { useLanguage } from '../context/LanguageContext';

export const GeminiStarIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 15,
  className = '',
  style = {}
}) => (
  <svg
    viewBox="0 0 24 24"
    width={size}
    height={size}
    className={className}
    style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    fill="currentColor"
  >
    <path d="M12 0C12 6.627 6.627 12 0 12C6.627 12 12 17.373 12 24C12 17.373 17.373 12 24 12C17.373 12 12 6.627 12 0Z" />
  </svg>
);

interface MeetingHistoryProps {
  onSelectMeeting: (meeting: MeetingRecord) => void;
  onOpenChat?: (meeting: MeetingRecord) => void;
}

const CREATIVE_VAULT_QUOTES = [
  {
    en: "“Meetings are fascinating if you're keeping the minutes.”",
    zh: "“如果你负责整理会议纪要，会议就会格外有启发。”"
  },
  {
    en: "“Great minds discuss ideas, average minds discuss events, small minds discuss people.” — Eleanor Roosevelt",
    zh: "“大智论道，中智论事，小智论人。” —— 埃莉诺·罗斯福"
  },
  {
    en: "“Time isn’t the main thing. It’s the only thing.” — Miles Davis",
    zh: "“时间不是主要的事情，它是唯一的事情。” —— 迈尔斯·戴维斯"
  },
  {
    en: "“Creativity is intelligence having fun.” — Albert Einstein",
    zh: "“创造力，就是智力在自得其乐。” —— 爱因斯坦"
  },
  {
    en: "“The secret of getting ahead is getting started.” — Mark Twain",
    zh: "“领先的秘诀在于立刻开始行动。” —— 马克·吐温"
  },
  {
    en: "“Focus on being productive instead of busy.” — Tim Ferriss",
    zh: "“专注于高效产出，而不是盲目忙碌。” —— 蒂姆·费里斯"
  },
  {
    en: "“Simplicity is the ultimate sophistication.” — Leonardo da Vinci",
    zh: "“至简，乃臻至繁。” —— 达芬奇"
  },
  {
    en: "“Action is the foundational key to all success.” — Pablo Picasso",
    zh: "“行动是一切成功的基石。” —— 毕加索"
  },
  {
    en: "“Knowledge speaks, but wisdom listens.” — Jimi Hendrix",
    zh: "“知识滔滔不绝，而智慧静默聆听。” —— 吉米·亨德里克斯"
  },
  {
    en: "“The best way to predict the future is to create it.” — Peter Drucker",
    zh: "“预测未来最好的方法，就是去创造它。” —— 彼得·德鲁克"
  }
];

export const MeetingHistory: React.FC<MeetingHistoryProps> = ({ onSelectMeeting, onOpenChat }) => {
  const { t, language } = useLanguage();
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadingQuote, setLoadingQuote] = useState(() =>
    CREATIVE_VAULT_QUOTES[Math.floor(Math.random() * CREATIVE_VAULT_QUOTES.length)]
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [addingTaskId, setAddingTaskId] = useState<string | null>(null);
  const [newTaskText, setNewTaskText] = useState('');

  const mergeLocalStorage = (list: MeetingRecord[]): MeetingRecord[] => {
    return list.map((m) => {
      try {
        const cached = localStorage.getItem(`meetwithai_action_items_${m.id}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0 && m.summary) {
            const dbItems = m.summary.action_items || [];
            const mergedItems = dbItems.map((dbItem) => {
              const match = parsed.find(
                (p: { task?: string; status?: string }) => p.task?.trim().toLowerCase() === dbItem.task?.trim().toLowerCase()
              );
              if (match) {
                return {
                  ...dbItem,
                  status: (match.status === 'completed' ? 'completed' : 'pending') as 'pending' | 'completed'
                };
              }
              return dbItem;
            });

            // Also keep any newly added items from parsed that are not in dbItems yet
            const extraLocalItems = parsed.filter(
              (p: { task?: string }) => !dbItems.some((d) => d.task?.trim().toLowerCase() === p.task?.trim().toLowerCase())
            );
            const allItems = [...mergedItems, ...extraLocalItems];

            return {
              ...m,
              summary: {
                ...m.summary,
                action_items: allItems.length > 0 ? allItems : parsed
              }
            };
          }
        }
      } catch {}
      return m;
    });
  };

  const toggleActionItem = async (meetingId: string, taskTitle: string) => {
    let updatedItemsToPersist: Array<{ task: string; assignee?: string; due_date?: string; status?: 'pending' | 'completed' }> | null = null;
    let updatedSummaryToPersist: MeetingRecord['summary'] | undefined = undefined;

    setMeetings((prevMeetings) => {
      const targetMeeting = prevMeetings.find((m) => m.id === meetingId);
      if (!targetMeeting) return prevMeetings;

      const currentItems = targetMeeting.summary?.action_items ? [...targetMeeting.summary.action_items] : [];
      const targetIdx = currentItems.findIndex(
        (item) => item.task?.trim().toLowerCase() === taskTitle.trim().toLowerCase()
      );
      if (targetIdx === -1) return prevMeetings;

      const currentStatus = currentItems[targetIdx].status;
      const nextStatus: 'pending' | 'completed' = currentStatus === 'completed' ? 'pending' : 'completed';

      const updatedItems = currentItems.map((item, idx) =>
        idx === targetIdx
          ? { ...item, status: nextStatus }
          : item
      );

      const updatedSummary = {
        ...(targetMeeting.summary || { overview: '', key_points: [], decisions: [] }),
        action_items: updatedItems
      };

      updatedItemsToPersist = updatedItems;
      updatedSummaryToPersist = updatedSummary;

      const updatedMeeting: MeetingRecord = {
        ...targetMeeting,
        summary: updatedSummary
      };

      return prevMeetings.map((m) => (m.id === meetingId ? updatedMeeting : m));
    });

    if (updatedItemsToPersist && updatedSummaryToPersist) {
      try {
        localStorage.setItem(`meetwithai_action_items_${meetingId}`, JSON.stringify(updatedItemsToPersist));
      } catch {}

      try {
        await updateMeetingActionItems(meetingId, updatedItemsToPersist, updatedSummaryToPersist);
      } catch (err) {
        console.warn('Error syncing action item toggle to database:', err);
      }
    }
  };

  const handleAddNewTask = async (meetingId: string) => {
    if (!newTaskText.trim()) return;
    const taskTitle = newTaskText.trim();
    setNewTaskText('');
    setAddingTaskId(null);

    const targetMeeting = meetings.find((m) => m.id === meetingId);
    if (!targetMeeting) return;

    const existingItems = targetMeeting.summary?.action_items ? [...targetMeeting.summary.action_items] : [];
    const newItem = {
      task: taskTitle,
      assignee: 'Unassigned',
      status: 'pending' as const
    };
    const updatedItems = [...existingItems, newItem];

    const updatedSummary = {
      ...(targetMeeting.summary || { overview: '', key_points: [], decisions: [] }),
      action_items: updatedItems
    };

    const updatedMeeting: MeetingRecord = {
      ...targetMeeting,
      summary: updatedSummary
    };

    setMeetings((prevMeetings) =>
      prevMeetings.map((m) => (m.id === meetingId ? updatedMeeting : m))
    );

    try {
      localStorage.setItem(`meetwithai_action_items_${meetingId}`, JSON.stringify(updatedItems));
    } catch {}

    try {
      await updateMeetingActionItems(meetingId, updatedItems, updatedSummary);
    } catch (err) {
      console.warn('Error syncing new action item to database:', err);
    }
  };

  const refreshMeetings = async () => {
    setLoadingQuote(CREATIVE_VAULT_QUOTES[Math.floor(Math.random() * CREATIVE_VAULT_QUOTES.length)]);
    setIsLoading(true);
    try {
      const data = await fetchMeetings();
      setMeetings(mergeLocalStorage(data));
    } catch (e) {
      console.warn('Error loading history:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    fetchMeetings()
      .then((data) => {
        if (!ignore) {
          setMeetings(mergeLocalStorage(data));
          setIsLoading(false);
        }
      })
      .catch((e) => {
        if (!ignore) {
          console.warn('Error loading history:', e);
          setIsLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, []);

  // Scroll Reveal Observer: progressively reveals vault cards as the user scrolls
  useEffect(() => {
    if (isLoading) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-revealed');
          }
        });
      },
      {
        threshold: 0.05,
        rootMargin: '0px 0px -20px 0px'
      }
    );

    const elements = document.querySelectorAll('.scroll-reveal');
    elements.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
    };
  }, [isLoading, meetings.length, searchQuery]);

  const handleDelete = async (e: React.MouseEvent, meeting: MeetingRecord) => {
    e.stopPropagation(); // Don't open the meeting
    if (!confirm(language === 'zh' ? `确定要删除“${meeting.title}”吗？此操作无法撤销。` : `Delete "${meeting.title}"? This cannot be undone.`)) return;

    setDeletingId(meeting.id);
    try {
      const ok = await deleteMeeting(meeting.id, meeting.audio_url);
      if (ok) {
        setMeetings((prev) => prev.filter((m) => m.id !== meeting.id));
      }
    } finally {
      setDeletingId(null);
    }
  };

  const handleSaveTitle = async (e: React.MouseEvent | React.KeyboardEvent, meetingId: string) => {
    e.stopPropagation();
    const trimmed = editingTitleValue.trim();
    if (!trimmed) {
      setEditingTitleId(null);
      return;
    }

    setIsSavingTitle(true);
    try {
      const ok = await updateMeetingTitle(meetingId, trimmed);
      if (ok) {
        setMeetings((prev) =>
          prev.map((m) => (m.id === meetingId ? { ...m, title: trimmed } : m))
        );
      }
    } catch (err) {
      console.warn('Could not save meeting title:', err);
    } finally {
      setIsSavingTitle(false);
      setEditingTitleId(null);
    }
  };

  const filteredMeetings = meetings.filter(
    (m) =>
      m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.summary?.overview || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.transcript || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatSeconds = (sec: number) => {
    if (!sec) return '—';
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m > 0 ? `${m}${t.vault.durationMin} ${s}${t.vault.durationSec}` : `${s}${t.vault.durationSec}`;
  };

  const totalPendingTasks = meetings.reduce((sum, m) => {
    return sum + (m.summary?.action_items || []).filter((t) => t.status !== 'completed').length;
  }, 0);

  return (
    <div className="page-container">
      {/* Search & Header */}
      <div className="glass-panel scroll-reveal" style={{ padding: '20px 24px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px' }}>
          <div>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-heading)' }}>
              {t.vault.title}
            </h2>
            <p style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
              {meetings.length} {language === 'zh' ? '场会议记录' : `meeting${meetings.length !== 1 ? 's' : ''}`}
              {totalPendingTasks > 0 && (
                <span style={{ color: 'var(--accent-primary)', fontWeight: 600 }}>
                  {' • '}{totalPendingTasks} {language === 'zh' ? '项未完成行动项' : `open task${totalPendingTasks !== 1 ? 's' : ''}`}
                </span>
              )}
            </p>
          </div>

          <div className="vault-controls">
            {/* Search box */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              background: 'var(--input-bg)',
              border: '1px solid var(--input-border)',
              padding: '8px 12px', borderRadius: '12px'
            }}>
              <Search size={15} color="var(--text-muted)" />
              <input
                id="vault-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.vault.searchPlaceholder}
                aria-label="Search meetings and summaries"
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  color: 'var(--text-primary)', fontSize: '13px', width: '220px'
                }}
              />
            </div>

            {/* Refresh button */}
            <button
              id="btn-refresh-vault"
              onClick={refreshMeetings}
              className="btn-secondary"
              style={{ padding: '8px 12px' }}
              title="Refresh from Supabase"
              aria-label="Refresh meeting vault"
            >
              <RefreshCw size={14} className={isLoading ? 'spin' : ''} />
            </button>
          </div>
        </div>
      </div>

      {/* Meeting Cards List */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '64px 20px', color: 'var(--text-muted)' }}>
          <RefreshCw size={24} className="spin" style={{ margin: '0 auto 16px', display: 'block', color: 'var(--accent-primary)' }} />
          <p style={{
            fontSize: '14px',
            fontStyle: 'italic',
            color: 'var(--text-secondary)',
            maxWidth: '540px',
            margin: '0 auto',
            lineHeight: 1.65,
            fontWeight: 500
          }}>
            {language === 'zh' ? loadingQuote.zh : loadingQuote.en}
          </p>
        </div>
      ) : filteredMeetings.length === 0 ? (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '60px 20px' }}>
          <Database size={36} color="#6366f1" style={{ margin: '0 auto 14px', display: 'block', opacity: 0.8 }} />
          <h3 style={{ fontSize: '17px', color: 'var(--text-primary)', marginBottom: '6px' }}>
            {searchQuery ? (language === 'zh' ? '未找到匹配的会议' : 'No Matching Meetings') : (language === 'zh' ? '档案库暂无会议' : 'No Saved Meetings Yet')}
          </h3>
          <p style={{ fontSize: '13px', color: 'var(--text-muted)', maxWidth: '420px', margin: '0 auto' }}>
            {searchQuery
              ? (language === 'zh' ? `未找到与“${searchQuery}”相关的会议，请尝试其他关键词。` : `No meetings match "${searchQuery}". Try a different search term.`)
              : t.vault.noMeetingsYet}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredMeetings.map((item, idx) => (
            <div
              key={item.id}
              className={`glass-panel scroll-reveal scroll-reveal-delay-${(idx % 4) + 1}`}
              style={{
                padding: '20px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px'
              }}
            >
              {/* Top Row: metadata + action buttons */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                <div
                  style={{ flex: 1, minWidth: '260px', cursor: 'pointer' }}
                  onClick={() => onSelectMeeting(item)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(item.date || item.created_at).toLocaleDateString(language === 'zh' ? 'zh-CN' : 'en-US', { dateStyle: 'medium' })}
                    </span>
                  </div>

                  {editingTitleId === item.id ? (
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="text"
                        value={editingTitleValue}
                        onChange={(e) => setEditingTitleValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTitle(e, item.id);
                          if (e.key === 'Escape') {
                            e.stopPropagation();
                            setEditingTitleId(null);
                          }
                        }}
                        autoFocus
                        disabled={isSavingTitle}
                        style={{
                          fontSize: '15px',
                          fontWeight: 600,
                          color: 'var(--text-primary)',
                          background: 'var(--input-bg)',
                          border: '1.5px solid var(--accent-primary)',
                          borderRadius: '8px',
                          padding: '4px 10px',
                          outline: 'none',
                          flex: 1,
                          maxWidth: '320px'
                        }}
                      />
                      <button
                        type="button"
                        onClick={(e) => handleSaveTitle(e, item.id)}
                        disabled={isSavingTitle}
                        className="btn-primary"
                        style={{ padding: '6px 10px', borderRadius: '7px' }}
                        title={t.summary.saveTitle}
                      >
                        <Check size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(null);
                        }}
                        disabled={isSavingTitle}
                        className="btn-secondary"
                        style={{ padding: '6px 10px', borderRadius: '7px' }}
                        title={t.summary.cancelEdit}
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px' }}>
                      <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
                        {item.title}
                      </h4>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTitleId(item.id);
                          setEditingTitleValue(item.title);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          padding: '3px 6px',
                          cursor: 'pointer',
                          color: 'var(--text-muted)',
                          borderRadius: '6px',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          transition: 'color 0.15s ease'
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--accent-primary)')}
                        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title={t.summary.editTitle}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  )}
                  <p style={{
                    fontSize: '13px', color: 'var(--text-secondary)',
                    overflow: 'hidden', display: '-webkit-box',
                    WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                  }}>
                    {item.summary?.overview || item.transcript?.slice(0, 200) || (language === 'zh' ? '暂无纪要概览' : 'No summary available.')}
                  </p>
                </div>

                {/* Right side stats + actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                  <div style={{ textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                    <div>{formatSeconds(item.duration_seconds || 0)}</div>
                    {(() => {
                      const uncheckedCount = (item.summary?.action_items || []).filter(
                        (t) => t.status !== 'completed'
                      ).length;
                      return (
                        <div style={{ color: uncheckedCount === 0 ? 'var(--text-muted)' : 'var(--accent-primary)' }}>
                          {uncheckedCount} {language === 'zh' ? '项待办' : (uncheckedCount === 1 ? 'task' : 'tasks')}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Gemini AI Chat Micro-Action */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      window.dispatchEvent(
                        new CustomEvent('meetwithai:open-chat', {
                          detail: { meetingId: item.id, meetingTitle: item.title }
                        })
                      );
                      onOpenChat?.(item);
                    }}
                    className="vault-action-btn-ai"
                    title={language === 'zh' ? `与 AI 对话关于“${item.title}”` : `Chat with AI about "${item.title}"`}
                    aria-label={t.vault.chatWithAi || 'Chat with AI'}
                  >
                    <GeminiStarIcon size={16} />
                  </button>

                  {/* Open button */}
                  <button
                    onClick={() => onSelectMeeting(item)}
                    style={{
                      width: '34px', height: '34px', borderRadius: '10px',
                      background: 'rgba(99, 102, 241, 0.12)',
                      border: '1px solid var(--glass-border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent-primary)', cursor: 'pointer', flexShrink: 0,
                      transition: 'all 0.15s ease'
                    }}
                    title="View full summary"
                  >
                    <ArrowRight size={16} />
                  </button>

                  {/* Delete button */}
                  <button
                    onClick={(e) => handleDelete(e, item)}
                    disabled={deletingId === item.id}
                    style={{
                      width: '34px', height: '34px', borderRadius: '10px',
                      background: 'rgba(244, 63, 94, 0.1)',
                      border: '1px solid rgba(244,63,94,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'var(--accent-rose)', cursor: deletingId === item.id ? 'not-allowed' : 'pointer',
                      flexShrink: 0, transition: 'all 0.15s ease',
                      opacity: deletingId === item.id ? 0.5 : 1
                    }}
                    title="Delete this meeting"
                  >
                    {deletingId === item.id
                      ? <RefreshCw size={14} className="spin" />
                      : <Trash2 size={14} />
                    }
                  </button>
                </div>
              </div>

              {/* Action Items Checklist on History Vault Card */}
              {(() => {
                const actionItems = item.summary?.action_items || [];
                if (actionItems.length === 0 && addingTaskId !== item.id) return null;

                const completedCount = actionItems.filter((t) => t.status === 'completed').length;
                const allDone = actionItems.length > 0 && completedCount === actionItems.length;

                return (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      padding: '12px 14px',
                      borderRadius: '10px',
                      background: allDone ? 'rgba(16, 185, 129, 0.05)' : 'rgba(99, 102, 241, 0.05)',
                      border: allDone ? '1px solid rgba(16, 185, 129, 0.25)' : '1px solid rgba(99, 102, 241, 0.2)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        fontSize: '12px',
                        fontWeight: 700,
                        color: allDone ? 'var(--accent-emerald)' : 'var(--accent-primary)',
                        textTransform: 'uppercase',
                        letterSpacing: '0.4px'
                      }}>
                        <ListTodo size={14} />
                        <span>
                          {language === 'zh' ? '行动待办' : 'Action Items'} ({completedCount}/{actionItems.length})
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() => setAddingTaskId(addingTaskId === item.id ? null : item.id)}
                        style={{
                          background: 'none',
                          border: 'none',
                          fontSize: '11.5px',
                          color: allDone ? 'var(--accent-emerald)' : 'var(--accent-primary)',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: 600,
                          padding: '2px 6px',
                          borderRadius: '4px'
                        }}
                      >
                        <Plus size={12} />
                        <span>{language === 'zh' ? '添加待办' : 'Add Task'}</span>
                      </button>
                    </div>

                    {/* Action Items List with Interactive Ticking Boxes */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {actionItems.map((actionItem, idx) => {
                        const isDone = actionItem.status === 'completed';
                        return (
                          <div
                            key={idx}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleActionItem(item.id, actionItem.task);
                            }}
                            role="checkbox"
                            aria-checked={isDone}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === ' ' || e.key === 'Enter') {
                                e.preventDefault();
                                e.stopPropagation();
                                toggleActionItem(item.id, actionItem.task);
                              }
                            }}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '10px',
                              padding: '8px 12px',
                              borderRadius: '8px',
                              background: isDone ? 'rgba(16, 185, 129, 0.08)' : 'var(--input-bg)',
                              border: isDone ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--glass-border)',
                              cursor: 'pointer',
                              transition: 'all 0.18s ease',
                              userSelect: 'none'
                            }}
                            onMouseEnter={(e) => {
                              if (!isDone) {
                                e.currentTarget.style.borderColor = 'var(--accent-primary)';
                                e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              if (!isDone) {
                                e.currentTarget.style.borderColor = 'var(--glass-border)';
                                e.currentTarget.style.background = 'var(--input-bg)';
                              }
                            }}
                            title={isDone ? (language === 'zh' ? '点击取消完成' : 'Click to uncheck') : (language === 'zh' ? '点击标记为完成' : 'Click to complete')}
                          >
                            {/* Interactive Ticking Box */}
                            <div
                              style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '5px',
                                border: isDone ? 'none' : '1.5px solid var(--text-muted)',
                                background: isDone ? 'var(--accent-emerald)' : 'var(--input-bg, #ffffff)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                flexShrink: 0,
                                boxShadow: isDone ? '0 2px 6px rgba(16, 185, 129, 0.35)' : 'none',
                                transition: 'all 0.15s ease'
                              }}
                            >
                              {isDone && <Check size={12} color="#ffffff" strokeWidth={3} />}
                            </div>

                            <span style={{
                              fontSize: '13px',
                              color: isDone ? 'var(--text-muted)' : 'var(--text-primary)',
                              textDecoration: isDone ? 'line-through' : 'none',
                              flex: 1,
                              lineHeight: 1.4,
                              transition: 'all 0.15s ease'
                            }}>
                              {actionItem.task}
                            </span>

                            {actionItem.assignee && actionItem.assignee !== 'Unassigned' && (
                              <span style={{
                                fontSize: '11px',
                                padding: '2px 6px',
                                borderRadius: '4px',
                                background: isDone ? 'rgba(100, 116, 139, 0.12)' : 'rgba(99, 102, 241, 0.12)',
                                color: isDone ? 'var(--text-muted)' : 'var(--accent-primary)',
                                flexShrink: 0,
                                fontWeight: 500
                              }}>
                                @{actionItem.assignee}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Inline Add Task Form */}
                    {addingTaskId === item.id && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                        <input
                          type="text"
                          value={newTaskText}
                          onChange={(e) => setNewTaskText(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleAddNewTask(item.id);
                            if (e.key === 'Escape') setAddingTaskId(null);
                          }}
                          placeholder={language === 'zh' ? '输入新的待办任务...' : 'New action item...'}
                          autoFocus
                          style={{
                            flex: 1,
                            padding: '6px 10px',
                            fontSize: '12.5px',
                            borderRadius: '6px',
                            background: 'var(--input-bg)',
                            border: '1px solid var(--accent-primary)',
                            color: 'var(--text-primary)',
                            outline: 'none'
                          }}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddNewTask(item.id)}
                          className="btn-primary"
                          style={{ padding: '4px 10px', fontSize: '12px', borderRadius: '6px' }}
                          title="Save action item"
                        >
                          <Check size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setAddingTaskId(null)}
                          className="btn-secondary"
                          style={{ padding: '4px 8px', fontSize: '12px', borderRadius: '6px' }}
                          title="Cancel"
                        >
                          <X size={13} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Audio Playback Row (only if recording was saved) */}
              {item.audio_url && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '10px',
                  padding: '10px 14px',
                  background: 'var(--glass-surface-subtle)',
                  borderRadius: '12px',
                  border: '1px solid var(--glass-border)'
                }}>
                  {playingId === item.id ? (
                    <Pause size={14} color="#a5b4fc" />
                  ) : (
                    <Play size={14} color="#a5b4fc" />
                  )}
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)', flexShrink: 0 }}>
                    Recording:
                  </span>
                  <audio
                    src={item.audio_url}
                    controls
                    onPlay={() => setPlayingId(item.id)}
                    onPause={() => setPlayingId(null)}
                    onEnded={() => setPlayingId(null)}
                    style={{ height: '28px', flex: 1, outline: 'none', minWidth: 0 }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
