import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Truck, Search, ChevronRight } from 'lucide-react';
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
              <p style={{ color: '#64748b', fontWeight: 600 }}>A historical record of all units (Shipped & Removed) and their production performance.</p>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <div style={{ background: '#dcfce7', padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700, color: '#166534' }}>
                {archivedTrailers.filter(t => !t.isDeleted).length} Shipped
              </div>
              <div style={{ background: '#fee2e2', padding: '0.5rem 1rem', borderRadius: '10px', fontSize: '0.875rem', fontWeight: 700, color: '#991b1b' }}>
                {archivedTrailers.filter(t => t.isDeleted).length} Removed
              </div>
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
                  opacity: t.isDeleted ? 0.75 : 1
                }}
                className="archive-card"
              >
                <div>
                  <div style={{ fontWeight: 800, fontSize: '1.25rem', color: '#0f172a', marginBottom: '0.25rem' }}>{t.model}</div>
                  <div style={{ fontSize: '0.9rem', color: '#64748b', fontWeight: 600 }}>{t.name}</div>
                </div>

                {/* Documentation Column */}
                <div style={{ padding: '0.75rem', background: t.isDeleted ? '#f8fafc' : '#f0fdf4', borderRadius: '12px', border: `1px solid ${t.isDeleted ? '#e2e8f0' : '#dcfce7'}` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Serial: <span style={{ color: '#0f172a' }}>{t.serialNumber}</span></div>
                    {!t.isDeleted && (
                      <>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Invoice: <span style={{ color: '#16a34a' }}>{t.invoiceNumber || '---'}</span></div>
                        <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>VIN Date: <span style={{ color: '#16a34a' }}>{t.vinDate ? format(new Date(t.vinDate), 'MMM d, yyyy') : '---'}</span></div>
                      </>
                    )}
                    {t.isDeleted && <div style={{ fontSize: '0.7rem', fontWeight: 900, color: '#ef4444' }}>REMOVED FROM BACKLOG</div>}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
                  <div style={{ width: '2px', height: '30px', background: '#e2e8f0' }} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Timeline</div>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1e293b' }}>
                      {format(t.dateStarted, 'MMM d')} → {t.archivedAt ? format(t.archivedAt, 'MMM d') : 'N/A'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: '#64748b' }}>
                  <Clock size={18} />
                  <div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Duration</div>
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
