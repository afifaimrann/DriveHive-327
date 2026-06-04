import React, { useState, useEffect, useRef } from 'react';
import api from '../services/api.js';
import Layout from '../components/Layout.jsx';
import Toast from '../components/Toast.jsx';
import { Send, Settings, Brain, Loader2, Sparkles, Info, FileText, ChevronDown, ChevronUp, Trash2 } from 'lucide-react';

/**
 * Strip common markdown formatting so LLM responses render as clean plain text.
 */
function stripMarkdown(text) {
  if (!text) return '';
  return text
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```\w*\n?/g, '').replace(/```/g, '').trim()) // code blocks → plain
    .replace(/`([^`]+)`/g, '$1')          // inline code
    .replace(/\*\*\*(.+?)\*\*\*/g, '$1')  // bold-italic
    .replace(/\*\*(.+?)\*\*/g, '$1')      // bold
    .replace(/\*(.+?)\*/g, '$1')          // italic
    .replace(/__(.+?)__/g, '$1')          // bold alt
    .replace(/_(.+?)_/g, '$1')            // italic alt
    .replace(/~~(.+?)~~/g, '$1')          // strikethrough
    .replace(/^#{1,6}\s+/gm, '')          // headings
    .replace(/^[\-\*]\s+/gm, '• ')        // unordered lists → bullet
    .replace(/^\d+\.\s+/gm, '')           // ordered list numbers
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links → text only
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1') // images → alt text
    .replace(/^>\s?/gm, '')               // blockquotes
    .replace(/---+/g, '')                 // horizontal rules
    .replace(/\n{3,}/g, '\n\n')           // collapse excessive newlines
    .trim();
}

export default function RagChat() {
  // Config state
  const [llmProvider, setLlmProvider] = useState('gemini');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [llmModelName, setLlmModelName] = useState('gemini-1.5-flash');
  const [embeddingProvider, setEmbeddingProvider] = useState('local');
  const [embeddingModelName, setEmbeddingModelName] = useState('all-MiniLM-L6-v2');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [savingConfig, setSavingConfig] = useState(false);
  const [configCollapsed, setConfigCollapsed] = useState(true);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);

  // Chat state
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'Hello! I am DriveHive AI. Ask me any question about your uploaded documents, and I\'ll search through their content to give you an answer.',
      sources: []
    }
  ]);
  const [input, setInput] = useState('');
  const [querying, setQuerying] = useState(false);
  const [toast, setToast] = useState(null);

  const messagesEndRef = useRef(null);

  // Load configuration on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await api.getRagSettings();
        setLlmProvider(settings.llmProvider);
        setLlmEndpoint(settings.llmEndpoint);
        setLlmModelName(settings.llmModelName);
        setEmbeddingProvider(settings.embeddingProvider);
        setEmbeddingModelName(settings.embeddingModelName);
        setHasApiKey(settings.hasApiKey);
        if (settings.hasApiKey) {
          setLlmApiKey('••••••••');
        }
      } catch (err) {
        console.error('Failed to load RAG settings', err);
      }
    };
    loadSettings();
  }, []);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, querying]);

  // Handle provider changes to fill in sensible defaults
  const handleProviderChange = (provider) => {
    setLlmProvider(provider);
    setLlmApiKey('');
    setHasApiKey(false);

    if (provider === 'gemini') {
      setLlmEndpoint('');
      setLlmModelName('gemini-1.5-flash');
      setEmbeddingProvider('local');
      setEmbeddingModelName('all-MiniLM-L6-v2');
    } else if (provider === 'openai') {
      setLlmEndpoint('');
      setLlmModelName('gpt-4o-mini');
      setEmbeddingProvider('openai');
      setEmbeddingModelName('text-embedding-3-small');
    } else if (provider === 'openrouter') {
      setLlmEndpoint('https://openrouter.ai/api/v1');
      setLlmModelName('google/gemma-2-9b-it:free');
      setEmbeddingProvider('local');
      setEmbeddingModelName('all-MiniLM-L6-v2');
    } else if (provider === 'ollama') {
      setLlmEndpoint('http://localhost:11434/v1');
      setLlmModelName('llama3');
      setEmbeddingProvider('local');
      setEmbeddingModelName('all-MiniLM-L6-v2');
    } else if (provider === 'custom') {
      setLlmEndpoint('');
      setLlmModelName('');
      setEmbeddingProvider('local');
      setEmbeddingModelName('all-MiniLM-L6-v2');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await api.updateRagSettings({
        llmProvider,
        llmApiKey: llmApiKey === '••••••••' ? '••••••••' : llmApiKey,
        llmEndpoint: llmEndpoint || null,
        llmModelName,
        embeddingProvider,
        embeddingModelName,
      });
      setToast({ message: 'RAG settings updated successfully!', type: 'success' });
      if (llmApiKey && llmApiKey !== '••••••••') {
        setHasApiKey(true);
        setLlmApiKey('••••••••');
      }
    } catch (err) {
      setToast({ message: err.message || 'Failed to update RAG settings', type: 'error' });
    } finally {
      setSavingConfig(false);
    }
  };

  const handleSend = async (e) => {
    e.preventDefault();
    const query = input.trim();
    if (!query || querying) return;

    // Add user message
    const userMessageId = Date.now().toString();
    setMessages((prev) => [
      ...prev,
      { id: userMessageId, role: 'user', content: query }
    ]);
    setInput('');
    setQuerying(true);

    try {
      const response = await api.queryRag(query);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.answer,
          sources: response.sources || []
        }
      ]);
    } catch (err) {
      setToast({ message: err.message || 'Query failed', type: 'error' });
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `Error: ${err.message || 'An error occurred while calling the LLM. Please double check your settings.'}`,
          sources: []
        }
      ]);
    } finally {
      setQuerying(false);
    }
  };

  const handleClearChat = () => {
    setMessages([messages[0]]);
  };

  return (
    <Layout title="RAG Document Chat">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', height: 'calc(100vh - 140px)' }} className="animate-fade-in">

        {/* Top Row: Collapsible Configuration Panel */}
        <div className="card glass" style={{ padding: 0, overflow: 'hidden', flexShrink: 0 }}>
          {/* Collapse Header */}
          <button
            onClick={() => setConfigCollapsed(!configCollapsed)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              padding: '16px 24px',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-primary)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #d946ef 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Settings size={20} color="white" />
              </div>
              <div style={{ textAlign: 'left' }}>
                <h3 style={{ fontSize: '1rem', margin: 0, fontFamily: 'Outfit' }}>LLM Configuration</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  {llmProvider === 'gemini' ? 'Google Gemini' : llmProvider === 'openai' ? 'OpenAI' : llmProvider === 'openrouter' ? 'OpenRouter' : llmProvider === 'ollama' ? 'Ollama' : 'Custom'} · {llmModelName}
                  {llmProvider !== 'ollama' && (
                    hasApiKey
                      ? <span style={{ color: 'var(--color-success)', marginLeft: '8px' }}>● Key saved</span>
                      : <span style={{ color: 'var(--color-danger)', marginLeft: '8px' }}>● No key provided</span>
                  )}
                </p>
              </div>
            </div>
            {configCollapsed ? <ChevronDown size={20} color="var(--text-muted)" /> : <ChevronUp size={20} color="var(--text-muted)" />}
          </button>

          {/* Collapsible Body */}
          <div style={{
            maxHeight: configCollapsed ? '0px' : '600px',
            overflow: 'hidden',
            transition: 'max-height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
          }}>
            <form onSubmit={handleSaveSettings} style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
              gap: '16px',
              padding: '0 24px 20px 24px',
              borderTop: '1px solid var(--border-color)',
              paddingTop: '20px',
            }}>
              {/* LLM Provider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>LLM Provider</label>
                <select
                  value={llmProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                >
                  <option value="gemini">Google Gemini (Recommended)</option>
                  <option value="openrouter">OpenRouter (Free Models)</option>
                  <option value="openai">OpenAI (GPT Models)</option>
                  <option value="ollama">Ollama (Local LLM)</option>
                  <option value="custom">Custom OpenAI Compatible</option>
                </select>
              </div>

              {/* Model Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>Model ID / Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. gemini-1.5-flash"
                  value={llmModelName}
                  onChange={(e) => setLlmModelName(e.target.value)}
                />
              </div>

              {/* API Key */}
              {llmProvider !== 'ollama' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label>
                    API Key
                    {hasApiKey && <span style={{ color: 'var(--color-success)', fontSize: '0.7rem', marginLeft: '6px', textTransform: 'none' }}>(Saved)</span>}
                  </label>
                  <input
                    type="password"
                    placeholder="Enter LLM API token"
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                  />
                </div>
              )}

              {/* API Endpoint (conditional) */}
              {(llmProvider === 'openrouter' || llmProvider === 'ollama' || llmProvider === 'custom') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label>API Endpoint URL</label>
                  <input
                    type="text"
                    required
                    placeholder={llmProvider === 'ollama' ? 'http://localhost:11434/v1' : 'https://api.provider.com/v1'}
                    value={llmEndpoint}
                    onChange={(e) => setLlmEndpoint(e.target.value)}
                  />
                </div>
              )}

              {/* Embedding Provider */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>Embedding Provider</label>
                <select
                  value={embeddingProvider}
                  onChange={(e) => {
                    setEmbeddingProvider(e.target.value);
                    if (e.target.value === 'local') setEmbeddingModelName('all-MiniLM-L6-v2');
                    else if (e.target.value === 'gemini') setEmbeddingModelName('text-embedding-004');
                    else if (e.target.value === 'openai') setEmbeddingModelName('text-embedding-3-small');
                  }}
                >
                  <option value="local">Local Embeddings (Free)</option>
                  <option value="gemini">Gemini Embeddings</option>
                  <option value="openai">OpenAI Embeddings</option>
                </select>
              </div>

              {/* Embedding Model ID */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <label>Embedding Model ID</label>
                <input
                  type="text"
                  required
                  readOnly={embeddingProvider === 'local'}
                  value={embeddingModelName}
                  onChange={(e) => setEmbeddingModelName(e.target.value)}
                  style={embeddingProvider === 'local' ? { opacity: 0.6 } : {}}
                />
              </div>

              {/* Save Button - takes full row */}
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button
                  type="submit"
                  disabled={savingConfig}
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                >
                  {savingConfig ? (
                    <>
                      <Loader2 size={16} className="spin-animation" />
                      Saving...
                    </>
                  ) : (
                    'Save Configuration'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="card glass" style={{
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          overflow: 'hidden',
          minHeight: 0,
        }}>
          {/* Chat Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <Brain size={20} color="white" />
              </div>
              <div>
                <h3 style={{ fontSize: '1rem', margin: 0, fontFamily: 'Outfit' }}>DriveHive AI Copilot</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
                  Retrieval Augmented Generation over your files
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              {messages.length > 1 && (
                <button
                  onClick={handleClearChat}
                  className="btn btn-secondary"
                  style={{ padding: '6px 12px', fontSize: '0.8rem' }}
                >
                  <Trash2 size={14} />
                  Clear
                </button>
              )}
              {/* Info hover tooltip */}
              <div
                style={{ position: 'relative' }}
                onMouseEnter={() => setShowInfoTooltip(true)}
                onMouseLeave={() => setShowInfoTooltip(false)}
              >
                <button
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: '1px solid var(--border-color)',
                    background: 'rgba(15, 23, 42, 0.5)',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'var(--transition-fast)',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-accent)'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-muted)'; }}
                >
                  <Info size={16} />
                </button>
                {showInfoTooltip && (
                  <div style={{
                    position: 'absolute',
                    top: '40px',
                    right: 0,
                    width: '320px',
                    padding: '16px 18px',
                    background: 'rgba(15, 23, 42, 0.92)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    boxShadow: 'var(--shadow-lg)',
                    zIndex: 100,
                    animation: 'fadeIn 0.2s ease forwards',
                  }}>
                    <h4 style={{ margin: '0 0 8px 0', fontWeight: 600, fontSize: '0.88rem', fontFamily: 'Outfit', color: 'var(--text-primary)' }}>
                      How does this work?
                    </h4>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                      Documents (PDF, DOCX, TXT) are automatically chunked and embedded when uploaded. Use the <strong style={{ color: 'var(--text-primary)' }}>File Browser</strong> to manually index existing files. The AI retrieves relevant chunks and generates answers using your configured LLM.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
          }}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  gap: '6px',
                  maxWidth: '80%',
                  alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                }}
              >
                {/* Role label */}
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: msg.role === 'user' ? 'var(--color-primary)' : 'var(--color-accent)',
                  padding: '0 4px',
                }}>
                  {msg.role === 'user' ? 'You' : 'AI'}
                </span>

                {/* Bubble */}
                <div style={{
                  padding: '14px 18px',
                  borderRadius: msg.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                  fontSize: '0.9rem',
                  lineHeight: 1.65,
                  whiteSpace: 'pre-wrap',
                  ...(msg.role === 'user'
                    ? {
                        background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-accent) 100%)',
                        color: 'white',
                        boxShadow: '0 4px 12px rgba(59, 130, 246, 0.2)',
                      }
                    : {
                        background: 'rgba(15, 23, 42, 0.5)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                      }
                  ),
                }}>
                  {msg.role === 'assistant' ? stripMarkdown(msg.content) : msg.content}
                </div>

                {/* Citation Sources */}
                {msg.role === 'assistant' && msg.sources && msg.sources.length > 0 && (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '6px',
                    alignItems: 'center',
                    padding: '0 4px',
                  }}>
                    <span style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}>
                      <FileText size={12} /> Sources:
                    </span>
                    {msg.sources.map((src, i) => (
                      <span
                        key={i}
                        title={src.filename}
                        style={{
                          fontSize: '0.7rem',
                          background: 'rgba(139, 92, 246, 0.1)',
                          border: '1px solid rgba(139, 92, 246, 0.25)',
                          color: '#a78bfa',
                          padding: '2px 10px',
                          borderRadius: '9999px',
                          maxWidth: '160px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          fontWeight: 500,
                        }}
                      >
                        {src.filename}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {querying && (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                gap: '6px',
                maxWidth: '80%',
              }}>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--color-accent)',
                  padding: '0 4px',
                }}>
                  AI
                </span>
                <div style={{
                  padding: '14px 18px',
                  borderRadius: '14px 14px 14px 4px',
                  background: 'rgba(15, 23, 42, 0.5)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  fontSize: '0.9rem',
                }}>
                  <Sparkles size={16} color="#8b5cf6" className="pulse-animation" />
                  Searching your documents...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSend} style={{
            display: 'flex',
            gap: '12px',
            padding: '16px 24px',
            borderTop: '1px solid var(--border-color)',
            background: 'rgba(11, 15, 25, 0.5)',
          }}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your uploaded documents..."
              disabled={querying}
              style={{
                flex: 1,
                borderRadius: 'var(--radius-md)',
              }}
            />
            <button
              type="submit"
              disabled={!input.trim() || querying}
              className="btn btn-primary"
              style={{
                padding: '12px 16px',
                flexShrink: 0,
              }}
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 1; }
        }
        .pulse-animation {
          animation: pulse-glow 1.5s ease-in-out infinite;
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </Layout>
  );
}
