import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Clock, Truck, Search, ChevronRight } from 'lucide-react';
import { formatDistance, format } from 'date-fns';
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

          <div className="archive-list-container">
            {archivedTrailers.length > 0 ? archivedTrailers.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTrailerId(t.id)}
                className={`archive-card ${t.isDeleted ? 'is-deleted' : ''}`}
              >
                <div className="archive-card-identity">
                  <div className="archive-model-name">{t.model}</div>
                  <div className="archive-customer-name">{t.name}</div>
                </div>

                <div className="archive-card-details">
                  <div className="archive-detail-row">
                    <span className="archive-detail-label">Serial:</span>
                    <span className="archive-detail-value">{t.serialNumber}</span>
                  </div>
                  {!t.isDeleted ? (
                    <>
                      <div className="archive-detail-row">
                        <span className="archive-detail-label">Invoice:</span>
                        <span className="archive-detail-value success">{t.invoiceNumber || '---'}</span>
                      </div>
                      <div className="archive-detail-row">
                        <span className="archive-detail-label">VIN Date:</span>
                        <span className="archive-detail-value success">{t.vinDate ? format(new Date(t.vinDate), 'MMM d, yyyy') : '---'}</span>
                      </div>
                    </>
                  ) : (
                    <div className="archive-removed-label">REMOVED FROM BACKLOG</div>
                  )}
                </div>

                <div className="archive-card-timeline">
                  <div className="archive-badge-label">Timeline</div>
                  <div className="archive-badge-value">
                    {format(t.dateStarted, 'MMM d')} → {t.archivedAt ? format(t.archivedAt, 'MMM d') : 'N/A'}
                  </div>
                </div>

                <div className="archive-card-duration">
                  <Clock size={16} />
                  <div>
                    <div className="archive-badge-label">Total Lead Time</div>
                    <div className="archive-badge-value">
                      {t.archivedAt ? formatDistance(t.dateStarted, t.archivedAt) : 'N/A'}
                    </div>
                  </div>
                </div>

                <ChevronRight size={20} className="archive-arrow" />
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
