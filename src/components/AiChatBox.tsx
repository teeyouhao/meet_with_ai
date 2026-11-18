import React, { useState, useRef, useEffect } from 'react';
import { Bot, Send, Sparkles, Loader2, User, ChevronDown, ChevronUp, MessageSquare, Quote } from 'lucide-react';
import { chatWithAi, type ChatMessage } from '../services/memory';
import { useLanguage } from '../context/LanguageContext';

interface AiChatBoxProps {
  meetingId?: string;
  meetingTitle?: string;
  defaultExpanded?: boolean;
}

export const AiChatBox: React.FC<AiChatBoxProps> = ({
  meetingId,
  meetingTitle,
  defaultExpanded = true
}) => {
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(defaultExpanded);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [citations, setCitations] = useState<Array<{ title: string; text: string }>>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const quickPrompts = language === 'zh'
    ? [
        meetingId ? '本次会议达成了哪些关键决议？' : '最近的会议讨论了哪些重点项目？',
        '有哪些待办行动项需要跟进？',
        '会议中有提到任何时间节点或风险吗？'
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
        { role: 'assistant', content: language === 'zh' ? '抱歉，AI 响应出错，请稍后重试。' : 'Sorry, failed to generate an AI response. Please try again.' }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="glass-panel"
      style={{
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid rgba(99, 102, 241, 0.25)',
        boxShadow: '0 8px 32px rgba(99, 102, 241, 0.08)',
        marginBottom: '24px'
      }}
    >
      {/* Header bar */}
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.12) 0%, rgba(168, 85, 247, 0.12) 100%)',
          cursor: 'pointer',
          userSelect: 'none'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            background: 'var(--accent-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff'
          }}>
            <Bot size={16} />
          </div>
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
              {language === 'zh' ? 'AI 交互智能问答 (Chatbox)' : 'AI Executive Chatbox'}
              <Sparkles size={13} color="var(--accent-purple)" />
            </h3>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              {meetingId
                ? (language === 'zh' ? `针对当前会议「${meetingTitle || '会议记录'}」即时问答` : `Q&A on "${meetingTitle || 'Meeting'}"`)
                : (language === 'zh' ? '基于全部会议的深度语义向量记忆库跨时段问答' : 'Cross-meeting intelligence powered by Vector Memory')}
            </span>
          </div>
        </div>

        <button
          type="button"
          aria-label="Toggle chat"
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '4px' }}
        >
          {isOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
        </button>
      </div>

      {/* Expandable Chat Body */}
      {isOpen && (
        <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {/* Messages list */}
          <div
            style={{
              maxHeight: '320px',
              minHeight: messages.length === 0 ? '60px' : '160px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              paddingRight: '6px'
            }}
          >
            {messages.length === 0 && (
              <div style={{ textAlign: 'center', padding: '18px 12px', color: 'var(--text-muted)', fontSize: '13px' }}>
                <MessageSquare size={24} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                {language === 'zh'
                  ? '您可以直接向 AI 提问任何关于会议内容、决议背景或待办安排的问题。'
                  : 'Ask AI anything about the discussion, context, decisions, or follow-ups.'}
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
                    gap: '10px',
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                    maxWidth: '85%'
                  }}
                >
                  {!isUser && (
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'rgba(99, 102, 241, 0.2)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      <Bot size={14} color="var(--accent-primary)" />
                    </div>
                  )}

                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: isUser ? '14px 14px 2px 14px' : '14px 14px 14px 2px',
                      background: isUser
                        ? 'linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-purple) 100%)'
                        : 'var(--glass-surface-subtle)',
                      border: isUser ? 'none' : '1px solid var(--glass-border)',
                      color: isUser ? '#ffffff' : 'var(--text-primary)',
                      fontSize: '13px',
                      lineHeight: 1.55,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word'
                    }}
                  >
                    {msg.content}
                  </div>

                  {isUser && (
                    <div style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--accent-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      marginTop: '2px',
                      color: '#fff'
                    }}>
                      <User size={14} />
                    </div>
                  )}
                </div>
              );
            })}

            {isLoading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-muted)', fontSize: '12px' }}>
                <Loader2 size={14} className="spin" />
                <span>{language === 'zh' ? 'AI 正在分析思考并生成回答…' : 'AI is synthesizing an answer…'}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Citation Pills */}
          {citations.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', paddingTop: '4px' }}>
              <Quote size={12} color="var(--accent-primary)" />
              <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                {language === 'zh' ? '引用上下文:' : 'Context References:'}
              </span>
              {citations.slice(0, 3).map((c, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: '10.5px',
                    padding: '2px 8px',
                    borderRadius: '10px',
                    background: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--accent-primary)',
                    border: '1px solid rgba(99, 102, 241, 0.25)'
                  }}
                  title={c.text}
                >
                  {c.title}
                </span>
              ))}
            </div>
          )}

          {/* Quick Prompts */}
          {messages.length === 0 && (
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSend(prompt)}
                  disabled={isLoading}
                  style={{
                    fontSize: '11.5px',
                    padding: '5px 10px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.04)',
                    border: '1px solid var(--glass-border)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s ease'
                  }}
                >
                  {prompt}
                </button>
              ))}
            </div>
          )}

          {/* Input Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={language === 'zh' ? '输入问题与 AI 对话…' : 'Type a question to ask AI…'}
              disabled={isLoading}
              className="search-input"
              style={{
                flex: 1,
                height: '38px',
                borderRadius: '10px',
                padding: '0 12px',
                fontSize: '13px'
              }}
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="btn-primary"
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '10px',
                padding: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0
              }}
              title="Send"
            >
              {isLoading ? <Loader2 size={16} className="spin" /> : <Send size={15} />}
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
