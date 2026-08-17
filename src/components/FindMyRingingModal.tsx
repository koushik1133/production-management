import React from 'react';
import { Volume2, VolumeX, Radio } from 'lucide-react';

interface FindMyRingingModalProps {
  isOpen: boolean;
  deviceName: string;
  onStopSound: () => void;
}

export const FindMyRingingModal: React.FC<FindMyRingingModalProps> = ({
  isOpen,
  deviceName,
  onStopSound,
}) => {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.85)',
        backdropFilter: 'blur(12px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
        animation: 'fadeIn 0.2s ease-out',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '440px',
          background: 'linear-gradient(180deg, #18181b 0%, #09090b 100%)',
          borderRadius: '24px',
          border: '2px solid rgba(59, 130, 246, 0.4)',
          boxShadow: '0 25px 60px -15px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.2)',
          padding: '2.5rem 2rem',
          textAlign: 'center',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Pulsating Sonar Ripples */}
        <div
          style={{
            position: 'relative',
            width: '100px',
            height: '100px',
            margin: '0 auto 1.5rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(59, 130, 246, 0.2)',
              animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
            }}
          />
          <div
            style={{
              position: 'absolute',
              inset: '-15px',
              borderRadius: '50%',
              border: '2px solid rgba(59, 130, 246, 0.3)',
              animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }}
          />
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 30px rgba(59, 130, 246, 0.6)',
              position: 'relative',
              zIndex: 2,
            }}
          >
            <Volume2 size={38} color="#ffffff" />
          </div>
        </div>

        {/* Device Tag */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.4rem',
            background: 'rgba(59, 130, 246, 0.15)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            color: '#60a5fa',
            borderRadius: '999px',
            padding: '0.35rem 0.9rem',
            fontSize: '0.82rem',
            fontWeight: 800,
            marginBottom: '0.85rem',
          }}
        >
          <Radio size={14} className="animate-pulse" />
          <span>Find My Tablet Alert</span>
        </div>

        {/* Title & Description */}
        <h2
          style={{
            fontSize: '1.6rem',
            fontWeight: 900,
            color: '#ffffff',
            letterSpacing: '-0.02em',
            margin: '0 0 0.5rem',
          }}
        >
          Sound Playing
        </h2>

        <p
          style={{
            color: '#a1a1aa',
            fontSize: '0.92rem',
            lineHeight: 1.5,
            margin: '0 0 2rem',
          }}
        >
          Production Manager is playing an alarm sound on <strong style={{ color: '#ffffff' }}>{deviceName}</strong> to locate this tablet.
        </p>

        {/* Stop Alarm Action Button */}
        <button
          onClick={onStopSound}
          style={{
            width: '100%',
            padding: '1rem 1.5rem',
            borderRadius: '16px',
            background: '#ef4444',
            color: '#ffffff',
            border: 'none',
            fontSize: '1.05rem',
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.6rem',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.4)',
            transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.02)')}
          onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
        >
          <VolumeX size={22} />
          <span>Stop Sound</span>
        </button>
      </div>
    </div>
  );
};
