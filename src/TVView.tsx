import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Tv, Share2, Maximize, Minimize, Sun, Moon } from 'lucide-react';
import { Modal } from './components/Modal';
import type { Trailer } from './types';
import { PHASES } from './types';
import { TrailerCard } from './components/TrailerCard';

interface Props {
  trailers: Trailer[];
  monitorMode?: 'all' | 'station1' | 'station2';
}

const TVView: React.FC<Props> = ({ trailers, monitorMode: initialMode = 'all' }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [monitorMode, setMonitorMode] = useState(initialMode);
  const [isCastModalOpen, setIsCastModalOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        alert(`Error attempting to enable fullscreen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };
  
  const filteredTrailers = trailers.filter(t => !t.isArchived);
  const filteredPhases = PHASES.filter(p => {
    if (monitorMode === 'station1') return ['backlog', 'prefab', 'build'].includes(p.id);
    if (monitorMode === 'station2') return ['paint', 'outsource', 'trim', 'shipping'].includes(p.id);
    // 'All' view now shows every phase in the production lifecycle
    return true;
  });

  const monitorTitle = monitorMode === 'station1' ? 'Station 1 Progress' : monitorMode === 'station2' ? 'Station 2 Progress' : 'Live Production Stream';

  useEffect(() => {
    // Disable auto-scroll on mobile/tablet to avoid 'skipping' behavior
    if (window.innerWidth < 1024) return;

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
      flexDirection: 'column' as const,
      overflow: 'hidden'
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
      <header className="header" style={{ ...themeStyles.header, padding: '0.5rem 1rem', height: 'auto', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div className="header-left" style={{ flex: 1, minWidth: '200px' }}>
          <Link to="/" className="btn btn-secondary" style={{ 
            padding: '0.4rem 0.6rem',
            color: isDarkMode ? 'white' : '#1e293b', 
            borderColor: isDarkMode ? '#3f3f46' : '#e2e8f0',
            background: isDarkMode ? 'transparent' : 'white'
          }}>
            <ArrowLeft size={16} /> <span style={{ fontSize: '0.8rem' }}>Exit</span>
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginLeft: '0.75rem' }}>
            <Tv size={24} color="#3b82f6" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>{monitorTitle}</h1>
          </div>
        </div>

        <div className="header-center" style={{ display: 'flex', gap: '0.25rem', background: isDarkMode ? '#09090b' : '#f1f5f9', padding: '3px', borderRadius: '8px', overflowX: 'auto' }}>
          <button onClick={() => setMonitorMode('all')} style={getMonitorBtnStyle('all')}>ALL</button>
          <button onClick={() => setMonitorMode('station1')} style={getMonitorBtnStyle('station1')}>ST 1</button>
          <button onClick={() => setMonitorMode('station2')} style={getMonitorBtnStyle('station2')}>ST 2</button>
        </div>

        <div className="header-right" style={{ gap: '0.5rem', marginLeft: 'auto' }}>
          <div style={{ display: 'flex', background: isDarkMode ? '#27272a' : '#f1f5f9', padding: '3px', borderRadius: '10px' }}>
            <button onClick={() => setIsDarkMode(false)} style={{ background: !isDarkMode ? 'white' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', color: isDarkMode ? '#a1a1aa' : '#1e293b' }}>
              <Sun size={14} />
            </button>
            <button onClick={() => setIsDarkMode(true)} style={{ background: isDarkMode ? '#3f3f46' : 'transparent', border: 'none', padding: '4px 8px', borderRadius: '8px', cursor: 'pointer', color: isDarkMode ? 'white' : '#64748b' }}>
              <Moon size={14} />
            </button>
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 800, color: themeStyles.textMuted, background: isDarkMode ? '#27272a' : '#f1f5f9', padding: '0.4rem 0.75rem', borderRadius: '8px' }}>
            {currentTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </div>
          
          <button 
            className="btn btn-secondary" 
            onClick={toggleFullscreen}
            style={{ 
              padding: '0.4rem',
              color: isDarkMode ? 'white' : '#1e293b', 
              borderColor: isDarkMode ? '#3f3f46' : '#e2e8f0',
              background: isDarkMode ? 'transparent' : 'white',
              borderRadius: '8px'
            }}
          >
            {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
          </button>
          
          <button 
            className="btn btn-secondary" 
            onClick={() => setIsCastModalOpen(true)}
            style={{ 
              padding: '0.4rem', 
              borderRadius: '8px', 
              color: isDarkMode ? 'white' : '#1e293b',
              background: isDarkMode ? '#27272a' : 'white',
              borderColor: isDarkMode ? '#3f3f46' : '#e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Share2 size={18} />
          </button>
        </div>
      </header>

      <Modal isOpen={isCastModalOpen} onClose={() => setIsCastModalOpen(false)} title="Monitor Setup" darkMode={isDarkMode}>
         <div style={{ 
           display: 'flex', 
           flexDirection: 'column', 
           gap: '1.25rem', 
           padding: '1.5rem',
         }}>
            <p style={{ fontSize: '0.9rem', color: isDarkMode ? '#a1a1aa' : '#64748b', fontWeight: 500, lineHeight: 1.5 }}>
              Connect your shop floor displays to this live production stream. 
              Open this link on any Smart TV or Tablet:
            </p>
            
            <div style={{ 
              background: isDarkMode ? 'rgba(0,0,0,0.3)' : '#f8fafc', 
              padding: '1rem', 
              borderRadius: '12px', 
              border: '1px solid',
              borderColor: isDarkMode ? '#27272a' : '#e2e8f0',
              textAlign: 'center'
            }}>
              <a 
                href="https://production-management-murex.vercel.app/tv" 
                target="_blank" 
                rel="noopener noreferrer"
                style={{ 
                  fontSize: '1rem', 
                  fontWeight: 900, 
                  color: isDarkMode ? '#60a5fa' : '#2563eb', 
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
            : (monitorMode !== 'all' || filteredPhases.length <= 3 ? 'center' : 'flex-start'),
          alignItems: 'stretch'
        }}
      >
        {filteredPhases.map((phase) => (
          <div 
            key={phase.id} 
            className="tv-column" 
            style={{ 
              ...themeStyles.column, 
              minWidth: window.innerWidth < 768 ? 'calc(100vw - 2rem)' : '420px', 
              height: '100%', 
              flexShrink: 0,
              display: 'flex',
              flexDirection: 'column',
              padding: '1.25rem',
              borderRadius: '20px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
            }}
          >
            <div className="column-header" style={{ marginBottom: '1.25rem', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="column-title" style={{ color: themeStyles.textMuted, fontSize: '1.1rem', fontWeight: 800 }}>{phase.title}</span>
              <span className="column-count" style={{ background: isDarkMode ? '#27272a' : '#f1f5f9', color: isDarkMode ? 'white' : '#1e293b', fontSize: '1rem', padding: '0.2rem 0.6rem', borderRadius: '8px', fontWeight: 700 }}>
                {filteredTrailers.filter(t => t.currentPhase === phase.id).length}
              </span>
            </div>
            <div className="cards-container" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {filteredTrailers
                .filter(t => t.currentPhase === phase.id)
                .map(trailer => (
                  <TrailerCard key={trailer.id} trailer={trailer} hideCustomerName={true} hideShipButton={true} />
                ))}
              {filteredTrailers.filter(t => t.currentPhase === phase.id).length === 0 && (
                <div style={{ padding: '2rem', textAlign: 'center', color: themeStyles.textMuted, fontSize: '0.8rem', fontStyle: 'italic', border: '1px dashed #cbd5e1', borderRadius: '12px' }}>
                  No units in this stage
                </div>
              )}
            </div>
          </div>
        ))}
      </main>

      <footer style={{ 
        height: '40px', 
        padding: '0 1.5rem', 
        display: 'flex', 
        alignItems: 'center', 
        background: themeStyles.header.background, 
        borderTop: themeStyles.header.borderBottom,
        fontSize: '0.75rem',
        color: themeStyles.textMuted
      }}>
        <span>Live Production Stream • Status: Online</span>
        <span style={{ flex: 1 }}></span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
           <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#22c55e' }} /> Monitor Connected
        </span>
      </footer>
    </div>
  );
};

export default TVView;
