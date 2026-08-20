import React, { useState, useEffect } from 'react';
import {
  Volume2,
  VolumeX,
  Radio,
  Home,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import {
  sendRemoteCommand,
  TABLET_SPECS,
  subscribeToRemoteCommands,
} from '../lib/findMy';
import type { TabletSlot } from '../lib/findMy';

interface FindMyTabletsViewProps {
  currentRole: string;
  currentUserId: string;
  onBackToHome: () => void;
}

export const FindMyTabletsView: React.FC<FindMyTabletsViewProps> = ({
  currentRole,
  currentUserId,
  onBackToHome,
}) => {
  const [ringingSlots, setRingingSlots] = useState<Set<TabletSlot>>(new Set());
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isManager = currentRole === 'manager';

  // Listen to remote commands to sync ringing state across all managers in real-time.
  // Uses isManager=true so it receives all commands (for UI sync only — no audio plays here).
  useEffect(() => {
    const unsubscribe = subscribeToRemoteCommands(
      'manager',
      true, // isManager — receive all commands for UI sync, no alarm sound
      (cmd) => {
        const slot = cmd.target_slot; // Use explicit slot — no guessing from name
        setRingingSlots((prev) => {
          const next = new Set(prev);
          if (cmd.command === 'PLAY_SOUND') {
            next.add(slot);
          } else if (cmd.command === 'STOP_SOUND') {
            next.delete(slot);
          }
          return next;
        });
      }
    );

    return () => unsubscribe();
  }, [currentUserId, currentRole]);

  const handlePlaySound = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    setRingingSlots((prev) => new Set(prev).add(slot));
    setActionNotice(`🔔 Playing alarm sound on ${spec.officialName}...`);
    await sendRemoteCommand(slot, 'PLAY_SOUND');
  };

  const handleStopSound = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    setRingingSlots((prev) => {
      const next = new Set(prev);
      next.delete(slot);
      return next;
    });
    setActionNotice(`🔇 Alarm stopped on ${spec.officialName}`);
    await sendRemoteCommand(slot, 'STOP_SOUND');
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleStopAll = async () => {
    setRingingSlots(new Set());
    setActionNotice('🔇 Stopped alarms on all tablets');
    await Promise.all([
      sendRemoteCommand('T1', 'STOP_SOUND'),
      sendRemoteCommand('T2', 'STOP_SOUND'),
      sendRemoteCommand('T3', 'STOP_SOUND'),
      sendRemoteCommand('manager', 'STOP_SOUND'),
    ]);
    setTimeout(() => setActionNotice(null), 3000);
  };


  if (!isManager) {
    return (
      <div
        style={{
          padding: '3rem 1.5rem',
          maxWidth: '600px',
          margin: '3rem auto',
          background: 'var(--bg-secondary)',
          borderRadius: '24px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.5rem' }}>
          Access Restricted
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: '1.5rem' }}>
          The Find My Tablets sound manager is restricted to Manager accounts only.
        </p>
        <button onClick={onBackToHome} className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  const tabletSlots: TabletSlot[] = ['T1', 'T2', 'T3', 'manager'];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.5rem',
        padding: '1.5rem',
        maxWidth: '1200px',
        margin: '0 auto',
        minHeight: '80vh',
      }}
    >
      {/* Top Header Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(9, 9, 11, 0.95) 100%)',
          borderRadius: '20px',
          padding: '1.25rem 1.75rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div
            style={{
              width: '50px',
              height: '50px',
              borderRadius: '16px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 25px rgba(59, 130, 246, 0.4)',
            }}
          >
            <Radio size={26} color="#ffffff" className="animate-pulse" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.45rem', fontWeight: 900, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                Find My Production Tablets
              </h1>
            </div>
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.86rem', color: '#a1a1aa' }}>
              Real-time Sound Alarm — Ring and silence shop floor tablets with 100% pinpoint isolation
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
          {ringingSlots.size > 0 && (
            <button
              onClick={handleStopAll}
              className="btn btn-secondary"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                fontSize: '0.85rem',
                padding: '0.55rem 1rem',
                borderRadius: '12px',
                background: 'rgba(239, 68, 68, 0.2)',
                color: '#ef4444',
                border: '1px solid rgba(239, 68, 68, 0.4)',
                fontWeight: 800,
              }}
            >
              <VolumeX size={16} />
              <span>Stop All Sounds</span>
            </button>
          )}
          <button
            onClick={onBackToHome}
            className="btn btn-primary"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              fontSize: '0.85rem',
              padding: '0.55rem 1.15rem',
              borderRadius: '12px',
              fontWeight: 800,
            }}
          >
            <Home size={16} />
            <span>Home</span>
          </button>
        </div>
      </div>

      {/* Action Notification Toast Banner */}
      {actionNotice && (
        <div
          style={{
            background: 'linear-gradient(90deg, rgba(59, 130, 246, 0.2) 0%, rgba(16, 185, 129, 0.2) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.4)',
            borderRadius: '14px',
            padding: '0.75rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#60a5fa',
            fontSize: '0.9rem',
            fontWeight: 700,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <CheckCircle2 size={18} color="#10b981" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Tablet Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: '1.25rem',
        }}
      >
        {tabletSlots.map((slot) => {
          const spec = TABLET_SPECS[slot];
          const isRinging = ringingSlots.has(slot);

          return (
            <div
              key={slot}
              style={{
                background: isRinging
                  ? 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(24, 24, 27, 0.95) 100%)'
                  : 'linear-gradient(135deg, rgba(24, 24, 27, 0.9) 0%, rgba(15, 15, 18, 0.95) 100%)',
                borderRadius: '20px',
                padding: '1.5rem',
                border: isRinging
                  ? '2px solid #ef4444'
                  : '1px solid rgba(255, 255, 255, 0.08)',
                boxShadow: isRinging
                  ? '0 12px 30px rgba(239, 68, 68, 0.25)'
                  : '0 8px 24px rgba(0, 0, 0, 0.3)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                gap: '1.25rem',
                transition: 'all 0.2s ease',
              }}
            >
              {/* Card Header: Icon + Info */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
                  <div
                    style={{
                      width: '52px',
                      height: '52px',
                      borderRadius: '16px',
                      background: isRinging
                        ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                        : 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      boxShadow: isRinging
                        ? '0 0 25px rgba(239, 68, 68, 0.6)'
                        : '0 0 15px rgba(59, 130, 246, 0.3)',
                    }}
                  >
                    {isRinging ? (
                      <Volume2 size={28} className="animate-bounce" />
                    ) : (
                      <Radio size={26} />
                    )}
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#ffffff', margin: 0 }}>
                      {spec.officialName}
                    </h3>
                    <span style={{ fontSize: '0.84rem', color: '#a1a1aa' }}>
                      {spec.stationName}
                    </span>
                  </div>
                </div>

                {/* Status Indicator */}
                <div
                  style={{
                    background: isRinging ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.15)',
                    border: isRinging ? '1px solid rgba(239, 68, 68, 0.4)' : '1px solid rgba(59, 130, 246, 0.3)',
                    color: isRinging ? '#ef4444' : '#60a5fa',
                    borderRadius: '999px',
                    padding: '4px 10px',
                    fontSize: '0.76rem',
                    fontWeight: 800,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                    whiteSpace: 'nowrap',
                  }}
                >
                  <span
                    style={{
                      width: '6px',
                      height: '6px',
                      borderRadius: '50%',
                      background: isRinging ? '#ef4444' : '#3b82f6',
                    }}
                    className={isRinging ? 'animate-ping' : ''}
                  />
                  <span>{isRinging ? 'Ringing...' : 'Ready to Ring'}</span>
                </div>
              </div>

              {/* Action Button */}
              <div>
                {isRinging ? (
                  <button
                    onClick={() => handleStopSound(slot)}
                    style={{
                      width: '100%',
                      background: '#ef4444',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.9rem 1.25rem',
                      fontSize: '1rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 8px 20px rgba(239, 68, 68, 0.4)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.01)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <VolumeX size={20} />
                    <span>Stop Alarm</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handlePlaySound(slot)}
                    style={{
                      width: '100%',
                      background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '14px',
                      padding: '0.9rem 1.25rem',
                      fontSize: '1rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.5rem',
                      boxShadow: '0 6px 18px rgba(59, 130, 246, 0.35)',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.01)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <Volume2 size={20} />
                    <span>Play Sound</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
