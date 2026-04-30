import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowLeft, Clock, Truck, Search, ChevronRight, Package, Eye, EyeOff, Image, Hash, User, DollarSign, BarChart3, Download, Upload } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, PhaseId, ShippedTrailer, UserRole } from './types';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';
import { Modal } from './components/Modal';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  localTargetHours: Record<string, Record<PhaseId, number>>;
  shippedTrailers?: ShippedTrailer[];
  userRole: UserRole;
}

const PHASE_LABELS = [
  { key: 'prefab_hours', label: 'Prefab', color: '#3b82f6' },
  { key: 'build_hours', label: 'Build', color: '#6366f1' },
  { key: 'paint_hours', label: 'Paint', color: '#8b5cf6' },
  { key: 'outsource_hours', label: 'Outsource', color: '#ec4899' },
  { key: 'trim_hours', label: 'Trim', color: '#10b981' },
];

const ShippedRecord: React.FC<{ record: ShippedTrailer; onClose: () => void; userRole: UserRole }> = ({ record, onClose, userRole }) => {
  const [showPrices, setShowPrices] = useState(false);
  const photos = [record.photo_1_url, record.photo_2_url, record.photo_3_url].filter(Boolean) as string[];

  return (
    <Modal isOpen={true} onClose={onClose} title={`${record.serial_number} • Performance Report`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-primary)' }}>

        {/* Hero Section */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem', 
          padding: '1.5rem', 
          background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)', 
          borderRadius: '20px', 
          border: '1px solid rgba(59, 130, 246, 0.2)',
          position: 'relative',
          overflow: 'hidden'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', zIndex: 1 }}>
            <div>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>{record.trailer_name}</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><User size={14} /> {record.customer_name || 'Generic Stock'}</span>
                {userRole === 'manager' && <span style={{ width: '4px', height: '4px', background: 'var(--text-muted)', borderRadius: '50%' }} />}
                {userRole === 'manager' && <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}><Hash size={14} /> {record.invoice_number}</span>}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Serial Number</div>
              <div style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--accent)' }}>{record.serial_number}</div>
            </div>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.5rem', zIndex: 1 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Date Shipped</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{record.shipped_at ? format(new Date(record.shipped_at), 'MMM d, yyyy') : '—'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>VIN Date</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700 }}>{record.vin_date ? format(new Date(record.vin_date + 'T12:00:00'), 'MMM d, yyyy') : '—'}</div>
            </div>
            <div style={{ background: 'rgba(255,255,255,0.03)', padding: '0.75rem', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Build Efficiency</div>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#10b981' }}>{record.total_hours}h Total</div>
            </div>
          </div>
        </div>

        {/* Phase Breakdown Visualization */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
            <BarChart3 size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Timeline</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {PHASE_LABELS.map(({ key, label, color }) => (
              <div key={key} style={{ 
                background: 'var(--bg-card)', 
                padding: '1rem', 
                borderRadius: '16px', 
                border: '1px solid var(--border-default)', 
                textAlign: 'center',
                transition: 'transform 0.2s',
              }}>
                <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>{label}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 900, color }}>
                  {(record as any)[key] ?? 0}
                  <small style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '2px' }}>h</small>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Photo Gallery */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
            <Image size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Photos</h3>
          </div>
          {photos.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${photos.length}, 1fr)`, gap: '1rem' }}>
              {photos.map((url, i) => (
                <div key={i} style={{ position: 'relative' }}>
                  <a href={url} target="_blank" rel="noreferrer" style={{ display: 'block', borderRadius: '16px', overflow: 'hidden', border: '1px solid var(--border-default)', textDecoration: 'none' }}>
                    <img src={url} alt={`Photo ${i + 1}`} style={{ width: '100%', height: '160px', objectFit: 'cover', display: 'block', transition: 'transform 0.3s' }} className="gallery-img" />
                    <div style={{ position: 'absolute', bottom: '0', left: '0', right: '0', padding: '8px', background: 'rgba(0,0,0,0.6)', color: 'white', fontSize: '0.6rem', fontWeight: 800, textAlign: 'center', backdropFilter: 'blur(4px)' }}>VIEW FULL SIZE</div>
                  </a>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--border-default)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              No production photos were captured for this unit.
            </div>
          )}
        </div>

        {/* Pricing Segment */}
        {userRole === 'manager' && (
          <div style={{ 
            marginTop: '0.5rem',
            padding: '1.25rem', 
            background: showPrices ? 'rgba(234, 179, 8, 0.05)' : 'rgba(255, 255, 255, 0.02)', 
            borderRadius: '20px', 
            border: `1px solid ${showPrices ? 'rgba(234, 179, 8, 0.2)' : 'var(--border-default)'}`,
            transition: 'all 0.3s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <DollarSign size={16} color={showPrices ? '#eab308' : 'var(--text-muted)'} />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: showPrices ? '#eab308' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Data</span>
              </div>
              <button
                onClick={() => setShowPrices(p => !p)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  background: showPrices ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.05)', 
                border: 'none', 
                borderRadius: '10px', 
                padding: '6px 14px', 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: showPrices ? '#eab308' : 'var(--text-secondary)'
              }}
            >
              {showPrices ? <><EyeOff size={14} /> Hide Pricing</> : <><Eye size={14} /> Reveal Pricing</>}
            </button>
          </div>
          {showPrices && (
            <div style={{ marginTop: '1.25rem' }}>
              <div style={{ fontSize: '0.65rem', fontWeight: 800, color: '#eab308', textTransform: 'uppercase', marginBottom: '4px' }}>Final Sale Price</div>
              <div style={{ fontSize: '2rem', fontWeight: 900, color: '#eab308', letterSpacing: '-0.03em' }}>
                <span style={{ fontSize: '1rem', verticalAlign: 'top', marginTop: '4px', display: 'inline-block' }}>$</span>
                {(record.sale_price || 0).toLocaleString()}
              </div>
            </div>
          )}
        </div>
      )}
      </div>
    </Modal>
  );
};

export const ArchiveView: React.FC<Props> = ({ trailers, onUpdateTrailer, localTargetHours, shippedTrailers = [], userRole }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'shipped' | 'serial'>('shipped');
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [tab, setTab] = useState<'shipped' | 'removed'>('shipped');

  const filteredShipped = shippedTrailers
    .filter(t =>
      t.serial_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.trailer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.customer_name || '').toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => sortBy === 'serial'
      ? a.serial_number.localeCompare(b.serial_number)
      : new Date(b.shipped_at).getTime() - new Date(a.shipped_at).getTime()
    );

  const removedTrailers = trailers
    .filter(t => t.isArchived && t.isDeleted)
    .filter(t =>
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.serialNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.model.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const selectedTrailer = trailers.find(t => t.id === selectedTrailerId);
  const selectedShipped = shippedTrailers.find(t => t.serial_number === selectedSerial);

  return (
    <div className="app-container" style={{ background: 'var(--bg-main)', minHeight: '100vh', color: 'var(--text-primary)' }}>
      <header style={{ 
        height: 'var(--header-height)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        padding: '0 2rem', 
        background: 'var(--bg-header)', 
        backdropFilter: 'var(--glass-blur)', 
        borderBottom: '1px solid var(--border-default)', 
        position: 'sticky', 
        top: 0, 
        zIndex: 10 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <Link to="/" style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '0.6rem', 
            textDecoration: 'none', 
            color: 'var(--text-secondary)', 
            fontSize: '0.85rem', 
            fontWeight: 700, 
            padding: '0.5rem 1rem', 
            borderRadius: '10px', 
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid var(--border-default)' 
          }}>
            <ArrowLeft size={16} /> Dashboard
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'var(--accent-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(59, 130, 246, 0.4)' }}>
              <BarChart3 size={22} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '-0.01em' }}>Production Archive</h1>
              <p style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Historical Unit Intelligence</p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>SORT</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}
            >
              <option value="shipped">Recent Shipped</option>
              <option value="serial">Serial Number</option>
            </select>
          </div>
          <div style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Filter archives..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              style={{ width: '100%', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)', borderRadius: '12px', padding: '0.6rem 1rem 0.6rem 2.5rem', fontSize: '0.85rem', color: 'white', fontWeight: 600, outline: 'none' }}
            />
          </div>

          <div className="hide-on-mobile" style={{ display: 'flex', gap: '0.5rem' }}>
            <button 
              className="btn btn-secondary" 
              onClick={() => {
                const headers = ["Serial", "Model", "Customer", "Invoice", "VIN_Date", "Shipped_Date", "Sale_Price", "Total_Hours", "Prefab_H", "Build_H", "Paint_H", "Outsource_H", "Trim_H"];
                
                // Sort by monthly sales (most recent month first)
                const sortedData = [...filteredShipped].sort((a, b) => {
                  const dateA = new Date(a.shipped_at);
                  const dateB = new Date(b.shipped_at);
                  // Sort by Year then Month
                  if (dateA.getFullYear() !== dateB.getFullYear()) {
                    return dateB.getFullYear() - dateA.getFullYear();
                  }
                  return dateB.getMonth() - dateA.getMonth();
                });

                const data = sortedData.map(t => ({
                  "Serial": t.serial_number,
                  "Model": t.trailer_name,
                  "Customer": t.customer_name || 'Generic Stock',
                  "Invoice": t.invoice_number,
                  "VIN Date": t.vin_date || '',
                  "Shipped Date": format(new Date(t.shipped_at), 'yyyy-MM-dd'),
                  "Sale Price": t.sale_price || 0,
                  "Total Hours": t.total_hours,
                  "Prefab (h)": t.prefab_hours || 0,
                  "Build (h)": t.build_hours || 0,
                  "Paint (h)": t.paint_hours || 0,
                  "Outsource (h)": t.outsource_hours || 0,
                  "Trim (h)": t.trim_hours || 0
                }));

                const worksheet = XLSX.utils.json_to_sheet(data);
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, "Production Archive");
                
                // Auto-size columns
                const maxWidths = headers.map(h => ({ wch: Math.max(h.length, 15) }));
                worksheet['!cols'] = maxWidths;

                XLSX.writeFile(workbook, `production_full_archive_${format(new Date(), 'yyyy_MM_dd')}.xlsx`);
              }}
              style={{ fontSize: '0.75rem' }}
            >
              <Download size={14} /> Export Excel
            </button>
            <label className="btn btn-secondary" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>
              <Upload size={14} /> Import
              <input 
                type="file" 
                accept=".csv" 
                style={{ display: 'none' }} 
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      const text = event.target?.result as string;
                      console.log("Imported CSV Data:", text);
                      alert("CSV Import received. Processing logic would go here.");
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </label>
          </div>
        </div>
      </header>

      <main style={{ padding: '3rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Statistics Bar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
          {[
            { label: 'Total Shipped', value: shippedTrailers.length, icon: Truck, color: 'var(--accent)' },
            { label: 'Avg Build Time', value: `${shippedTrailers.length ? (shippedTrailers.reduce((a,b) => a + b.total_hours, 0) / shippedTrailers.length).toFixed(1) : 0}h`, icon: Clock, color: '#10b981' },
            { label: 'Active Pipeline', value: trailers.filter(t => !t.isArchived).length, icon: Package, color: '#f59e0b' },
            { label: 'Search Results', value: tab === 'shipped' ? filteredShipped.length : removedTrailers.length, icon: Search, color: '#8b5cf6' }
          ].map((stat, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '24px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                <div style={{ width: '32px', height: '32px', borderRadius: '10px', background: `${stat.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <stat.icon size={18} color={stat.color} />
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{stat.label}</span>
              </div>
              <div style={{ fontSize: '1.75rem', fontWeight: 900, letterSpacing: '-0.02em' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Tab Selection */}
        <div style={{ display: 'flex', marginBottom: '2rem', gap: '0.5rem', background: 'rgba(255,255,255,0.02)', padding: '6px', borderRadius: '16px', border: '1px solid var(--border-default)', width: 'fit-content' }}>
          {[{ id: 'shipped', label: '🚚 Shipped Units', count: filteredShipped.length }, { id: 'removed', label: '🗑 Deleted Units', count: removedTrailers.length }].map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? 'white' : 'var(--text-secondary)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              {label}
              <span style={{ background: tab === id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px 8px', fontSize: '0.7rem' }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Shipped Content */}
        {tab === 'shipped' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {filteredShipped.length > 0 ? filteredShipped.map(t => (
              <div
                key={t.serial_number}
                onClick={() => setSelectedSerial(t.serial_number)}
                style={{ 
                  background: 'var(--bg-card)', 
                  padding: '1.5rem', 
                  borderRadius: '24px', 
                  border: '1px solid var(--border-default)', 
                  cursor: 'pointer',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                  position: 'relative',
                  overflow: 'hidden',
                  userSelect: 'none'
                }}
                className="hover-lift"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 900, marginBottom: '0.15rem' }}>{t.trailer_name}</h4>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <User size={12} /> {t.customer_name || 'Generic Stock'}
                    </p>
                  </div>
                  <div style={{ background: 'var(--accent)15', color: 'var(--accent)', padding: '4px 10px', borderRadius: '8px', fontSize: '0.75rem', fontWeight: 900 }}>
                    {t.serial_number}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem' }}>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Shipped Date</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{format(new Date(t.shipped_at), 'MMM d, yyyy')}</div>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.02)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Total Hours</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>{t.total_hours}h Built</div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid var(--border-default)', paddingTop: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    {(t.photo_1_url || t.photo_2_url || t.photo_3_url) && (
                      <div style={{ width: '28px', height: '28px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Image size={14} color="var(--accent)" />
                      </div>
                    )}
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)' }}>
                      Invoice {t.invoice_number}
                    </div>
                  </div>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: '1 / -1', padding: '8rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '32px', border: '2px dashed var(--border-default)' }}>
                <Truck size={64} style={{ marginBottom: '1.5rem', opacity: 0.1 }} />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>No Shipped Units Found</h3>
                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Try adjusting your search filters or sort orders.</p>
              </div>
            )}
          </div>
        )}

        {/* Removed Content */}
        {tab === 'removed' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
            {removedTrailers.length > 0 ? removedTrailers.map(t => (
              <div 
                key={t.id} 
                onClick={() => setSelectedTrailerId(t.id)} 
                style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '24px', border: '1px solid var(--border-default)', cursor: 'pointer', opacity: 0.8 }}
                className="hover-lift"
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 900 }}>{t.model}</h4>
                    <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)' }}>{t.serialNumber}</p>
                  </div>
                  <div style={{ background: '#ef444415', color: '#ef4444', padding: '4px 10px', borderRadius: '8px', fontSize: '0.65rem', fontWeight: 900, textTransform: 'uppercase' }}>DELETED</div>
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Was active for {formatDistanceToNow(t.dateStarted)}
                </div>
                <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>VIEW DETAILS</span>
                  <ChevronRight size={18} color="var(--text-muted)" />
                </div>
              </div>
            )) : (
              <div style={{ gridColumn: '1 / -1', padding: '8rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '32px', border: '2px dashed var(--border-default)' }}>
                <Package size={64} style={{ marginBottom: '1.5rem', opacity: 0.1 }} />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>No Removed Units</h3>
                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Historical deletions will appear here.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {selectedTrailer && (
        <TrailerDetailsModal
          trailer={selectedTrailer}
          isOpen={true}
          onClose={() => setSelectedTrailerId(null)}
          onUpdate={onUpdateTrailer}
          localTargetHours={localTargetHours}
          shippedTrailers={shippedTrailers}
          userRole={userRole}
        />
      )}

      {selectedShipped && (
        <ShippedRecord record={selectedShipped} onClose={() => setSelectedSerial(null)} userRole={userRole} />
      )}

      {/* Hover Lift Style Injection */}
      <style>{`
        .hover-lift:hover {
          transform: translateY(-8px);
          border-color: var(--accent) !important;
          background: rgba(255,255,255,0.03) !important;
          box-shadow: var(--shadow-lg) !important;
        }
        .gallery-img:hover {
          transform: scale(1.05);
        }
      `}</style>
    </div>
  );
};
