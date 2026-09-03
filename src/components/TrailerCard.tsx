import React, { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clock, Hash, Calendar, Crown, StickyNote, Truck, Layers, GripVertical, RefreshCw, Save, CheckCircle2, FileText } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import type { Trailer, StationId, PhaseId, UserRole } from '../types';
import { STATIONS, PHASE_METADATA, calculateTrailerRemainingHours } from '../types';
import { isLrgFrame } from './ConvertFrameModal';

interface Props {
  trailer: Trailer;
  onUpdateTrailer?: (id: string, updates: Partial<Trailer>) => void;
  onCardClick?: (mode?: 'view' | 'edit') => void;
  onShipRequest?: (trailer: Trailer) => void;
  onConvertRequest?: (trailer: Trailer) => void;
  hideCustomerName?: boolean;
  hideShipButton?: boolean;
  isHighlighted?: boolean;
  suggestedBay?: StationId;
  showPhaseBadge?: boolean;
  isTVMode?: boolean;
  localTargetHours: Record<string, Record<PhaseId, number>>;
  isOverlay?: boolean;
  userRole: UserRole;
  isPriceUnlockedGlobally?: boolean;
  onUnlockPrices?: () => boolean;
  hidePrice?: boolean;
  isBoardLocked?: boolean;
  isDarin?: boolean;
}

export const TrailerCard: React.FC<Props> = React.memo(({ 
  trailer, 
  onUpdateTrailer, 
  onCardClick,
  onShipRequest,
  onConvertRequest,
  hideCustomerName,
  hideShipButton,
  isHighlighted,
  suggestedBay,
  showPhaseBadge,
  isTVMode,
  localTargetHours,
  isOverlay,
  userRole,
  isPriceUnlockedGlobally,
  onUnlockPrices,
  hidePrice,
  isBoardLocked,
  isDarin
}) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isDragDisabled = userRole !== 'manager' || (Boolean(isBoardLocked) && !isDarin);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    isDragging
  } = useSortable({
    id: trailer.id,
    disabled: isDragDisabled,
    data: {
      type: 'Trailer',
      trailer
    }
  });

  // Local draft state for shipping details editing directly on the card
  const [draftInvoice, setDraftInvoice] = React.useState<string>(trailer.invoiceNumber || '');
  const [draftVinDate, setDraftVinDate] = React.useState<string>(trailer.vinDate || '');
  const [isSavingShipping, setIsSavingShipping] = React.useState<boolean>(false);
  const [showSaveSuccess, setShowSaveSuccess] = React.useState<boolean>(false);

  useEffect(() => {
    setDraftInvoice(trailer.invoiceNumber || '');
    setDraftVinDate(trailer.vinDate || '');
  }, [trailer.invoiceNumber, trailer.vinDate]);

  const isInvoiceChanged = draftInvoice.trim() !== (trailer.invoiceNumber || '').trim();
  const isVinDateChanged = draftVinDate.trim() !== (trailer.vinDate || '').trim();
  const isShippingDirty = isInvoiceChanged || isVinDateChanged;

  const isShippingPhase = trailer.currentPhase === 'shipping';
  const hasCompleteShippingDetails = isShippingPhase && Boolean(
    (trailer.invoiceNumber && trailer.invoiceNumber.trim()) &&
    (trailer.vinDate && trailer.vinDate.trim())
  );
  const hasPartialShippingDetails = isShippingPhase && !hasCompleteShippingDetails && Boolean(
    (trailer.invoiceNumber && trailer.invoiceNumber.trim()) ||
    (trailer.vinDate && trailer.vinDate.trim())
  );

  const handleSaveShippingDetails = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (!onUpdateTrailer || !isShippingDirty || isSavingShipping) return;

    setIsSavingShipping(true);
    const updates: Partial<Trailer> = {};
    if (isInvoiceChanged) updates.invoiceNumber = draftInvoice.trim();
    if (isVinDateChanged) updates.vinDate = draftVinDate.trim();

    onUpdateTrailer(trailer.id, updates);
    setIsSavingShipping(false);
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  useEffect(() => {
    if (isHighlighted && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isHighlighted]);

  // Chrome on desktop reports maxTouchPoints > 0 even on non-touch machines, so we only
  // use the pointer:coarse media query which accurately identifies real touch devices.
  const isTouchDevice = typeof window !== 'undefined' && 
    window.matchMedia('(pointer: coarse)').matches;

  const style: React.CSSProperties = {
    transition: isDragging ? 'none' : 'transform 0ms linear, opacity 0ms linear',
    transform: CSS.Transform.toString(transform ? {
      ...transform,
      scaleX: isOverlay ? 1.05 : transform.scaleX,
      scaleY: isOverlay ? 1.05 : transform.scaleY,
    } : null),
    opacity: isDragging ? (isOverlay ? 1 : 0.15) : 1,
    zIndex: isDragging ? (isOverlay ? 1000 : 10) : 1,
    cursor: isDragDisabled ? 'default' : (isDragging ? 'grabbing' : 'grab'),
    boxShadow: isOverlay
      ? '0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)'
      : isShippingDirty
      ? '0 0 14px rgba(245, 158, 11, 0.45)'
      : hasCompleteShippingDetails
      ? '0 0 16px rgba(16, 185, 129, 0.35)'
      : hasPartialShippingDetails
      ? '0 0 10px rgba(59, 130, 246, 0.25)'
      : (isDragging ? 'none' : undefined),
    borderColor: isShippingDirty
      ? '#f59e0b'
      : hasCompleteShippingDetails
      ? '#10b981'
      : hasPartialShippingDetails
      ? '#3b82f6'
      : undefined,
    borderWidth: (isShippingDirty || hasCompleteShippingDetails || hasPartialShippingDetails) ? '2px' : undefined,
    borderStyle: (isShippingDirty || hasCompleteShippingDetails || hasPartialShippingDetails) ? 'solid' : undefined,
    background: hasCompleteShippingDetails
      ? 'linear-gradient(180deg, rgba(16, 185, 129, 0.08) 0%, var(--bg-card) 100%)'
      : undefined,
    rotate: isOverlay ? '2deg' : undefined,
    willChange: 'transform',
    touchAction: isTouchDevice ? 'auto' : 'none',
  };

  const currentLog = (trailer.history ?? []).find(h => h.phase === trailer.currentPhase && !h.exitedAt);
  const safeEnteredAt = (currentLog && Number.isFinite(currentLog.enteredAt)) ? currentLog.enteredAt : null;
  const timeInPhase = safeEnteredAt ? formatDistanceToNow(safeEnteredAt) : '0m';

  // eslint-disable-next-line react-hooks/purity
  const hoursRemaining = safeEnteredAt ? (Date.now() - safeEnteredAt) / (1000 * 60 * 60) : 0;
  const currentManual = (trailer.history ?? [])
    .filter(h => h.phase === trailer.currentPhase)
    .reduce((sum, h) => sum + (h.phaseManualHours ?? h.bayManualHours ?? 0), 0);
  const targetHours = currentManual > 0
    ? currentManual
    : (localTargetHours[trailer.model]?.[trailer.currentPhase]
      ?? PHASE_METADATA[trailer.currentPhase]?.defaultTargetHours
      ?? 40);
  const isBottleneck = trailer.currentPhase !== 'backlog' && hoursRemaining > targetHours;

  const timeToShipping = calculateTrailerRemainingHours(trailer, localTargetHours);

  return (
    <div
      ref={(node) => {
        setNodeRef(node);
        if (cardRef) {
          (cardRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
        }
      }}
      style={style}
      className={`trailer-card hover-lift ${isBottleneck ? 'is-bottleneck' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${isTVMode ? 'is-ultra-compact' : ''}`}
      {...attributes}
      {...(!isTouchDevice ? listeners : {})}
      onClick={() => onCardClick?.('view')}
    >
      <div className="card-header-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.3rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
          {isTouchDevice && (
            <div 
              {...listeners}
              className="drag-handle"
              style={{ 
                padding: '0.2rem',
                margin: '-0.2rem 0 -0.2rem -0.2rem',
                cursor: 'grab',
                touchAction: 'none',
                color: 'var(--accent)',
                opacity: 0.8,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255, 255, 255, 0.05)',
                borderRadius: '6px',
                width: '24px',
                height: '24px'
              }}
            >
              <GripVertical size={20} strokeWidth={3} />
            </div>
          )}
          <div className="card-title" style={{ flex: 1, minWidth: 0 }}>
            <span className="card-model" style={{ 
              display: 'block', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis',
              fontSize: '0.9rem'
            }}>{trailer.model}</span>
            {!hideCustomerName && (
              <span className="card-customer" style={{ 
                display: 'block', 
                whiteSpace: 'nowrap', 
                overflow: 'hidden', 
                textOverflow: 'ellipsis',
                fontSize: '0.725rem'
              }}>{trailer.name}</span>
            )}
          </div>
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.4rem', marginLeft: '0.75rem' }}>
          {/* Trailer Color Swatch */}
          {trailer.trailer_color && (() => {
            const colorLower = trailer.trailer_color.toLowerCase().trim();
            // Detect visually-light colors that need a border to be visible on white bg
            const lightColors = ['white', 'ivory', 'cream', 'snow', 'ghost white', 'beige', 'linen', 'seashell', 'old lace', 'floral white', 'mint', 'lavender', 'yellow', 'lightyellow', 'light yellow', 'silver', 'light gray', 'light grey', 'lightgray', 'lightgrey', 'gainsboro', 'whitesmoke', 'floralwhite', 'cornsilk', 'honeydew', 'azure', 'aliceblue', 'ghost'];
            const isLightColor = lightColors.some(lc => colorLower.includes(lc)) || colorLower.startsWith('#f') || colorLower.startsWith('#e');
            const isWhiteOrNear = colorLower === 'white' || colorLower === '#fff' || colorLower === '#ffffff' || colorLower === 'ivory' || colorLower === 'cream';

            // Detect black / dark colors that need a prominent white border on dark cards
            const blackColors = ['black', 'jet black', 'matte black', 'gloss black', 'onyx', 'charcoal', '#000', '#000000', '#111', '#111111', '#1a1a1a', '#18181b', '#09090b', '#222', '#222222'];
            const isBlackOrDark = blackColors.some(bc => colorLower.includes(bc)) || colorLower === '#000' || colorLower === '#000000' || colorLower === 'black';

            // Darken bright/standard HTML orange to rich industrial orange
            let displayColor = trailer.trailer_color;
            if (colorLower === 'orange' || colorLower === 'standard orange' || colorLower === 'bright orange' || colorLower === '#ffa500') {
              displayColor = '#d97706'; // Darker industrial orange
            } else if (colorLower === 'safety orange') {
              displayColor = '#ea580c'; // Rich dark safety orange
            } else if (colorLower === 'dark orange' || colorLower === 'darkorange') {
              displayColor = '#c2410c';
            }

            return (
              <div
                title={`Color: ${trailer.trailer_color}`}
                style={{
                  width: '22px',
                  height: '22px',
                  borderRadius: '6px',
                  background: displayColor,
                  border: isBlackOrDark
                    ? '2px solid rgba(255, 255, 255, 0.85)'
                    : isWhiteOrNear
                    ? '2px solid #94a3b8'
                    : isLightColor
                    ? '1.5px solid rgba(0,0,0,0.3)'
                    : '1.5px solid rgba(255,255,255,0.3)',
                  boxShadow: isBlackOrDark 
                    ? '0 0 0 1px rgba(255,255,255,0.2), 0 2px 5px rgba(0,0,0,0.4)' 
                    : '0 1px 4px rgba(0,0,0,0.18)',
                  flexShrink: 0,
                  cursor: 'default'
                }}
              />
            );
          })()}
          {/* Time to Shipping Indicator */}
          {trailer.currentPhase !== 'shipping' && (
            <div style={{ 
              display: 'flex', 
              padding: isTVMode ? '0.2rem 0.4rem' : '0.3rem 0.6rem', 
              background: 'var(--bg-secondary)', 
              color: 'var(--accent)', 
              borderRadius: '8px', 
              fontSize: isTVMode ? '0.6rem' : '0.7rem', 
              fontWeight: 900, 
              alignItems: 'center', 
              gap: '0.3rem',
              border: '1px solid var(--border-default)',
              whiteSpace: 'nowrap'
            }}>
              <span style={{ fontSize: isTVMode ? '0.55rem' : '0.6rem' }}>{Number.isFinite(timeToShipping) ? Math.round(timeToShipping) : 0}H TO SHIP</span>
            </div>
          )}

          {(() => {
            if (!trailer.promisedShippingDate || isTVMode) return null;
            const parsedDate = new Date(trailer.promisedShippingDate);
            const isValidDate = !isNaN(parsedDate.getTime());
            if (!isValidDate) return null;

            return (
              <div style={{ 
                padding: '0.3rem 0.6rem', 
                background: trailer.isPriority ? 'rgba(239, 68, 68, 0.1)' : 'rgba(255, 255, 255, 0.03)', 
                borderRadius: '8px', 
                border: `1px solid ${trailer.isPriority ? 'rgba(239, 68, 68, 0.2)' : 'var(--border-default)'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                whiteSpace: 'nowrap'
              }}>
                {trailer.isPriority && <Crown size={12} fill="#ef4444" color="#ef4444" />}
                <Calendar size={12} color={trailer.isPriority ? '#ef4444' : 'var(--text-muted)'} />
                <span style={{ 
                  fontSize: '0.75rem', 
                  fontWeight: 700, 
                  color: trailer.isPriority ? '#f87171' : 'var(--text-secondary)'
                }}>
                  {format(parsedDate, 'MMM d')}
                </span>
              </div>
            );
          })()}
        </div>

      </div>
      
      <div className="card-meta">
        <div className="card-meta-item">
          <Hash className="card-meta-icon" />
          <span>{trailer.serialNumber}</span>
          {userRole === 'manager' && trailer.sale_price !== undefined && !hidePrice && !isTVMode && (
            <span 
              className="card-price-display"
              onClick={(e) => {
                if (!isPriceUnlockedGlobally && onUnlockPrices) {
                  e.stopPropagation();
                  onUnlockPrices();
                }
              }}
              style={{ 
                marginLeft: 'auto', 
                color: '#10b981', 
                fontWeight: 900, 
                fontSize: '0.8rem',
                background: 'rgba(16, 185, 129, 0.1)',
                padding: '1px 6px',
                borderRadius: '6px',
                border: '1px solid rgba(16, 185, 129, 0.2)',
                cursor: isPriceUnlockedGlobally ? 'default' : 'pointer'
              }}
            >
              {isPriceUnlockedGlobally ? (trailer.sale_price != null ? `$${trailer.sale_price.toLocaleString()}` : 'NOT SET') : '••••••'}
            </span>
          )}
          {showPhaseBadge && (
             <div style={{
               marginLeft: '0.5rem',
               display: 'flex',
               alignItems: 'center',
               gap: '0.3rem',
               background: 'var(--bg-secondary)',
               color: 'var(--text-secondary)',
               padding: '2px 8px',
               borderRadius: '4px',
               fontSize: '0.65rem',
               fontWeight: 800,
               textTransform: 'uppercase',
               border: '1px solid var(--border-default)'
             }}>
               <Layers size={10} color="var(--text-muted)" strokeWidth={3} />
               {PHASE_METADATA[trailer.currentPhase]?.title || trailer.currentPhase || 'Unknown'}
             </div>
          )}
        </div>
        
        <div 
          className="card-meta-item station-badge-wrapper" 
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 800, color: 'var(--accent)', textTransform: 'uppercase' }}>Bay</span>
            {!isTVMode && userRole === 'manager' ? (
                <select 
                  className="bay-select"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid var(--border-default)',
                    borderRadius: '6px',
                    fontSize: '0.75rem',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    padding: '2px 8px',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  value={trailer.station}
                  onChange={(e) => onUpdateTrailer?.(trailer.id, { station: e.target.value as StationId })}
                  onClick={(e) => e.stopPropagation()}
                >
                  <option value="None" style={{ background: 'var(--bg-card)' }}>Off</option>
                  {STATIONS.map(s => <option key={s} value={s} style={{ background: 'var(--bg-card)' }}>{s}</option>)}
                </select>
            ) : (
              <span style={{ 
                fontSize: '0.75rem', 
                fontWeight: 800, 
                color: 'var(--text-primary)',
                background: 'var(--bg-secondary)',
                padding: '2px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border-default)'
              }}>
                {trailer.station === 'None' ? 'Off' : trailer.station}
              </span>
            )}
            {trailer.currentPhase === 'backlog' && trailer.station === 'None' && suggestedBay && (
              <span className="reco-badge-tag" style={{ marginLeft: '0.2rem', padding: '2px 6px', fontSize: '0.6rem' }}>
                RECO: {suggestedBay}
              </span>
            )}
          </div>
        </div>

        {!isTVMode && (
          <div className="card-meta-item">
            <Calendar className="card-meta-icon" />
            <span>
              Started {trailer.dateStarted && Number.isFinite(trailer.dateStarted) && !isNaN(new Date(trailer.dateStarted).getTime())
                ? format(trailer.dateStarted, 'MMM d')
                : '—'}
            </span>
          </div>
        )}
      </div>
      
      {trailer.notes && !isTVMode && (
        <div style={{ 
          marginTop: '0.25rem', 
          padding: '0.5rem 0.75rem', 
          background: 'rgba(255, 255, 255, 0.02)', 
          borderRadius: '8px', 
          border: '1px solid var(--border-default)',
          display: 'flex',
          gap: '0.5rem',
          alignItems: 'start'
        }}>
          <StickyNote size={14} style={{ color: '#64748b', marginTop: '2px', flexShrink: 0 }} />
          <p style={{ 
            fontSize: '0.75rem', 
            color: '#475569', 
            margin: 0, 
            lineHeight: '1.4', 
            fontStyle: 'italic',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden'
          }}>
            {trailer.notes}
          </p>
        </div>
      )}

      {!isTVMode && (
        <div className="card-footer">
            <div className="card-meta-item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
                <div className="card-meta-item">
                  <Clock className="card-meta-icon" style={{ color: 'var(--accent)', width: '12px', height: '12px' }} />
                  <span className="card-time" style={{ fontSize: '0.65rem' }}>
                    {timeInPhase} (Stage: {Number.isFinite(targetHours) ? Math.round(targetHours) : 0}h)
                  </span>
                </div>
                <div className="card-meta-item">
                  <Hash className="card-meta-icon" style={{ color: '#0ea5e9', width: '12px', height: '12px' }} />
                  <span style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>
                    Pipeline: {Number.isFinite(calculateTrailerRemainingHours(trailer, localTargetHours)) ? Math.round(calculateTrailerRemainingHours(trailer, localTargetHours)) : 0}h
                  </span>
                </div>
              </div>
            </div>
          
          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
            {trailer.finishingType && (
              <span className="badge-finishing" data-type={trailer.finishingType}>
                {trailer.finishingType}
              </span>
            )}

          </div>
        </div>
      )}

      {trailer.currentPhase === 'shipping' && (
        <div 
          className="shipping-card-panel"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{ 
            marginTop: '0.75rem', 
            padding: '0.65rem', 
            background: hasCompleteShippingDetails 
              ? 'rgba(16, 185, 129, 0.08)' 
              : 'rgba(255, 255, 255, 0.03)', 
            borderRadius: '8px', 
            border: `1px solid ${
              isShippingDirty 
                ? 'rgba(245, 158, 11, 0.6)' 
                : hasCompleteShippingDetails 
                ? 'rgba(16, 185, 129, 0.35)' 
                : 'var(--border-default)'
            }`,
            display: 'flex', 
            flexDirection: 'column', 
            gap: '0.5rem' 
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <FileText size={13} color={hasCompleteShippingDetails ? '#10b981' : isShippingDirty ? '#f59e0b' : 'var(--text-muted)'} />
              <span style={{ 
                fontSize: '0.7rem', 
                fontWeight: 800, 
                color: hasCompleteShippingDetails ? '#10b981' : isShippingDirty ? '#f59e0b' : 'var(--text-secondary)',
                textTransform: 'uppercase',
                letterSpacing: '0.02em'
              }}>
                {hasCompleteShippingDetails ? '✓ Shipping Info Set' : 'Shipping Details'}
              </span>
            </div>
            {isShippingDirty ? (
              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#f59e0b', background: 'rgba(245, 158, 11, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                Unsaved Edits
              </span>
            ) : hasCompleteShippingDetails ? (
              <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '1px 6px', borderRadius: '4px' }}>
                Complete
              </span>
            ) : null}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.4rem' }}>
            <div>
              <label htmlFor={`invoice-input-${trailer.id}`} style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 700 }}>
                INVOICE #
              </label>
              <input
                id={`invoice-input-${trailer.id}`}
                name="invoiceNumber"
                type="text"
                placeholder="Invoice #"
                value={draftInvoice}
                onChange={(e) => setDraftInvoice(e.target.value)}
                disabled={userRole !== 'manager'}
                style={{
                  width: '100%',
                  padding: '4px 7px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: draftInvoice ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-default)',
                  borderRadius: '5px',
                  outline: 'none'
                }}
              />
            </div>
            <div>
              <label htmlFor={`vin-date-input-${trailer.id}`} style={{ display: 'block', fontSize: '0.625rem', color: 'var(--text-muted)', marginBottom: '2px', fontWeight: 700 }}>
                VIN DATE
              </label>
              <input
                id={`vin-date-input-${trailer.id}`}
                name="vinDate"
                type="date"
                value={draftVinDate}
                onChange={(e) => setDraftVinDate(e.target.value)}
                disabled={userRole !== 'manager'}
                style={{
                  width: '100%',
                  padding: '4px 7px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  background: 'var(--bg-secondary)',
                  color: 'var(--text-primary)',
                  border: draftVinDate ? '1px solid rgba(16, 185, 129, 0.4)' : '1px solid var(--border-default)',
                  borderRadius: '5px',
                  outline: 'none'
                }}
              />
            </div>
          </div>

          {userRole === 'manager' && (
            <button
              className="btn"
              onClick={handleSaveShippingDetails}
              disabled={!isShippingDirty || isSavingShipping}
              style={{
                width: '100%',
                padding: '6px 10px',
                fontSize: '0.725rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.4rem',
                borderRadius: '6px',
                transition: 'all 0.2s ease',
                background: showSaveSuccess
                  ? '#059669'
                  : isShippingDirty
                  ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                  : 'var(--bg-secondary)',
                color: isShippingDirty || showSaveSuccess ? '#ffffff' : 'var(--text-muted)',
                border: isShippingDirty ? 'none' : '1px solid var(--border-default)',
                boxShadow: isShippingDirty ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none',
                cursor: isShippingDirty ? 'pointer' : 'not-allowed',
                opacity: isShippingDirty || showSaveSuccess ? 1 : 0.6
              }}
            >
              {showSaveSuccess ? (
                <>
                  <CheckCircle2 size={14} /> Saved!
                </>
              ) : isShippingDirty ? (
                <>
                  <Save size={14} /> Save Shipping Info
                </>
              ) : (
                <>
                  <Save size={14} /> Save (No Changes)
                </>
              )}
            </button>
          )}
        </div>
      )}

      {trailer.currentPhase === 'shipping' && !hideShipButton && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border-default)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {isLrgFrame(trailer.model) && (
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', gap: '0.6rem', background: 'linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)', boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)' }} 
              onClick={(e) => {
                e.stopPropagation();
                if (onConvertRequest) onConvertRequest(trailer);
              }}
            >
              <RefreshCw size={15} /> Convert Frame
            </button>
          )}
          <button 
            className="btn btn-primary" 
            style={{ width: '100%', gap: '0.75rem', background: '#10b981', opacity: userRole === 'manager' ? 1 : 0.85, cursor: userRole === 'manager' ? 'pointer' : 'default' }} 
            onClick={(e) => {
              e.stopPropagation();
              if (userRole !== 'manager') {
                return;
              }
              if (onShipRequest) onShipRequest(trailer);
              else onUpdateTrailer?.(trailer.id, { isArchived: true, archivedAt: Date.now() });
            }}
          >
            <Truck size={16} /> Mark as Shipped
          </button>
        </div>
      )}
    </div>
  );
});
