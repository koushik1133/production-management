import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

export const STORAGE_GATEWAY_URL = import.meta.env.VITE_STORAGE_GATEWAY_URL || 'http://localhost:3001';

export function isRelativePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return !path.startsWith('data:') && !path.startsWith('http:') && !path.startsWith('https:');
}

export async function fetchFileBlob(relativePath: string): Promise<Blob> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${STORAGE_GATEWAY_URL}/api/download?path=${encodeURIComponent(relativePath)}`, {
    headers: {
      'Authorization': `Bearer ${token || ''}`
    }
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch file from gateway: ${res.statusText}`);
  }

  return await res.blob();
}

export function useResolvedUrl(path: string | undefined | null): string {
  const [url, setUrl] = useState<string>('');

  const resolvedSyncUrl = useMemo(() => {
    if (!path) return '';
    if (!isRelativePath(path)) return path;
    return null;
  }, [path]);

  useEffect(() => {
    if (resolvedSyncUrl !== null) {
      return;
    }

    let active = true;
    let objectUrl = '';

    const load = async () => {
      try {
        const blob = await fetchFileBlob(path!);
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      } catch (err) {
        console.error('Error resolving relative path through storage gateway:', err);
      }
    };

    load();

    return () => {
      active = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [path, resolvedSyncUrl]);

  return resolvedSyncUrl !== null ? resolvedSyncUrl : url;
}

export async function uploadFileToGateway(file: File, id: string, type: string, table: string, category: string, serialNumber?: string): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const formData = new FormData();
  formData.append('id', id);
  formData.append('type', type);
  formData.append('table', table);
  formData.append('category', category);
  if (serialNumber) {
    formData.append('serialNumber', serialNumber);
  }
  formData.append('file', file);

  const res = await fetch(`${STORAGE_GATEWAY_URL}/api/upload`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token || ''}`
    },
    body: formData
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Upload failed: ${res.statusText}`);
  }

  const result = await res.json();
  return result.filePath;
}

export async function deleteFileFromGateway(relativePath: string, table: string, id: string, column: string, serialNumber?: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const res = await fetch(`${STORAGE_GATEWAY_URL}/api/file`, {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${token || ''}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ path: relativePath, table, id, column, serialNumber })
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Delete failed: ${res.statusText}`);
  }
}

export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function triggerFileDownload(path: string, defaultName: string): Promise<void> {
  if (isRelativePath(path)) {
    const blob = await fetchFileBlob(path);
    const localUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = localUrl;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(localUrl);
  } else {
    const a = document.createElement('a');
    a.href = path;
    a.download = defaultName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}
