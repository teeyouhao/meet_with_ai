import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, User, MessageSquare, Quote, X, Trash2 } from 'lucide-react';
import { chatWithAi, type ChatMessage } from '../services/memory';
import { useLanguage } from '../context/LanguageContext';

interface AiChatBoxProps {
  meetingId?: string;
  meetingTitle?: string;
}

export const AiChatBox: React.FC<AiChatBoxProps> = ({
  meetingId,
  meetingTitle
}) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Array<{ title: string; text: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
        meetingId ? '本次会议达成了哪些关键决议？' : '最近的会议讨论了哪些重点项目？',
        '有哪些待办行动项需要跟进？',
        '会议中有提到任何关键时间节点或风险吗？'
      ]
    : [
        meetingId ? 'What key decisions were reached?' : 'What are the main project updates across meetings?',
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
      const res = await chatWithAi(text, meetingId, messages);
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
      {/* ── Small Floating Chat Icon (FAB) ── */}
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
            <Bot size={22} />
            <Sparkles
              size={12}
              style={{
                position: 'absolute',
                top: -6,
                right: -6,
                color: '#facc15',
                filter: 'drop-shadow(0 0 4px rgba(250, 204, 21, 0.8))'
              }}
            />
          </div>
        )}
      </button>

      {/* ── Small Floating Chat Window (ChatGPT-style) ── */}
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
              background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.15) 0%, rgba(168, 85, 247, 0.12) 100%)',
              userSelect: 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '10px',
                  background: 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#fff',
                  flexShrink: 0,
                  boxShadow: '0 4px 12px var(--accent-primary-glow)'
                }}
              >
                <Bot size={18} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <h4 style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>
                    {language === 'zh' ? 'AI 助理 (ChatGPT)' : 'AI Executive Assistant'}
                  </h4>
                  <Sparkles size={12} color="var(--accent-purple)" />
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
                  title={meetingTitle || (language === 'zh' ? '全域向量记忆' : 'Semantic Memory')}
                >
                  {meetingTitle
                    ? (language === 'zh' ? `当前: ${meetingTitle}` : `Context: ${meetingTitle}`)
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
                    background: 'rgba(99, 102, 241, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    margin: '0 auto 10px',
                    color: 'var(--accent-primary)'
                  }}
                >
                  <MessageSquare size={20} />
                </div>
                <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 4px' }}>
                  {language === 'zh' ? '有什么可以帮您的？' : 'How can I assist you?'}
                </p>
                <p style={{ fontSize: '11.5px', lineHeight: 1.45, margin: 0 }}>
                  {meetingTitle
                    ? (language === 'zh' ? `您可以随时询问针对本场会议「${meetingTitle}」的具体细节、行动项或决议。` : `Ask about any decisions, deadlines, or discussions from "${meetingTitle}".`)
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
                        background: 'rgba(99, 102, 241, 0.2)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                        marginTop: '2px'
                      }}
                    >
                      <Bot size={13} color="var(--accent-primary)" />
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

            {/* ── ChatGPT-style Shimmering Loading Animation ── */}
            {isLoading && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  alignSelf: 'flex-start',
                  width: '85%'
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    background: 'rgba(99, 102, 241, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '2px'
                  }}
                >
                  <Bot size={13} color="var(--accent-primary)" />
                </div>

                <div
                  style={{
                    flex: 1,
                    padding: '12px 14px',
                    borderRadius: '14px 14px 14px 3px',
                    background: 'var(--glass-surface-subtle)',
                    border: '1px solid var(--glass-border)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '9px'
                  }}
                >
                  {/* Shimmer header text */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Sparkles size={12} color="var(--accent-purple)" />
                    <span className="chatgpt-shimmer-text" style={{ fontSize: '11.5px' }}>
                      {language === 'zh'
                        ? 'AI 正在检索向量记忆并深度推理…'
                        : 'Searching vector memory & reasoning…'}
                    </span>
                    <span
                      style={{
                        fontSize: '10px',
                        color: 'var(--accent-primary)',
                        animation: 'chatgpt-pulse-dot 1s infinite'
                      }}
                    >
                      ●
                    </span>
                  </div>

                  {/* 3 ChatGPT Shimmer Skeleton Waves */}
                  <div className="chatgpt-shimmer-line" style={{ width: '85%' }} />
                  <div className="chatgpt-shimmer-line" style={{ width: '100%' }} />
                  <div className="chatgpt-shimmer-line" style={{ width: '58%' }} />
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
                  meetingTitle
                    ? (language === 'zh' ? `问问关于「${meetingTitle}」…` : `Ask about "${meetingTitle}"…`)
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
