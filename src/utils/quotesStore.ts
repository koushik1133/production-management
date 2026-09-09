import type { QuoteRecord, Trailer } from '../types';
import { supabase } from '../lib/supabase';

const LOCAL_STORAGE_KEY = 'lanetrailers_persistent_quotes';
export const QUOTES_UPDATED_EVENT = 'lanetrailers_quotes_updated';

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
export function saveStoredLocalQuote(quote: QuoteRecord): void {
  try {
    const current = getStoredLocalQuotes();
    const existingIndex = current.findIndex(q => 
      (quote.id && q.id === quote.id) || 
      (quote.serial_number && q.serial_number?.trim().toLowerCase() === quote.serial_number.trim().toLowerCase())
    );

    if (existingIndex >= 0) {
      current[existingIndex] = { ...current[existingIndex], ...quote };
    } else {
      current.unshift(quote);
    }

    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current));
    window.dispatchEvent(new CustomEvent(QUOTES_UPDATED_EVENT, { detail: quote }));
  } catch (err) {
    console.warn('Failed to save quote locally:', err);
  }
}

/**
 * Persist a quote to both localStorage and Supabase (if table exists)
 */
export async function persistQuote(quote: QuoteRecord): Promise<void> {
  // 1. Immediately save to local persistent storage
  saveStoredLocalQuote(quote);

  // 2. Try to save to Supabase quotes table
  try {
    const { error } = await supabase.from('quotes').upsert({
      id: quote.id,
      trailer_id: quote.trailer_id || null,
      serial_number: quote.serial_number,
      model: quote.model || null,
      dealer_name: quote.dealer_name || null,
      sale_price: quote.sale_price ?? null,
      trailer_color: quote.trailer_color || null,
      trailer_plug: quote.trailer_plug || null,
      sales_person: quote.sales_person || null,
      dealer_location: quote.dealer_location || null,
      dealer_address: quote.dealer_address || null,
      purchase_order: quote.purchase_order || null,
      consignment: quote.consignment || null,
      quote_file_path: quote.quote_file_path || null,
      status: quote.status || 'quote',
      created_at: quote.created_at || new Date().toISOString(),
      notes: quote.notes || null
    }, { onConflict: 'id' });

    if (error) {
      console.warn('Notice: quotes table sync deferred:', error.message);
    }
  } catch (err) {
    console.warn('Could not sync quote to Supabase quotes table:', err);
  }
}

/**
 * Load all quotes from Supabase, localStorage, and trailers fallback
 */
export async function fetchAllPersistentQuotes(trailers: Trailer[] = []): Promise<QuoteRecord[]> {
  const map = new Map<string, QuoteRecord>();

  // 1. Load from localStorage
  const localQuotes = getStoredLocalQuotes();
  localQuotes.forEach(q => {
    const key = q.serial_number ? q.serial_number.trim().toLowerCase() : q.id;
    if (key) map.set(key, q);
  });

  // 2. Load from Supabase quotes table
  try {
    const { data, error } = await supabase
      .from('quotes')
      .select('*')
      .order('created_at', { ascending: false });

    if (!error && data && Array.isArray(data)) {
      data.forEach((q: any) => {
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
          notes: q.notes
        };
        const key = record.serial_number ? record.serial_number.trim().toLowerCase() : record.id;
        if (key) map.set(key, record);
        // Also save to localStorage to maintain local cache
        saveStoredLocalQuote(record);
      });
    }
  } catch (err) {
    // Graceful fallback if quotes table doesn't exist yet
  }

  // 3. Fallback: Merge trailers with phase 'quote' or quote history
  if (trailers && trailers.length > 0) {
    trailers
      .filter(t => !t.isDeleted && (t.currentPhase === 'quote' || (t.notes && (t.notes.includes('[STATUS:approved]') || t.notes.includes('Approved into Backlog')))))
      .forEach(t => {
        const displaySerial = t.serialNumber?.replace(/-Q$/i, '') || t.serialNumber;
        const s = displaySerial?.trim().toLowerCase();
        if (s && !map.has(s)) {
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
            notes: t.notes
          };
          map.set(s, rec);
        }
      });
  }

  return Array.from(map.values()).sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return timeB - timeA;
  });
}
