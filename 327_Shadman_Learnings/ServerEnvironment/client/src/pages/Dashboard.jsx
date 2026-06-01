import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api.js';
import Layout from '../components/Layout.jsx';
import StorageChart from '../components/StorageChart.jsx';
import Toast from '../components/Toast.jsx';
import { HardDrive, Files, Plus, Link2, Cloud, RefreshCw } from 'lucide-react';

/**
 * Format bytes to human readable format (KB, MB, GB, etc.)
 */
export function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  if (!bytes) return '0 GB';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

/**
 * Main dashboard view showing aggregated cloud storage space, circular progress,
 * and per-account breakdown cards.
 */
export function Dashboard() {
  const [quota, setQuota] = useState(null);
  const [filesCount, setFilesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const quotaData = await api.get('/storage/quota');
      setQuota(quotaData);

      const filesData = await api.get('/storage/files');
      setFilesCount(filesData.files?.length || 0);
    } catch (err) {
      setToast({
        message: err.message || 'Failed to fetch storage status. Please connect cloud accounts.',
        type: 'error',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  return (
    <Layout title="Dashboard">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }} className="animate-fade-in">
        
        {/* Top Header Summary cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '24px'
        }}>
          {/* Card 1: Total Unified Storage */}
          <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <HardDrive color="#3b82f6" size={28} />
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Hive Memory
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '2px 0 0', fontFamily: 'Outfit' }}>
                {quota ? formatBytes(quota.total) : '0 GB'}
              </h2>
            </div>
          </div>

          {/* Card 2: Used Storage */}
          <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: 'rgba(139, 92, 246, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Cloud color="#8b5cf6" size={28} />
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Used Space
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '2px 0 0', fontFamily: 'Outfit' }}>
                {quota ? formatBytes(quota.used) : '0 GB'}
              </h2>
            </div>
          </div>

          {/* Card 3: Files Count */}
          <div className="card glass" style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{
              width: '56px',
              height: '56px',
              borderRadius: '12px',
              backgroundColor: 'rgba(16, 185, 129, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <Files color="#10b981" size={28} />
            </div>
            <div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>
                Aggregated Files
              </span>
              <h2 style={{ fontSize: '1.8rem', fontWeight: 700, margin: '2px 0 0', fontFamily: 'Outfit' }}>
                {filesCount}
              </h2>
            </div>
          </div>
        </div>

        {/* Middle Section: Chart & Quick Actions */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 2fr',
          gap: '24px',
        }} className="grid-responsive">
          
          {/* Left panel: Donut Chart */}
          <div className="card glass" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', margin: 0, color: 'var(--text-secondary)', alignSelf: 'flex-start' }}>
              Storage Allocation
            </h3>
            <StorageChart total={quota?.total || 0} used={quota?.used || 0} />
            <div style={{ display: 'flex', gap: '20px', fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'linear-gradient(to right, #3b82f6, #8b5cf6)' }} />
                <span>Used: {quota ? formatBytes(quota.used) : '0 GB'}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: 'rgba(30, 41, 59, 0.6)' }} />
                <span>Free: {quota ? formatBytes(quota.available) : '0 GB'}</span>
              </div>
            </div>
          </div>

          {/* Right panel: Connected Account breakdown */}
          <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between' }}>
              <h3 style={{ fontSize: '1.1rem', margin: 0, flex: 1 }}>Connected Storages</h3>
              <button
                onClick={fetchDashboardData}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  padding: '4px'
                }}
                disabled={loading}
              >
                <RefreshCw size={16} className={loading ? 'spin-animation' : ''} />
              </button>
            </div>

            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: 'var(--text-secondary)', minHeight: '180px' }}>
                Fetching connected nodes...
              </div>
            ) : !quota || quota.breakdown.length === 0 ? (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                flex: 1,
                gap: '16px',
                minHeight: '180px',
                border: '1px dashed var(--border-color)',
                borderRadius: '10px',
                padding: '24px'
              }}>
                <Link2 size={36} color="var(--text-muted)" />
                <div style={{ textAlign: 'center' }}>
                  <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>No cloud accounts connected</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '4px' }}>
                    Connect Google Drive or Dropbox to pool your storage!
                  </p>
                </div>
                <Link to="/accounts" className="btn btn-primary" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  <Plus size={16} /> Connect Account
                </Link>
              </div>
            ) : (
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                {quota.breakdown.map((acc) => {
                  const usedPct = acc.total > 0 ? Math.round((acc.used / acc.total) * 100) : 0;
                  return (
                    <div key={acc.accountId} style={{
                      padding: '16px',
                      background: 'rgba(15, 23, 42, 0.4)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '10px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '10px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', flexWrap: 'wrap', gap: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                          <span className={`badge badge-${acc.provider}`}>
                            {acc.provider}
                          </span>
                          <span style={{ fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {acc.email}
                          </span>
                        </div>
                        <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {formatBytes(acc.used)} / {formatBytes(acc.total)} ({usedPct}%)
                        </span>
                      </div>
                      
                      {/* Progress Bar */}
                      <div style={{
                        height: '6px',
                        width: '100%',
                        backgroundColor: 'rgba(30, 41, 59, 0.6)',
                        borderRadius: '3px',
                        overflow: 'hidden'
                      }}>
                        <div style={{
                          height: '100%',
                          width: `${usedPct}%`,
                          background: acc.provider === 'google' 
                            ? 'linear-gradient(to right, #ea4335, #fbbc05)' 
                            : 'linear-gradient(to right, #0061fe, #00c6ff)',
                          borderRadius: '3px',
                          transition: 'width 1s ease'
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Quick Help Section */}
        <div className="card glass" style={{ padding: '20px 24px', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'between', gap: '16px' }}>
          <div>
            <h4 style={{ fontSize: '1rem', fontFamily: 'Outfit', fontWeight: 600, color: 'var(--text-primary)' }}>
              How chunk distribution works:
            </h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Files larger than 200MB are automatically sliced into 100MB chunks and distributed across your cloud drives based on available space.
            </p>
          </div>
          <Link to="/files" className="btn btn-primary" style={{ padding: '10px 20px', fontSize: '0.9rem' }}>
            Go to File Browser
          </Link>
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
      
      {/* Responsive grids in CSS */}
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @media (max-width: 900px) {
          .grid-responsive {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </Layout>
  );
}

export default Dashboard;
