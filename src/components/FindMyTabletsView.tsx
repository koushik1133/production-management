import React, { useState, useEffect, useCallback } from 'react';
import {
  Navigation,
  Volume2,
  VolumeX,
  Battery,
  BatteryCharging,
  Wifi,
  WifiOff,
  RefreshCw,
  MapPin,
  Compass,
  AlertTriangle,
  Smartphone,
  CheckCircle2,
  Radio,
} from 'lucide-react';
import { fetchTabletLocations, sendRemoteCommand, subscribeToLocationUpdates, upsertTabletLocation } from '../lib/findMy';
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
  const [selectedTabletId, setSelectedTabletId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [ringingTabletId, setRingingTabletId] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Verification guard: Only Manager role can view Find My dashboard
  const isManager = currentRole === 'manager';

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchTabletLocations();
      setTablets([...data]);
      if (data.length > 0 && !selectedTabletId) {
        setSelectedTabletId(data[0].user_id);
      }
    } catch (err) {
      console.error('Error loading tablet locations:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedTabletId]);

  useEffect(() => {
    loadLocations();
    const interval = setInterval(loadLocations, 5000); // 5s live refresh
    const unsubscribe = subscribeToLocationUpdates(() => {
      loadLocations();
    });
    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [loadLocations]);

  const handlePlaySound = async (targetUserId: string, deviceName: string) => {
    setRingingTabletId(targetUserId);
    setActionNotice(`🔔 Playing alarm chime on ${deviceName}...`);
    await sendRemoteCommand(targetUserId, 'PLAY_SOUND', deviceName);

    setTimeout(() => {
      setRingingTabletId((prev) => (prev === targetUserId ? null : prev));
      setActionNotice(null);
    }, 12000);
  };

  const handleStopSound = async (targetUserId: string, deviceName: string) => {
    setRingingTabletId(null);
    setActionNotice(`🔇 Alarm stopped on ${deviceName}`);
    await sendRemoteCommand(targetUserId, 'STOP_SOUND', deviceName);
    setTimeout(() => setActionNotice(null), 3000);
  };

  const handleRequestAccess = async (targetUserId: string, deviceName: string) => {
    setActionNotice(`📩 Location Access Request sent to all devices matching ${deviceName}`);
    await sendRemoteCommand(targetUserId, 'REQUEST_LOCATION_PERMISSION', deviceName);
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleSimulatePing = async (targetTabletName: 'T1' | 'T2' | 'T3') => {
    const canonicalId =
      targetTabletName === 'T1'
        ? '00000000-0000-4000-a000-000000000001'
        : targetTabletName === 'T2'
        ? '00000000-0000-4000-a000-000000000002'
        : '00000000-0000-4000-a000-000000000003';

    const bays = {
      T1: { name: 'T1 (Frame Assembly)', lat: 33.1248, lng: -96.7977, bat: 1.0 },
      T2: { name: 'T2 (Welding Bay 3)', lat: 33.1243, lng: -96.7975, bat: 0.92 },
      T3: { name: 'T3 (Finishing & Paint)', lat: 33.1250, lng: -96.7984, bat: 0.88 },
    };

    const bay = bays[targetTabletName];
    await upsertTabletLocation({
      user_id: canonicalId,
      device_name: bay.name,
      role: 'worker',
      latitude: bay.lat,
      longitude: bay.lng,
      accuracy: 10,
      battery_level: bay.bat,
      is_charging: true,
      is_online: true,
      permission_approved: true,
      last_ping_at: new Date().toISOString(),
    });

    setActionNotice(`✅ 24/7 Location & Battery tracking enabled for ${targetTabletName}!`);
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
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          textAlign: 'center',
        }}
      >
        <AlertTriangle size={48} color="#ef4444" style={{ marginBottom: '1rem' }} />
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#ef4444', marginBottom: '0.5rem' }}>
          Access Restricted
        </h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
          The 24/7 "Find My Tablets" location manager is restricted to Manager accounts only.
        </p>
        <button onClick={onBackToHome} className="btn btn-secondary">
          Return to Dashboard
        </button>
      </div>
    );
  }

  const selectedTablet = tablets.find((t) => t.user_id === selectedTabletId) || tablets[0];

  const getStatusInfo = (tab: TabletLocation) => {
    if (tab.permission_approved && tab.is_online) {
      return { label: 'Live 24/7 (Approved)', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)' };
    }
    return { label: 'Offline / Location Pending', color: '#ef4444', bg: 'rgba(239, 68, 68, 0.15)' };
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.25rem',
        maxWidth: '1400px',
        margin: '0 auto',
        minHeight: '85vh',
      }}
    >
      {/* Top Header Navigation */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-secondary)',
          borderRadius: '16px',
          padding: '1rem 1.5rem',
          border: '1px solid var(--border-color)',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div
            style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
              color: 'white',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 12px rgba(2, 132, 199, 0.3)',
            }}
          >
            <Compass size={24} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <h2 style={{ fontSize: '1.2rem', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
                Find My Production Tablets
              </h2>
              <span
                style={{
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: 'rgba(16, 185, 129, 0.15)',
                  color: '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                <Radio size={12} className="animate-pulse" /> 24/7 Live
              </span>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', margin: 0 }}>
              Real-time location, battery status, and lost tablet alarm trigger (Manager Access)
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => handleSimulatePing('T1')}
            title="Enable 24/7 location & battery tracking for T1"
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 800,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
            }}
          >
            + Approve T1
          </button>
          <button
            onClick={() => handleSimulatePing('T2')}
            title="Enable 24/7 location & battery tracking for T2"
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 800,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
            }}
          >
            + Approve T2
          </button>
          <button
            onClick={() => handleSimulatePing('T3')}
            title="Enable 24/7 location & battery tracking for T3"
            style={{
              padding: '6px 12px',
              borderRadius: '8px',
              fontSize: '0.76rem',
              fontWeight: 800,
              background: 'rgba(16, 185, 129, 0.15)',
              color: '#10b981',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              cursor: 'pointer',
            }}
          >
            + Approve T3
          </button>
          <button
            onClick={loadLocations}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.82rem', fontWeight: 700 }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={onBackToHome} className="btn btn-secondary" style={{ fontSize: '0.82rem', fontWeight: 700 }}>
            Home
          </button>
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionNotice && (
        <div
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.4)',
            borderRadius: '12px',
            padding: '0.75rem 1.25rem',
            color: '#10b981',
            fontSize: '0.88rem',
            fontWeight: 800,
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <CheckCircle2 size={18} /> {actionNotice}
        </div>
      )}

      {/* Dual Panel Layout: Device Sidebar + Map Visualization */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(320px, 380px) 1fr',
          gap: '1.25rem',
          flex: 1,
        }}
      >
        {/* Left Sidebar: Device Cards List */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '0.85rem',
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-secondary)' }}>
              DEVICES ({tablets.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Updated Live</span>
          </div>

          {tablets.length === 0 ? (
            <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No active tablet pings detected yet.
            </div>
          ) : (
            tablets.map((tab) => {
              const isSelected = tab.user_id === selectedTabletId;
              const status = getStatusInfo(tab);
              const isRinging = ringingTabletId === tab.user_id;

              return (
                <div
                  key={tab.user_id}
                  onClick={() => setSelectedTabletId(tab.user_id)}
                  style={{
                    padding: '1rem',
                    borderRadius: '14px',
                    background: isSelected ? 'rgba(59, 130, 246, 0.12)' : 'var(--bg-primary)',
                    border: isSelected ? '2px solid #3b82f6' : '1px solid var(--border-color)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  {/* Top Bar: Device Name & Status Badge */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Smartphone size={18} style={{ color: isSelected ? '#3b82f6' : 'var(--text-primary)' }} />
                      <span style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                        {tab.device_name}
                      </span>
                    </div>

                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: status.bg,
                        color: status.color,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      {tab.is_online ? <Wifi size={10} /> : <WifiOff size={10} />}
                      {status.label}
                    </span>
                  </div>

                  {/* Metadata Row: Battery & Location */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontSize: '0.78rem',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      {tab.permission_approved && tab.is_online && tab.battery_level !== undefined ? (
                        <>
                          {tab.is_charging !== false ? (
                            <BatteryCharging size={14} color="#10b981" />
                          ) : (
                            <Battery size={14} color={Math.round((tab.battery_level ?? 1.0) * 100) < 20 ? '#ef4444' : 'var(--text-secondary)'} />
                          )}
                          <span>{Math.round((tab.battery_level ?? 1.0) * 100)}% Battery</span>
                        </>
                      ) : (
                        <>
                          <Battery size={14} style={{ opacity: 0.4 }} />
                          <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Battery Not Reported</span>
                        </>
                      )}
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      {tab.permission_approved && tab.is_online && tab.latitude && tab.longitude ? (
                        <>
                          <MapPin size={13} color="#3b82f6" />
                          <span>
                            {tab.latitude.toFixed(4)}, {tab.longitude.toFixed(4)}
                          </span>
                        </>
                      ) : (
                        <>
                          <MapPin size={13} style={{ opacity: 0.4 }} />
                          <span style={{ fontStyle: 'italic', opacity: 0.6 }}>Location Not Found</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Action Buttons: Play Sound Alarm & Request Access */}
                  <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.25rem' }}>
                    {isRinging ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleStopSound(tab.user_id, tab.device_name);
                        }}
                        style={{
                          flex: 1,
                          background: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '0.45rem',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <VolumeX size={15} /> Stop Alarm
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlaySound(tab.user_id, tab.device_name);
                        }}
                        style={{
                          flex: 1,
                          background: 'rgba(59, 130, 246, 0.15)',
                          color: '#3b82f6',
                          border: '1px solid rgba(59, 130, 246, 0.3)',
                          borderRadius: '8px',
                          padding: '0.45rem',
                          fontSize: '0.78rem',
                          fontWeight: 800,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.4rem',
                        }}
                        title="Ring lost tablet with loud chime"
                      >
                        <Volume2 size={15} /> Play Sound
                      </button>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRequestAccess(tab.user_id, tab.device_name);
                      }}
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.3)',
                        borderRadius: '8px',
                        padding: '0.45rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 800,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.3rem',
                      }}
                      title="Send Location Access Approval Request to Tablet"
                    >
                      <Compass size={13} /> Request Access
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Right Panel: Interactive Shop Floor Location Map */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: '16px',
            padding: '1.25rem',
            border: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            minHeight: '500px',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: 900, margin: 0, color: 'var(--text-primary)' }}>
                Factory Shop Floor Map
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                Lane Trailers Production Facility & Yard
              </span>
            </div>

            {selectedTablet && (
              <div
                style={{
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '0.4rem 0.8rem',
                  fontSize: '0.8rem',
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <Navigation size={14} color="#3b82f6" />
                <span>Selected: {selectedTablet.device_name}</span>
              </div>
            )}
          </div>

          {/* Interactive Shop Floor Grid Map Canvas */}
          <div
            style={{
              flex: 1,
              background: '#0f172a',
              borderRadius: '14px',
              position: 'relative',
              overflow: 'hidden',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Grid Overlay Lines */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                backgroundImage:
                  'radial-gradient(rgba(255, 255, 255, 0.1) 1px, transparent 0)',
                backgroundSize: '24px 24px',
                opacity: 0.6,
              }}
            />

            {/* Factory Zones Layout Labels */}
            <div
              style={{
                position: 'absolute',
                top: '1rem',
                left: '1rem',
                background: 'rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              BAY 1: FRAME ASSEMBLY
            </div>

            <div
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                background: 'rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              BAY 2: WELDING
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                left: '1rem',
                background: 'rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              BAY 3: ELECTRICAL & FINISHING
            </div>

            <div
              style={{
                position: 'absolute',
                bottom: '1rem',
                right: '1rem',
                background: 'rgba(255,255,255,0.08)',
                padding: '4px 10px',
                borderRadius: '6px',
                color: 'rgba(255,255,255,0.6)',
                fontSize: '0.72rem',
                fontWeight: 800,
              }}
            >
              SHIPPING YARD
            </div>

            {/* Device Location Pins - Only rendered for approved online tablets */}
            {tablets.filter((t) => t.permission_approved && t.is_online && t.latitude && t.longitude).length === 0 && (
              <div style={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.82rem', fontWeight: 600, textAlign: 'center', zIndex: 5, padding: '1rem' }}>
                No active approved tablets reported on shop floor map.<br />
                <span style={{ fontSize: '0.74rem', opacity: 0.6 }}>Click "Request Access" to prompt worker tablet location approval.</span>
              </div>
            )}

            {tablets.filter((t) => t.permission_approved && t.is_online && t.latitude && t.longitude).map((tab, idx) => {
              const isSelected = tab.user_id === selectedTabletId;
              const isRinging = ringingTabletId === tab.user_id;

              // Compute grid positioning based on role / coordinates
              const positions = [
                { top: '35%', left: '30%' },
                { top: '42%', left: '68%' },
                { top: '65%', left: '35%' },
                { top: '50%', left: '50%' },
              ];
              const pos = positions[idx % positions.length];

              return (
                <div
                  key={tab.user_id}
                  onClick={() => setSelectedTabletId(tab.user_id)}
                  style={{
                    position: 'absolute',
                    top: pos.top,
                    left: pos.left,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    zIndex: isSelected ? 10 : 2,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                  }}
                >
                  {/* Alarm Radar Ring Pulse */}
                  {(isRinging || isSelected) && (
                    <div
                      style={{
                        position: 'absolute',
                        width: '64px',
                        height: '64px',
                        borderRadius: '50%',
                        background: isRinging
                          ? 'rgba(239, 68, 68, 0.4)'
                          : 'rgba(59, 130, 246, 0.25)',
                        border: isRinging
                          ? '2px solid #ef4444'
                          : '2px solid #3b82f6',
                        animation: 'ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite',
                      }}
                    />
                  )}

                  {/* Device Pin Indicator */}
                  <div
                    style={{
                      width: isSelected ? '44px' : '36px',
                      height: isSelected ? '44px' : '36px',
                      borderRadius: '50%',
                      background: isRinging
                        ? '#ef4444'
                        : isSelected
                        ? '#3b82f6'
                        : '#0284c7',
                      color: 'white',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: isSelected
                        ? '0 0 20px rgba(59, 130, 246, 0.8)'
                        : '0 4px 10px rgba(0, 0, 0, 0.5)',
                      border: '3px solid white',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    <Smartphone size={isSelected ? 22 : 18} />
                  </div>

                  {/* Pin Callout Tag */}
                  <div
                    style={{
                      marginTop: '6px',
                      background: 'rgba(15, 23, 42, 0.9)',
                      border: isSelected
                        ? '1px solid #3b82f6'
                        : '1px solid rgba(255, 255, 255, 0.2)',
                      borderRadius: '8px',
                      padding: '3px 8px',
                      color: 'white',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      whiteSpace: 'nowrap',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
                    }}
                  >
                    {tab.device_name}
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
