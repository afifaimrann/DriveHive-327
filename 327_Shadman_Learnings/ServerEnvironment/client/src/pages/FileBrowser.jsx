import React, { useEffect, useState, useRef } from 'react';
import api from '../services/api.js';
import Layout from '../components/Layout.jsx';
import Toast from '../components/Toast.jsx';
import { formatBytes } from './Dashboard.jsx';
import {
  UploadCloud,
  Download,
  Trash2,
  File,
  FileText,
  Image,
  FileCode,
  Loader2,
  Layers,
  Search,
  Brain,
} from 'lucide-react';

/**
 * File browser page showing file list, search filter, custom drag-and-drop upload zone,
 * progress bar indicator, and download/delete controls.
 */
export function FileBrowser() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadProgressEvent, setUploadProgressEvent] = useState(null);
  const [displayProgress, setDisplayProgress] = useState(0);
  const [downloadingId, setDownloadingId] = useState(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadProgressEvent, setDownloadProgressEvent] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteProgressEvent, setDeleteProgressEvent] = useState(null);
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState(null);
  const [indexingIds, setIndexingIds] = useState([]);
  
  const fileInputRef = useRef(null);

  // Creep progress bar smoothly during uploading to avoid jumps and stuck states
  useEffect(() => {
    if (!uploading) {
      setDisplayProgress(0);
      return;
    }
    
    if (!uploadProgressEvent) {
      // Phase 1: Client transmitting file to local server. Creep from 0% to 15%
      const interval = setInterval(() => {
        setDisplayProgress(prev => {
          if (prev === 100) return 100;
          if (prev < 15) return prev + 1;
          return prev;
        });
      }, 100);
      return () => clearInterval(interval);
    }
    
    // Phase 2: Server chunking & uploading to cloud drives
    const { chunkIndex, totalChunks } = uploadProgressEvent;
    const basePercent = Math.round((chunkIndex / totalChunks) * 100);
    const targetPercent = Math.round(((chunkIndex + 1) / totalChunks) * 100);
    
    setDisplayProgress(prev => Math.max(prev, basePercent));
    
    const maxCreep = targetPercent - 2;
    const interval = setInterval(() => {
      setDisplayProgress(prev => {
        if (prev === 100) return 100;
        if (prev < maxCreep) {
          const remaining = maxCreep - prev;
          const step = Math.max(1, Math.round(remaining * 0.15));
          return prev + step;
        }
        return prev;
      });
    }, 200);
    
    return () => clearInterval(interval);
  }, [uploadProgressEvent, uploading]);

  const fetchFiles = async () => {
    try {
      const data = await api.get('/storage/files');
      setFiles(data.files || []);
    } catch (err) {
      setToast({ message: err.message || 'Failed to fetch files list', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFiles();
  }, []);

  const handleFileSelect = async (e) => {
    const selectedFile = e.target.files[0];
    if (!selectedFile) return;
    await performUpload(selectedFile);
  };

  const performUpload = async (file) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadProgressEvent(null);
    setDisplayProgress(0);
    setToast({ message: `Uploading "${file.name}"... DriveHive is chunking and distributing the file.`, type: 'success' });
    
    const formData = new FormData();
    formData.append('file', file);

    try {
      await api.upload('/storage/upload', formData, (progressEvent) => {
        setUploadProgressEvent(progressEvent);
        const percent = Math.round((progressEvent.chunkIndex / progressEvent.totalChunks) * 100);
        setUploadProgress(percent);
      });
      setDisplayProgress(100);
      setToast({ message: `"${file.name}" uploaded and distributed successfully!`, type: 'success' });
      await new Promise((resolve) => setTimeout(resolve, 1000));
      fetchFiles();
    } catch (err) {
      setToast({ message: err.message || 'Upload failed', type: 'error' });
    } finally {
      setUploading(false);
      setUploadProgress(0);
      setUploadProgressEvent(null);
      setDisplayProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDownload = async (fileId, filename) => {
    const file = files.find(f => f.id === fileId);
    if (!file) return;

    setDownloadingId(fileId);
    setDownloadProgress(0);
    setDownloadProgressEvent({
      filename,
      chunkIndex: 0,
      totalChunks: file.is_chunked ? Math.ceil(file.size / (50 * 1024 * 1024)) : 1
    });

    try {
      const blob = await api.downloadStream(`/storage/download/${fileId}`, (progress) => {
        const { loadedBytes, totalBytes } = progress;
        const percent = Math.min(99, Math.round((loadedBytes / totalBytes) * 100));
        setDownloadProgress(percent);

        const CHUNK_SIZE = 50 * 1024 * 1024;
        const totalChunks = file.is_chunked ? Math.ceil(file.size / CHUNK_SIZE) : 1;
        const chunkIndex = Math.min(totalChunks - 1, Math.floor(loadedBytes / CHUNK_SIZE));

        setDownloadProgressEvent({
          filename,
          chunkIndex,
          totalChunks
        });
      });

      setDownloadProgress(100);
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
      setToast({ message: `Downloaded ${filename} successfully!`, type: 'success' });
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (err) {
      setToast({ message: err.message || 'Download failed. Ensure storage drives are connected.', type: 'error' });
    } finally {
      setDownloadingId(null);
      setDownloadProgress(0);
      setDownloadProgressEvent(null);
    }
  };

  const handleDelete = async (fileId, filename) => {
    if (!window.confirm(`Are you sure you want to permanently delete "${filename}"? Chunks on Google Drive and Dropbox will be deleted.`)) {
      return;
    }

    setDeletingId(fileId);
    setDeleteProgressEvent(null);
    try {
      await api.deleteStream(`/storage/files/${fileId}`, (progressEvent) => {
        setDeleteProgressEvent(progressEvent);
      });
      setToast({ message: `Successfully deleted "${filename}"`, type: 'success' });
      fetchFiles();
    } catch (err) {
      setToast({ message: err.message || 'Failed to delete file', type: 'error' });
    } finally {
      setDeletingId(null);
      setDeleteProgressEvent(null);
    }
  };

  const handleIndexFile = async (fileId, filename) => {
    setIndexingIds(prev => [...prev, fileId]);
    setToast({ message: `Indexing "${filename}" for RAG Q&A chat...`, type: 'success' });
    try {
      const result = await api.indexFile(fileId);
      setToast({ message: `"${filename}" successfully indexed! (${result.chunksIndexed} chunks)`, type: 'success' });
      fetchFiles();
    } catch (err) {
      setToast({ message: err.message || 'Indexing failed', type: 'error' });
    } finally {
      setIndexingIds(prev => prev.filter(id => id !== fileId));
    }
  };

  const getFileIcon = (mimeType) => {
    if (!mimeType) return File;
    if (mimeType.includes('image')) return Image;
    if (mimeType.includes('text') || mimeType.includes('pdf') || mimeType.includes('document')) return FileText;
    if (mimeType.includes('javascript') || mimeType.includes('json') || mimeType.includes('html')) return FileCode;
    return File;
  };

  const filteredFiles = files.filter(f => 
    f.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout title="Files Matrix">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }} className="animate-fade-in">
        
        {/* Upload Zone / Download Zone */}
        {downloadingId ? (
          <div style={{
            border: '2px solid var(--color-primary)',
            borderRadius: '16px',
            padding: '40px 24px',
            textAlign: 'center',
            backgroundColor: 'rgba(15, 23, 42, 0.4)',
            transition: 'var(--transition-normal)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
              <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                <Loader2 size={56} color="var(--color-primary)" className="spin-animation" style={{ opacity: 0.8 }} />
                <div style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  color: '#f8fafc',
                  fontFamily: 'Outfit, sans-serif'
                }}>
                  {downloadProgress}%
                </div>
              </div>
              <div style={{ width: '100%' }}>
                <h3 style={{ fontSize: '1.1rem', fontFamily: 'Outfit, sans-serif', margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>
                  {downloadProgress === 100 ? (
                    <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                      Download complete!
                    </span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontWeight: 600 }}>
                        {downloadProgressEvent 
                          ? (downloadProgressEvent.totalChunks > 1 
                              ? `Downloading Chunk ${downloadProgressEvent.chunkIndex + 1}/${downloadProgressEvent.totalChunks}`
                              : 'Downloading file...')
                          : 'Initiating download...'}
                      </span>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        "{downloadProgressEvent?.filename || 'File'}"
                      </span>
                    </div>
                  )}
                </h3>
                {/* Progress bar container */}
                <div style={{
                  height: '10px',
                  width: '100%',
                  backgroundColor: 'rgba(30, 41, 59, 0.6)',
                  borderRadius: '5px',
                  marginTop: '12px',
                  overflow: 'hidden',
                  border: '1px solid var(--border-color)'
                }}>
                  <div 
                    className="progress-bar-animated"
                    style={{
                      height: '100%',
                      width: `${downloadProgress}%`,
                      borderRadius: '5px',
                      transition: 'width 0.2s ease-out'
                    }} 
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div 
            onClick={() => !uploading && fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border-color)',
              borderRadius: '16px',
              padding: '40px 24px',
              textAlign: 'center',
              cursor: uploading ? 'not-allowed' : 'pointer',
              backgroundColor: 'rgba(15, 23, 42, 0.3)',
              transition: 'var(--transition-normal)',
            }}
            onMouseEnter={(e) => {
              if (!uploading) {
                e.currentTarget.style.borderColor = 'var(--color-primary)';
                e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.05)';
              }
            }}
            onMouseLeave={(e) => {
              if (!uploading) {
                e.currentTarget.style.borderColor = 'var(--border-color)';
                e.currentTarget.style.backgroundColor = 'rgba(15, 23, 42, 0.3)';
              }
            }}
          >
            <input 
              type="file" 
              ref={fileInputRef} 
              onChange={handleFileSelect} 
              style={{ display: 'none' }} 
              disabled={uploading}
            />
            
            <div style={{ width: '100%' }}>
              {uploading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', width: '100%', maxWidth: '400px', margin: '0 auto' }}>
                  <div style={{ position: 'relative', width: '56px', height: '56px' }}>
                    <Loader2 size={56} color="var(--color-primary)" className="spin-animation" style={{ opacity: 0.8 }} />
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.8rem',
                      fontWeight: 700,
                      color: '#f8fafc',
                      fontFamily: 'Outfit, sans-serif'
                    }}>
                      {displayProgress}%
                    </div>
                  </div>
                  <div style={{ width: '100%' }}>
                    <h3 style={{ fontSize: '1.1rem', fontFamily: 'Outfit, sans-serif', margin: 0, color: 'var(--text-primary)', textAlign: 'center' }}>
                      {displayProgress === 100 ? (
                        <span style={{ color: 'var(--color-success)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                          Upload complete!
                        </span>
                      ) : uploadProgressEvent ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                          <span style={{ fontWeight: 600 }}>
                            {uploadProgressEvent.totalChunks > 1 
                              ? `Streaming Chunk ${uploadProgressEvent.chunkIndex + 1}/${uploadProgressEvent.totalChunks}`
                              : 'Streaming file...'}
                          </span>
                        </div>
                      ) : (
                        'Uploading file to server...'
                      )}
                    </h3>
                    {/* Progress bar container */}
                    <div style={{
                      height: '10px',
                      width: '100%',
                      backgroundColor: 'rgba(30, 41, 59, 0.6)',
                      borderRadius: '5px',
                      marginTop: '12px',
                      overflow: 'hidden',
                      border: '1px solid var(--border-color)'
                    }}>
                      <div 
                        className="progress-bar-animated"
                        style={{
                          height: '100%',
                          width: `${displayProgress}%`,
                          borderRadius: '5px',
                          transition: 'width 0.2s ease-out'
                        }} 
                      />
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                  <UploadCloud size={48} color="var(--text-secondary)" style={{ transition: 'color 0.2s' }} />
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontFamily: 'Outfit, sans-serif', margin: 0 }}>
                      Select a file to upload
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Files over 100MB will be auto-chunked. Max file size: 500MB
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Search & Listing */}
        <div className="card glass" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Header & Search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'between', flexWrap: 'wrap', gap: '16px' }}>
            <h3 style={{ fontSize: '1.2rem', fontFamily: 'Outfit', margin: 0, flex: 1 }}>Aggregated Files</h3>
            <div style={{ position: 'relative', width: '100%', maxWidth: '300px' }}>
              <input
                type="text"
                placeholder="Search file name..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ paddingLeft: '40px', paddingRight: '16px', height: '40px' }}
              />
              <Search size={18} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '11px' }} />
            </div>
          </div>

          {/* Files List */}
          {loading ? (
            <div style={{ color: 'var(--text-secondary)', padding: '40px 0', textAlign: 'center' }}>
              Syncing files from cluster...
            </div>
          ) : filteredFiles.length === 0 ? (
            <div style={{
              padding: '48px 24px',
              border: '1px dashed var(--border-color)',
              borderRadius: '12px',
              textAlign: 'center',
              color: 'var(--text-secondary)'
            }}>
              <File size={36} style={{ marginBottom: '16px', opacity: 0.5 }} />
              <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                {search ? 'No files match your search' : 'No files stored in the hive'}
              </p>
              <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>
                {search ? 'Try clearing the search query.' : 'Use the upload zone above to save files.'}
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {filteredFiles.map((file) => {
                const Icon = getFileIcon(file.mime_type);
                const isDownloading = downloadingId === file.id;
                const isDeleting = deletingId === file.id;

                return (
                  <div key={file.id} style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 20px',
                    background: 'rgba(15, 23, 42, 0.4)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '12px',
                    flexWrap: 'wrap',
                    gap: '16px',
                    transition: 'var(--transition-fast)'
                  }} className="file-row">
                    
                    {/* File Meta */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, minWidth: 0 }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        backgroundColor: 'rgba(30, 41, 59, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'var(--color-primary)'
                      }}>
                        <Icon size={22} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <p style={{ fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {file.name}
                          </p>
                          {file.is_chunked && (
                            <span 
                              className="badge" 
                              style={{ 
                                backgroundColor: 'rgba(139, 92, 246, 0.15)', 
                                color: '#a78bfa',
                                border: '1px solid rgba(139, 92, 246, 0.3)',
                                fontSize: '0.65rem'
                              }}
                            >
                              <Layers size={10} style={{ marginRight: '4px' }} />
                              Chunked
                            </span>
                          )}
                          {file.is_indexed && (
                            <span 
                              className="badge" 
                              style={{ 
                                backgroundColor: 'rgba(16, 185, 129, 0.15)', 
                                color: '#10b981',
                                border: '1px solid rgba(16, 185, 129, 0.3)',
                                fontSize: '0.65rem'
                              }}
                            >
                              <Brain size={10} style={{ marginRight: '4px' }} />
                              Indexed
                            </span>
                          )}
                        </div>
                        <p style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', margin: '4px 0 0' }}>
                          {formatBytes(file.size)} • {new Date(file.uploaded_at).toLocaleString()}
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    {isDeleting ? (
                      <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'flex-end',
                        gap: '4px',
                        minWidth: '220px',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: 'var(--color-danger)' }}>
                          <Loader2 size={14} className="spin-animation" style={{ opacity: 0.8 }} />
                          <span style={{ fontWeight: 500 }}>
                            {deleteProgressEvent 
                              ? `Deleting chunk ${deleteProgressEvent.chunkIndex + 1}/${deleteProgressEvent.totalChunks}`
                              : 'Initiating deletion...'}
                          </span>
                        </div>
                        {/* Deletion progress bar */}
                        <div style={{
                          width: '100%',
                          height: '4px',
                          backgroundColor: 'rgba(239, 68, 68, 0.1)',
                          borderRadius: '2px',
                          overflow: 'hidden',
                          border: '1px solid rgba(239, 68, 68, 0.2)',
                          marginTop: '2px'
                        }}>
                          <div 
                            className="progress-bar-danger-animated"
                            style={{
                              height: '100%',
                              width: `${deleteProgressEvent ? Math.round(((deleteProgressEvent.chunkIndex + 1) / deleteProgressEvent.totalChunks) * 100) : 0}%`,
                              borderRadius: '2px',
                              transition: 'width 0.3s ease'
                            }} 
                          />
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '10px' }}>
                        {/* Index AI (only for text-extractable files) */}
                        {(() => {
                          const ext = file.name.split('.').pop().toLowerCase();
                          const isTextSupported = ['txt', 'md', 'csv', 'json', 'pdf', 'docx'].includes(ext) || 
                                                  (file.mime_type && file.mime_type.startsWith('text/'));
                          if (!isTextSupported) return null;
                          const isIndexing = indexingIds.includes(file.id);
                          return (
                            <button
                              onClick={() => handleIndexFile(file.id, file.name)}
                              className="btn btn-secondary"
                              disabled={isDownloading || deletingId !== null || isIndexing}
                              style={{
                                padding: '8px 12px',
                                fontSize: '0.85rem',
                                borderColor: file.is_indexed ? 'rgba(16, 185, 129, 0.25)' : 'var(--border-color)',
                                color: file.is_indexed ? '#34d399' : 'var(--text-primary)',
                                backgroundColor: file.is_indexed ? 'rgba(16, 185, 129, 0.05)' : 'transparent',
                              }}
                            >
                              {isIndexing ? (
                                <Loader2 size={16} className="spin-animation" style={{ opacity: 0.8 }} />
                              ) : (
                                <Brain size={16} />
                              )}
                              {file.is_indexed ? 'Re-Index' : 'Index AI'}
                            </button>
                          );
                        })()}

                        {/* Download */}
                        <button
                          onClick={() => handleDownload(file.id, file.name)}
                          className="btn btn-secondary"
                          disabled={isDownloading || deletingId !== null}
                          style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                        >
                          {isDownloading ? (
                            <Loader2 size={16} className="spin-animation" />
                          ) : (
                            <Download size={16} />
                          )}
                          Download
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => handleDelete(file.id, file.name)}
                          className="btn btn-secondary"
                          disabled={isDownloading || deletingId !== null}
                          style={{
                            padding: '8px 12px',
                            color: 'var(--color-danger)',
                            border: '1px solid rgba(239, 68, 68, 0.25)',
                            backgroundColor: 'rgba(239, 68, 68, 0.05)',
                            fontSize: '0.85rem'
                          }}
                        >
                          <Trash2 size={16} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}
      
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .spin-animation {
          animation: spin 1s linear infinite;
        }
        @keyframes progress-stripes {
          from { background-position: 40px 0; }
          to { background-position: 0 0; }
        }
        .progress-bar-animated {
          background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.15) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.15) 75%,
            transparent 75%,
            transparent
          ), linear-gradient(to right, var(--color-primary), var(--color-accent));
          background-size: 40px 40px, auto;
          animation: progress-stripes 1s linear infinite;
        }
        .progress-bar-danger-animated {
          background-image: linear-gradient(
            45deg,
            rgba(255, 255, 255, 0.15) 25%,
            transparent 25%,
            transparent 50%,
            rgba(255, 255, 255, 0.15) 50%,
            rgba(255, 255, 255, 0.15) 75%,
            transparent 75%,
            transparent
          ), linear-gradient(to right, var(--color-danger), #f87171);
          background-size: 40px 40px, auto;
          animation: progress-stripes 1s linear infinite;
        }
        .file-row:hover {
          border-color: rgba(59, 130, 246, 0.4) !important;
          background-color: rgba(30, 41, 59, 0.4) !important;
        }
      `}</style>
    </Layout>
  );
}

export default FileBrowser;
