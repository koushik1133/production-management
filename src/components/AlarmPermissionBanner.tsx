import React, { useState } from 'react';
import { Bell, Check, X } from 'lucide-react';

interface AlarmPermissionBannerProps {
  permission: NotificationPermission | 'unsupported';
  tabletName: string;
  onEnable: () => Promise<boolean>;
}

export const AlarmPermissionBanner: React.FC<AlarmPermissionBannerProps> = ({
  permission,
  tabletName,
  onEnable,
}) => {
  const [isDismissed, setIsDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('alarm_banner_dismissed') === 'true';
    }
    return false;
  });
  const [isLoading, setIsLoading] = useState(false);
  const [justGranted, setJustGranted] = useState(false);

  // If already granted, unsupported, or dismissed, do not render
  if ((permission === 'granted' && !justGranted) || permission === 'unsupported' || isDismissed) {
    return null;
  }

  const handleGrant = async () => {
    setIsLoading(true);
    try {
      const ok = await onEnable();
      if (ok || (typeof Notification !== 'undefined' && Notification.permission === 'granted')) {
        setJustGranted(true);
        setTimeout(() => {
          setIsDismissed(true);
          sessionStorage.setItem('alarm_banner_dismissed', 'true');
        }, 3000);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('alarm_banner_dismissed', 'true');
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '560px',
        width: 'calc(100% - 32px)',
        background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.98) 0%, rgba(9, 9, 11, 0.99) 100%)',
        border: justGranted
          ? '2px solid #10b981'
          : '1px solid rgba(59, 130, 246, 0.5)',
        borderRadius: '18px',
        padding: '1rem 1.25rem',
        boxShadow: justGranted
          ? '0 12px 35px rgba(16, 185, 129, 0.3)'
          : '0 12px 35px rgba(0, 0, 0, 0.6), 0 0 25px rgba(59, 130, 246, 0.25)',
        backdropFilter: 'blur(16px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        animation: 'slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: '42px',
            height: '42px',
            borderRadius: '12px',
            background: justGranted
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(59, 130, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            boxShadow: justGranted ? '0 0 15px rgba(16, 185, 129, 0.4)' : 'none',
          }}
        >
          {justGranted ? (
            <Check size={22} color="#10b981" />
          ) : (
            <Bell size={22} color="#60a5fa" />
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.92rem', fontWeight: 800, color: '#ffffff' }}>
            {justGranted
              ? '✅ Screen-Off Alarm Ready!'
              : `Enable Screen-Off Alarm for ${tabletName}`}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '2px' }}>
            {justGranted
              ? 'This tablet will now ring and wake up even when the screen is locked.'
              : 'Allow notifications & wake-lock so this tablet rings 24/7 when called.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexShrink: 0 }}>
        {!justGranted && (
          <button
            onClick={handleGrant}
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              padding: '0.5rem 1rem',
              fontSize: '0.84rem',
              fontWeight: 800,
              borderRadius: '12px',
              whiteSpace: 'nowrap',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              border: 'none',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.4)',
              cursor: 'pointer',
            }}
          >
            {isLoading ? 'Enabling...' : 'Enable Now'}
          </button>
        )}
        <button
          onClick={handleDismiss}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            padding: '6px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '8px',
          }}
          title="Dismiss"
        >
          <X size={18} />
        </button>
      </div>
    </div>
  );
};
