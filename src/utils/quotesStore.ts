import type { QuoteRecord, Trailer, LadOptions } from '../types';
import { supabase } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'lanetrailers_persistent_quotes';
export const QUOTES_UPDATED_EVENT = 'lanetrailers_quotes_updated';

export const hasLadKeys = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false;
  return Object.values(obj).some(v => v !== '' && v !== null && v !== undefined && v !== false);
};

export const extractLadFromNotes = (notes?: string | null): LadOptions | null => {
  if (!notes) return null;
  const match = notes.match(/\[LAD:([^\]]+)\]/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (hasLadKeys(parsed)) return parsed;
    } catch (_) {}
  }
  return null;
};

/**
 * Read quotes saved in localStorage safely
 */
export function getStoredLocalQuotes(): QuoteRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to parse local quotes:', err);
    return [];
  }
}

/**
 * Upsert a quote into localStorage and notify all active listeners
 */
export function saveStoredLocalQuote(quote: QuoteRecord, emitEvent = true): void {
  try {
    const current = getStoredLocalQuotes();
    const existingIndex = current.findIndex(q => 
      (quote.id && q.id === quote.id) || 
      (quote.serial_number && q.serial_number?.trim().toLowerCase() === quote.serial_number.trim().toLowerCase())
    );

    let lad = quote.lad_options || quote.ladOptions || extractLadFromNotes(quote.notes);
    if (typeof lad === 'string') {
      try { lad = JSON.parse(lad); } catch (_) {}
    }

    const mergedQuote: QuoteRecord = {
      ...(existingIndex >= 0 ? current[existingIndex] : {}),
      ...quote,
      ...(hasLadKeys(lad) ? { lad_options: lad, ladOptions: lad } : {})
    };

    if (existingIndex >= 0) {
      current[existingIndex] = mergedQuote;
    } else {
      current.unshift(mergedQuote);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    if (emitEvent) {
      window.dispatchEvent(new CustomEvent(QUOTES_UPDATED_EVENT, { detail: mergedQuote }));
    }
  } catch (err) {
    console.warn('Failed to save quote locally:', err);
  }
}

/**
 * Persist a quote to both localStorage and Supabase (with notes encoding fallback)
 */
export async function persistQuote(quote: QuoteRecord): Promise<void> {
  let lad = quote.lad_options || quote.ladOptions || extractLadFromNotes(quote.notes);
  if (typeof lad === 'string') {
    try { lad = JSON.parse(lad); } catch (_) {}
  }

  let updatedNotes = quote.notes || null;
  if (hasLadKeys(lad)) {
    const cleanNotes = (updatedNotes || '').replace(/\[LAD:[^\]]+\]\s*/g, '').trim();
    updatedNotes = `${cleanNotes ? `${cleanNotes} ` : ''}[LAD:${JSON.stringify(lad)}]`.trim();
  }

  const enrichedQuote: QuoteRecord = {
    ...quote,
    notes: updatedNotes,
    lad_options: hasLadKeys(lad) ? lad : undefined,
    ladOptions: hasLadKeys(lad) ? lad : undefined
  };

  const isUUID = (str?: string | null): boolean =>
    !!str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

  const safeQuoteId = isUUID(enrichedQuote.id) ? enrichedQuote.id : crypto.randomUUID();

  // 1. Immediately save to local persistent storage
  saveStoredLocalQuote({ ...enrichedQuote, id: safeQuoteId }, true);

  // 2. Try to save to Supabase quotes table
  try {
    const cleanFilePath = (enrichedQuote.quote_file_path && !enrichedQuote.quote_file_path.startsWith('data:'))
      ? enrichedQuote.quote_file_path
      : null;

    const payload: any = {
      id: safeQuoteId,
      trailer_id: enrichedQuote.trailer_id || null,
      serial_number: enrichedQuote.serial_number,
      model: enrichedQuote.model || null,
      dealer_name: enrichedQuote.dealer_name || null,
      sale_price: enrichedQuote.sale_price,
      trailer_color: enrichedQuote.trailer_color || null,
      trailer_plug: enrichedQuote.trailer_plug || null,
      sales_person: enrichedQuote.sales_person || null,
      dealer_location: enrichedQuote.dealer_location || null,
      dealer_address: enrichedQuote.dealer_address || null,
      purchase_order: enrichedQuote.purchase_order || null,
      consignment: enrichedQuote.consignment || null,
      quote_file_path: cleanFilePath,
      status: enrichedQuote.status || 'quote',
      created_at: enrichedQuote.created_at || new Date().toISOString(),
      notes: updatedNotes,
      lad_options: hasLadKeys(lad) ? lad : null
    };

    let { error } = await supabase.from('quotes').upsert(payload);

    if (error && (String(error.message || '').includes('lad_options') || String(error.message || '').includes('column') || error.code === '42703')) {
      delete payload.lad_options;
      const res = await supabase.from('quotes').upsert(payload);
      error = res.error;
    }

    if (error) {
      console.warn('Could not upsert quote to Supabase quotes table:', error.message);
    }
  } catch (err) {
    console.warn('Supabase quotes table upsert exception:', err);
  }
}

/**
 * Loads all persistent quotes:
 * 1. From public.quotes table
 * 2. From localStorage cache
 * 3. Fallback: trailers board state
 */
export async function fetchAllPersistentQuotes(trailers: Trailer[] = []): Promise<QuoteRecord[]> {
  const map = new Map<string, QuoteRecord>();

  // 1. Load from Supabase quotes table (primary source of truth)
  let dbSuccess = false;
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && Array.isArray(data)) {
      dbSuccess = true;
      data.forEach((q: any) => {
        let lad = q.lad_options || q.ladOptions || extractLadFromNotes(q.notes);
        if (typeof lad === 'string') {
          try { lad = JSON.parse(lad); } catch (_) {}
        }
        const record: QuoteRecord = {
          id: q.id,
          trailer_id: q.trailer_id,
          serial_number: q.serial_number,
          model: q.model,
          dealer_name: q.dealer_name,
          sale_price: q.sale_price != null ? Number(q.sale_price) : null,
          trailer_color: q.trailer_color,
          trailer_plug: q.trailer_plug,
          sales_person: q.sales_person,
          dealer_location: q.dealer_location,
          dealer_address: q.dealer_address,
          purchase_order: q.purchase_order,
          consignment: q.consignment,
          quote_file_path: q.quote_file_path,
          status: q.status,
          created_at: q.created_at,
          notes: q.notes,
          lad_options: hasLadKeys(lad) ? lad : undefined,
          ladOptions: hasLadKeys(lad) ? lad : undefined
        };
        const key = record.serial_number ? record.serial_number.trim().toLowerCase() : record.id;
        if (key) map.set(key, record);
      });

      // Also merge any cached lad_options from localStorage if DB record was missing them
      const localQuotes = getStoredLocalQuotes();
      localQuotes.forEach(lq => {
        const k = lq.serial_number ? lq.serial_number.trim().toLowerCase() : lq.id;
        if (k) {
          const dbRec = map.get(k);
          if (dbRec) {
            let lqLad = lq.lad_options || lq.ladOptions || extractLadFromNotes(lq.notes);
            if (typeof lqLad === 'string') { try { lqLad = JSON.parse(lqLad); } catch (_) {} }
            if (!hasLadKeys(dbRec.lad_options) && hasLadKeys(lqLad)) {
              dbRec.lad_options = lqLad;
              dbRec.ladOptions = lqLad;
            }
          }
        }
      });

      // Synchronize clean database records into local storage cache
      try {
        localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(Array.from(map.values())));
      } catch (_) {}
    }
  } catch (err) {
    // DB query failed or table not available
  }

  // 2. If DB was unreachable, fallback to localStorage cache
  if (!dbSuccess) {
    const localQuotes = getStoredLocalQuotes();
    localQuotes.forEach(q => {
      let lad = q.lad_options || q.ladOptions || extractLadFromNotes(q.notes);
      if (typeof lad === 'string') { try { lad = JSON.parse(lad); } catch (_) {} }
      const key = q.serial_number ? q.serial_number.trim().toLowerCase() : q.id;
      if (key && !map.has(key)) {
        map.set(key, { ...q, lad_options: hasLadKeys(lad) ? lad : undefined, ladOptions: hasLadKeys(lad) ? lad : undefined });
      }
    });
  }

  // 3. Fallback: Merge trailer records from state
  if (trailers && trailers.length > 0) {
    trailers
      .filter(t => !t.isDeleted)
      .forEach(t => {
        const displaySerial = t.serialNumber?.replace(/-Q$/i, '') || t.serialNumber;
        const s = displaySerial?.trim().toLowerCase();
        if (s) {
          let lad = t.lad_options || t.ladOptions || extractLadFromNotes(t.notes);
          if (typeof lad === 'string') { try { lad = JSON.parse(lad); } catch (_) {} }
          const existing = map.get(s);
          if (existing) {
            if (!hasLadKeys(existing.lad_options) && hasLadKeys(lad)) {
              existing.lad_options = lad;
              existing.ladOptions = lad;
            }
          } else if (t.currentPhase === 'quote') {
            const isApproved = t.quoteStatus === 'approved' || (t.notes && (t.notes.includes('[STATUS:approved]') || t.notes.includes('Approved into Backlog')));
            const isDenied = t.quoteStatus === 'denied' || (t.notes && (t.notes.includes('[STATUS:denied]') || t.notes.includes('[STATUS:auto_denied]')));
            const rec: QuoteRecord = {
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
              notes: t.notes,
              lad_options: hasLadKeys(lad) ? lad : undefined,
              ladOptions: hasLadKeys(lad) ? lad : undefined
            };
            map.set(s, rec);
          }
        }
      });
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });
}
