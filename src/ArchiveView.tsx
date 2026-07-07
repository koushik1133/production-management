import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { ArrowLeft, Clock, Truck, Search, ChevronRight, Package, Eye, EyeOff, Image, Hash, User, DollarSign, BarChart3, Download, Upload, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, PhaseId, ShippedTrailer, UserRole } from './types';
import { TrailerDetailsModal } from './components/TrailerDetailsModal';
import { Modal } from './components/Modal';
import { supabase } from './lib/supabase';
import JSZip from 'jszip';
import { useResolvedUrl, triggerFileDownload, fetchFileBlob, isRelativePath } from './utils/storage';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  localTargetHours: Record<string, Record<PhaseId, number>>;
  shippedTrailers?: ShippedTrailer[];
  userRole: UserRole;
  isPriceUnlockedGlobally?: boolean;
  onUnlockPrices?: () => boolean;
  onLockPrices?: () => void;
}

const PHASE_LABELS = [
  { key: 'prefab_hours', label: 'Prefab', color: '#3b82f6' },
  { key: 'build_hours', label: 'Build', color: '#6366f1' },
  { key: 'paint_hours', label: 'Paint', color: '#8b5cf6' },
  { key: 'outsource_hours', label: 'Outsource', color: '#ec4899' },
  { key: 'trim_hours', label: 'Trim', color: '#10b981' },
];

const ShippedRecord: React.FC<{ record: ShippedTrailer; notes?: string; onClose: () => void; userRole: UserRole; isPriceUnlockedGlobally?: boolean; onUnlockPrices?: () => boolean; onLockPrices?: () => void }> = ({ record, notes, onClose, userRole, isPriceUnlockedGlobally, onUnlockPrices, onLockPrices }) => {
  const [heavyData, setHeavyData] = useState<Partial<ShippedTrailer>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!record.serial_number) return;
    
    // Check if we already have the media loaded in the record prop
    if (record.spec_sheet_file !== undefined) {
      setHeavyData({
        photo_1_url: record.photo_1_url,
        photo_2_url: record.photo_2_url,
        photo_3_url: record.photo_3_url,
        spec_sheet_file: record.spec_sheet_file,
        inspection_sheet_file: record.inspection_sheet_file
      });
      return;
    }

    const loadHeavyShipped = async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('shipped_trailers')
          .select('photo_1_url, photo_2_url, photo_3_url, spec_sheet_file, inspection_sheet_file')
          .eq('serial_number', record.serial_number)
          .single();
        if (data) {
          setHeavyData(data);
        }
      } catch (err) {
        console.error("Error fetching heavy fields for shipped record:", err);
      } finally {
        setLoading(false);
      }
    };
    loadHeavyShipped();
  }, [record.serial_number, record.spec_sheet_file]);

  const p1 = record.photo_1_url !== undefined ? record.photo_1_url : heavyData.photo_1_url;
  const p2 = record.photo_2_url !== undefined ? record.photo_2_url : heavyData.photo_2_url;
  const p3 = record.photo_3_url !== undefined ? record.photo_3_url : heavyData.photo_3_url;
  const specSheetFile = record.spec_sheet_file !== undefined ? record.spec_sheet_file : heavyData.spec_sheet_file;
  const inspectionSheetFile = record.inspection_sheet_file !== undefined ? record.inspection_sheet_file : heavyData.inspection_sheet_file;

  const resolvedP1 = useResolvedUrl(p1);
  const resolvedP2 = useResolvedUrl(p2);
  const resolvedP3 = useResolvedUrl(p3);
  const resolvedPhotos = [resolvedP1, resolvedP2, resolvedP3].filter((u): u is string => !!u);

  return (
    <Modal isOpen={true} onClose={onClose} title={`${record.serial_number} • Performance Report`}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-primary)' }}>

        {/* Hero Section */}
        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '1rem', 
          padding: '1.5rem', 
          background: 'var(--bg-secondary)', 
          borderRadius: '20px', 
          border: '1px solid var(--border-default)',
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
          
          <div className="shipped-hero-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem', marginTop: '0.5rem', zIndex: 1 }}>
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
          <div className="shipped-phase-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
            {PHASE_LABELS.map(({ key, label, color }) => {
              const value = record[key as keyof ShippedTrailer] as number ?? 0;
              return (
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
                    {value}
                    <small style={{ fontSize: '0.6rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '2px' }}>h</small>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Production Notes */}
        {notes && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
              <FileText size={16} color="var(--accent)" />
              <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Notes</h3>
            </div>
            <div style={{ 
              background: 'rgba(234, 179, 8, 0.05)', 
              padding: '1.25rem', 
              borderRadius: '16px', 
              border: '1px solid rgba(234, 179, 8, 0.2)',
              color: 'var(--text-secondary)',
              fontSize: '0.9rem',
              lineHeight: 1.6,
              whiteSpace: 'pre-wrap'
            }}>
              {notes}
            </div>
          </div>
        )}

        {/* Photo Gallery */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1rem' }}>
            <Image size={16} color="var(--accent)" />
            <h3 style={{ fontSize: '0.9rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Production Photos</h3>
          </div>
          {loading ? (
            <div style={{ padding: '2rem', textAlign: 'center', background: 'rgba(255,255,255,0.02)', borderRadius: '16px', border: '1px dashed var(--border-default)', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
              Loading media details...
            </div>
          ) : resolvedPhotos.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${resolvedPhotos.length}, 1fr)`, gap: '1rem' }}>
              {resolvedPhotos.map((url, i) => (
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

        {/* Spec Sheet Download */}
        {!loading && specSheetFile && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={async () => {
                const baseName = (record.serial_number || record.trailer_name || 'Trailer').trim();
                await triggerFileDownload(specSheetFile, `${baseName}_Final-SpecSheet.xlsx`);
              }}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                border: '1px solid var(--accent)',
                color: 'var(--accent)',
                fontWeight: 800,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                background: 'rgba(59, 130, 246, 0.05)'
              }}
            >
              <FileText size={18} />
              Download Final Spec Sheet
            </button>
          </div>
        )}

        {/* Inspection Sheet Download */}
        {!loading && inspectionSheetFile && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              onClick={async () => {
                const baseName = (record.serial_number || record.trailer_name || 'Trailer').trim();
                await triggerFileDownload(inspectionSheetFile, `${baseName}_InspectionSheet`);
              }}
              className="btn btn-secondary"
              style={{
                width: '100%',
                padding: '0.85rem',
                borderRadius: '12px',
                border: '1px solid #059669',
                color: '#059669',
                fontWeight: 800,
                fontSize: '0.9rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.75rem',
                background: 'rgba(16, 185, 129, 0.05)'
              }}
            >
              <FileText size={18} />
              Download Inspection Sheet
            </button>
          </div>
        )}

        {/* Pricing Segment */}
        {userRole === 'manager' && (
          <div style={{ 
            marginTop: '0.5rem',
            padding: '1.25rem', 
            background: isPriceUnlockedGlobally ? 'rgba(234, 179, 8, 0.05)' : 'var(--bg-secondary)', 
            borderRadius: '20px', 
            border: `1px solid ${isPriceUnlockedGlobally ? 'rgba(234, 179, 8, 0.2)' : 'var(--border-default)'}`,
            transition: 'all 0.3s ease'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <DollarSign size={16} color={isPriceUnlockedGlobally ? '#eab308' : 'var(--text-muted)'} />
                <span style={{ fontSize: '0.85rem', fontWeight: 800, color: isPriceUnlockedGlobally ? '#eab308' : 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Financial Data</span>
              </div>
              <button
                onClick={() => {
                  if (isPriceUnlockedGlobally) {
                    if (onLockPrices) onLockPrices();
                  } else {
                    if (onUnlockPrices) onUnlockPrices();
                  }
                }}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '0.5rem', 
                  background: isPriceUnlockedGlobally ? 'rgba(234, 179, 8, 0.15)' : 'rgba(255,255,255,0.05)', 
                border: 'none', 
                borderRadius: '10px', 
                padding: '6px 14px', 
                fontSize: '0.75rem', 
                fontWeight: 700, 
                color: isPriceUnlockedGlobally ? '#eab308' : 'var(--text-secondary)'
              }}
            >
              {isPriceUnlockedGlobally ? <><EyeOff size={14} /> Hide Details</> : <><Eye size={14} /> View Details</>}
            </button>
          </div>
          {isPriceUnlockedGlobally && (
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

export const ArchiveView: React.FC<Props> = ({ trailers, onUpdateTrailer, localTargetHours, shippedTrailers = [], userRole, isPriceUnlockedGlobally, onUnlockPrices, onLockPrices }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'shipped' | 'serial'>('shipped');
  const [selectedTrailerId, setSelectedTrailerId] = useState<string | null>(null);
  const [selectedSerial, setSelectedSerial] = useState<string | null>(null);
  const [tab, setTab] = useState<'shipped' | 'removed'>('shipped');
  const [visibleCount, setVisibleCount] = useState(10);
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [exportFilter, setExportFilter] = useState<'all' | 'today' | 'week' | 'month'>('all');

  useEffect(() => {
    setVisibleCount(10);
  }, [searchQuery, sortBy, tab]);

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
      <header className="archive-header" style={{ 
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
            </div>
          </div>
        </div>


        <div className="archive-header-right" style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
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
          <div className="archive-search" style={{ position: 'relative', width: '280px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input 
              type="text" 
              placeholder="Filter archives..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="form-input"
              style={{ width: '100%', paddingLeft: '2.5rem' }}
            />
          </div>

          {userRole === 'manager' && (
            <div className="hide-on-mobile hide-under-900" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select 
                value={exportFilter} 
                onChange={(e) => setExportFilter(e.target.value as any)}
                className="form-input" 
                style={{ width: 'auto', fontSize: '0.75rem', padding: '4px 10px', height: '36px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontWeight: 700 }}
              >
                <option value="all">Export: All Time</option>
                <option value="today">Export: Today</option>
                <option value="week">Export: This Week (7 Days)</option>
                <option value="month">Export: This Month</option>
              </select>
              <button 
                className="btn btn-secondary" 
                disabled={exportStatus !== null}
                onClick={async () => {
                  try {
                    const headers = [
                      "Serial", "Model", "Customer", "Invoice", "VIN_Date", "Shipped_Date", "Sale_Price", "Total_Hours", 
                      "Prefab_H", "Build_H", "Paint_H", "Outsource_H", "Trim_H",
                      "Photo_1_Path", "Photo_2_Path", "Photo_3_Path", "Spec_Sheet_Path", "Inspection_Sheet_Path"
                    ];
                    
                    // Sort by monthly sales (most recent month first)
                    const sortedData = [...filteredShipped].sort((a, b) => {
                      const dateA = new Date(a.shipped_at);
                      const dateB = new Date(b.shipped_at);
                      if (dateA.getFullYear() !== dateB.getFullYear()) {
                        return dateB.getFullYear() - dateA.getFullYear();
                      }
                      return dateB.getMonth() - dateA.getMonth();
                    });

                    const now = new Date();
                    const filteredDataForExport = sortedData.filter(t => {
                      if (!t.shipped_at) return false;
                      const shipDate = new Date(t.shipped_at);
                      if (exportFilter === 'today') {
                        return shipDate.toDateString() === now.toDateString();
                      } else if (exportFilter === 'week') {
                        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                        return shipDate >= oneWeekAgo;
                      } else if (exportFilter === 'month') {
                        return shipDate.getMonth() === now.getMonth() && shipDate.getFullYear() === now.getFullYear();
                      }
                      return true;
                    });

                    if (filteredDataForExport.length === 0) {
                      alert("No matching trailers found for the selected export date filter.");
                      return;
                    }

                    setExportStatus("Loading...");
                    const allTrailersWithMedia: ShippedTrailer[] = [];
                    const serials = filteredDataForExport.map(t => t.serial_number);
                    
                    setExportStatus(`Fetching records...`);
                    const { data: recordsData, error } = await supabase
                      .from('shipped_trailers')
                      .select('*')
                      .in('serial_number', serials);
                    
                    if (error) throw error;
                    if (recordsData) {
                      allTrailersWithMedia.push(...recordsData);
                    }

                    const data = allTrailersWithMedia.map(t => {
                      const baseFolder = `media/${t.serial_number}/`;
                      
                      const getExt = (value: string | null | undefined, defaultExt: string) => {
                        if (!value) return "";
                        if (isRelativePath(value) || value.startsWith('http')) {
                          const parts = value.split('?')[0].split('.');
                          const ext = '.' + (parts.pop()?.toLowerCase() || defaultExt.replace('.', ''));
                          return ['.jpg', '.jpeg', '.png', '.pdf', '.xlsx'].includes(ext) ? ext : defaultExt;
                        }
                        const parts = value.split(';base64,');
                        if (parts.length < 2) return defaultExt;
                        const contentType = parts[0].split(':')[1];
                        if (contentType.includes("jpeg") || contentType.includes("jpg")) return ".jpg";
                        if (contentType.includes("png")) return ".png";
                        if (contentType.includes("spreadsheetml") || contentType.includes("excel")) return ".xlsx";
                        if (contentType.includes("pdf")) return ".pdf";
                        return defaultExt;
                      };

                      return {
                        "Serial": t.serial_number,
                        "Model": t.trailer_name,
                        "Customer": t.customer_name || 'Generic Stock',
                        "Invoice": t.invoice_number,
                        "VIN Date": t.vin_date || '',
                        "Shipped Date": t.shipped_at ? format(new Date(t.shipped_at), 'yyyy-MM-dd') : '',
                        "Sale Price": t.sale_price || 0,
                        "Total Hours": t.total_hours,
                        "Prefab (h)": t.prefab_hours || 0,
                        "Build (h)": t.build_hours || 0,
                        "Paint (h)": t.paint_hours || 0,
                        "Outsource (h)": t.outsource_hours || 0,
                        "Trim (h)": t.trim_hours || 0,
                        "Photo 1 Path": t.photo_1_url ? `${baseFolder}photo_1${getExt(t.photo_1_url, '.jpg')}` : '',
                        "Photo 2 Path": t.photo_2_url ? `${baseFolder}photo_2${getExt(t.photo_2_url, '.jpg')}` : '',
                        "Photo 3 Path": t.photo_3_url ? `${baseFolder}photo_3${getExt(t.photo_3_url, '.jpg')}` : '',
                        "Spec Sheet Path": t.spec_sheet_file ? `${baseFolder}${t.serial_number}_Final-SpecSheet${getExt(t.spec_sheet_file, '.xlsx')}` : '',
                        "Inspection Sheet Path": t.inspection_sheet_file ? `${baseFolder}${t.serial_number}_InspectionSheet${getExt(t.inspection_sheet_file, '.jpg')}` : ''
                      };
                    });

                    const worksheet = XLSX.utils.json_to_sheet(data);
                    const workbook = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(workbook, worksheet, "Production Archive");
                    
                    // Auto-size columns
                    const maxWidths = headers.map(h => ({ wch: Math.max(h.length, 15) }));
                    worksheet['!cols'] = maxWidths;

                    setExportStatus("Building Excel...");
                    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });

                    setExportStatus("Packaging ZIP...");
                    const zip = new JSZip();
                    zip.file(`production_full_archive_${format(new Date(), 'yyyy_MM_dd')}.xlsx`, excelBuffer);

                    const mediaFolder = zip.folder("media");
                    
                    const promises = allTrailersWithMedia.map(async (t) => {
                      const trailerFolder = mediaFolder?.folder(t.serial_number);
                      
                      const addFileToZip = async (pathOrBase64: string | undefined | null, defaultFilename: string) => {
                        if (!pathOrBase64) return;
                        
                        if (isRelativePath(pathOrBase64)) {
                          try {
                            const blob = await fetchFileBlob(pathOrBase64);
                            const ext = '.' + pathOrBase64.split('.').pop()?.toLowerCase();
                            const filename = defaultFilename + ext;
                            trailerFolder?.file(filename, blob);
                          } catch (err) {
                            console.error(`Failed to fetch file ${pathOrBase64} for ZIP export:`, err);
                          }
                        } else {
                          const parts = pathOrBase64.split(';base64,');
                          if (parts.length < 2) return;
                          
                          const contentType = parts[0].split(':')[1];
                          const base64Data = parts[1];
                          
                          let ext = "";
                          if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = ".jpg";
                          else if (contentType.includes("png")) ext = ".png";
                          else if (contentType.includes("spreadsheetml") || contentType.includes("excel")) ext = ".xlsx";
                          else if (contentType.includes("pdf")) ext = ".pdf";
                          
                          const filename = defaultFilename + ext;
                          trailerFolder?.file(filename, base64Data, { base64: true });
                        }
                      };

                      await addFileToZip(t.photo_1_url, "photo_1");
                      await addFileToZip(t.photo_2_url, "photo_2");
                      await addFileToZip(t.photo_3_url, "photo_3");
                      await addFileToZip(t.spec_sheet_file, `${t.serial_number}_Final-SpecSheet`);
                      await addFileToZip(t.inspection_sheet_file, `${t.serial_number}_InspectionSheet`);
                    });

                    await Promise.all(promises);

                    setExportStatus("Downloading ZIP...");
                    const zipBlob = await zip.generateAsync({ type: "blob" });
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(zipBlob);
                    link.download = `production_archive_export_${format(new Date(), 'yyyy_MM_dd')}.zip`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                  } catch (error: any) {
                    console.error("Export failed:", error);
                    alert("Export failed: " + error.message);
                  } finally {
                    setExportStatus(null);
                  }
                }}
                style={{ fontSize: '0.75rem' }}
              >
                <Download size={14} /> {exportStatus || "Export"}
              </button>
              <label className="btn btn-secondary hide-on-mobile" style={{ fontSize: '0.75rem', cursor: 'pointer' }}>
                <Upload size={14} /> Import
                <input 
                  type="file" 
                  accept=".csv" 
                  style={{ display: 'none' }} 
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        alert("CSV Import received. Processing logic would go here.");
                      };
                      reader.readAsText(file);
                    }
                  }}
                />
              </label>
            </div>
          )}
        </div>
      </header>

      <main className="archive-main" style={{ padding: '3rem 2rem', maxWidth: '1400px', margin: '0 auto' }}>
        
        {/* Statistics Bar */}
        <div className="archive-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.5rem', marginBottom: '3rem' }}>
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
        <div className="archive-tabs" style={{ display: 'flex', marginBottom: '2rem', gap: '0.5rem', background: 'var(--bg-secondary)', padding: '6px', borderRadius: '16px', border: '1px solid var(--border-default)', width: 'fit-content' }}>
          {[{ id: 'shipped', label: '🚚 Shipped Units', count: filteredShipped.length }, { id: 'removed', label: '🗑 Deleted Units', count: removedTrailers.length }].map(({ id, label, count }) => (
            <button
              key={id}
              onClick={() => setTab(id as any)}
              style={{ padding: '0.6rem 1.25rem', borderRadius: '12px', border: 'none', fontWeight: 800, fontSize: '0.85rem', cursor: 'pointer', background: tab === id ? 'var(--accent)' : 'transparent', color: tab === id ? 'var(--bg-main)' : 'var(--text-secondary)', transition: 'all 0.2s', display: 'flex', alignItems: 'center', gap: '0.75rem' }}
            >
              {label}
              <span style={{ background: tab === id ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', padding: '2px 8px', fontSize: '0.7rem' }}>{count}</span>
            </button>
          ))}
        </div>

        {/* Shipped Content */}
        {tab === 'shipped' && (
          <>
            <div className="archive-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {filteredShipped.length > 0 ? filteredShipped.slice(0, visibleCount).map(t => (
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
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <div style={{ fontSize: '0.65rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>Shipped Date</div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{t.shipped_at ? format(new Date(t.shipped_at), 'MMM d, yyyy') : '—'}</div>
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', padding: '0.75rem', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
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
              <div className="archive-empty" style={{ gridColumn: '1 / -1', padding: '8rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '32px', border: '2px dashed var(--border-default)' }}>
                <Truck size={64} style={{ marginBottom: '1.5rem', opacity: 0.1 }} />
                <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>No Shipped Units Found</h3>
                <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Try adjusting your search filters or sort orders.</p>
              </div>
            )}
          </div>
          {filteredShipped.length > visibleCount && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
              <button 
                className="btn btn-secondary" 
                onClick={() => setVisibleCount(prev => prev + 10)}
                style={{ padding: '0.75rem 2rem', fontWeight: 800, borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', cursor: 'pointer' }}
              >
                Load More
              </button>
            </div>
          )}
          </>
        )}

        {/* Removed Content */}
        {tab === 'removed' && (
          <>
            <div className="archive-card-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: '1.5rem' }}>
              {removedTrailers.length > 0 ? removedTrailers.slice(0, visibleCount).map(t => (
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
                <div className="archive-empty" style={{ gridColumn: '1 / -1', padding: '8rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '32px', border: '2px dashed var(--border-default)' }}>
                  <Package size={64} style={{ marginBottom: '1.5rem', opacity: 0.1 }} />
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: '0.5rem' }}>No Removed Units</h3>
                  <p style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Historical deletions will appear here.</p>
                </div>
              )}
            </div>
            {removedTrailers.length > visibleCount && (
              <div style={{ display: 'flex', justifyContent: 'center', marginTop: '2rem' }}>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => setVisibleCount(prev => prev + 10)}
                  style={{ padding: '0.75rem 2rem', fontWeight: 800, borderRadius: '12px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', cursor: 'pointer' }}
                >
                  Load More
                </button>
              </div>
            )}
          </>
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
          isPriceUnlockedGlobally={isPriceUnlockedGlobally}
          onUnlockPrices={onUnlockPrices}
        />
      )}

      {selectedShipped && (
        <ShippedRecord 
          record={selectedShipped} 
          notes={trailers.find(t => t.serialNumber === selectedShipped.serial_number)?.notes}
          onClose={() => setSelectedSerial(null)} 
          userRole={userRole} 
          isPriceUnlockedGlobally={isPriceUnlockedGlobally}
          onUnlockPrices={onUnlockPrices}
          onLockPrices={onLockPrices}
        />
      )}

      {/* Hover Lift Style Injection + Mobile Responsive */}
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

        /* ── MOBILE ONLY ── */
        @media (max-width: 768px) {

          /* Header: stack into two rows */
          .archive-header {
            height: auto !important;
            flex-direction: column !important;
            align-items: flex-start !important;
            padding: 0.75rem 1rem !important;
            gap: 0.75rem !important;
          }
          .archive-header-right {
            width: 100% !important;
            flex-wrap: wrap !important;
            gap: 0.5rem !important;
          }
          .archive-search {
            width: 100% !important;
          }

          /* Main content padding */
          .archive-main {
            padding: 1rem !important;
          }

          /* Stats bar: 2 columns on mobile */
          .archive-stats-grid {
            grid-template-columns: repeat(2, 1fr) !important;
            gap: 0.75rem !important;
            margin-bottom: 1.25rem !important;
          }
          .archive-stats-grid > div {
            padding: 1rem !important;
            border-radius: 16px !important;
          }
          .archive-stats-grid .stat-value {
            font-size: 1.35rem !important;
          }

          /* Tab strip: scrollable, no overflow */
          .archive-tabs {
            width: 100% !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
          }

          /* Card grid: single column */
          .archive-card-grid {
            grid-template-columns: 1fr !important;
            gap: 0.75rem !important;
          }
          .archive-card-grid > div {
            padding: 1rem !important;
            border-radius: 16px !important;
          }

          /* Empty state: reduce huge padding */
          .archive-empty {
            padding: 3rem 1rem !important;
          }

          /* Shipped record modal: phase grid 3-col → 3-col still fine but make smaller */
          .shipped-phase-grid {
            grid-template-columns: repeat(3, 1fr) !important;
            gap: 0.5rem !important;
          }
          .shipped-phase-grid > div {
            padding: 0.6rem !important;
          }

          /* Hero 3-col grid in modal → single col stacked */
          .shipped-hero-grid {
            grid-template-columns: 1fr !important;
            gap: 0.5rem !important;
          }
        }
      `}</style>
    </div>
  );
};
