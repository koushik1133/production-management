 
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, ArrowRight, Clock, Trash2, Calendar, AlertCircle, CheckCircle, Copy } from 'lucide-react';
import { PHASES, PHASE_METADATA } from './types';
import type { Trailer, StationId, PhaseId, UserRole } from './types';
import { addHours, format } from 'date-fns';
import { injectTrailerDataIntoSpec } from './lib/injectSpecSheet';
import { supabase } from './lib/supabase';
import { fetchTemplateAsBase64, uploadFileToSupabase, dataURLtoFile } from './utils/storage';
import { persistQuote } from './utils/quotesStore';

export function getNextIncrementedSerial(baseSerial: string, existingTrailers: Trailer[]): string {
  if (!baseSerial || !baseSerial.trim()) return '10001';
  const trimmed = baseSerial.trim();
  
  // Extract trailing digits (e.g., "T473" -> prefix "T", numStr "473")
  const match = trimmed.match(/^(.*?)(\d+)$/);
  
  let prefix = '';
  let numVal = 0;
  let padLen = 0;

  if (match) {
    prefix = match[1];
    const numStr = match[2];
    numVal = parseInt(numStr, 10);
    padLen = numStr.length;
  } else {
    prefix = trimmed + '-';
    numVal = 1;
    padLen = 1;
  }

  const existingSerials = new Set(
    existingTrailers
      .filter(t => !t.isDeleted)
      .map(t => t.serialNumber?.trim().toLowerCase())
  );

  let attempts = 0;
  while (attempts < 1000) {
    numVal += 1;
    attempts++;
    const nextNumStr = padLen > 0 ? numVal.toString().padStart(padLen, '0') : numVal.toString();
    const candidate = `${prefix}${nextNumStr}`;
    if (!existingSerials.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${trimmed}-copy`;
}

interface Props {
  onAddTrailer: (trailer: Trailer) => void;
  onUpdateTrailer: (id: string, updates: Partial<Trailer>) => void;
  onDeleteTrailer?: (id: string) => void;
  trailers: Trailer[];
  suggestedBay: StationId;
  nextSuggestedSerial?: string;
  localModelCategories: { name: string, models: string[] }[];
  localTargetHours: Record<string, Record<PhaseId, number>>;
  localSpecSheetTemplates: Record<string, string>;
  userRole: UserRole;
  isPriceUnlockedGlobally?: boolean;
  onUnlockPrices?: () => boolean;
  dealers?: { id: string; name: string; addresses?: string[]; common_address?: string; }[];
  onUpdateDealer?: (id: string, dealer: { name: string, addresses: string[], common_address: string }) => Promise<void>;
}

export const BacklogView: React.FC<Props> = ({ onAddTrailer, onUpdateTrailer, onDeleteTrailer, trailers, suggestedBay, nextSuggestedSerial, localModelCategories, localTargetHours, localSpecSheetTemplates, userRole, isPriceUnlockedGlobally, onUnlockPrices, dealers = [], onUpdateDealer }) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const [visibleBacklogCount, setVisibleBacklogCount] = useState(8);

  const activeFloorTrailers = trailers.filter(t => !t.isArchived && t.currentPhase !== 'backlog');
  const factoryWorkloadHours = activeFloorTrailers.reduce((sum, t) => {
    const manualHours = (t.history ?? [])
      .filter(h => h.phase === t.currentPhase)
      .reduce((s, h) => s + (h.phaseManualHours ?? h.bayManualHours ?? 0), 0);
    const templateHours = (localTargetHours[t.model] || {})[t.currentPhase] || PHASE_METADATA[t.currentPhase]?.defaultTargetHours || 0;
    return sum + (manualHours > 0 ? manualHours : templateHours);
  }, 0);

  const BAYS_COUNT = 4;
  const activeFloorDelayHours = factoryWorkloadHours / BAYS_COUNT;

  const backlogTrailers = trailers
    .filter(t => !t.isArchived && t.currentPhase === 'backlog')
    .filter(t => 
      (t.name?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) || 
      (t.serialNumber?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
      (t.model?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    );

  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  const allQuoteTrailers = trailers
    .filter(t => !t.isArchived && !t.isDeleted && t.currentPhase === 'quote' && t.quoteStatus !== 'approved' && !t.notes?.includes('[STATUS:approved]'))
    .filter(t => 
      (t.name?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) || 
      (t.serialNumber?.toLowerCase() ?? '').includes(searchQuery.toLowerCase()) ||
      (t.model?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    );

  const pendingQuoteTrailers = allQuoteTrailers
    .filter(t => {
      if (t.quoteStatus === 'approved' || (t.notes && t.notes.includes('[STATUS:approved]'))) return false;
      if (t.quoteStatus === 'denied' || t.quoteStatus === 'auto_denied' || (t.notes && (t.notes.includes('[STATUS:denied]') || t.notes.includes('[STATUS:auto_denied]')))) return false;
      const createdAt = t.dateStarted || t.history?.[0]?.enteredAt || Date.now();
      return (Date.now() - createdAt) <= SEVEN_DAYS_MS;
    })
    .sort((a, b) => (a.dateStarted || 0) - (b.dateStarted || 0));

  const autoDeniedQuoteTrailers = allQuoteTrailers
    .filter(t => {
      if (t.quoteStatus === 'approved' || (t.notes && t.notes.includes('[STATUS:approved]'))) return false;
      if (t.quoteStatus === 'denied' || t.quoteStatus === 'auto_denied' || (t.notes && (t.notes.includes('[STATUS:denied]') || t.notes.includes('[STATUS:auto_denied]')))) return true;
      const createdAt = t.dateStarted || t.history?.[0]?.enteredAt || Date.now();
      return (Date.now() - createdAt) > SEVEN_DAYS_MS;
    })
    .sort((a, b) => (b.dateStarted || 0) - (a.dateStarted || 0));

  const [selectedQuoteTab, setSelectedQuoteTab] = useState<'pending' | 'auto_denied' | 'all'>('pending');

  const handleTogglePart = (trailer: Trailer, partKey: keyof NonNullable<Trailer['partsStatus']>) => {
    const currentStatus = trailer.partsStatus || { tyres: false, steel: false, parts: false };
    onUpdateTrailer(trailer.id, {
      partsStatus: {
        ...currentStatus,
        [partKey]: !currentStatus[partKey]
      }
    });
  };

  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [approvingQuoteId, setApprovingQuoteId] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    model: '',
    serialNumber: '',
    station: 'B1' as StationId,
    isPriority: false,
    partsStatus: {
      tyres: false,
      steel: false,
      parts: false
    },
    promisedShippingDate: '',
    dateRegistered: new Date().toISOString().split('T')[0],
    sale_price: '',
    trailer_color: '',
    trailer_plug: '',
    salesPerson: '',
    dealerLocation: '',
    purchaseOrder: '',
    consignment: ''
  });

  const [isCustomAddress, setIsCustomAddress] = useState(false);
  const [customAddressText, setCustomAddressText] = useState('');

  const handleUseDetails = (trailer: Trailer) => {
    const nextSerial = getNextIncrementedSerial(trailer.serialNumber, trailers);
    const loc = trailer.dealerLocation || '';

    setFormData({
      name: trailer.name || '',
      model: trailer.model || '',
      serialNumber: nextSerial,
      station: 'B1',
      isPriority: trailer.isPriority || false,
      partsStatus: {
        tyres: trailer.partsStatus?.tyres || false,
        steel: trailer.partsStatus?.steel || false,
        parts: trailer.partsStatus?.parts || false
      },
      promisedShippingDate: trailer.promisedShippingDate || '',
      dateRegistered: new Date().toISOString().split('T')[0],
      sale_price: trailer.sale_price != null ? trailer.sale_price.toString() : '',
      trailer_color: trailer.trailer_color || '',
      trailer_plug: trailer.trailer_plug || '',
      salesPerson: trailer.salesPerson || '',
      dealerLocation: loc,
      purchaseOrder: trailer.purchaseOrder || '',
      consignment: trailer.consignment || ''
    });

    if (loc && trailer.name) {
      const d = dealers.find(dl => dl.name === trailer.name);
      const knownAddresses = d ? [...(d.common_address ? [d.common_address] : []), ...(d.addresses || [])] : [];
      if (knownAddresses.length > 0 && !knownAddresses.includes(loc)) {
        setIsCustomAddress(true);
        setCustomAddressText(loc);
      } else {
        setIsCustomAddress(false);
        setCustomAddressText('');
      }
    } else {
      setIsCustomAddress(false);
      setCustomAddressText('');
    }

    setToastMessage(`Copied details from ${trailer.serialNumber}! Form pre-filled with Serial #${nextSerial}.`);
    setTimeout(() => setToastMessage(null), 4000);

    const formElement = document.getElementById('backlog-registration-form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const selectedModelHours = formData.model ? localTargetHours[formData.model] : null;
  const totalHours = selectedModelHours ? Object.entries(selectedModelHours).reduce((a, [p, h]) => (p !== 'shipping' && p !== 'backlog') ? a + (h as number) : a, 0) : 0;

  const handleGenerateQuote = async () => {
    if (!formData.model) {
      alert("Please select a Trailer Model first.");
      return;
    }

    let templateBase64: string | undefined = localSpecSheetTemplates[formData.model];
    
    if (templateBase64 === 'EXISTS') {
      try {
        const { data, error } = await supabase.from('production_models').select('spec_sheet_template').eq('name', formData.model).single();
        if (error) throw error;
        if (!data?.spec_sheet_template) throw new Error('No spec sheet template configured for this model.');
        templateBase64 = await fetchTemplateAsBase64(data.spec_sheet_template);
      } catch (e) {
        console.error('Failed to fetch template:', e);
        alert('Failed to download template from server.');
        return;
      }
    } else if (templateBase64 && !templateBase64.startsWith('data:')) {
      // It's a relative file path in Supabase Storage — fetch it as base64
      try {
        templateBase64 = await fetchTemplateAsBase64(templateBase64);
      } catch (e) {
        console.error('Failed to fetch template file from storage:', e);
        alert('Failed to download template from server.');
        return;
      }
    }

    if (!templateBase64) {
      alert("No Excel template is available for this model.");
      return;
    }

    const quoteId = formData.serialNumber || 'QUOTE';
    const selectedDealer = dealers.find(d => d.name === formData.name);

    try {
      const injected = await injectTrailerDataIntoSpec(
        templateBase64,
        quoteId,
        formData.name || undefined,
        formData.trailer_color || undefined,
        formData.trailer_plug || undefined,
        formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        formData.salesPerson || undefined,
        formData.dealerLocation || undefined,
        selectedDealer?.common_address || undefined,
        true, // hideOtherSheets for Quotes
        formData.dateRegistered ? new Date(formData.dateRegistered + 'T12:00:00').toLocaleDateString('en-US', {
          month: '2-digit', day: '2-digit', year: 'numeric'
        }) : undefined,
        formData.purchaseOrder || undefined,
        formData.consignment || undefined
      );

      const a = document.createElement('a');
      a.href = injected;
      a.download = `${quoteId}_Quote.xlsx`;
      a.click();

      const quoteTrailerId = crypto.randomUUID();

      // Upload quote excel file to Supabase Storage (quotes folder)
      let uploadedQuotePath: string | null = null;
      try {
        const quoteFile = dataURLtoFile(injected, `${quoteId}_Quote.xlsx`);
        uploadedQuotePath = await uploadFileToSupabase(quoteFile, 'quote', quoteId);
      } catch (uploadErr) {
        console.error('Failed to upload quote to Supabase storage:', uploadErr);
      }

      // Save to permanent quotes store (localStorage + Supabase)
      persistQuote({
        id: quoteTrailerId,
        trailer_id: quoteTrailerId,
        serial_number: quoteId,
        model: formData.model,
        dealer_name: formData.name || '---',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : null,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        sales_person: formData.salesPerson || undefined,
        dealer_location: formData.dealerLocation || undefined,
        dealer_address: selectedDealer?.common_address || undefined,
        purchase_order: formData.purchaseOrder || undefined,
        consignment: formData.consignment || undefined,
        quote_file_path: uploadedQuotePath || injected,
        status: 'quote',
        created_at: new Date().toISOString(),
        notes: formData.purchaseOrder ? `PO: ${formData.purchaseOrder}` : undefined
      });

      // Save the quote to the trailers table
      const newQuote: Trailer = {
        id: quoteTrailerId,
        name: formData.name || '---',
        model: formData.model,
        serialNumber: quoteId,
        isPriority: formData.isPriority,
        dateStarted: formData.dateRegistered ? new Date(formData.dateRegistered + 'T12:00:00').getTime() : Date.now(),
        currentPhase: 'quote',
        history: [{ phase: 'quote', enteredAt: Date.now() }],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        isArchived: false,
        isDeleted: false,
        station: 'None',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: uploadedQuotePath || injected,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: formData.dealerLocation || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined,
        purchaseOrder: formData.purchaseOrder || undefined,
        consignment: formData.consignment || undefined
      };
      onAddTrailer(newQuote);

      setFormData({
        name: '',
        model: '',
        serialNumber: '',
        station: 'B1' as StationId,
        isPriority: false,
        partsStatus: {
          tyres: false,
          steel: false,
          parts: false
        },
        promisedShippingDate: '',
        dateRegistered: new Date().toISOString().split('T')[0],
        sale_price: '',
        trailer_color: '',
        trailer_plug: '',
        salesPerson: '',
        dealerLocation: '',
        purchaseOrder: '',
        consignment: ''
      });
      setToastMessage('Quote Generated Successfully!');
      setTimeout(() => setToastMessage(null), 3000);
    } catch (error) {
      console.error("Failed to generate quote sheet", error);
      alert("Failed to generate quote sheet.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.model) return;
    if (isSubmitting) return; // Prevent double-submission
    setIsSubmitting(true);
    try {
      const serialNum = formData.serialNumber || `UNIT-${Math.floor(10000 + Math.random() * 90000)}`;

      const exists = trailers.some(t => t.serialNumber?.trim().toLowerCase() === serialNum.trim().toLowerCase() && !t.isDeleted && t.id !== approvingQuoteId);
      if (exists) {
        alert(`A trailer with serial number "${serialNum}" already exists. Serial numbers must be unique.`);
        setIsSubmitting(false);
        return;
      }

    let dealerLocationVal = formData.dealerLocation;
    if (isCustomAddress && customAddressText.trim()) {
      dealerLocationVal = customAddressText.trim();
      const selectedDealer = dealers.find(d => d.name === formData.name);
      if (selectedDealer && onUpdateDealer) {
        const currentAddresses = selectedDealer.addresses || [];
        if (!currentAddresses.includes(dealerLocationVal)) {
          const updatedAddresses = [...currentAddresses, dealerLocationVal];
          onUpdateDealer(selectedDealer.id, {
            name: selectedDealer.name,
            addresses: updatedAddresses,
            common_address: selectedDealer.common_address || ''
          });
        }
      }
    }

    let finalSpecSheetFile = undefined;
    let templateBase64: string | undefined = localSpecSheetTemplates[formData.model];
    
    if (templateBase64 === 'EXISTS') {
      try {
        const { data, error } = await supabase.from('production_models').select('spec_sheet_template').eq('name', formData.model).single();
        if (error) throw error;
        templateBase64 = await fetchTemplateAsBase64(data.spec_sheet_template);
      } catch (e) {
        console.error('Failed to fetch template:', e);
        templateBase64 = undefined;
      }
    } else if (templateBase64 && !templateBase64.startsWith('data:')) {
      // Relative file path in Supabase Storage — fetch and convert to base64
      try {
        templateBase64 = await fetchTemplateAsBase64(templateBase64);
      } catch (e) {
        console.error('Failed to fetch template file from storage:', e);
        templateBase64 = undefined;
      }
    }

    const selectedDealer = dealers.find(d => d.name === formData.name);
    
    if (templateBase64) {
      try {
        finalSpecSheetFile = await injectTrailerDataIntoSpec(
          templateBase64,
          serialNum,
          formData.name || undefined,
          formData.trailer_color || undefined,
          formData.trailer_plug || undefined,
          formData.sale_price ? parseFloat(formData.sale_price) : undefined,
          formData.salesPerson || undefined,
          dealerLocationVal || undefined,
          selectedDealer?.common_address || undefined,
          false,
          formData.dateRegistered ? new Date(formData.dateRegistered + 'T12:00:00').toLocaleDateString('en-US', {
            month: '2-digit', day: '2-digit', year: 'numeric'
          }) : undefined,
          formData.purchaseOrder || undefined,
          formData.consignment || undefined
        );
      } catch (error) {
        console.error("Failed to generate spec sheet", error);
      }
    }

    if (approvingQuoteId) {
      const originalQuote = trailers.find(t => t.id === approvingQuoteId);
      const quoteSerial = originalQuote?.serialNumber || `Q-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Create a brand-new independent production trailer for Backlog
      const newBacklogTrailer: Trailer = {
        id: crypto.randomUUID(),
        name: formData.name || '---',
        model: formData.model,
        serialNumber: serialNum,
        isPriority: formData.isPriority,
        dateStarted: formData.dateRegistered ? new Date(formData.dateRegistered + 'T12:00:00').getTime() : Date.now(),
        currentPhase: 'backlog',
        history: [
          ...(originalQuote?.history || [{ phase: 'quote', enteredAt: originalQuote?.dateStarted || Date.now() }]),
          { phase: 'backlog', enteredAt: Date.now() }
        ],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        isArchived: false,
        isDeleted: false,
        station: 'None',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: finalSpecSheetFile,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: dealerLocationVal || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined,
        purchaseOrder: formData.purchaseOrder || undefined,
        consignment: formData.consignment || undefined
      };

      onAddTrailer(newBacklogTrailer);

      // 2. Keep the original quote row in trailers table as an independent approved quote
      const cleanNotes = (originalQuote?.notes || '').replace(/\[STATUS:[^\]]+\]\s*/g, '').trim();
      const updatedNotes = `Approved into Backlog #${serialNum}${cleanNotes ? ` • ${cleanNotes}` : ''}`.trim();

      // If user typed the exact same serial for production backlog as quote serial, suffix quote serial internally
      const safeQuoteSerial = serialNum.trim().toLowerCase() === quoteSerial.trim().toLowerCase()
        ? `${quoteSerial}-Q`
        : quoteSerial;

      onUpdateTrailer(approvingQuoteId, {
        serialNumber: safeQuoteSerial,
        quoteStatus: 'approved',
        notes: updatedNotes
      });

      // 3. Permanently save the approved quote record to persistent quotes store (localStorage + Supabase quotes table)
      persistQuote({
        id: originalQuote ? `quote-${originalQuote.id}` : crypto.randomUUID(),
        trailer_id: approvingQuoteId,
        serial_number: quoteSerial,
        model: originalQuote?.model || formData.model,
        dealer_name: originalQuote?.name || formData.name || '---',
        sale_price: originalQuote?.sale_price ?? (formData.sale_price ? parseFloat(formData.sale_price) : null),
        trailer_color: originalQuote?.trailer_color || formData.trailer_color,
        trailer_plug: originalQuote?.trailer_plug || formData.trailer_plug,
        sales_person: originalQuote?.salesPerson || formData.salesPerson,
        dealer_location: originalQuote?.dealerLocation || dealerLocationVal,
        dealer_address: originalQuote?.dealerCommonAddress || selectedDealer?.common_address,
        purchase_order: originalQuote?.purchaseOrder || formData.purchaseOrder,
        consignment: originalQuote?.consignment || formData.consignment,
        quote_file_path: originalQuote?.spec_sheet_file || finalSpecSheetFile,
        status: 'approved',
        created_at: originalQuote?.dateStarted ? new Date(originalQuote.dateStarted).toISOString() : new Date().toISOString(),
        notes: updatedNotes
      });

      setApprovingQuoteId(null);
      setToastMessage('Quote Approved & Added to Backlog!');
      setTimeout(() => setToastMessage(null), 3000);
    } else {
      const newTrailer: Trailer = {
        id: crypto.randomUUID(),
        name: formData.name || '---',
        model: formData.model,
        serialNumber: serialNum,
        isPriority: formData.isPriority,
        dateStarted: formData.dateRegistered ? new Date(formData.dateRegistered + 'T12:00:00').getTime() : Date.now(),
        currentPhase: 'backlog',
        history: [{ phase: 'backlog', enteredAt: Date.now() }],
        partsStatus: formData.partsStatus,
        promisedShippingDate: formData.promisedShippingDate,
        isArchived: false,
        isDeleted: false,
        station: 'None',
        sale_price: formData.sale_price ? parseFloat(formData.sale_price) : undefined,
        spec_sheet_file: finalSpecSheetFile,
        trailer_color: formData.trailer_color || undefined,
        trailer_plug: formData.trailer_plug || undefined,
        salesPerson: formData.salesPerson || undefined,
        dealerLocation: dealerLocationVal || undefined,
        dealerCommonAddress: selectedDealer?.common_address || undefined,
        dealerId: selectedDealer?.id || undefined,
        purchaseOrder: formData.purchaseOrder || undefined,
        consignment: formData.consignment || undefined
      };
      onAddTrailer(newTrailer);
      setToastMessage('Added to Backlog Successfully!');
    }
    
      setIsCustomAddress(false);
      setCustomAddressText('');
      setFormData({ 
        name: '', 
        model: '', 
        serialNumber: '', 
        station: 'B1', 
        isPriority: false, 
        partsStatus: { tyres: false, steel: false, parts: false },
        promisedShippingDate: '',
        dateRegistered: new Date().toISOString().split('T')[0],
        sale_price: '',
        trailer_color: '',
        trailer_plug: '',
        salesPerson: '',
        dealerLocation: '',
        purchaseOrder: '',
        consignment: ''
      });
      window.scrollTo({ top: 0, behavior: 'smooth' });
      setTimeout(() => setToastMessage(null), 3000);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="backlog-page-wrapper">
      <div className="backlog-header-section" style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '2.5rem', minHeight: '52px' }}>
        <button 
          onClick={() => navigate('/')}
          className="btn btn-secondary"
          style={{
            position: 'absolute',
            left: 0,
            borderRadius: '10px',
            padding: '0.45rem 0.85rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
          title="Home"
        >
          <Home size={18} /> Home
        </button>

        <div className="backlog-title-group" style={{ textAlign: 'center' }}>
          <h1 className="backlog-page-title" style={{ margin: 0, textAlign: 'center', fontSize: '1.85rem', fontWeight: 900 }}>Backlog Manager</h1>
          <p className="backlog-page-subtitle" style={{ margin: '0.35rem 0 0', textAlign: 'center', color: 'var(--text-secondary)' }}>Management of units awaiting production slot assignment.</p>
        </div>
      </div>

      <div className="backlog-grid-layout" style={userRole !== 'manager' ? { display: 'block' } : undefined}>
        {/* Registration Section */}
        {userRole === 'manager' && (
          <div style={{ position: 'sticky', top: '2rem' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)', marginBottom: '1.5rem' }}>Registration Form</h2>
          {userRole === 'manager' ? (
            <section className="registration-card" style={{ background: 'var(--bg-card)', padding: '1.5rem', borderRadius: '16px', border: '1px solid var(--border-default)', boxShadow: 'var(--shadow-lg)' }}>
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
                  
                  {/* General Trailer Info */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>General Details</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', display: 'flex', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                            <span>Serial Number *</span>
                            {trailers.some(t => t.serialNumber === formData.serialNumber && !t.isDeleted) && (
                              <span style={{ color: '#ef4444', fontSize: '0.65rem', fontWeight: 800 }}>ALREADY EXISTS!</span>
                            )}
                          </div>
                          {nextSuggestedSerial && (
                            <button 
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, serialNumber: nextSuggestedSerial }))}
                              style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: '0.65rem', fontWeight: 800, cursor: 'pointer', padding: 0 }}
                            >
                              SUGGEST: {nextSuggestedSerial}
                            </button>
                          )}
                        </label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ 
                            padding: '0.75rem 1rem',
                            fontSize: '0.95rem', 
                            fontWeight: 700,
                            borderColor: trailers.some(t => t.serialNumber === formData.serialNumber && !t.isDeleted) ? '#fecdd3' : undefined,
                            backgroundColor: trailers.some(t => t.serialNumber === formData.serialNumber && !t.isDeleted) ? '#fff1f2' : 'var(--bg-card)' 
                          }}
                          placeholder="e.g. 10001" 
                          value={formData.serialNumber} 
                          onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })} 
                        />
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Trailer Model *</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', fontWeight: 700, background: 'var(--bg-card)' }}
                          value={formData.model} 
                          onChange={e => setFormData({...formData, model: e.target.value})} 
                          required
                        >
                          <option value="">Select Trailer Model...</option>
                          {localModelCategories.map(cat => (
                            <optgroup key={cat.name} label={cat.name}>
                              {cat.models.map(m => <option key={m} value={m}>{m}</option>)}
                            </optgroup>
                          ))}
                        </select>
                        {formData.model && !localSpecSheetTemplates[formData.model] && (
                          <div style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#ea580c', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <AlertCircle size={14} /> No Excel template available for this model.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dealer & Sales Info */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>Dealer & Sales Info</h3>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Dealer Name *</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.name} 
                          onChange={e => setFormData({...formData, name: e.target.value, dealerLocation: ''})} 
                          required
                        >
                          <option value="">Select Dealer...</option>
                          {dealers.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Shipping Address</label>
                        <select 
                          className="form-select" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={isCustomAddress ? 'CUSTOM_ADD' : formData.dealerLocation} 
                          onChange={e => {
                            if (e.target.value === 'CUSTOM_ADD') {
                              setIsCustomAddress(true);
                              setFormData({ ...formData, dealerLocation: '' });
                            } else {
                              setIsCustomAddress(false);
                              setFormData({ ...formData, dealerLocation: e.target.value });
                            }
                          }} 
                          disabled={!formData.name}
                        >
                          <option value="">Select Address...</option>
                          {(() => {
                            const d = dealers.find(dl => dl.name === formData.name);
                            if (!d) return null;
                            const list = [];
                            if (d.common_address) list.push(d.common_address);
                            if (d.addresses) list.push(...d.addresses);
                            const options = Array.from(new Set(list)).map(addr => (
                              <option key={addr} value={addr}>{addr}</option>
                            ));
                            return [
                              ...options,
                              <option key="custom-add" value="CUSTOM_ADD" style={{ color: '#2563eb', fontWeight: 800 }}>+ Add Custom Address...</option>
                            ];
                          })()}
                        </select>
                        {isCustomAddress && (
                          <input 
                            type="text"
                            className="form-input"
                            style={{ marginTop: '0.5rem', padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)', borderColor: 'var(--accent)' }}
                            placeholder="Enter custom shipping address..."
                            value={customAddressText}
                            onChange={e => setCustomAddressText(e.target.value)}
                            required
                          />
                        )}
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Sales Person</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          placeholder="e.g. John Doe"
                          value={formData.salesPerson} 
                          onChange={e => setFormData({...formData, salesPerson: e.target.value})} 
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Purchase Order (PO)</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          placeholder="e.g. PO-12345"
                          value={formData.purchaseOrder} 
                          onChange={e => setFormData({...formData, purchaseOrder: e.target.value})} 
                        />
                      </div>

                      <div className="form-group" style={{ marginBottom: 0, gridColumn: 'span 2' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>Consignment</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          placeholder="e.g. Consignment Info"
                          value={formData.consignment} 
                          onChange={e => setFormData({...formData, consignment: e.target.value})} 
                        />
                      </div>
                    </div>
                  </div>

                  {/* Specifications & Pricing */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '1rem', letterSpacing: '0.05em' }}>Specifications & Pricing</h3>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
                      <div className="form-group" style={{ marginBottom: 0, flex: '1 1 calc(50% - 0.5rem)', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>🎨 Trailer Color</label>
                        <input 
                          type="text" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          placeholder="e.g. White, Red" 
                          value={formData.trailer_color} 
                          onChange={e => setFormData({...formData, trailer_color: e.target.value})} 
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: '1 1 calc(50% - 0.5rem)', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem' }}>🔌 Trailer Plug</label>
                        <select 
                          className="form-select"
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)' }}
                          value={formData.trailer_plug}
                          onChange={e => setFormData({...formData, trailer_plug: e.target.value})}
                        >
                          <option value="">Select Plug...</option>
                          <option value="7 RV Molded Plug">7 RV Molded Plug</option>
                          <option value="7 Pole Semi Plug">7 Pole Semi Plug</option>
                          <option value="6 Pole Molded Plug">6 Pole Molded Plug</option>
                          <option value="4 Way Flat">4 Way Flat</option>
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0, flex: '1 1 calc(50% - 0.5rem)', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Date Registered</label>
                        <input 
                          type="date" 
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)', cursor: 'pointer' }}
                          value={formData.dateRegistered} 
                          onChange={e => setFormData({...formData, dateRegistered: e.target.value})} 
                          onFocus={(e) => e.target.showPicker()}
                          required
                        />
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, flex: '1 1 calc(50% - 0.5rem)', minWidth: '150px' }}>
                        <label className="form-label" style={{ fontSize: '0.75rem', color: 'var(--accent)' }}>Promised Shipping</label>
                        <input 
                          type="date" 
                          min={new Date().toISOString().split('T')[0]}
                          className="form-input" 
                          style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', background: 'var(--bg-card)', cursor: 'pointer' }}
                          value={formData.promisedShippingDate} 
                          onChange={e => setFormData({...formData, promisedShippingDate: e.target.value})} 
                          onFocus={(e) => e.target.showPicker()}
                        />
                      </div>

                      {userRole === 'manager' && (
                        <div className="form-group" style={{ marginBottom: 0, flex: '1 1 100%' }}>
                          <label className="form-label" style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 800 }}>Sale Price ($)</label>
                          <input 
                            key={isPriceUnlockedGlobally ? 'unlocked-backlog' : 'locked-backlog'}
                            type={isPriceUnlockedGlobally ? "number" : "password"} 
                            className="form-input" 
                            style={{ padding: '0.75rem 1rem', fontSize: '0.95rem', borderColor: 'rgba(217, 119, 6, 0.3)', background: 'rgba(217, 119, 6, 0.05)', color: '#d97706', fontWeight: 800 }}
                            placeholder={isPriceUnlockedGlobally ? "0.00" : "••••••"}
                            value={formData.sale_price} 
                            onChange={e => setFormData({...formData, sale_price: e.target.value.replace(/[^0-9.]/g, '')})} 
                            onFocus={() => {
                              if (!isPriceUnlockedGlobally && onUnlockPrices) {
                                onUnlockPrices();
                              }
                            }}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Readiness & Priority */}
                  <div style={{ padding: '1.25rem', background: 'var(--bg-secondary)', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                      <h3 style={{ fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0 }}>Parts Readiness</h3>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: formData.isPriority ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-card)', padding: '0.4rem 0.8rem', borderRadius: '8px', border: `1px solid ${formData.isPriority ? '#ef4444' : 'var(--border-default)'}` }}>
                        <input 
                          type="checkbox" 
                          id="priority-check"
                          checked={formData.isPriority} 
                          onChange={e => setFormData({...formData, isPriority: e.target.checked})}
                          style={{ width: '16px', height: '16px', accentColor: '#ef4444' }}
                        />
                        <label htmlFor="priority-check" style={{ fontSize: '0.75rem', fontWeight: 800, color: formData.isPriority ? '#ef4444' : 'var(--text-secondary)', cursor: 'pointer' }}>HIGH PRIORITY</label>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                      {Object.entries(formData.partsStatus).map(([key, val]) => (
                        <label key={key} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', padding: '1rem 0.5rem', background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-card)', borderRadius: '10px', border: `2px solid ${val ? 'var(--accent)' : 'var(--border-default)'}`, transition: 'all 0.2s', boxShadow: val ? '0 4px 12px rgba(34, 197, 94, 0.15)' : 'none' }}>
                          <input type="checkbox" checked={val} onChange={e => setFormData({...formData, partsStatus: {...formData.partsStatus, [key]: e.target.checked}})} style={{ width: '18px', height: '18px', accentColor: 'var(--accent)' }} />
                          <span style={{ fontSize: '0.7rem', fontWeight: 800, textTransform: 'uppercase', color: val ? 'var(--accent)' : 'var(--text-muted)' }}>{key}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <button 
                    type="button" 
                    className="btn btn-secondary" 
                    onClick={handleGenerateQuote}
                    style={{ 
                      height: '3.5rem', 
                      fontSize: '1rem', 
                      borderRadius: '12px', 
                      border: '2px solid var(--accent)',
                      color: 'var(--accent)',
                      background: 'transparent',
                      fontWeight: 700
                    }}
                  >
                    Get Quote
                  </button>
                  <button 
                    type="button" 
                    onClick={handleSubmit}
                    className="btn btn-primary" 
                    style={{ 
                      height: '3.5rem', 
                      fontSize: '1rem', 
                      borderRadius: '12px', 
                      position: 'relative',
                      opacity: trailers.some(t => t.serialNumber === formData.serialNumber && !t.isDeleted) ? 0.6 : 1
                    }}
                    disabled={isSubmitting || trailers.some(t => t.serialNumber === formData.serialNumber && !t.isDeleted && t.id !== approvingQuoteId)}
                  >
                    Confirm Registration <ArrowRight size={18} />
                    <div className="reco-badge-tag" style={{ 
                      position: 'absolute', 
                      top: '-12px', 
                      right: '12px', 
                      background: 'var(--bg-main)', 
                      color: 'var(--text-primary)', 
                      padding: '4px 10px', 
                      borderRadius: '8px', 
                      fontSize: '0.65rem', 
                      fontWeight: 900,
                      border: '1.5px solid var(--accent)',
                      boxShadow: 'var(--shadow-md)'
                    }}>
                      RECOMMENDED: BAY {suggestedBay}
                    </div>
                  </button>
                </div>
              </form>

              {formData.model && (
                <div style={{ marginTop: '2rem', paddingTop: '2rem', borderTop: '2px dashed var(--border-default)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1rem' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Estimated Build Time</span>
                    <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--text-primary)' }}>{totalHours}h</span>
                  </div>
                  {Object.entries(selectedModelHours || {}).filter(([p]) => p !== 'shipping' && p !== 'backlog').map(([phase, hours]) => (
                    <div key={phase} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border-default)' }}>
                      <span style={{ fontSize: '0.8125rem', textTransform: 'capitalize', color: 'var(--text-secondary)', fontWeight: 600 }}>{phase}</span>
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--text-primary)' }}>{hours}h</span>
                    </div>
                  ))}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginTop: '1rem' }}>
                    {selectedModelHours && Object.values(selectedModelHours).map((h, i) => (
                      <div key={i} style={{ height: '4px', background: h > 0 ? '#3b82f6' : '#e2e8f0', borderRadius: '2px' }} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          ) : (
            <div style={{ padding: '2rem', background: 'var(--bg-card)', borderRadius: '16px', border: '2px dashed var(--border-default)', textAlign: 'center' }}>
              <div style={{ padding: '1.25rem', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', marginBottom: '1.25rem', width: 'fit-content', margin: '0 auto 1.25rem' }}>
                <Home size={32} color="var(--accent)" />
              </div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: 'var(--text-primary)', marginBottom: '0.5rem' }}>Read-Only Access</h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>You are logged in as a <strong>Worker</strong>. Unit registration and management is restricted to Managers.</p>
            </div>
          )}
        </div>
        )}

        {/* List Section */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', gap: '1rem' }}>
             <h2 style={{ fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-muted)' }}>Existing Backlog ({backlogTrailers.length})</h2>
             {userRole === 'manager' && (
               <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                 <input 
                   type="text" 
                   placeholder="Filter backlog..." 
                   style={{ padding: '0.5rem 1rem', borderRadius: '8px', border: '1px solid var(--border-default)', background: 'var(--bg-card)', color: 'var(--text-primary)', width: '240px', fontSize: '0.875rem' }}
                   value={searchQuery}
                   onChange={e => setSearchQuery(e.target.value)}
                 />
               </div>
             )}
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {backlogTrailers.length > 0 ? (() => {
                  let cumulativeBacklogHours = 0;
                  const displayedBacklog = backlogTrailers.slice(0, visibleBacklogCount);
                  
                  return (
                    <>
                      {displayedBacklog.map(t => {
                        const modelHours = localTargetHours[t.model] || {};
                        // Correct build hours calculation (excluding backlog/shipping)
                        const actualBuildHours = PHASES.filter(p => p.id !== 'backlog' && p.id !== 'shipping').reduce((sum, p) => {
                          return sum + (modelHours[p.id] || PHASE_METADATA[p.id]?.defaultTargetHours || 0);
                        }, 0);
                        
                        // Estimate = (Active Floor Delay) + (Hours of units ahead in backlog / 4 bays)
                        const safeFloorDelay = Number.isFinite(activeFloorDelayHours) ? activeFloorDelayHours : 0;
                        const safeCumulative = Number.isFinite(cumulativeBacklogHours) ? cumulativeBacklogHours : 0;
                        const estimateHours = safeFloorDelay + (safeCumulative / (BAYS_COUNT || 4));
                        const estimatedDate = Number.isFinite(estimateHours) ? addHours(new Date(), estimateHours) : null;
                        
                        // Add current unit's hours for the NEXT unit's calculation
                        cumulativeBacklogHours += actualBuildHours;

                        return (
                          <div key={t.id} className="backlog-item-card">
                            <div>
                              <div style={{ fontWeight: 800, fontSize: '0.95rem', color: 'var(--text-primary)' }}>{t.model}</div>
                              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                                {t.serialNumber} • {t.name}
                                <span className="reco-badge-tag" style={{ marginLeft: '0.2rem' }}>RECO: {suggestedBay}</span>
                                {userRole === 'manager' && t.sale_price !== undefined && (
                                  <span 
                                    onClick={(e) => {
                                      if (!isPriceUnlockedGlobally && onUnlockPrices) {
                                        e.stopPropagation();
                                        onUnlockPrices();
                                      }
                                    }}
                                    style={{ 
                                      color: '#10b981', 
                                      fontWeight: 900, 
                                      background: 'rgba(16, 185, 129, 0.1)', 
                                      padding: '1px 5px', 
                                      borderRadius: '4px', 
                                      fontSize: '0.75rem',
                                      cursor: isPriceUnlockedGlobally ? 'default' : 'pointer'
                                    }}
                                  >
                                    {isPriceUnlockedGlobally ? (t.sale_price != null ? `$${t.sale_price.toLocaleString()}` : 'NOT SET') : '••••••'}
                                  </span>
                                )}
                              </div>
                            </div>

                            <div style={{ display: 'flex', gap: '0.3rem' }}>
                              {t.partsStatus && Object.entries(t.partsStatus).map(([key, val]) => (
                                <div 
                                  key={key} 
                                  onClick={() => handleTogglePart(t, key as any)}
                                  style={{ 
                                    padding: '0.25rem 0.75rem', 
                                    borderRadius: '99px', 
                                    background: val ? 'rgba(34, 197, 94, 0.1)' : 'var(--priority-bg)', 
                                    color: val ? '#22c55e' : '#ef4444', 
                                    fontSize: '0.65rem', 
                                    fontWeight: 800, 
                                    textTransform: 'uppercase', 
                                    letterSpacing: '0.05em',
                                    border: `1px solid ${val ? 'rgba(34, 197, 94, 0.2)' : 'var(--priority-border)'}`,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    userSelect: 'none',
                                    minWidth: '60px',
                                    textAlign: 'center'
                                  }}
                                >
                                  {key}
                                </div>
                              ))}
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--text-secondary)' }}>
                              <Clock size={14} />
                              <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>{actualBuildHours}h Build</span>
                            </div>

                            {confirmingDeleteId === t.id ? (
                              <div style={{ gridColumn: '4 / 6', display: 'flex', gap: '0.5rem', background: '#fee2e2', padding: '0.5rem', borderRadius: '8px', border: '1px solid #ef4444' }}>
                                <button 
                                  onClick={() => {
                                    onUpdateTrailer(t.id, { isArchived: true, archivedAt: Date.now(), isDeleted: true });
                                    setConfirmingDeleteId(null);
                                  }}
                                  style={{ flex: 1, padding: '0.4rem', background: '#ef4444', color: 'white', border: 'none', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  CONFIRM
                                </button>
                                <button 
                                  onClick={() => setConfirmingDeleteId(null)}
                                  style={{ flex: 1, padding: '0.4rem', background: 'transparent', color: '#ef4444', border: '1px solid #ef4444', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                  CANCEL
                                </button>
                              </div>
                            ) : (
                              <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', padding: '0.5rem', background: 'var(--bg-secondary)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: 'var(--accent)' }}>
                                    <Calendar size={12} />
                                    <span style={{ fontSize: '0.65rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Est. Start Date</span>
                                  </div>
                                  <div style={{ fontSize: '0.85rem', fontWeight: 800, color: 'var(--text-primary)' }}>
                                    {estimatedDate && !isNaN(estimatedDate.getTime()) ? format(estimatedDate, 'MMM d, h:mm a') : '—'}
                                  </div>
                                </div>

                                 <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', justifySelf: 'end' }}>
                                   {userRole === 'manager' && (
                                     <button 
                                       type="button"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         handleUseDetails(t);
                                       }}
                                       title="Copy model & configuration details to registration form with next incremented serial number"
                                       style={{ 
                                         padding: '0.55rem 0.9rem', 
                                         borderRadius: '10px', 
                                         border: '1px solid rgba(37, 99, 235, 0.35)', 
                                         background: 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(59, 130, 246, 0.18) 100%)', 
                                         color: '#2563eb', 
                                         fontSize: '0.78rem', 
                                         fontWeight: 800, 
                                         cursor: 'pointer',
                                         display: 'flex',
                                         alignItems: 'center',
                                         gap: '0.45rem',
                                         transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                         whiteSpace: 'nowrap',
                                         boxShadow: '0 2px 6px rgba(37, 99, 235, 0.12)'
                                       }}
                                       onMouseOver={(e) => { 
                                         e.currentTarget.style.background = 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)'; 
                                         e.currentTarget.style.color = '#ffffff';
                                         e.currentTarget.style.borderColor = '#2563eb';
                                         e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.35)';
                                       }}
                                       onMouseOut={(e) => { 
                                         e.currentTarget.style.background = 'linear-gradient(135deg, rgba(37, 99, 235, 0.1) 0%, rgba(59, 130, 246, 0.18) 100%)'; 
                                         e.currentTarget.style.color = '#2563eb';
                                         e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.35)';
                                         e.currentTarget.style.boxShadow = '0 2px 6px rgba(37, 99, 235, 0.12)';
                                       }}
                                     >
                                       <Copy size={14} /> Use Details
                                     </button>
                                   )}

                                   {userRole === 'manager' && (
                                     <button 
                                       type="button"
                                       onClick={(e) => {
                                         e.stopPropagation();
                                         setConfirmingDeleteId(t.id);
                                       }}
                                       style={{ 
                                         width: '36px', 
                                         height: '36px', 
                                         borderRadius: '10px', 
                                         border: '1px solid #fee2e2', 
                                         background: 'var(--bg-card)', 
                                         color: '#ef4444', 
                                         display: 'flex', 
                                         alignItems: 'center', 
                                         justifyContent: 'center',
                                         cursor: 'pointer',
                                         transition: 'all 0.2s ease',
                                         flexShrink: 0
                                       }}
                                       onMouseOver={(e) => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.borderColor = '#fca5a5'; }}
                                       onMouseOut={(e) => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.borderColor = '#fee2e2'; }}
                                     >
                                       <Trash2 size={16} />
                                     </button>
                                   )}
                                 </div>
                               </>
                             )}
                          </div>
                        );
                      })}
                      
                      {backlogTrailers.length > visibleBacklogCount && (
                        <button 
                          onClick={() => setVisibleBacklogCount(prev => prev + 8)}
                          style={{
                            padding: '0.8rem',
                            background: 'var(--bg-card)',
                            border: '1px solid var(--border-default)',
                            borderRadius: '12px',
                            color: 'var(--text-primary)',
                            fontWeight: 700,
                            cursor: 'pointer',
                            marginTop: '0.5rem',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseOver={(e) => e.currentTarget.style.background = 'var(--bg-secondary)'}
                          onMouseOut={(e) => e.currentTarget.style.background = 'var(--bg-card)'}
                        >
                          Load More ({backlogTrailers.length - visibleBacklogCount} remaining)
                        </button>
                      )}
                    </>
                  );
                })() : (
                  <div style={{ padding: '4rem', textAlign: 'center', background: 'var(--bg-card)', borderRadius: '12px', border: '2px dashed var(--border-default)', color: 'var(--text-muted)' }}>
                    No units found in backlog matching your filters.
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Quotes Section (Pending & Auto Denied) */}
          {userRole === 'manager' && (
            <div style={{ marginTop: '2.5rem' }}>
              {/* Tabs Switcher */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem', flexWrap: 'wrap', gap: '0.75rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', background: 'var(--bg-card)', padding: '4px', borderRadius: '12px', border: '1px solid var(--border-default)' }}>
                  <button
                    type="button"
                    onClick={() => setSelectedQuoteTab('pending')}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: selectedQuoteTab === 'pending' ? 'var(--accent)' : 'transparent',
                      color: selectedQuoteTab === 'pending' ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Pending Quotes
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      background: selectedQuoteTab === 'pending' ? 'rgba(255,255,255,0.25)' : 'var(--bg-secondary)',
                      color: selectedQuoteTab === 'pending' ? '#fff' : 'var(--text-muted)',
                      fontWeight: 700
                    }}>
                      {pendingQuoteTrailers.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedQuoteTab('auto_denied')}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: selectedQuoteTab === 'auto_denied' ? '#ef4444' : 'transparent',
                      color: selectedQuoteTab === 'auto_denied' ? '#fff' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Auto Denied Quotes
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      background: selectedQuoteTab === 'auto_denied' ? 'rgba(255,255,255,0.25)' : '#fee2e2',
                      color: selectedQuoteTab === 'auto_denied' ? '#fff' : '#b91c1c',
                      fontWeight: 700
                    }}>
                      {autoDeniedQuoteTrailers.length}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSelectedQuoteTab('all')}
                    style={{
                      padding: '0.45rem 1rem',
                      borderRadius: '8px',
                      border: 'none',
                      fontSize: '0.85rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      background: selectedQuoteTab === 'all' ? 'var(--bg-secondary)' : 'transparent',
                      color: selectedQuoteTab === 'all' ? 'var(--text-primary)' : 'var(--text-secondary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    Show Both
                    <span style={{
                      fontSize: '0.75rem',
                      padding: '2px 7px',
                      borderRadius: '10px',
                      background: 'var(--bg-secondary)',
                      color: 'var(--text-muted)',
                      fontWeight: 700
                    }}>
                      {allQuoteTrailers.length}
                    </span>
                  </button>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Clock size={14} />
                  <span>Quotes older than 7 days automatically move to Auto Denied</span>
                </div>
              </div>

              {/* Helper renderer for quote row */}
              {(() => {
                const renderQuoteRow = (quote: Trailer, isAutoDenied: boolean) => {
                  const createdAt = quote.dateStarted || quote.history?.[0]?.enteredAt || 0;
                  const ageDays = createdAt ? Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24)) : 0;

                  return (
                    <div key={quote.id} style={{ padding: '1.25rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background-color 0.2s', background: 'var(--bg-card)', borderBottom: '1px solid var(--border-default)' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px', flexWrap: 'wrap' }}>
                          <span style={{ fontWeight: 800, fontSize: '1.1rem', color: 'var(--text-primary)' }}>{quote.serialNumber}</span>
                          <span style={{ fontSize: '0.8rem', background: '#fef3c7', color: '#b45309', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>{quote.model}</span>
                          {isAutoDenied ? (
                            <span style={{ fontSize: '0.72rem', background: '#fee2e2', color: '#dc2626', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #fecaca' }}>
                              <Clock size={12} /> Auto-Denied ({ageDays}d old)
                            </span>
                          ) : (
                            <span style={{ fontSize: '0.72rem', background: '#eff6ff', color: '#2563eb', padding: '2px 8px', borderRadius: '6px', fontWeight: 800, display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid #bfdbfe' }}>
                              <Clock size={12} /> Pending ({Math.max(0, 7 - ageDays)}d left)
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600, flexWrap: 'wrap' }}>
                          <span>Sales Rep: {quote.salesPerson || 'N/A'}</span>
                          <span>Dealer: {quote.name !== '---' ? quote.name : 'N/A'}</span>
                          {quote.sale_price && <span style={{ color: '#059669' }}>Price: ${quote.sale_price.toLocaleString()}</span>}
                          {createdAt > 0 && <span>Created: {format(new Date(createdAt), 'MMM d, yyyy')}</span>}
                        </div>
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                        <button 
                          onClick={() => {
                            setFormData({
                              name: quote.name !== '---' ? quote.name : '',
                              model: quote.model,
                              serialNumber: nextSuggestedSerial || '',
                              station: 'B1',
                              isPriority: quote.isPriority || false,
                              partsStatus: quote.partsStatus || { tyres: false, steel: false, parts: false },
                              promisedShippingDate: quote.promisedShippingDate || '',
                              dateRegistered: new Date().toISOString().split('T')[0],
                              sale_price: quote.sale_price ? quote.sale_price.toString() : '',
                              trailer_color: quote.trailer_color || '',
                              trailer_plug: quote.trailer_plug || '',
                              salesPerson: quote.salesPerson || '',
                              dealerLocation: quote.dealerLocation || '',
                              purchaseOrder: quote.purchaseOrder || '',
                              consignment: quote.consignment || ''
                            });
                            setApprovingQuoteId(quote.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          title={isAutoDenied ? "Approve this quote and add to backlog" : "Approve quote and add to backlog"}
                          style={{
                            padding: '0.6rem 1.25rem',
                            borderRadius: '8px',
                            background: '#10b981',
                            color: 'white',
                            border: 'none',
                            fontWeight: 700,
                            cursor: 'pointer',
                            fontSize: '0.9rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'background-color 0.2s'
                          }}
                        >
                          <CheckCircle size={16} /> Approve
                        </button>
                        
                        {userRole === 'manager' && onDeleteTrailer && (
                          <button 
                            onClick={() => {
                              if (isAutoDenied) {
                                if (window.confirm(`Permanently delete quote ${quote.serialNumber}? This cannot be undone.`)) {
                                  onDeleteTrailer(quote.id);
                                  try {
                                    supabase.from('quotes').update({ status: 'denied' }).eq('serial_number', quote.serialNumber).then();
                                  } catch (e) {}
                                  setToastMessage('Quote Deleted');
                                  setTimeout(() => setToastMessage(null), 3000);
                                }
                              } else {
                                if (window.confirm(`Deny quote ${quote.serialNumber}? It will be moved to Auto Denied Quotes.`)) {
                                  onUpdateTrailer(quote.id, { quoteStatus: 'denied' });
                                  persistQuote({
                                    id: `quote-${quote.id}`,
                                    trailer_id: quote.id,
                                    serial_number: quote.serialNumber,
                                    model: quote.model,
                                    dealer_name: quote.name,
                                    sale_price: quote.sale_price ?? null,
                                    trailer_color: quote.trailer_color,
                                    trailer_plug: quote.trailer_plug,
                                    sales_person: quote.salesPerson,
                                    dealer_location: quote.dealerLocation,
                                    dealer_address: quote.dealerCommonAddress,
                                    purchase_order: quote.purchaseOrder,
                                    consignment: quote.consignment,
                                    quote_file_path: quote.spec_sheet_file,
                                    status: 'denied',
                                    created_at: quote.dateStarted ? new Date(quote.dateStarted).toISOString() : new Date().toISOString(),
                                    notes: quote.notes
                                  });
                                  setToastMessage('Quote Denied & Moved');
                                  setTimeout(() => setToastMessage(null), 3000);
                                }
                              }
                            }}
                            style={{
                              padding: '0.6rem 1.25rem',
                              borderRadius: '8px',
                              background: '#fff',
                              color: '#ef4444',
                              border: '1px solid #fee2e2',
                              fontWeight: 700,
                              cursor: 'pointer',
                              fontSize: '0.9rem',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '6px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <Trash2 size={16} /> {isAutoDenied ? 'Delete' : 'Deny'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* Pending Quotes Section */}
                    {(selectedQuoteTab === 'pending' || selectedQuoteTab === 'all') && (
                      <div style={{ marginBottom: selectedQuoteTab === 'all' ? '2.5rem' : 0 }}>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Pending Quotes
                          <span style={{ fontSize: '0.8rem', background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '12px', color: 'var(--text-muted)' }}>
                            {pendingQuoteTrailers.length}
                          </span>
                        </h2>
                        
                        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                          {pendingQuoteTrailers.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                              {pendingQuoteTrailers.map(q => renderQuoteRow(q, false))}
                            </div>
                          ) : (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              No pending quotes within the last 7 days.
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Auto Denied Quotes Section (Placed below Pending Quotes) */}
                    {(selectedQuoteTab === 'auto_denied' || selectedQuoteTab === 'all') && (
                      <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: 'var(--text-primary)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Auto Denied Quotes (7+ Days)
                          <span style={{ fontSize: '0.8rem', background: '#fee2e2', color: '#b91c1c', padding: '2px 8px', borderRadius: '12px', fontWeight: 700 }}>
                            {autoDeniedQuoteTrailers.length}
                          </span>
                        </h2>
                        
                        <div style={{ background: 'var(--bg-card)', borderRadius: '16px', border: '1px solid var(--border-default)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
                          {autoDeniedQuoteTrailers.length > 0 ? (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr' }}>
                              {autoDeniedQuoteTrailers.map(q => renderQuoteRow(q, true))}
                            </div>
                          ) : (
                            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                              No auto-denied quotes found.
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}
          
          {toastMessage && (
            <div style={{
              position: 'fixed',
              bottom: '24px',
              right: '24px',
              background: '#10b981',
              color: 'white',
              padding: '16px 24px',
              borderRadius: '8px',
              boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              zIndex: 9999,
              fontWeight: 600,
              animation: 'slideUp 0.3s ease-out'
            }}>
              <CheckCircle size={20} />
              {toastMessage}
            </div>
          )}
        </div>
      );
    };
