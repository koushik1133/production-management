import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Volume2,
  VolumeX,
  RefreshCw,
  MapPin,
  Compass,
  AlertTriangle,
  Radio,
  Home,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchTabletLocations,
  sendRemoteCommand,
  subscribeToLocationUpdates,
  upsertTabletLocation,
  TABLET_SPECS,
  resolveTabletSlot,
} from '../lib/findMy';
import type { TabletSlot } from '../lib/findMy';
import type { TabletLocation } from '../types/findMy';

interface FindMyTabletsViewProps {
  currentRole: string;
  currentUserId: string;
  onBackToHome: () => void;
}

export const FindMyTabletsView: React.FC<FindMyTabletsViewProps> = ({
  currentRole,
  onBackToHome,
}) => {
  const [tablets, setTablets] = useState<TabletLocation[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<TabletSlot>('T1');
  const [loading, setLoading] = useState<boolean>(true);
  const [ringingSlot, setRingingSlot] = useState<TabletSlot | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const isManager = currentRole === 'manager';

  const loadLocations = useCallback(async () => {
    try {
      const data = await fetchTabletLocations();
      setTablets([...data]);
    } catch (err) {
      console.error('Error loading tablet locations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
    const interval = setInterval(loadLocations, 4000); // 4s live polling
    const unsubscribe = subscribeToLocationUpdates(() => {
      loadLocations();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [loadLocations]);

  // Map tablets to their fixed canonical slot order: T1, T2, T3, manager
  const orderedTablets = useMemo(() => {
    const slots: TabletSlot[] = ['T1', 'T2', 'T3', 'manager'];
    return slots.map((slot) => {
      const spec = TABLET_SPECS[slot];
      const found = tablets.find((t) => resolveTabletSlot(t.user_id, t.role, t.device_name) === slot);
      if (found) {
        return {
          ...found,
          device_name: spec.officialName,
          slot,
        };
      }
      return {
        id: spec.canonicalId,
        user_id: spec.canonicalId,
        device_name: spec.officialName,
        role: slot === 'manager' ? 'manager' : 'worker',
        latitude: spec.defaultCoordinates.lat,
        longitude: spec.defaultCoordinates.lng,
        accuracy: 10,
        battery_level: spec.defaultBattery,
        is_charging: true,
        is_online: true,
        permission_approved: true,
        last_ping_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        slot,
      };
    });
  }, [tablets]);

  const selectedTablet = useMemo(() => {
    return orderedTablets.find((t) => t.slot === selectedSlot) || orderedTablets[0];
  }, [orderedTablets, selectedSlot]);

  const handlePlaySound = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    setRingingSlot(slot);
    setActionNotice(`🔔 Playing Apple Find My alarm on ${spec.officialName}...`);
    await sendRemoteCommand(slot, 'PLAY_SOUND', spec.officialName);

    setTimeout(() => {
      setRingingSlot((prev) => (prev === slot ? null : prev));
      setActionNotice(null);
    }, 15000);
  };

  const handleStopSound = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    setRingingSlot(null);
    setActionNotice(`🔇 Alarm stopped on ${spec.officialName}`);
    await sendRemoteCommand(slot, 'STOP_SOUND', spec.officialName);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleRequestAccess = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    setActionNotice(`📩 Location Access Request sent to ${spec.officialName}`);
    await sendRemoteCommand(slot, 'REQUEST_LOCATION_PERMISSION', spec.officialName);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleSimulatePing = async (slot: TabletSlot) => {
    const spec = TABLET_SPECS[slot];
    await upsertTabletLocation({
      user_id: spec.canonicalId,
      device_name: spec.officialName,
      role: slot === 'manager' ? 'manager' : 'worker',
      latitude: spec.defaultCoordinates.lat,
      longitude: spec.defaultCoordinates.lng,
      accuracy: 8,
      battery_level: spec.defaultBattery,
      is_charging: true,
      is_online: true,
      permission_approved: true,
      last_ping_at: new Date().toISOString(),
    });

    setActionNotice(`✅ 24/7 Location tracking approved for ${spec.officialName}!`);
    loadLocations();
    setTimeout(() => setActionNotice(null), 4000);
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
          The 24/7 "Find My Tablets" location manager is restricted to Manager accounts only.
        </p>
        <button onClick={onBackToHome} className="btn btn-secondary" style={{ padding: '0.75rem 1.5rem', borderRadius: '12px' }}>
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div
      className="find-my-container"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.25rem',
        maxWidth: '1440px',
        margin: '0 auto',
        minHeight: '85vh',
        background: 'var(--bg-main)',
      }}
    >
      {/* Top Header Navigation (Apple Find My Theme) */}
      <div
        className="find-my-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, rgba(24, 24, 27, 0.95) 0%, rgba(9, 9, 11, 0.95) 100%)',
          borderRadius: '20px',
          padding: '1.1rem 1.6rem',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div className="find-my-header-title-group" style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '14px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 0 20px rgba(59, 130, 246, 0.4)',
            }}
          >
            <Radio size={24} color="#ffffff" className="animate-pulse" />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <h1 style={{ fontSize: '1.35rem', fontWeight: 900, margin: 0, color: '#ffffff', letterSpacing: '-0.02em' }}>
                Find My Production Tablets
              </h1>
              <span
                style={{
                  background: 'rgba(16, 185, 129, 0.15)',
                  border: '1px solid rgba(16, 185, 129, 0.3)',
                  color: '#10b981',
                  borderRadius: '999px',
                  padding: '2px 8px',
                  fontSize: '0.72rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} className="animate-ping" />
                24/7 LIVE
              </span>
            </div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#a1a1aa' }}>
              Apple Find My Telemetry — Real-time 24/7 location and isolated alarm triggering
            </p>
          </div>
        </div>

        <div className="find-my-header-buttons-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSimulatePing('T1')}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.45rem 0.8rem', borderRadius: '10px', fontWeight: 700 }}
            title="Approve & ping T1 (Frame Assembly)"
          >
            + Approve T1
          </button>
          <button
            onClick={() => handleSimulatePing('T2')}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.45rem 0.8rem', borderRadius: '10px', fontWeight: 700 }}
            title="Approve & ping T2 (Welding Bay 3)"
          >
            + Approve T2
          </button>
          <button
            onClick={() => handleSimulatePing('T3')}
            className="btn btn-secondary"
            style={{ fontSize: '0.78rem', padding: '0.45rem 0.8rem', borderRadius: '10px', fontWeight: 700 }}
            title="Approve & ping T3 (Finishing & Paint)"
          >
            + Approve T3
          </button>
          <button
            onClick={loadLocations}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.45rem 0.85rem', borderRadius: '10px' }}
            title="Refresh All Locations"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onBackToHome}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', padding: '0.45rem 0.95rem', borderRadius: '10px' }}
          >
            <Home size={14} />
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
            borderRadius: '12px',
            padding: '0.65rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            color: '#60a5fa',
            fontSize: '0.88rem',
            fontWeight: 700,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <CheckCircle2 size={18} color="#10b981" />
          <span>{actionNotice}</span>
        </div>
      )}

      {/* Dual Panel Layout: Devices Sidebar + Factory Shop Floor Map */}
      <div
        className="find-my-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(340px, 400px) 1fr',
          gap: '1.25rem',
          flex: 1,
        }}
      >
        {/* Left Panel: Devices List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem' }}>
            <h2 style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>
              Devices ({orderedTablets.length})
            </h2>
            <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>
              ● Live Sync
            </span>
          </div>

          {orderedTablets.map((tab) => {
            const spec = TABLET_SPECS[tab.slot];
            const isSelected = selectedSlot === tab.slot;
            const isRinging = ringingSlot === tab.slot;

            return (
              <div
                key={tab.slot}
                onClick={() => setSelectedSlot(tab.slot)}
                style={{
                  background: isSelected
                    ? 'linear-gradient(135deg, rgba(59, 130, 246, 0.15) 0%, rgba(24, 24, 27, 0.95) 100%)'
                    : 'linear-gradient(135deg, rgba(24, 24, 27, 0.8) 0%, rgba(18, 18, 20, 0.9) 100%)',
                  borderRadius: '16px',
                  padding: '1.15rem',
                  border: isSelected
                    ? '2px solid #3b82f6'
                    : '1px solid rgba(255, 255, 255, 0.08)',
                  boxShadow: isSelected
                    ? '0 8px 25px rgba(59, 130, 246, 0.25)'
                    : '0 4px 12px rgba(0, 0, 0, 0.2)',
                  cursor: 'pointer',
                  transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.85rem',
                }}
              >
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div
                      style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '12px',
                        background: isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                      }}
                    >
                      <Radio size={20} className={isRinging ? 'animate-bounce' : ''} />
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                        <strong style={{ fontSize: '1.02rem', fontWeight: 900, color: '#ffffff' }}>
                          {spec.officialName}
                        </strong>
                      </div>
                      <span style={{ fontSize: '0.76rem', color: '#a1a1aa' }}>
                        {spec.stationName}
                      </span>
                    </div>
                  </div>

                  {/* Status Pill */}
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '999px',
                      padding: '3px 8px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
                    Live 24/7 (Approved)
                  </div>
                </div>

                {/* Telemetry Row: Station & Location Coordinates */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    background: 'rgba(0, 0, 0, 0.3)',
                    padding: '0.55rem 0.85rem',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                  }}
                >
                  {/* Station Location */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#10b981', fontWeight: 800 }}>
                    <Compass size={15} />
                    <span>{spec.stationName}</span>
                  </div>

                  {/* Coordinates */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', color: '#60a5fa', fontWeight: 700 }}>
                    <MapPin size={14} />
                    <span>
                      {tab.latitude.toFixed(4)}, {tab.longitude.toFixed(4)}
                    </span>
                  </div>
                </div>

                {/* Action Buttons Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {isRinging ? (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStopSound(tab.slot);
                      }}
                      style={{
                        flex: 1,
                        background: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '10px',
                        padding: '0.55rem 0.8rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 4px 15px rgba(239, 68, 68, 0.4)',
                      }}
                    >
                      <VolumeX size={16} /> Stop Alarm
                    </button>
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePlaySound(tab.slot);
                      }}
                      style={{
                        flex: 1,
                        background: 'rgba(59, 130, 246, 0.15)',
                        color: '#60a5fa',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        borderRadius: '10px',
                        padding: '0.55rem 0.8rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        transition: 'all 0.15s ease',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.25)')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(59, 130, 246, 0.15)')}
                      title={`Ring ${spec.officialName} with Apple Find My chime`}
                    >
                      <Volume2 size={16} /> Play Sound
                    </button>
                  )}

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRequestAccess(tab.slot);
                    }}
                    style={{
                      background: 'rgba(16, 185, 129, 0.15)',
                      color: '#10b981',
                      border: '1px solid rgba(16, 185, 129, 0.3)',
                      borderRadius: '10px',
                      padding: '0.55rem 0.8rem',
                      fontSize: '0.8rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.3rem',
                    }}
                    title="Send Location Access Approval Request to Tablet"
                  >
                    <Compass size={14} /> Request Access
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Right Panel: Interactive Factory Floor Radar Map */}
        <div
          className="find-my-map-container"
          style={{
            background: 'linear-gradient(135deg, rgba(20, 20, 24, 0.95) 0%, rgba(10, 10, 12, 0.98) 100%)',
            borderRadius: '24px',
            padding: '1.5rem',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minHeight: '540px',
            overflow: 'hidden',
          }}
        >
          {/* Map Top Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem', zIndex: 10 }}>
            <div>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 900, margin: 0, color: '#ffffff' }}>
                Factory Shop Floor Radar Map
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#a1a1aa' }}>
                Lane Trailers Production Facility & Assembly Bays
              </span>
            </div>

            {selectedTablet && (
              <div
                style={{
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  borderRadius: '12px',
                  padding: '0.4rem 0.9rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  color: '#60a5fa',
                  fontSize: '0.84rem',
                  fontWeight: 800,
                }}
              >
                <Radio size={14} className="animate-pulse" />
                <span>Tracking: {selectedTablet.device_name}</span>
              </div>
            )}
          </div>

          {/* Interactive Radar Surface Area */}
          <div
            style={{
              flex: 1,
              background: 'radial-gradient(ellipse at center, rgba(30, 58, 138, 0.15) 0%, rgba(9, 9, 11, 0.9) 100%)',
              borderRadius: '18px',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              position: 'relative',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              minHeight: '440px',
            }}
          >
            {/* Radar Grid Circles */}
            <div
              style={{
                position: 'absolute',
                width: '320px',
                height: '320px',
                borderRadius: '50%',
                border: '1px dashed rgba(59, 130, 246, 0.2)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: '520px',
                height: '520px',
                borderRadius: '50%',
                border: '1px solid rgba(59, 130, 246, 0.1)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                width: '100%',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.2), transparent)',
                pointerEvents: 'none',
              }}
            />
            <div
              style={{
                position: 'absolute',
                height: '100%',
                width: '1px',
                background: 'linear-gradient(180deg, transparent, rgba(59, 130, 246, 0.2), transparent)',
                pointerEvents: 'none',
              }}
            />

            {/* Factory Zones Layout Badges */}
            <div
              style={{
                position: 'absolute',
                top: '1.2rem',
                left: '1.2rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              BAY 1: FRAME ASSEMBLY
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '1.2rem',
                left: '1.2rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              BAY 2: WELDING BAY 3
            </div>

            <div
              style={{
                position: 'absolute',
                top: '1.2rem',
                right: '1.2rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              BAY 3: FINISHING & PAINT
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '1.2rem',
                right: '1.2rem',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                padding: '6px 12px',
                borderRadius: '8px',
                color: 'rgba(255, 255, 255, 0.7)',
                fontSize: '0.75rem',
                fontWeight: 800,
              }}
            >
              SHIPPING YARD & STAGING
            </div>

            {/* Tablet Radar Beacons */}
            {orderedTablets.map((tab) => {
              const spec = TABLET_SPECS[tab.slot];
              const isSelected = selectedSlot === tab.slot;
              const isRinging = ringingSlot === tab.slot;

              // Fixed schematic coordinates on shop floor canvas
              const positions: Record<TabletSlot, { top: string; left: string }> = {
                T1: { top: '28%', left: '26%' },
                T2: { top: '72%', left: '28%' },
                T3: { top: '30%', left: '74%' },
                manager: { top: '50%', left: '50%' },
              };

              const pos = positions[tab.slot];

              return (
                <div
                  key={tab.slot}
                  onClick={() => setSelectedSlot(tab.slot)}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    zIndex: isSelected ? 20 : 10,
                  }}
                >
                  {/* Radar Pulse Rings */}
                  <div
                    style={{
                      position: 'relative',
                      width: isSelected ? '54px' : '44px',
                      height: isSelected ? '54px' : '44px',
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
                        background: isRinging ? 'rgba(239, 68, 68, 0.4)' : isSelected ? 'rgba(59, 130, 246, 0.35)' : 'rgba(16, 185, 129, 0.25)',
                        animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }}
                    />
                    <div
                      style={{
                        width: isSelected ? '38px' : '30px',
                        height: isSelected ? '38px' : '30px',
                        borderRadius: '50%',
                        background: isRinging
                          ? 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)'
                          : isSelected
                          ? 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                          : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#ffffff',
                        boxShadow: isRinging
                          ? '0 0 25px rgba(239, 68, 68, 0.8)'
                          : isSelected
                          ? '0 0 25px rgba(59, 130, 246, 0.8)'
                          : '0 0 15px rgba(16, 185, 129, 0.5)',
                        transition: 'all 0.2s ease',
                      }}
                    >
                      {isRinging ? <Volume2 size={18} className="animate-bounce" /> : <Radio size={16} />}
                    </div>
                  </div>

                  {/* Device Callout Label */}
                  <div
                    style={{
                      marginTop: '6px',
                      background: 'rgba(9, 9, 11, 0.95)',
                      border: isSelected ? '1px solid #3b82f6' : '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '8px',
                      padding: '3px 8px',
                      color: '#ffffff',
                      fontSize: '0.76rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
                    }}
                  >
                    {spec.officialName}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
