import React from 'react';
import { MessageSquare, X, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { ToastAlert } from '../../hooks/useMessageNotifications';

interface NotificationToastProps {
  toast: ToastAlert | null;
  onDismiss: () => void;
}

export const NotificationToast: React.FC<NotificationToastProps> = ({ toast, onDismiss }) => {
  const navigate = useNavigate();

  if (!toast) return null;

  const handleClick = () => {
    onDismiss();
    navigate('/messages');
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: '80px',
        right: '20px',
        zIndex: 99999,
        minWidth: '300px',
        maxWidth: '380px',
        background: 'rgba(18, 18, 24, 0.95)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: '14px',
        padding: '0.85rem 1rem',
        boxShadow: '0 12px 30px rgba(0, 0, 0, 0.5), 0 0 15px rgba(59, 130, 246, 0.2)',
        color: '#ffffff',
        animation: 'slideInRight 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.4rem',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div
            style={{
              background: 'var(--accent-gradient)',
              padding: '6px',
              borderRadius: '8px',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <MessageSquare size={16} />
          </div>
          <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#ffffff' }}>
            {toast.title}
          </span>
        </div>

        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: '2px',
            borderRadius: '4px',
          }}
        >
          <X size={16} />
        </button>
      </div>

      <p style={{ fontSize: '0.85rem', color: '#e2e8f0', margin: '0.2rem 0', lineHeight: 1.4, wordBreak: 'break-word' }}>
        {toast.body}
      </p>

      <button
        onClick={handleClick}
        style={{
          alignSelf: 'flex-end',
          background: 'rgba(59, 130, 246, 0.15)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa',
          padding: '0.25rem 0.65rem',
          borderRadius: '6px',
          fontSize: '0.75rem',
          fontWeight: 700,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '0.3rem',
          marginTop: '0.2rem',
        }}
      >
        <span>View Chat</span> <ArrowRight size={12} />
      </button>
    </div>
  );
};
