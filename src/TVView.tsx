import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Monitor, Tv, Moon, Sun } from 'lucide-react';
import type { Trailer } from './types';
import { PHASES } from './types';
import { TrailerCard } from './components/TrailerCard';

interface Props {
  trailers: Trailer[];
  monitorMode?: 'all' | 'station1' | 'station2';
}

const TVView: React.FC<Props> = ({ trailers, monitorMode: initialMode = 'all' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [monitorMode, setMonitorMode] = useState(initialMode);
  
  const filteredTrailers = trailers.filter(t => !t.isArchived);
  const filteredPhases = PHASES.filter(p => {
    if (monitorMode === 'station1') return ['backlog', 'prefab', 'build'].includes(p.id);
    if (monitorMode === 'station2') return ['paint', 'outsource', 'trim', 'shipping'].includes(p.id);
    return true;
  });

  const monitorTitle = monitorMode === 'station1' ? 'Station 1 Progress' : monitorMode === 'station2' ? 'Station 2 Progress' : 'Live Production Stream';

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    let direction = 1;
    const scrollInterval = setInterval(() => {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainer;
      
      if (scrollWidth <= clientWidth) return;

      if (scrollLeft + clientWidth >= scrollWidth - 2) {
        direction = -1;
      } else if (scrollLeft <= 0) {
        direction = 1;
      }
      
      scrollContainer.scrollBy({ left: 2 * direction, behavior: 'auto' });
    }, 40);
    
    return () => clearInterval(scrollInterval);
  }, [monitorMode]);

  const themeStyles = {
    app: {
      background: isDarkMode ? '#09090b' : '#f8fafc',
      color: isDarkMode ? 'white' : '#1e293b',
      transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column' as const
    },
    header: {
      background: isDarkMode ? '#18181b' : 'white',
      borderBottom: `1px solid ${isDarkMode ? '#27272a' : '#e2e8f0'}`,
    },
    column: {
      background: isDarkMode ? '#18181b' : 'white',
      border: `1px solid ${isDarkMode ? '#27272a' : '#e2e8f0'}`,
    },
    textMuted: isDarkMode ? '#a1a1aa' : '#64748b',
  };

  const getMonitorBtnStyle = (mode: string) => ({
    padding: '0.4rem 0.8rem',
    borderRadius: '6px',
    fontSize: '0.75rem',
    fontWeight: 700,
    cursor: 'pointer',
    background: monitorMode === mode ? '#3b82f6' : 'transparent',
    color: monitorMode === mode ? 'white' : themeStyles.textMuted,
    border: `1px solid ${monitorMode === mode ? '#3b82f6' : isDarkMode ? '#3f3f46' : '#e2e8f0'}`,
    transition: 'all 0.2s'
  });

  return (
    <div className="tv-view-container" style={themeStyles.app}>
      <header className="header" style={{ ...themeStyles.header, padding: '0.5rem 1.5rem', height: 'auto', flexWrap: 'wrap' }}>
        <div className="header-left">
          <Link to="/" className="btn btn-secondary" style={{ 
            padding: '0.4rem 0.8rem',
            color: isDarkMode ? 'white' : '#1e293b', 
            borderColor: isDarkMode ? '#3f3f46' : '#e2e8f0',
            background: isDarkMode ? 'transparent' : 'white'
          }}>
            <ArrowLeft size={16} /> Exit
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginLeft: '1rem' }}>
            <Tv size={20} color="#3b82f6" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em' }}>{monitorTitle}</h1>
          </div>
        </div>

        <div className="header-center" style={{ display: 'flex', gap: '0.5rem', background: isDarkMode ? '#09090b' : '#f1f5f9', padding: '4px', borderRadius: '10px' }}>
          <button onClick={() => setMonitorMode('all')} style={getMonitorBtnStyle('all')}>MAIN VIEW</button>
          <button onClick={() => setMonitorMode('station1')} style={getMonitorBtnStyle('station1')}>STATION 1</button>
          <button onClick={() => setMonitorMode('station2')} style={getMonitorBtnStyle('station2')}>STATION 2</button>
        </div>

        <div className="header-right" style={{ gap: '1rem' }}>
          <div style={{ display: 'flex', background: isDarkMode ? '#27272a' : '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
            <button onClick={() => setIsDarkMode(false)} style={{ background: !isDarkMode ? 'white' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer' }}><Sun size={14} /></button>
            <button onClick={() => setIsDarkMode(true)} style={{ background: isDarkMode ? '#3f3f46' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', color: 'white' }}><Moon size={14} /></button>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 600, color: themeStyles.textMuted }}>{new Date().toLocaleTimeString()}</div>
        </div>
      </header>

      <main className="main-content" ref={scrollRef} style={{ padding: '2rem', gap: '2rem', flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
        {filteredPhases.map((phase) => (
          <div key={phase.id} className="kanban-column" style={{ ...themeStyles.column, minWidth: '420px', height: '100%', flexShrink: 0 }}>
            <div className="column-header" style={{ marginBottom: '1.5rem' }}>
              <span className="column-title" style={{ color: themeStyles.textMuted, fontSize: '1rem', fontWeight: 700 }}>{phase.title}</span>
              <span className="column-count" style={{ background: isDarkMode ? '#27272a' : '#f1f5f9', color: isDarkMode ? 'white' : '#1e293b', fontSize: '1rem' }}>
                {filteredTrailers.filter(t => t.currentPhase === phase.id).length}
              </span>
            </div>
            <div className="cards-container" style={{ overflowY: 'auto' }}>
              {filteredTrailers
                .filter(t => t.currentPhase === phase.id)
                .map(trailer => (
                  <TrailerCard key={trailer.id} trailer={trailer} hideCustomerName={true} hideShipButton={true} />
                ))}
            </div>
          </div>
        ))}
      </main>
      
      <footer style={{ 
        height: '48px', 
        padding: '0 2rem', 
        display: 'flex', 
        alignItems: 'center', 
        background: themeStyles.header.background, 
        borderTop: themeStyles.header.borderBottom,
        fontSize: '1rem',
        color: themeStyles.textMuted
      }}>
        <span>Total Units in Stream: {trailers.length}</span>
        <span style={{ flex: 1 }}></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
           <Monitor size={16} /> Monitor #001 - Lane Trailers Main Hall
        </span>
      </footer>
    </div>
  );
};

export default TVView;
