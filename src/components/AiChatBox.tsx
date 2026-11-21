import React, { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, User, Quote, X, Trash2 } from 'lucide-react';
import { chatWithAi, type ChatMessage } from '../services/memory';
import { useLanguage } from '../context/LanguageContext';

export const GeminiStarIcon: React.FC<{ size?: number; className?: string; style?: React.CSSProperties }> = ({
  size = 16,
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

interface AiChatBoxProps {
  meetingId?: string;
  meetingTitle?: string;
}

export const AiChatBox: React.FC<AiChatBoxProps> = ({
  meetingId: initialMeetingId,
  meetingTitle: initialMeetingTitle
}) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [activeMeetingId, setActiveMeetingId] = useState<string | undefined>(initialMeetingId);
  const [activeMeetingTitle, setActiveMeetingTitle] = useState<string | undefined>(initialMeetingTitle);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Array<{ title: string; text: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync props to internal state when valid
  useEffect(() => {
    if (initialMeetingId) {
      setActiveMeetingId(initialMeetingId);
      setActiveMeetingTitle(initialMeetingTitle);
    }
  }, [initialMeetingId, initialMeetingTitle]);

  // Support opening via custom event from any item card in MeetingHistory
  useEffect(() => {
    const handleOpenChat = (e: Event) => {
      const detail = (e as CustomEvent<{ meetingId?: string; meetingTitle?: string }>).detail;
      if (detail) {
        if (detail.meetingId) setActiveMeetingId(detail.meetingId);
        if (detail.meetingTitle) setActiveMeetingTitle(detail.meetingTitle);
      }
      setIsOpen(true);
    };

    window.addEventListener('meetwithai:open-chat', handleOpenChat);
    return () => {
      window.removeEventListener('meetwithai:open-chat', handleOpenChat);
    };
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [messages, isOpen, isLoading]);

  const quickPrompts = language === 'zh'
    ? [
        activeMeetingId ? '本次会议达成了哪些关键决议？' : '最近的会议讨论了哪些重点项目？',
        '有哪些待办行动项需要跟进？',
        '会议中有提到任何关键时间节点或风险吗？'
      ]
    : [
        activeMeetingId ? 'What key decisions were reached?' : 'What are the main project updates across meetings?',
        'What action items require follow-up?',
        'Were any deadlines or risks highlighted?'
      ];

  const handleSend = async (textToSend?: string) => {
    const text = (textToSend || input).trim();
    if (!text || isLoading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await chatWithAi(text, activeMeetingId, messages);
      const assistantMsg: ChatMessage = { role: 'assistant', content: res.reply };
      setMessages(prev => [...prev, assistantMsg]);
      if (res.citations && res.citations.length > 0) {
        setCitations(res.citations);
      }
    } catch {
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: language === 'zh'
            ? '抱歉，AI 响应出错，请稍后重试。'
            : 'Sorry, failed to generate an AI response. Please try again.'
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setCitations([]);
  };

  return (
    <>
      {/* ── Small Floating Chat Icon (FAB) with Gemini Star ── */}
      <button
        type="button"
        className="floating-chat-fab"
        onClick={() => setIsOpen(!isOpen)}
        aria-label={isOpen ? 'Close AI Chat' : 'Open AI Chat'}
        title={language === 'zh' ? '打开 AI 智能问答' : 'Open AI Executive Chat'}
      >
        {isOpen ? (
          <X size={22} />
        ) : (
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <GeminiStarIcon size={22} style={{ color: '#ffffff', filter: 'drop-shadow(0 0 6px rgba(255, 255, 255, 0.6))' }} />
            <Sparkles
              size={11}
              style={{
                position: 'absolute',
                top: -5,
                right: -6,
                color: '#facc15',
                filter: 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.8))'
              }}
            />
          </div>
        )}
      </button>

      {/* ── Small Floating Chat Window (Gemini Copilot style) ── */}
      {isOpen && (
        <div className="floating-chat-popup">
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              borderBottom: '1px solid var(--glass-border)',
              background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.15) 0%, rgba(155, 114, 203, 0.14) 50%, rgba(217, 101, 112, 0.12) 100%)',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, #4285f4 0%, #9b72cb 50%, #d96570 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  boxShadow: '0 4px 14px rgba(66, 133, 244, 0.4)'
                }}
              >
                <GeminiStarIcon size={18} style={{ animation: 'gemini-sparkle-spin 8s linear infinite' }} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {language === 'zh' ? 'AI 助理 (Gemini)' : 'AI Executive Assistant'}
                  </h4>
                  <Sparkles size={12} color="#9b72cb" />
                </div>
                <div
                  style={{
                    fontSize: '11px',
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    maxWidth: '220px'
                  }}
                  title={activeMeetingTitle || (language === 'zh' ? '全域向量记忆' : 'Semantic Memory')}
                >
                  {activeMeetingTitle
                    ? (language === 'zh' ? `当前会议: ${activeMeetingTitle}` : `Context: ${activeMeetingTitle}`)
                    : (language === 'zh' ? '基于全部会议向量记忆' : 'Cross-meeting vector memory')}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={clearChat}
                  title={language === 'zh' ? '清空对话' : 'Clear Chat'}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    padding: '6px',
                    borderRadius: '8px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <Trash2 size={15} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                title={language === 'zh' ? '关闭' : 'Close'}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center'
                }}
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Messages Body */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '14px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px'
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 8px 12px', color: 'var(--text-muted)' }}>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.15) 0%, rgba(155, 114, 203, 0.2) 100%)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    color: '#818cf8',
                    border: '1px solid rgba(155, 114, 203, 0.3)'
                  }}
                >
                  <GeminiStarIcon size={22} style={{ color: '#818cf8' }} />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {language === 'zh' ? '有什么可以帮您的？' : 'How can I assist you?'}
                </p>
                <p style={{ fontSize: '11.5px', lineHeight: 1.45, margin: 0 }}>
                  {activeMeetingTitle
                    ? (language === 'zh' ? `您可以随时询问针对本场会议「${activeMeetingTitle}」的具体细节、行动项或决议。` : `Ask about any decisions, deadlines, or discussions from "${activeMeetingTitle}".`)
                    : (language === 'zh' ? '我可以跨时段检索您所有会议的向量语义记忆，回答历史决策与待办。' : 'I can search cross-meeting semantic memory to surface decisions and tasks.')}
                </p>

                {/* Quick Prompts */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '16px' }}>
                  {quickPrompts.map((prompt, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => handleSend(prompt)}
                      disabled={isLoading}
                      style={{
                        fontSize: '11.5px',
                        padding: '7px 10px',
                        borderRadius: '10px',
                        background: 'var(--glass-surface-subtle)',
                        border: '1px solid var(--glass-border)',
                        color: 'var(--text-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'all 0.15s ease'
                      }}
                    >
                      💡 {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '88%'
                  }}
                >
                  {!isUser && (
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.2) 0%, rgba(155, 114, 203, 0.25) 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                        border: '1px solid rgba(155, 114, 203, 0.3)'
                      }}
                    >
                      <GeminiStarIcon size={13} style={{ color: '#818cf8' }} />
                    </div>
                  )}

                  <div
                    style={{
                      padding: '9px 13px',
                      borderRadius: isUser ? '14px 14px 3px 14px' : '14px 14px 14px 3px',
                      background: isUser
                        ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)'
                        : 'var(--glass-surface-subtle)',
                      border: isUser ? 'none' : '1px solid var(--glass-border)',
                      color: isUser ? '#ffffff' : 'var(--text-primary)',
                      fontSize: '12.5px',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      boxShadow: isUser ? '0 4px 12px var(--accent-primary-glow)' : 'none'
                    }}
                  >
                    {msg.content}
                  </div>

                  {isUser && (
                    <div
                      style={{
                        width: '24px',
                        height: '24px',
                        borderRadius: '50%',
                        background: 'var(--accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px',
                        color: '#fff'
                      }}
                    >
                      <User size={13} />
                    </div>
                  )}
                </div>
              );
            })}

            {/* ── Google Gemini-style Shimmering Loading Animation ── */}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  alignSelf: 'flex-start',
                  width: '90%'
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'linear-gradient(135deg, rgba(66, 133, 244, 0.25) 0%, rgba(155, 114, 203, 0.3) 100%)',
                    border: '1px solid rgba(155, 114, 203, 0.35)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <GeminiStarIcon
                    size={13}
                    style={{
                      animation: 'gemini-sparkle-spin 2s linear infinite',
                      color: '#9b72cb'
                    }}
                  />
                </div>

                <div className="gemini-shimmer-container" style={{ flex: 1 }}>
                  {/* Shimmer header text with holographic gradient */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <GeminiStarIcon
                      size={12}
                      style={{
                        animation: 'gemini-sparkle-spin 2.2s linear infinite',
                        color: '#4285f4'
                      }}
                    />
                    <span className="gemini-gradient-text" style={{ fontSize: '11.5px' }}>
                      {language === 'zh'
                        ? 'Gemini 正在分析会议记忆并深度思考…'
                        : 'Gemini is analyzing meeting memory & generating insights…'}
                    </span>
                  </div>

                  {/* 3 Gemini Holographic Shimmer Skeleton Waves */}
                  <div className="gemini-shimmer-bar" style={{ width: '88%' }} />
                  <div className="gemini-shimmer-bar" style={{ width: '100%', animationDelay: '0.2s' }} />
                  <div className="gemini-shimmer-bar" style={{ width: '62%', animationDelay: '0.4s' }} />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Context References Citations */}
          {citations.length > 0 && (
            <div
              style={{
                padding: '6px 14px',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                flexWrap: 'wrap',
                background: 'rgba(0, 0, 0, 0.12)'
              }}
            >
              <Quote size={11} color="var(--accent-primary)" />
              <span style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                {language === 'zh' ? '引用来源:' : 'Sources:'}
              </span>
              {citations.slice(0, 2).map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '10px',
                    padding: '1px 7px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.14)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    maxWidth: '120px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap'
                  }}
                  title={c.text}
                >
                  {c.title}
                </span>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <div
            style={{
              padding: '10px 12px',
              borderTop: '1px solid var(--glass-border)',
              background: 'rgba(0, 0, 0, 0.18)'
            }}
          >
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSend();
              }}
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={
                  activeMeetingTitle
                    ? (language === 'zh' ? `问问关于「${activeMeetingTitle}」…` : `Ask about "${activeMeetingTitle}"…`)
                    : (language === 'zh' ? '输入问题或检索记忆…' : 'Ask about past meetings…')
                }
                disabled={isLoading}
                className="search-input"
                style={{
                  flex: 1,
                  height: '36px',
                  borderRadius: '12px',
                  padding: '0 12px',
                  fontSize: '12.5px',
                  background: 'var(--input-bg)'
                }}
              />
              <button
                type="submit"
                disabled={isLoading || !input.trim()}
                className="btn-primary"
                style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '12px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
                title="Send"
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
