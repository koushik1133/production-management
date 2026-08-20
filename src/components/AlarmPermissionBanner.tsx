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
  const [isDismissed, setIsDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [justGranted, setJustGranted] = useState(false);

  // If already granted, unsupported, or dismissed, do not render
  if (permission === 'granted' && !justGranted) return null;
  if (permission === 'unsupported' || isDismissed) return null;

  const handleGrant = async () => {
    setIsLoading(true);
    try {
      const ok = await onEnable();
      if (ok) {
        setJustGranted(true);
        setTimeout(() => setJustGranted(false), 3500);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        maxWidth: '520px',
        width: 'calc(100% - 32px)',
        background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.96) 0%, rgba(9, 9, 11, 0.98) 100%)',
        border: justGranted
          ? '1px solid rgba(16, 185, 129, 0.5)'
          : '1px solid rgba(59, 130, 246, 0.4)',
        borderRadius: '16px',
        padding: '0.9rem 1.25rem',
        boxShadow: '0 12px 35px rgba(0, 0, 0, 0.5), 0 0 25px rgba(59, 130, 246, 0.2)',
        backdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        animation: 'slideUp 0.3s ease-out',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '12px',
            background: justGranted
              ? 'rgba(16, 185, 129, 0.2)'
              : 'rgba(59, 130, 246, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          {justGranted ? (
            <Check size={22} color="#10b981" />
          ) : (
            <Bell size={22} color="#60a5fa" className="animate-bounce" />
          )}
        </div>
        <div>
          <div style={{ fontSize: '0.9rem', fontWeight: 800, color: '#ffffff' }}>
            {justGranted
              ? '✅ 24/7 Screen-Off Alarm Enabled!'
              : `Enable Screen-Off Alarm for ${tabletName}`}
          </div>
          <div style={{ fontSize: '0.78rem', color: '#a1a1aa', marginTop: '2px' }}>
            {justGranted
              ? 'This tablet will now ring and wake up even when the screen is turned off.'
              : 'Allow notifications so this tablet can ring when locked or screen is off.'}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
        {!justGranted && (
          <button
            onClick={handleGrant}
            disabled={isLoading}
            className="btn btn-primary"
            style={{
              padding: '0.45rem 0.9rem',
              fontSize: '0.82rem',
              fontWeight: 800,
              borderRadius: '10px',
              whiteSpace: 'nowrap',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
            }}
          >
            {isLoading ? 'Enabling...' : 'Enable Now'}
          </button>
        )}
        <button
          onClick={() => setIsDismissed(true)}
          style={{
            background: 'none',
            border: 'none',
            color: '#71717a',
            cursor: 'pointer',
            padding: '4px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
