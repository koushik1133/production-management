import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Tv, Share2 } from 'lucide-react';
import { Modal } from './components/Modal';
import type { Trailer, PhaseId, UserRole } from './types';
import { PHASES } from './types';
import { TrailerCard } from './components/TrailerCard';
import { format } from 'date-fns';

interface Props {
  trailers: Trailer[];
  monitorMode?: 'all' | 'station1' | 'station2';
  localTargetHours: Record<string, Record<PhaseId, number>>;
  userRole: UserRole;
}

import logo from './assets/lane-logo-v4.png';

const TVView: React.FC<Props> = ({ trailers, monitorMode: initialMode = 'all', localTargetHours, userRole }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [monitorMode, setMonitorMode] = useState(initialMode);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());


  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  
  const filteredTrailers = trailers.filter(t => !t.isArchived);
  type Column = { id: string; title: string; type: 'phase' | 'station' };
  
  const columns: Column[] = (() => {
    if (monitorMode === 'station1') {
      return [
        { id: 'prefab', title: 'Prefab', type: 'phase' },
        { id: 'B1', title: 'Bay 1', type: 'station' },
        { id: 'B2', title: 'Bay 2', type: 'station' },
        { id: 'B3', title: 'Bay 3', type: 'station' },
        { id: 'B4', title: 'Bay 4', type: 'station' },
      ];
    }
    if (monitorMode === 'station2') {
      return PHASES.filter(p => ['paint', 'outsource', 'trim', 'shipping'].includes(p.id))
        .map(p => ({ id: p.id, title: p.title, type: 'phase' }));
    }
    return PHASES.map(p => ({ id: p.id, title: p.title, type: 'phase' }));
  })();

  const monitorTitle = monitorMode === 'station1' ? 'STATION 1' : monitorMode === 'station2' ? 'STATION 2' : 'FULL PIPELINE';

  useEffect(() => {
    if (window.innerWidth < 1024) return;
    if (monitorMode === 'station2') return;
    
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    let direction = 1;
    const scrollInterval = setInterval(() => {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
      if (scrollWidth <= clientWidth) return;
      if (scrollLeft + clientWidth >= scrollWidth - 2) direction = -1;
      else if (scrollLeft <= 0) direction = 1;
      scrollContainer.scrollBy({ left: 2 * direction, behavior: 'auto' });
    }, 40);
    return () => clearInterval(scrollInterval);
  }, [monitorMode]);

  // themeStyles removed in favor of CSS variables

  const getMonitorBtnStyle = (mode: string) => ({
    padding: '0.4rem 1rem',
    borderRadius: '8px',
    fontSize: '0.75rem',
    fontWeight: 800,
    cursor: 'pointer',
    background: monitorMode === mode ? 'var(--accent)' : 'transparent',
    color: monitorMode === mode ? 'var(--bg-main)' : 'var(--text-secondary)',
    border: 'none',
    boxShadow: monitorMode === mode ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
    transition: 'all 0.2s',
    display: 'flex',
    alignItems: 'center',
    gap: '0.4rem'
  });

  return (
    <div className="tv-view-container" style={{ minHeight: '100vh', background: 'var(--bg-main)', color: 'var(--text-primary)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <header className="header" style={{ 
        background: 'var(--bg-header)',
        backdropFilter: 'var(--glass-blur)',
        borderBottom: '1px solid var(--border-default)',
        padding: '0 1.5rem', 
        height: '64px', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between',
        flexWrap: 'nowrap',
        gap: '2rem'
      }}>
        {/* Left Section: Branding & Title */}
        <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexShrink: 0 }}>
          <Link to="/" className="btn btn-secondary" style={{ 
            padding: '0.4rem 0.75rem',
            borderRadius: '10px',
            fontSize: '0.75rem',
            fontWeight: 700
          }}>
            <ArrowLeft size={14} /> Exit
          </Link>
          
          <div style={{ width: '1px', height: '24px', background: 'var(--border-default)' }} />
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ background: '#000', padding: '3px 6px', borderRadius: '6px', display: 'flex', alignItems: 'center' }}>
              <img src={logo} alt="Logo" style={{ height: '32px' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <h1 style={{ fontSize: '0.9rem', fontWeight: 900, letterSpacing: '0.02em', color: 'var(--text-primary)', margin: 0 }}>{monitorTitle}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'rgba(34, 197, 94, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                  <div style={{ width: '6px', height: '6px', background: '#22c55e', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
                  <span style={{ fontSize: '0.65rem', fontWeight: 800, color: '#22c55e' }}>LIVE</span>
                </div>
              </div>
              <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>PRODUCTION STREAM</span>
            </div>
          </div>
        </div>

        {/* Center Section: Monitor Selection */}
        <div className="header-center" style={{ 
          display: 'flex', 
          gap: '0.25rem', 
          background: 'var(--bg-secondary)', 
          padding: '4px', 
          borderRadius: '12px',
          border: '1px solid var(--border-default)'
        }}>
          <button onClick={() => setMonitorMode('all')} style={getMonitorBtnStyle('all')}>
            <Tv size={14} /> ALL STATIONS
          </button>
          <button onClick={() => setMonitorMode('station1')} style={getMonitorBtnStyle('station1')}>STATION 1</button>
          <button onClick={() => setMonitorMode('station2')} style={getMonitorBtnStyle('station2')}>STATION 2</button>
        </div>

        {/* Right Section: Utilities & Clock */}
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
          <div className="clock-pill" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.75rem', 
            background: 'var(--bg-secondary)', 
            padding: '0.4rem 0.8rem', 
            borderRadius: '10px',
            border: '1px solid var(--border-default)',
            fontSize: '0.9rem',
            fontWeight: 800,
            color: 'var(--text-primary)'
          }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', fontWeight: 600 }}>{format(currentTime, 'hh:mm')}</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 400, opacity: 0.3 }}>|</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent)' }}>{format(currentTime, 'ss')}</span>
          </div>
            <button 
              className="btn btn-secondary btn-icon" 
              onClick={() => setIsCastModalOpen(true)}
              style={{ padding: '0.5rem', borderRadius: '10px' }}
            >
              <Share2 size={16} />
            </button>
        </div>
      </header>

      <Modal isOpen={isCastModalOpen} onClose={() => setIsCastModalOpen(false)} title="Monitor Setup">
         <div style={{ 
           display: 'flex', 
           flexDirection: 'column', 
           gap: '1.25rem', 
           padding: '1.5rem',
         }}>
            <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', fontWeight: 500, lineHeight: 1.5 }}>
              Connect your shop floor displays to this live production stream. 
              Open this link on any Smart TV or Tablet:
            </p>
            
            <div style={{ 
              background: 'var(--bg-secondary)', 
              padding: '1rem', 
              borderRadius: '12px', 
              border: '1px solid var(--border-default)',
              textAlign: 'center'
            }}>
              <a 
                href="https://production-management-murex.vercel.app/tv" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  fontSize: '1rem', 
                  fontWeight: 900, 
                  color: 'var(--accent)', 
                  textDecoration: 'underline',
                  wordBreak: 'break-all'
                }}
              >
                https://production-management-murex.vercel.app/tv
              </a>
            </div>
            
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button 
                className="btn btn-primary" 
                style={{ flex: 1, padding: '0.75rem', fontSize: '0.85rem' }}
                onClick={() => {
                  navigator.clipboard.writeText("https://production-management-murex.vercel.app/tv");
                  alert("Link copied to clipboard!");
                }}
              >
                Copy Link
              </button>
              <button 
                className="btn btn-secondary" 
                style={{ flex: 1, padding: '0.75rem', fontSize: '0.85rem' }}
                onClick={() => setIsCastModalOpen(false)}
              >
                Dismiss
              </button>
            </div>
         </div>
      </Modal>

      <main 
        className="main-content tv-main-content" 
        ref={scrollRef} 
        style={{ 
          padding: window.innerWidth < 768 ? '1rem' : '2rem', 
          gap: window.innerWidth < 768 ? '1rem' : '2rem', 
          flex: 1, 
          overflowX: 'auto', 
          overflowY: 'hidden',
          display: 'flex',
          justifyContent: window.innerWidth < 1024 
            ? 'flex-start' 
            : (monitorMode !== 'all' || columns.length <= 3 ? 'center' : 'flex-start'),
          alignItems: 'stretch'
        }}
      >
        {columns.map((col) => {
          const trailersInCol = col.type === 'phase' 
            ? filteredTrailers.filter(t => t.currentPhase === col.id)
            : filteredTrailers.filter(t => t.station === col.id);

          return (
            <div 
              key={col.id} 
              className="tv-column" 
              style={{ 
                background: 'var(--bg-card)', 
                border: '1px solid var(--border-default)',
                minWidth: window.innerWidth < 1024 ? '240px' : (columns.length > 4 ? 'calc(20% - 1.25rem)' : '280px'),
                flex: columns.length > 4 ? '1' : '0 0 auto',
                height: '100%', 
                display: 'flex',
                flexDirection: 'column',
                padding: '1.25rem',
                borderRadius: '20px',
                boxShadow: 'var(--shadow-md)'
              }}
            >
              <div className="column-header" style={{ marginBottom: '1.25rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="column-title" style={{ color: 'var(--text-muted)', fontSize: '1.1rem', fontWeight: 800 }}>{col.title}</span>
                <span className="column-count" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: '1rem', padding: '0.2rem 0.6rem', borderRadius: '8px', fontWeight: 700 }}>
                  {trailersInCol.length}
                </span>
              </div>
              <div className="cards-container" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {trailersInCol.map(trailer => (
                    <TrailerCard 
                      key={trailer.id} 
                      trailer={trailer} 
                      hideCustomerName={true} 
                      hideShipButton={true} 
                      isTVMode={true} 
                      localTargetHours={localTargetHours}
                      userRole={userRole}
                    />
                  ))}
                {trailersInCol.length === 0 && (
                  <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', fontStyle: 'italic', border: '1px dashed var(--border-default)', borderRadius: '12px' }}>
                    No units in this stage
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </main>

      <footer style={{ 
        height: '40px', 
        padding: '0 1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'var(--bg-header)', 
        borderTop: '1px solid var(--border-default)',
        fontSize: '0.75rem',
        color: 'var(--text-muted)'
      }}>
        <span>Live Production Stream</span>
      </footer>
    </div>
  );
};

export default TVView;
