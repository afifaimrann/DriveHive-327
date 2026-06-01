import React, { useEffect } from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

/**
 * Premium floating toast notification component.
 */
export function Toast({ message, type = 'success', onClose }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onClose();
    }, 4500);
    return () => clearTimeout(timer);
  }, [onClose]);

  const isSuccess = type === 'success';

  return (
    <div style={{
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '16px 20px',
      borderRadius: '12px',
      background: '#131b2e',
      border: `1px solid ${isSuccess ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)'}`,
      boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 10px 10px -5px rgba(0, 0, 0, 0.4)',
      animation: 'fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
      minWidth: '320px',
      maxWidth: '480px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {isSuccess ? (
          <CheckCircle size={20} color="#10b981" />
        ) : (
          <AlertTriangle size={20} color="#ef4444" />
        )}
      </div>
      <div style={{ flex: 1, fontSize: '0.9rem', color: '#f8fafc', fontWeight: 500, lineHeight: 1.4 }}>
        {message}
      </div>
      <button
        onClick={onClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '4px',
          color: '#94a3b8',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '4px',
          transition: 'color 0.15s ease',
        }}
        onMouseEnter={(e) => e.currentTarget.style.color = '#f8fafc'}
        onMouseLeave={(e) => e.currentTarget.style.color = '#94a3b8'}
      >
        <X size={16} />
      </button>
    </div>
  );
}

export default Toast;
