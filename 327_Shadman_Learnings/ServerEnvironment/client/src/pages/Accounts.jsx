import React, { useEffect, useState } from 'react';
import api from '../services/api.js';
import Layout from '../components/Layout.jsx';
import Toast from '../components/Toast.jsx';
import { Plus, Trash2, Link2, AlertCircle } from 'lucide-react';

/**
 * Account management page allowing users to connect Google Drive / Dropbox accounts,
 * view active nodes, and revoke integrations.
 */
export function Accounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null); // 'google' or 'dropbox' or null
  const [toast, setToast] = useState(null);

  const fetchAccounts = async () => {
    try {
      const data = await api.get('/oauth/accounts');
      setAccounts(data.accounts || []);
    } catch (err) {
      setToast({ message: err.message || 'Failed to load connected accounts', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const handleConnect = async (provider) => {
    setConnecting(provider);
    try {
      const { authUrl } = await api.get(`/oauth/connect/${provider}`);
      
      // Open authorization flow in a popup window
      const width = 600;
      const height = 700;
      const left = window.screen.width / 2 - width / 2;
      const top = window.screen.height / 2 - height / 2;
      
      const popup = window.open(
        authUrl,
        `Connect to ${provider}`,
        `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,scrollbars=yes`
      );

      // Check if popup closed every 1 second, then reload accounts
      const checkPopup = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(checkPopup);
          setConnecting(null);
          fetchAccounts();
          setToast({ message: `Reloaded accounts. Checking connection status...`, type: 'success' });
        }
      }, 1000);

    } catch (err) {
      setToast({ message: err.message || 'Could not initiate connection', type: 'error' });
      setConnecting(null);
    }
  };

  const handleDisconnect = async (accountId, email, provider) => {
    if (!window.confirm(`Are you sure you want to disconnect ${provider} account (${email})? Any file chunks stored here will be inaccessible!`)) {
      return;
    }

    try {
      await api.delete(`/oauth/accounts/${accountId}`);
      setToast({ message: `Successfully disconnected ${email}`, type: 'success' });
      fetchAccounts();
    } catch (err) {
      setToast({ message: err.message || 'Failed to disconnect account', type: 'error' });
    }
  };

  return (
    <Layout title="Cloud Integration">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }} className="animate-fade-in">
        
        {/* Intro */}
        <div>
          <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: 0 }}>
            Pool your storage by linking cloud accounts. DriveHive aggregates their spaces, allowing you to upload files seamlessly.
          </p>
        </div>

        {/* Integration Actions */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '24px'
        }}>
          {/* Google Drive Connect */}
          <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justify: 'between', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(234, 67, 53, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: '1.25rem', color: '#ea4335', fontWeight: 'bold' }}>G</span>
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0, fontFamily: 'Outfit' }}>Google Drive</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>15 GB free per account</p>
              </div>
            </div>
            <button
              onClick={() => handleConnect('google')}
              className="btn btn-primary"
              disabled={connecting !== null}
              style={{
                background: 'linear-gradient(135deg, #ea4335 0%, #fabc05 100%)',
                boxShadow: '0 4px 10px rgba(234, 67, 53, 0.2)'
              }}
            >
              <Plus size={18} />
              {connecting === 'google' ? 'Connecting...' : 'Connect Google Drive'}
            </button>
          </div>

          {/* Dropbox Connect */}
          <div className="card glass" style={{ display: 'flex', flexDirection: 'column', justify: 'between', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: 'rgba(0, 97, 254, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span style={{ fontSize: '1.25rem', color: '#0061fe', fontWeight: 'bold' }}>D</span>
              </div>
              <div>
                <h3 style={{ fontSize: '1.1rem', margin: 0, fontFamily: 'Outfit' }}>Dropbox</h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>2 GB free per account</p>
              </div>
            </div>
            <button
              onClick={() => handleConnect('dropbox')}
              className="btn btn-primary"
              disabled={connecting !== null}
              style={{
                background: 'linear-gradient(135deg, #0061fe 0%, #00c6ff 100%)',
                boxShadow: '0 4px 10px rgba(0, 97, 254, 0.2)'
              }}
            >
              <Plus size={18} />
              {connecting === 'dropbox' ? 'Connecting...' : 'Connect Dropbox'}
            </button>
          </div>
        </div>

        {/* List of active connections */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontFamily: 'Outfit', margin: 0 }}>Active Storage Nodes</h3>

          {loading ? (
            <div style={{ color: 'var(--text-secondary)', padding: '20px 0', textAlign: 'center' }}>
              Loading active nodes...
            </div>
          ) : accounts.length === 0 ? (
            <div style={{
              padding: '32px',
              border: '1px dashed var(--border-color)',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <Link2 size={28} style={{ marginBottom: '12px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>No active drives pooled</p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Connect storage accounts above to activate the cluster.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {accounts.map((acc) => (
                <div key={acc.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'between',
                  padding: '16px 20px',
                  background: 'rgba(15, 23, 42, 0.4)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '12px',
                  flexWrap: 'wrap',
                  gap: '16px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                    <span className={`badge badge-${acc.provider}`}>
                      {acc.provider}
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {acc.email}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                        Connected {new Date(acc.created_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleDisconnect(acc.id, acc.email, acc.provider)}
                    className="btn btn-secondary"
                    style={{
                      padding: '8px 12px',
                      color: 'var(--color-danger)',
                      border: '1px solid rgba(239, 68, 68, 0.25)',
                      backgroundColor: 'rgba(239, 68, 68, 0.05)',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.15)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = 'rgba(239, 68, 68, 0.05)';
                    }}
                  >
                    <Trash2 size={16} />
                    Disconnect
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Warning card */}
        <div style={{
          display: 'flex',
          gap: '16px',
          padding: '16px 20px',
          backgroundColor: 'rgba(245, 158, 11, 0.08)',
          border: '1px solid rgba(245, 158, 11, 0.25)',
          borderRadius: '12px',
          color: 'var(--color-warning)'
        }}>
          <AlertCircle size={24} style={{ flexShrink: 0 }} />
          <div>
            <h4 style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem', color: '#f59e0b' }}>
              Warning regarding disconnections
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px', lineHeight: 1.5 }}>
              If you disconnect an account that contains active file chunks, you will not be able to download any files that rely on those chunks until the account is connected again.
            </p>
          </div>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
    </Layout>
  );
}

export default Accounts;
