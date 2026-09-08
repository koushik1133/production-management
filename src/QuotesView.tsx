import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Home, Search, BarChart3, Download, CheckCircle, XCircle, FileText, User, Hash, Calendar, Clock } from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import type { Trailer, PhaseId, UserRole } from './types';
import { triggerFileDownload } from './utils/storage';

interface Props {
  trailers: Trailer[];
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  userRole: UserRole;
}

type ExportFilter = 'all' | 'today' | 'week' | 'month';

const safeDate = (ts: number | string | undefined): Date | null => {
  if (!ts) return null;
  const d = typeof ts === 'number' ? new Date(ts) : new Date(ts);
  return isNaN(d.getTime()) ? null : d;
};

export const QuotesView: React.FC<Props> = ({ trailers, onUpdateTrailer, userRole }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'date' | 'serial' | 'model'>('date');
  const [exportFilter, setExportFilter] = useState<ExportFilter>('all');
  const [exportStatus, setExportStatus] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: 'approve' | 'deny'; trailer: Trailer } | null>(null);

  const quoteTrailers = useMemo(() =>
    trailers.filter(t => t.currentPhase === 'quote' && !t.isDeleted),
    [trailers]
  );

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return quoteTrailers
      .filter(t =>
        t.serialNumber.toLowerCase().includes(q) ||
        t.model.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q)
      )
      .sort((a, b) => {
        if (sortBy === 'serial') return a.serialNumber.localeCompare(b.serialNumber);
        if (sortBy === 'model') return a.model.localeCompare(b.model);
        return b.dateStarted - a.dateStarted;
      });
  }, [quoteTrailers, searchQuery, sortBy]);

  const handleApprove = (t: Trailer) => {
    onUpdateTrailer(t.id, { currentPhase: 'backlog' as PhaseId });
    setConfirmAction(null);
  };

  const handleDeny = (t: Trailer) => {
    onUpdateTrailer(t.id, { isDeleted: true, isArchived: true, archivedAt: Date.now() });
    setConfirmAction(null);
  };

  const handleExport = async () => {
    const now = new Date();
    const year = format(now, 'yyyy');
    const toExport = filtered.filter(t => {
      const d = safeDate(t.dateStarted);
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
      const folderName = `quotes_${year}`;
      const folder = zip.folder(folderName);

      // 1. Master Excel file
      const rows = toExport.map(t => ({
        'Quote Label': `${t.name} - ${t.model} ${t.serialNumber}${t.notes ? ` (${t.notes})` : ''}`,
        'Serial Number': t.serialNumber,
        'Model': t.model,
        'Dealer / Customer': t.name,
        'Notes': t.notes || '',
        'Sale Price': t.sale_price ?? '',
        'Date Added': safeDate(t.dateStarted) ? format(safeDate(t.dateStarted)!, 'yyyy-MM-dd') : '',
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, `Quotes ${year}`);
      const excelBuf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
      folder?.file(`quotes_${year}_master.xlsx`, excelBuf);

      // 2. Individual quote files inside the folder
      toExport.forEach(t => {
        const dStr = safeDate(t.dateStarted) ? format(safeDate(t.dateStarted)!, 'yyyy-MM-dd') : 'N/A';
        const rawLabel = `${t.name} - ${t.model} - ${t.serialNumber}`;
        const safeFilename = rawLabel.replace(/[/\\?%*:|"<>]/g, '_').trim();

        const fileContent = [
          `LANE TRAILERS — QUOTE SPECIFICATION`,
          `====================================`,
          `Quote Label:      ${t.name} - ${t.model} ${t.serialNumber}${t.notes ? ` (${t.notes})` : ''}`,
          `Serial Number:    ${t.serialNumber}`,
          `Model:            ${t.model}`,
          `Customer/Dealer:  ${t.name}`,
          `Date Added:       ${dStr}`,
          `Sale Price:       ${t.sale_price != null ? `$${t.sale_price.toLocaleString()}` : 'Not Set'}`,
          `Status:           Quote (Pending Approval)`,
          `Notes / Options:  ${t.notes || 'None'}`,
          `------------------------------------`,
          `Generated:        ${format(now, 'yyyy-MM-dd HH:mm:ss')}`
        ].join('\n');

        folder?.file(`${safeFilename}.txt`, fileContent);
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quotes_${year}.zip`;
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
              <p style={{ fontSize: '0.7rem', color: 'var(--text-muted)', margin: 0 }}>{quoteTrailers.length} active quote{quoteTrailers.length !== 1 ? 's' : ''}</p>
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
        {filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '6rem 2rem', color: 'var(--text-muted)' }}>
            <BarChart3 size={48} style={{ marginBottom: '1rem', opacity: 0.3 }} />
            <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              {searchQuery ? 'No quotes match your search' : 'No active quotes'}
            </h2>
            <p style={{ fontSize: '0.85rem' }}>
              {searchQuery ? 'Try a different keyword.' : 'Add a trailer to the "Quote" phase to track it here.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {filtered.map(t => {
              const addedDate = safeDate(t.dateStarted);
              const quoteLabel = `${t.name} - ${t.model} ${t.serialNumber}${t.notes ? ` (${t.notes})` : ''}`;
              return (
                <div key={t.id} style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
                  {t.trailer_color && (
                    <div title={t.trailer_color} style={{ width: '20px', height: '44px', flexShrink: 0, borderRadius: '8px', background: t.trailer_color, border: (t.trailer_color.toLowerCase() === 'white' || t.trailer_color === '#fff' || t.trailer_color === '#ffffff') ? '2px solid #94a3b8' : '1.5px solid rgba(255,255,255,0.15)', boxShadow: '0 1px 4px rgba(0,0,0,0.18)' }} />
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '0.35rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{quoteLabel}</div>
                    <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><Hash size={13} /> {t.serialNumber}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><User size={13} /> {t.name}</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}><FileText size={13} /> {t.model}</span>
                      {addedDate && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}><Calendar size={13} /> {format(addedDate, 'MMM d, yyyy')}</span>}
                      {addedDate && <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}><Clock size={13} /> {formatDistanceToNow(addedDate, { addSuffix: true })}</span>}
                    </div>
                    {t.notes && <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.35rem', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.notes}</p>}
                  </div>
                  {userRole === 'manager' && t.sale_price != null && (
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <div style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>Quote Price</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 900, color: '#10b981' }}>${t.sale_price.toLocaleString()}</div>
                    </div>
                  )}
                  {t.spec_sheet_file && (
                    <button
                      onClick={() => triggerFileDownload(t.spec_sheet_file!, `${t.serialNumber}_Quote.xlsx`)}
                      title="Download quote sheet"
                      style={{ padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: 800, background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.3)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#6366f1', flexShrink: 0 }}
                    >
                      <Download size={14} /> Download Quote
                    </button>
                  )}
                  {userRole === 'manager' && (
                    <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                      <button onClick={() => setConfirmAction({ type: 'approve', trailer: t })} style={{ padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: 800, background: '#10b981', border: 'none', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#fff' }}>
                        <CheckCircle size={14} /> Approve
                      </button>
                      <button onClick={() => setConfirmAction({ type: 'deny', trailer: t })} style={{ padding: '0.45rem 1rem', fontSize: '0.78rem', fontWeight: 800, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.35rem', color: '#ef4444' }}>
                        <XCircle size={14} /> Deny
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>

      {confirmAction && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }} onClick={() => setConfirmAction(null)}>
          <div style={{ background: 'var(--bg-card)', borderRadius: '20px', border: '1px solid var(--border-default)', padding: '2rem', maxWidth: '420px', width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.4)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              {confirmAction.type === 'approve' ? <CheckCircle size={22} color="#10b981" /> : <XCircle size={22} color="#ef4444" />}
              <h3 style={{ fontSize: '1rem', fontWeight: 900 }}>{confirmAction.type === 'approve' ? 'Approve Quote' : 'Deny Quote'}</h3>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '1.5rem', lineHeight: 1.5 }}>
              {confirmAction.type === 'approve'
                ? <>Move <strong>{confirmAction.trailer.serialNumber}</strong> to the <strong>Backlog</strong> and start production?</>
                : <>Mark <strong>{confirmAction.trailer.serialNumber}</strong> as <strong>Denied</strong>? It will be removed from the active queue.</>}
            </p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setConfirmAction(null)} style={{ padding: '0.6rem 1.25rem', borderRadius: '10px', fontWeight: 700 }}>Cancel</button>
              <button onClick={() => confirmAction.type === 'approve' ? handleApprove(confirmAction.trailer) : handleDeny(confirmAction.trailer)} style={{ padding: '0.6rem 1.5rem', borderRadius: '10px', fontWeight: 800, background: confirmAction.type === 'approve' ? '#10b981' : '#ef4444', border: 'none', color: '#fff', cursor: 'pointer' }}>
                {confirmAction.type === 'approve' ? 'Yes, Approve' : 'Yes, Deny'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
