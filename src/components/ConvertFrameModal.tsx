import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { PHASES, type PhaseId, type StationId, STATIONS, type Trailer } from '../types';
import { RefreshCw, AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  trailer: Trailer | null;
  localModelCategories: { name: string; models: string[] }[];
  localSpecSheetTemplates?: Record<string, string>;
  onConvert: (trailerId: string, targetModel: string, targetPhase: PhaseId, targetStation?: StationId) => Promise<boolean>;
}

export const isLrgFrame = (model?: string): boolean => {
  if (!model) return false;
  const normalized = model.trim().toUpperCase().replace(/\s+/g, ' ');
  return normalized === 'LRG - FRAME' || normalized === 'LRG-FRAME' || normalized.includes('LRG - FRAME') || normalized.includes('LRG-FRAME');
};

export const ConvertFrameModal: React.FC<Props> = ({
  isOpen,
  onClose,
  trailer,
  localModelCategories,
  localSpecSheetTemplates = {},
  onConvert,
}) => {
  const [selectedModel, setSelectedModel] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<PhaseId>('backlog');
  const [selectedStation, setSelectedStation] = useState<StationId>('None');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && trailer) {
      setSelectedModel('');
      setSelectedPhase('backlog');
      setSelectedStation(trailer.station || 'None');
      setErrorMsg(null);
      setIsSubmitting(false);
    }
  }, [isOpen, trailer]);

  if (!isOpen || !trailer) return null;

  const hasTemplate = selectedModel ? Boolean(localSpecSheetTemplates[selectedModel]) : false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedModel) {
      setErrorMsg('Please select a target trailer model.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    try {
      const success = await onConvert(
        trailer.id,
        selectedModel,
        selectedPhase,
        selectedPhase === 'build' || selectedPhase === 'prefab' ? selectedStation : 'None'
      );
      if (success) {
        onClose();
      } else {
        setErrorMsg('Failed to convert trailer. Please try again.');
      }
    } catch (err: any) {
      console.error('Conversion error:', err);
      setErrorMsg(err?.message || 'An unexpected error occurred during frame conversion.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      title={`Convert Base Frame • Serial #${trailer.serialNumber}`}
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Banner Notice */}
        <div
          style={{
            background: 'linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(99, 102, 241, 0.1) 100%)',
            border: '1px solid rgba(59, 130, 246, 0.3)',
            borderRadius: '16px',
            padding: '1.25rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '0.9rem',
          }}
        >
          <div
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              color: '#ffffff',
            }}
          >
            <RefreshCw size={20} className={isSubmitting ? 'animate-spin' : ''} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.95rem', fontWeight: 800, margin: '0 0 0.25rem 0', color: 'var(--text-primary)' }}>
              LRG - FRAME Conversion Workflow
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.45 }}>
              Converting this base frame updates the trailer model, generates a new matching Excel spec sheet, and moves the trailer into the selected production phase.
            </p>
          </div>
        </div>

        {/* Preserved Data Badges */}
        <div
          style={{
            background: 'var(--bg-secondary)',
            borderRadius: '14px',
            padding: '1rem 1.25rem',
            border: '1px solid var(--border-default)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.75rem' }}>
            <ShieldCheck size={16} color="#10b981" />
            <span style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#10b981' }}>
              Preserved Fields (Zero Data Loss)
            </span>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: '0.6rem' }}>
            <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Serial Number</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 900, color: 'var(--accent)' }}>{trailer.serialNumber}</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Customer / Dealer</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{trailer.name || 'Generic Stock'}</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Color & Plug</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{trailer.trailer_color || 'Default'} • {trailer.trailer_plug || '7-Way'}</div>
            </div>

            <div style={{ background: 'var(--bg-card)', padding: '0.5rem 0.75rem', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
              <div style={{ fontSize: '0.62rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Sale Price</div>
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#10b981' }}>${(trailer.sale_price || 0).toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* Target Model Selection */}
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
            Target Trailer Model *
          </label>
          <select
            className="form-select"
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            required
            style={{
              padding: '0.8rem 1rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              background: 'var(--bg-card)',
              borderRadius: '10px',
              border: '1px solid var(--border-default)',
            }}
          >
            <option value="">Select Trailer Model to convert to...</option>
            {localModelCategories.map((cat) => (
              <optgroup key={cat.name} label={cat.name}>
                {cat.models
                  .filter((m) => !isLrgFrame(m)) // Exclude LRG - FRAME itself
                  .map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>

          {selectedModel && !hasTemplate && (
            <div style={{ marginTop: '0.4rem', fontSize: '0.76rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
              <AlertCircle size={14} />
              <span>Note: No custom Excel template found for this model. Default template will be created.</span>
            </div>
          )}
        </div>

        {/* Destination Phase & Station */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
              Destination Phase *
            </label>
            <select
              className="form-select"
              value={selectedPhase}
              onChange={(e) => setSelectedPhase(e.target.value as PhaseId)}
              required
              style={{
                padding: '0.75rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: 'var(--bg-card)',
                borderRadius: '10px',
                border: '1px solid var(--border-default)',
              }}
            >
              {PHASES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" style={{ fontSize: '0.78rem', fontWeight: 800 }}>
              Bay / Station
            </label>
            <select
              className="form-select"
              value={selectedStation}
              onChange={(e) => setSelectedStation(e.target.value as StationId)}
              style={{
                padding: '0.75rem 1rem',
                fontSize: '0.9rem',
                fontWeight: 700,
                background: 'var(--bg-card)',
                borderRadius: '10px',
                border: '1px solid var(--border-default)',
              }}
            >
              <option value="None">None (Unassigned)</option>
              {STATIONS.map((st) => (
                <option key={st} value={st}>
                  Bay {st}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div
            style={{
              padding: '0.75rem 1rem',
              borderRadius: '10px',
              background: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#ef4444',
              fontSize: '0.85rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Modal Action Buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
          <button
            type="submit"
            disabled={isSubmitting || !selectedModel}
            className="btn btn-primary"
            style={{
              flex: 1,
              padding: '0.85rem',
              borderRadius: '12px',
              fontWeight: 900,
              fontSize: '0.95rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
            }}
          >
            {isSubmitting ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>Converting Frame & Updating Spec...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Convert & Route to {PHASES.find((p) => p.id === selectedPhase)?.title || selectedPhase}</span>
              </>
            )}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isSubmitting}
            style={{ padding: '0.85rem 1.25rem', borderRadius: '12px', fontWeight: 800 }}
          >
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
};
