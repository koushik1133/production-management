import React, { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Home, Search, BarChart3, Download, FileText, User, Hash, Calendar, Clock, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { Trailer, UserRole, QuoteRecord, Dealer } from './types';
import { triggerFileDownload, isRelativePath, fetchFileBlob, fetchTemplateAsBase64 } from './utils/storage';
import { supabase } from './lib/supabase';
import { injectTrailerDataIntoSpec } from './lib/injectSpecSheet';
import { fetchAllPersistentQuotes, QUOTES_UPDATED_EVENT } from './utils/quotesStore';

interface Props {
  trailers?: Trailer[];
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  userRole: UserRole;
  localSpecSheetTemplates?: Record<string, string>;
  dealers?: Dealer[];
}

type ExportFilter = 'all' | 'today' | 'week' | 'month';
export type QuoteStatusType = 'approved' | 'auto_denied' | 'denied' | 'pending';

const safeDate = (ts: number | string | undefined): Date | null => {
  if (!ts) return null;
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

export const getQuoteStatus = (
  quote: QuoteRecord,
  trailers: Trailer[] = []
): { label: string; type: QuoteStatusType; color: string; bg: string; border: string } => {
  const explicitStatus = (quote.status || '').toLowerCase();
  if (explicitStatus === 'approved') {
    return { label: 'Approved', type: 'approved', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
  }
  if (explicitStatus === 'denied') {
    return { label: 'Denied', type: 'denied', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  }
  if (explicitStatus === 'auto_denied') {
    return { label: 'Auto-Denied', type: 'auto_denied', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  }

  // Check if trailer matching this quote is approved or in backlog
  const matchingTrailer = trailers.find(t =>
    ((quote.trailer_id && t.id === quote.trailer_id) ||
     (t.serialNumber && quote.serial_number && (
       t.serialNumber.trim().toLowerCase() === quote.serial_number.trim().toLowerCase() ||
       t.serialNumber.trim().toLowerCase() === `${quote.serial_number.trim().toLowerCase()}-q`
     ))) &&
    !t.isDeleted
  );

  if (matchingTrailer && (matchingTrailer.quoteStatus === 'approved' || (matchingTrailer.notes && (matchingTrailer.notes.includes('[STATUS:approved]') || matchingTrailer.notes.includes('Approved into Backlog'))))) {
    return { label: 'Approved', type: 'approved', color: '#059669', bg: '#ecfdf5', border: '#a7f3d0' };
  }

  if (matchingTrailer?.quoteStatus === 'denied' || matchingTrailer?.isDeleted || (matchingTrailer?.notes && matchingTrailer.notes.includes('[STATUS:denied]'))) {
    return { label: 'Denied', type: 'denied', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
  }

  // 7-day auto-denial check
  const createdAtMs = safeDate(quote.created_at)?.getTime() || (matchingTrailer?.dateStarted || 0);
  if (createdAtMs > 0) {
    const ageMs = Date.now() - createdAtMs;
    const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
    if (ageMs > SEVEN_DAYS_MS) {
      return { label: 'Auto-Denied (7+ Days)', type: 'auto_denied', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' };
    }
  }

  return { label: 'Pending Quote', type: 'pending', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
};

export const QuotesView: React.FC<Props> = ({
  trailers = [],
  userRole,
  localSpecSheetTemplates,
  dealers = []
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'serial' | 'model'>('date');
  const [exportFilter, setExportFilter] = useState<ExportFilter>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'auto_denied' | 'approved'>('all');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [dbQuotes, setDbQuotes] = useState<QuoteRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch persistent quotes from Supabase and persistent storage
  const fetchQuotes = async () => {
    try {
      const data = await fetchAllPersistentQuotes(trailers);
      setDbQuotes(data);
    } catch (err) {
      console.error('Error loading quotes:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchQuotes();

    const handleLocalUpdate = () => {
      fetchQuotes();
    };
    window.addEventListener(QUOTES_UPDATED_EVENT, handleLocalUpdate);

    const channel = supabase
      .channel('quotes_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quotes' }, () => {
        fetchQuotes();
      })
      .subscribe();

    return () => {
      window.removeEventListener(QUOTES_UPDATED_EVENT, handleLocalUpdate);
      supabase.removeChannel(channel);
    };
  }, [trailers]);

  // Merge DB/local quotes with active trailers (guarantee zero data loss and keep approved quotes)
  const allQuotes = useMemo(() => {
    const map = new Map<string, QuoteRecord>();

    // 1. Load all persistent quotes first
    dbQuotes.forEach(q => {
      const k = q.serial_number ? q.serial_number.trim().toLowerCase() : q.id;
      if (k) map.set(k, q);
    });

    // 2. Merge active or historical quote trailers from trailers prop
    if (trailers && trailers.length > 0) {
      trailers
        .filter(t => !t.isDeleted && (t.currentPhase === 'quote' || (t.notes && (t.notes.includes('[STATUS:approved]') || t.notes.includes('Approved into Backlog')))))
        .forEach(t => {
          const displaySerial = t.serialNumber?.replace(/-Q$/i, '') || t.serialNumber;
          const s = displaySerial?.trim().toLowerCase();
          if (s) {
            const isApproved = t.quoteStatus === 'approved' || (t.notes && (t.notes.includes('[STATUS:approved]') || t.notes.includes('Approved into Backlog')));
            const isDenied = t.quoteStatus === 'denied' || (t.notes && (t.notes.includes('[STATUS:denied]') || t.notes.includes('[STATUS:auto_denied]')));
            const existing = map.get(s);
            if (existing) {
              if (isApproved && existing.status !== 'approved') {
                map.set(s, { ...existing, status: 'approved' });
              }
            } else {
              map.set(s, {
                id: t.id,
                trailer_id: t.id,
                serial_number: displaySerial,
                model: t.model,
                dealer_name: t.name,
                sale_price: t.sale_price ?? null,
                trailer_color: t.trailer_color,
                trailer_plug: t.trailer_plug,
                sales_person: t.salesPerson,
                dealer_location: t.dealerLocation,
                dealer_address: t.dealerCommonAddress,
                purchase_order: t.purchaseOrder,
                consignment: t.consignment,
                quote_file_path: t.spec_sheet_file,
                status: isApproved ? 'approved' : (isDenied ? 'denied' : 'quote'),
                created_at: t.dateStarted ? new Date(t.dateStarted).toISOString() : new Date().toISOString(),
                notes: t.notes
              });
            }
          }
        });
    }

    return Array.from(map.values()).sort((a, b) => {
      const dateA = safeDate(a.created_at)?.getTime() || 0;
      const dateB = safeDate(b.created_at)?.getTime() || 0;
      return dateB - dateA;
    });
  }, [dbQuotes, trailers]);

  const statusCounts = useMemo(() => {
    let pending = 0;
    let autoDenied = 0;
    let approved = 0;
    allQuotes.forEach(q => {
      const st = getQuoteStatus(q, trailers);
      if (st.type === 'pending') pending++;
      else if (st.type === 'auto_denied' || st.type === 'denied') autoDenied++;
      else if (st.type === 'approved') approved++;
    });
    return { pending, autoDenied, approved };
  }, [allQuotes, trailers]);

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return allQuotes
      .filter(item => {
        if (statusFilter !== 'all') {
          const st = getQuoteStatus(item, trailers);
          if (statusFilter === 'pending' && st.type !== 'pending') return false;
          if (statusFilter === 'auto_denied' && st.type !== 'auto_denied' && st.type !== 'denied') return false;
          if (statusFilter === 'approved' && st.type !== 'approved') return false;
        }
        return (
          (item.serial_number || '').toLowerCase().includes(q) ||
          (item.model || '').toLowerCase().includes(q) ||
          (item.dealer_name || '').toLowerCase().includes(q) ||
          (item.notes || '').toLowerCase().includes(q) ||
          (item.sales_person || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'serial') return (a.serial_number || '').localeCompare(b.serial_number || '');
        if (sortBy === 'model') return (a.model || '').localeCompare(b.model || '');
        const dateA = safeDate(a.created_at)?.getTime() || 0;
        const dateB = safeDate(b.created_at)?.getTime() || 0;
        return dateB - dateA;
      });
  }, [allQuotes, searchQuery, sortBy, statusFilter, trailers]);

  // Download quote logic (fetches stored file or generates on the fly if needed)
  const handleDownloadQuote = async (q: QuoteRecord) => {
    setDownloadingId(q.id);
    try {
      if (q.quote_file_path) {
        await triggerFileDownload(q.quote_file_path, `${q.serial_number}_Quote.xlsx`);
        return;
      }

      // If no file path was stored yet, generate quote excel sheet on the fly
      if (q.model) {
        let templateBase64: string | undefined = localSpecSheetTemplates ? localSpecSheetTemplates[q.model] : undefined;
        if (templateBase64 === 'EXISTS') {
          const { data } = await supabase.from('production_models').select('spec_sheet_template').eq('name', q.model).single();
          if (data?.spec_sheet_template) {
            templateBase64 = await fetchTemplateAsBase64(data.spec_sheet_template);
          }
        } else if (templateBase64 && !templateBase64.startsWith('data:')) {
          templateBase64 = await fetchTemplateAsBase64(templateBase64);
        }

        if (templateBase64) {
          const selectedDealer = dealers.find(d => d.name === q.dealer_name);
          const formattedDate = q.created_at ? format(new Date(q.created_at), 'MM/dd/yyyy') : undefined;
          const injected = await injectTrailerDataIntoSpec(
            templateBase64,
            q.serial_number,
            q.dealer_name || undefined,
            q.trailer_color || undefined,
            q.trailer_plug || undefined,
            q.sale_price ? q.sale_price : undefined,
            q.sales_person || undefined,
            q.dealer_location || undefined,
            selectedDealer?.common_address || q.dealer_address || undefined,
            true, // hideOtherSheets for Quotes
            formattedDate,
            q.purchase_order || undefined,
            q.consignment || undefined
          );

          const a = document.createElement('a');
          a.href = injected;
          a.download = `${q.serial_number}_Quote.xlsx`;
          a.click();
          return;
        }
      }

      alert('No template or file found for this quote.');
    } catch (err) {
      console.error('Failed to download quote:', err);
      alert('Failed to download quote.');
    } finally {
      setDownloadingId(null);
    }
  };

  const handleExport = async () => {
    const now = new Date();
    const toExport = filtered.filter(t => {
      const d = safeDate(t.created_at);
      if (!d) return exportFilter === 'all';
      if (exportFilter === 'today') return d.toDateString() === now.toDateString();
      if (exportFilter === 'week') return d.getTime() >= now.getTime() - 7 * 24 * 60 * 60 * 1000;
      if (exportFilter === 'month') return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      return true;
    });

    if (toExport.length === 0) {
      setExportStatus('No records match filter.');
      setTimeout(() => setExportStatus(null), 3000);
      return;
    }

    try {
      setExportStatus('Building ZIP package...');
      const zip = new JSZip();

      // Format date range: e.g. "080926 - 081226"
      const dates = toExport
        .map(q => safeDate(q.created_at))
        .filter((d): d is Date => d !== null)
        .sort((a, b) => a.getTime() - b.getTime());

      let dateRangeStr = format(now, 'MMddyy');
      if (dates.length > 0) {
        const minStr = format(dates[0], 'MMddyy');
        const maxStr = format(dates[dates.length - 1], 'MMddyy');
        dateRangeStr = minStr === maxStr ? minStr : `${minStr} - ${maxStr}`;
      }

      const folderName = dateRangeStr;
      const folder = zip.folder(folderName);

      // 1. Master Excel file
      const rows = toExport.map(t => ({
        'Quote Label': `${t.dealer_name || 'Customer'} - ${t.model || ''} ${t.serial_number}${t.notes ? ` (${t.notes})` : ''}`,
        'Serial Number': t.serial_number,
        'Model': t.model || '',
        'Dealer / Customer': t.dealer_name || '',
        'Sales Person': t.sales_person || '',
        'Notes': t.notes || '',
        'Sale Price': t.sale_price ?? '',
        'Date Added': safeDate(t.created_at) ? format(safeDate(t.created_at)!, 'yyyy-MM-dd') : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Quotes ${folderName}`);
      const excelBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      folder?.file(`quotes_${folderName}_master.xlsx`, excelBuf);

      // 2. Individual quote files inside folder
      for (const t of toExport) {
        const dStr = safeDate(t.created_at) ? format(safeDate(t.created_at)!, 'yyyy-MM-dd') : 'N/A';
        const rawLabel = `${t.dealer_name || 'Customer'} - ${t.model || 'Model'} - ${t.serial_number}`;
        const safeFilename = rawLabel.replace(/[/\\?%*:|"<>]/g, '_').trim();

        // If actual excel quote exists, package it into the zip
        if (t.quote_file_path) {
          try {
            if (t.quote_file_path.startsWith('data:')) {
              const base64Data = t.quote_file_path.includes(',') ? t.quote_file_path.split(',')[1] : t.quote_file_path;
              folder?.file(`${safeFilename}.xlsx`, base64Data, { base64: true });
            } else if (isRelativePath(t.quote_file_path)) {
              const blob = await fetchFileBlob(t.quote_file_path);
              folder?.file(`${safeFilename}.xlsx`, blob);
            }
          } catch (fileErr) {
            console.warn(`Could not add excel file for ${t.serial_number}:`, fileErr);
          }
        }

        const fileContent = [
          `LANE TRAILERS — QUOTE SPECIFICATION`,
          `====================================`,
          `Quote Label:      ${t.dealer_name || 'Customer'} - ${t.model || ''} ${t.serial_number}${t.notes ? ` (${t.notes})` : ''}`,
          `Serial Number:    ${t.serial_number}`,
          `Model:            ${t.model || 'N/A'}`,
          `Customer/Dealer:  ${t.dealer_name || 'N/A'}`,
          `Sales Person:     ${t.sales_person || 'N/A'}`,
          `Date Added:       ${dStr}`,
          `Sale Price:       ${t.sale_price != null ? `$${t.sale_price.toLocaleString()}` : 'Not Set'}`,
          `Trailer Color:    ${t.trailer_color || 'Standard'}`,
          `Trailer Plug:     ${t.trailer_plug || 'Standard'}`,
          `Status:           ${t.status || 'Quote'}`,
          `Notes / Options:  ${t.notes || 'None'}`,
          `------------------------------------`,
          `Exported:         ${format(now, 'yyyy-MM-dd HH:mm:ss')}`
        ].join('\n');

        folder?.file(`${safeFilename}.txt`, fileContent);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotes_${folderName}.zip`;
      a.click();
      URL.revokeObjectURL(url);

      setExportStatus(`Exported ${toExport.length} quote(s).`);
      setTimeout(() => setExportStatus(null), 3000);
    } catch (err: any) {
      console.error('Failed to export quotes zip:', err);
      setExportStatus('Export failed');
      setTimeout(() => setExportStatus(null), 3000);
    }
  };

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
          <Link to="/" className="btn btn-secondary" style={{ borderRadius: '10px', padding: '0.45rem 0.85rem', display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, fontSize: '0.85rem' }}>
            <Home size={18} /> Home
          </Link>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: '12px', background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 16px -4px rgba(99,102,241,0.4)' }}>
              <BarChart3 size={22} color="white" />
            </div>
            <div>
              <h1 style={{ fontSize: '1.1rem', fontWeight: 900, letterSpacing: '-0.01em' }}>Quotes</h1>
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>
                {filtered.length} quote{filtered.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(255,255,255,0.03)', padding: '0.4rem 0.75rem', borderRadius: '10px', border: '1px solid var(--border-default)' }}>
            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: 'var(--text-muted)' }}>SORT</span>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as any)} style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', fontSize: '0.8rem', fontWeight: 700, outline: 'none', cursor: 'pointer' }}>
              <option value="date">Date Added</option>
              <option value="serial">Serial</option>
              <option value="model">Model</option>
            </select>
          </div>

          <div style={{ position: 'relative', width: '240px' }}>
            <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input type="text" placeholder="Search quotes..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="form-input" style={{ width: '100%', paddingLeft: '2.5rem' }} />
          </div>

          {userRole === 'manager' && (
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select value={exportFilter} onChange={e => setExportFilter(e.target.value as ExportFilter)} className="form-input" style={{ width: 'auto', fontSize: '0.75rem', padding: '4px 10px', height: '36px', borderRadius: '10px', background: 'var(--bg-secondary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)', fontWeight: 700 }}>
                <option value="all">Export: All Time</option>
                <option value="today">Export: Today</option>
                <option value="week">Export: This Week (7 Days)</option>
                <option value="month">Export: This Month</option>
              </select>
              <button className="btn btn-secondary" disabled={!!exportStatus} onClick={handleExport} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0.9rem', borderRadius: '10px', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap' }}>
                <Download size={15} />
                {exportStatus || 'Export Excel'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main style={{ padding: '2rem', maxWidth: '1100px', margin: '0 auto' }}>
        {/* Status Filter Tabs */}
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { id: 'all', label: 'All Quotes', count: allQuotes.length },
            { id: 'pending', label: 'Pending', count: statusCounts.pending },
            { id: 'auto_denied', label: 'Auto-Denied', count: statusCounts.autoDenied },
            { id: 'approved', label: 'Approved', count: statusCounts.approved },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as any)}
              style={{
                padding: '0.45rem 1rem',
                borderRadius: '10px',
                border: statusFilter === tab.id ? '1px solid var(--accent)' : '1px solid var(--border-default)',
                background: statusFilter === tab.id ? 'var(--accent)' : 'var(--bg-card)',
                color: statusFilter === tab.id ? '#ffffff' : 'var(--text-secondary)',
                fontWeight: 800,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.15s ease'
              }}
            >
              <span>{tab.label}</span>
              <span style={{
                fontSize: '0.72rem',
                padding: '2px 7px',
                borderRadius: '8px',
                background: statusFilter === tab.id ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                color: statusFilter === tab.id ? '#ffffff' : 'var(--text-muted)',
                fontWeight: 700
              }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
            <Loader2 size={36} className="animate-spin" style={{ margin: '0 auto 1rem', opacity: 0.7 }} />
            <p style={{ fontSize: '0.9rem' }}>Loading quotes...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
            <BarChart3 size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {searchQuery ? 'No quotes match your search' : 'No quotes found'}
            </h2>
            <p style={{ fontSize: '0.85rem' }}>
              {searchQuery ? 'Try a different keyword or filter.' : 'Quotes created on the Backlog registration will appear here.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map(q => {
              const addedDate = safeDate(q.created_at);
              const cleanNotes = (q.notes || '').replace(/\[STATUS:[^\]]+\]\s*/gi, '').trim();
              const quoteLabel = `${q.dealer_name || 'Customer'} - ${q.model || 'Model'} ${q.serial_number}${cleanNotes ? ` (${cleanNotes})` : ''}`;
              const isDownloading = downloadingId === q.id;
              const statusInfo = getQuoteStatus(q, trailers);

              return (
                <div key={q.id} style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                  {/* Square color swatch */}
                  {q.trailer_color && (
                    <div 
                      title={`Color: ${q.trailer_color}`} 
                      style={{ 
                        width: '32px', 
                        height: '32px', 
                        flexShrink: 0, 
                        borderRadius: '8px', 
                        background: q.trailer_color, 
                        border: (q.trailer_color.toLowerCase() === 'white' || q.trailer_color === '#fff' || q.trailer_color === '#ffffff') ? '2px solid #94a3b8' : '1.5px solid rgba(255,255,255,0.15)', 
                        boxShadow: '0 2px 5px rgba(0,0,0,0.18)' 
                      }} 
                    />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.35rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)' }}>{quoteLabel}</span>
                      {/* Status Note Badge (Approved, Auto-Denied, Denied, Pending) */}
                      <span style={{
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: statusInfo.bg,
                        color: statusInfo.color,
                        border: `1px solid ${statusInfo.border}`,
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.04em'
                      }}>
                        {statusInfo.type === 'approved' ? (
                          <CheckCircle2 size={12} />
                        ) : statusInfo.type === 'pending' ? (
                          <Clock size={12} />
                        ) : (
                          <XCircle size={12} />
                        )}
                        {statusInfo.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Hash size={13} /> {q.serial_number}</span>
                      {q.dealer_name && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><User size={13} /> {q.dealer_name}</span>}
                      {q.model && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><FileText size={13} /> {q.model}</span>}
                      {q.sales_person && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>👤 {q.sales_person}</span>}
                      {addedDate && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}><Calendar size={13} /> {format(addedDate, 'MMM d, yyyy')}</span>}
                      {addedDate && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}><Clock size={13} /> {formatDistanceToNow(addedDate, { addSuffix: true })}</span>}
                    </div>
                    {cleanNotes && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cleanNotes}</p>}
                  </div>
                  {userRole === 'manager' && q.sale_price != null && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Quote Price</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>${q.sale_price.toLocaleString()}</div>
                    </div>
                  )}

                  {/* Prominent Download Button */}
                  <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                    <button
                      onClick={() => handleDownloadQuote(q)}
                      disabled={isDownloading}
                      title="Download generated quote sheet"
                      style={{
                        padding: '0.55rem 1.15rem',
                        fontSize: '0.82rem',
                        fontWeight: 800,
                        background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
                        border: 'none',
                        borderRadius: '10px',
                        cursor: isDownloading ? 'wait' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                        color: '#ffffff',
                        boxShadow: '0 4px 12px rgba(99, 102, 241, 0.35)'
                      }}
                    >
                      {isDownloading ? (
                        <>
                          <Loader2 size={15} className="animate-spin" />
                          <span>Downloading...</span>
                        </>
                      ) : (
                        <>
                          <Download size={15} />
                          <span>Download</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
};
