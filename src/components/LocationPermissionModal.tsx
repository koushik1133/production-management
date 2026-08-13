import React from 'react';
import { Compass, ShieldCheck, MapPin, Check } from 'lucide-react';
import { initAudioContext } from '../lib/findMy';

interface LocationPermissionModalProps {
  isOpen: boolean;
  onApprove: () => void;
  roleName: string;
}

export const LocationPermissionModal: React.FC<LocationPermissionModalProps> = ({
  isOpen,
  onApprove,
  roleName,
}) => {
  if (!isOpen) return null;

  const handleApproveClick = () => {
    initAudioContext();
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          console.log('Browser location permission granted:', pos.coords);
        },
        (err) => {
          console.warn('Browser location permission notice:', err.message);
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    }
    onApprove();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '500px',
          background: 'var(--bg-secondary)',
          borderRadius: '20px',
          border: '1px solid var(--border-color)',
          padding: '1.75rem',
          color: 'var(--text-primary)',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '1.25rem',
        }}
      >
        {/* Top Header Icon */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            color: 'white',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 8px 24px rgba(2, 132, 199, 0.4)',
          }}
        >
          <Compass size={32} />
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', marginBottom: '0.35rem' }}>
            <ShieldCheck size={18} color="#10b981" />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Manager Safety & Location Request
            </span>
          </div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
            Approve 24/7 Tablet Location Access
          </h2>
        </div>

        <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          The Production Manager has requested continuous location tracking for <strong>{roleName.toUpperCase()} Tablet</strong>. This enables 24/7 shop floor location tracking, battery diagnostics, and lost device recovery.
        </p>

        <div
          style={{
            width: '100%',
            background: 'var(--bg-primary)',
            borderRadius: '12px',
            padding: '1rem',
            border: '1px solid var(--border-color)',
            fontSize: '0.8rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
            textAlign: 'left',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            <MapPin size={16} color="#3b82f6" /> Continuous 24/7 Tracking Policy
          </div>
          <span>• Location tracking runs automatically in the background while online.</span>
          <span>• Worker tablets do not have an option to disable location tracking.</span>
          <span>• Manager can remotely ring lost tablets using high-pitch chime.</span>
        </div>

        <button
          onClick={handleApproveClick}
          className="btn btn-primary"
          style={{
            width: '100%',
            padding: '0.85rem',
            borderRadius: '12px',
            fontSize: '0.95rem',
            fontWeight: 900,
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            color: 'white',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
          }}
        >
          <Check size={18} /> Approve & Enable 24/7 Location Access
        </button>
      </div>
    </div>
  );
};
