import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Calendar, Truck, Search, ChevronRight } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer } from './types';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
}

export const ArchiveView: React.FC<Props> = ({ trailers, onUpdateTrailer }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);

  const archivedTrailers = trailers
    .filter(t => t.isArchived)
    .filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => (b.archivedAt || 0) - (a.archivedAt || 0));

  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-left">
          <Link to="/" className="btn btn-secondary">
            <ArrowLeft size={16} /> Back to Dashboard
          </Link>
          <div style={{ marginLeft: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Truck size={20} color="#64748b" />
            <h1 style={{ fontSize: '1.25rem', fontWeight: 800 }}>Production Archive</h1>
          </div>
        </div>
        <div className="header-right">
           <div className="search-bar">
            <Search size={16} color="var(--text-muted)" />
            <input 
              type="text" 
              placeholder="Search archive..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
            />
          </div>
        </div>
      </header>

      <main className="main-content" style={{ padding: '2rem' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
            <div>
              <p style={{ color: '#64748b', fontWeight: 600 }}>A historical record of all shipped units and their production performance.</p>
            </div>
            <div style={{ background: '#f1f5f9', padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700, color: '#475569' }}>
              {archivedTrailers.length} Shipped Units
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {archivedTrailers.length > 0 ? archivedTrailers.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTrailerId(t.id)}
                style={{ 
                  background: 'white', 
                  border: '1px solid #e2e8f0', 
                  borderRadius: '16px', 
                  padding: '1.5rem', 
                  display: 'grid', 
                  gridTemplateColumns: '1.5fr 1fr 1fr 1fr auto', 
                  alignItems: 'center', 
                  gap: '2rem',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                className="archive-card"
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.125rem', color: '#0f172a', marginBottom: '0.25rem' }}>{t.model}</div>
                  <div style={{ fontSize: '0.875rem', color: '#64748b', fontWeight: 600 }}>{t.serialNumber} • {t.name}</div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
                  <Calendar size={18} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Started</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>{format(t.dateStarted, 'MMM d, yyyy')}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
                  <Truck size={18} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Shipped</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#10b981' }}>{t.archivedAt ? format(t.archivedAt, 'MMM d, yyyy') : 'N/A'}</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
                  <Clock size={18} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Production</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#1e293b' }}>
                      {t.archivedAt ? formatDistanceToNow(t.dateStarted) : 'N/A'}
                    </div>
                  </div>
                </div>

                <ChevronRight size={20} color="#e2e8f0" />
              </div>
            )) : (
              <div style={{ padding: '6rem', textAlign: 'center', background: 'white', borderRadius: '24px', border: '2px dashed #e2e8f0', color: '#94a3b8' }}>
                <Truck size={48} style={{ marginBottom: '1.5rem', opacity: 0.2 }} />
                <p style={{ fontSize: '1.125rem', fontWeight: 600 }}>No shipped products in the archive yet.</p>
              </div>
            )}
          </div>
        </div>
      </main>

      {selectedTrailer && (
        <TrailerDetailsModal 
          trailer={selectedTrailer} 
          isOpen={true} 
          onClose={() => setSelectedTrailerId(null)} 
          onUpdate={onUpdateTrailer} 
        />
      )}
    </div>
  );
};
