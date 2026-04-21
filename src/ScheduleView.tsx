import React, { useState } from 'react';
import { format, isToday, isBefore, startOfDay } from 'date-fns';
import { Calendar, ChevronRight, MapPin, Clock, AlertTriangle, CheckCircle2, LayoutDashboard, Archive, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Trailer } from './types';
import { PHASES } from './types';

interface Props {
  trailers: Trailer[];
}

export const ScheduleView: React.FC<Props> = ({ trailers }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');

  const activeTrailers = trailers.filter(t => !t.isArchived && !t.isDeleted);
  
  const filteredTrailers = activeTrailers.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.model.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Grouping logic
  const today = startOfDay(new Date());
  
  const groups = {
    overdue: filteredTrailers.filter(t => t.promisedShippingDate && isBefore(startOfDay(new Date(t.promisedShippingDate + 'T12:00:00')), today)),
    today: filteredTrailers.filter(t => t.promisedShippingDate && isToday(new Date(t.promisedShippingDate + 'T12:00:00'))),
    upcoming: filteredTrailers.filter(t => t.promisedShippingDate && !isToday(new Date(t.promisedShippingDate + 'T12:00:00')) && !isBefore(startOfDay(new Date(t.promisedShippingDate + 'T12:00:00')), today)),
    unscheduled: filteredTrailers.filter(t => !t.promisedShippingDate)
  };

  // Sort groups by date
  groups.upcoming.sort((a, b) => new Date(a.promisedShippingDate!).getTime() - new Date(b.promisedShippingDate!).getTime());
  groups.overdue.sort((a, b) => new Date(a.promisedShippingDate!).getTime() - new Date(b.promisedShippingDate!).getTime());

  const RenderTrailerList = (list: Trailer[], title: string, color: string, icon: React.ReactNode) => {
    if (list.length === 0) return null;
    
    return (
      <div style={{ marginBottom: '2.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem', borderBottom: `2px solid ${color}20`, paddingBottom: '0.75rem' }}>
          {icon}
          <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            {title} <span style={{ marginLeft: '0.5rem', color: '#64748b', fontWeight: 600 }}>({list.length})</span>
          </h2>
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1rem' }}>
          {list.map(trailer => {
            const phase = PHASES.find(p => p.id === trailer.currentPhase);
            return (
              <div 
                key={trailer.id}
                className="schedule-card"
                style={{
                  background: 'white',
                  borderRadius: '16px',
                  padding: '1.25rem',
                  border: '1px solid #e2e8f0',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '1rem'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                  <div>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>{trailer.model}</div>
                    <div style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600 }}>{trailer.name}</div>
                  </div>
                  <div style={{ background: '#f1f5f9', padding: '0.25rem 0.6rem', borderRadius: '8px', fontSize: '0.7rem', fontWeight: 800, color: '#475569' }}>
                    #{trailer.serialNumber}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <div style={{ flex: 1, padding: '0.75rem', background: '#f8fafc', borderRadius: '12px', border: '1px solid #f1f5f9' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Current Phase</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <Clock size={14} />
                      {phase?.title}
                    </div>
                  </div>
                  <div style={{ flex: 1, padding: '0.75rem', background: trailer.isPriority ? '#fff1f2' : '#f8fafc', borderRadius: '12px', border: '1px solid', borderColor: trailer.isPriority ? '#fecdd3' : '#f1f5f9' }}>
                    <span style={{ fontSize: '0.6rem', fontWeight: 800, color: trailer.isPriority ? '#be123c' : '#94a3b8', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>Due Date</span>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: trailer.isPriority ? '#e11d48' : '#0f172a' }}>
                      {trailer.promisedShippingDate ? format(new Date(trailer.promisedShippingDate + 'T12:00:00'), 'MMM d, yyyy') : 'NOT SET'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '0.5rem', borderTop: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#64748b' }}>
                    <MapPin size={14} />
                    <span style={{ fontSize: '0.75rem', fontWeight: 700 }}>Bay: {trailer.station}</span>
                  </div>
                  <button 
                    onClick={() => navigate(`/?highlight=${trailer.id}`)} 
                    style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                  >
                    View on Board <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: '5rem' }}>
      <header style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '1.25rem 2rem', position: 'sticky', top: 0, zIndex: 100, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <button className="btn btn-secondary btn-icon" onClick={() => navigate('/')} title="Back to Dashboard">
            <LayoutDashboard size={20} />
          </button>
          <div style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 900, color: '#0f172a', margin: 0 }}>Master Production Schedule</h1>
            <p style={{ fontSize: '0.85rem', color: '#64748b', fontWeight: 600, margin: 0 }}>Factory-wide deadline tracking & prioritization</p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="header-search-container" style={{ width: '300px' }}>
            <input 
              type="text" 
              placeholder="Filter schedule..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ width: '100%', padding: '0.6rem 1rem', borderRadius: '10px', border: '1px solid #e2e8f0' }}
            />
          </div>
          <button className="btn btn-primary" onClick={() => navigate('/backlog')}>
            <Plus size={16} /> Register Unit
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '3rem' }}>
          <div style={{ background: '#fee2e2', padding: '1.5rem', borderRadius: '20px', border: '1px solid #fecdd3' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase' }}>Overdue Units</span>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#991b1b' }}>{groups.overdue.length}</div>
          </div>
          <div style={{ background: '#fef9c3', padding: '1.5rem', borderRadius: '20px', border: '1px solid #fef08a' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#854d0e', textTransform: 'uppercase' }}>Due Today</span>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#713f12' }}>{groups.today.length}</div>
          </div>
          <div style={{ background: '#dcfce7', padding: '1.5rem', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#166534', textTransform: 'uppercase' }}>Next 7 Days</span>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#14532d' }}>{groups.upcoming.length}</div>
          </div>
          <div style={{ background: '#f1f5f9', padding: '1.5rem', borderRadius: '20px', border: '1px solid #e2e8f0' }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#475569', textTransform: 'uppercase' }}>Unscheduled</span>
            <div style={{ fontSize: '2rem', fontWeight: 900, color: '#1e293b' }}>{groups.unscheduled.length}</div>
          </div>
        </div>

        {RenderTrailerList(groups.overdue, "Critical: Overdue Units", "#ef4444", <AlertTriangle color="#ef4444" size={24} />)}
        {RenderTrailerList(groups.today, "Due Today", "#eab308", <Clock color="#eab308" size={24} />)}
        {RenderTrailerList(groups.upcoming, "Upcoming Deadlines", "#22c55e", <CheckCircle2 color="#22c55e" size={24} />)}
        {RenderTrailerList(groups.unscheduled, "Pending Schedule", "#94a3b8", <Calendar color="#94a3b8" size={24} />)}
      </div>

      <nav style={{ position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)', background: 'rgba(15, 23, 42, 0.9)', backdropFilter: 'blur(10px)', padding: '0.75rem 1.5rem', borderRadius: '50px', display: 'flex', gap: '1rem', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)', zIndex: 1000 }}>
        <button onClick={() => navigate('/')} style={{ background: 'none', border: 'none', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', opacity: 0.6 }}>
          <LayoutDashboard size={20} />
          <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>Board</span>
        </button>
        <div style={{ width: '1px', background: 'rgba(255,255,255,0.2)', margin: '0 0.5rem' }} />
        <button onClick={() => navigate('/stations')} style={{ background: 'none', border: 'none', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', opacity: 0.6 }}>
          <MapPin size={20} />
          <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>Bays</span>
        </button>
        <button onClick={() => navigate('/archive')} style={{ background: 'none', border: 'none', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', cursor: 'pointer', opacity: 0.6 }}>
          <Archive size={20} />
          <span style={{ fontSize: '0.6rem', fontWeight: 700 }}>Archive</span>
        </button>
      </nav>
    </div>
  );
};
