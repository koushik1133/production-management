import { useMemo } from 'react';
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'trailers-files';

export function isRelativePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return !path.startsWith('data:') && !path.startsWith('http:') && !path.startsWith('https:');
}

export async function fetchFileBlob(relativePath: string): Promise<Blob> {
  const normalized = relativePath.replace(/\\/g, '/');
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(normalized);
  if (error) {
    throw new Error(`Failed to fetch file from Supabase: ${error.message}`);
  }
  return data;
}

export function useResolvedUrl(path: string | undefined | null): string {
  return useMemo(() => {
    if (!path) return '';
    const normalized = path.replace(/\\/g, '/');
    if (!isRelativePath(normalized)) return normalized; 
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(normalized);
    return data.publicUrl;
  }, [path]);
}

export async function uploadFileToSupabase(file: File, type: string, id: string): Promise<string> {
  let folderPath = '';
  const safeId = id.replace(/[^a-zA-Z0-9.-]/g, '_');
  if (type === 'spec_sheet_template') {
    folderPath = `templates/${safeId}`;
  } else if (type === 'spec_sheet' || type === 'inspection_sheet' || type.startsWith('photo_')) {
    folderPath = `trailers/${safeId}`;
  } else {
    folderPath = `misc/${safeId}`;
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const fileName = `${type}_${Date.now()}_${safeName}`;
  const filePath = `${folderPath}/${fileName}`;

  const { data, error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: true
    });

  if (error) {
    throw new Error(`Supabase upload failed: ${error.message}`);
  }

  return data.path;
}

export async function deleteFileFromSupabase(pathOrUrl: string): Promise<void> {
  if (!pathOrUrl || pathOrUrl.startsWith('data:')) return;

  let path = pathOrUrl;
  const bucketUrlPart = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const pathIndex = pathOrUrl.indexOf(bucketUrlPart);
  
  if (pathIndex !== -1) {
    path = pathOrUrl.substring(pathIndex + bucketUrlPart.length);
  }

  const normalized = path.replace(/\\/g, '/');

  const { error } = await supabase.storage.from(BUCKET_NAME).remove([normalized]);
  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

export function dataURLtoFile(dataurl: string, filename: string): File {
  const [header, base64] = dataurl.split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'application/octet-stream';
  const binary = atob(base64);
  const u8arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    u8arr[i] = binary.charCodeAt(i);
  }
  return new File([u8arr], filename, { type: mime });
}

export async function triggerFileDownload(path: string, defaultName: string): Promise<void> {
  if (!path) return;
  
  if (path.startsWith('data:')) {
    const a = document.createElement('a');
    a.href = path;
    a.download = defaultName;
    a.click();
    return;
  }
  
  const downloadUrl = isRelativePath(path)
    ? supabase.storage.from(BUCKET_NAME).getPublicUrl(path.replace(/\\/g, '/')).data.publicUrl
    : path;

  try {
    const res = await fetch(downloadUrl);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = defaultName;
    a.click();
    URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(downloadUrl, '_blank');
  }
}

export async function fetchTemplateAsBase64(templateValue: string): Promise<string> {
  if (!templateValue) return '';
  if (templateValue.startsWith('data:')) return templateValue;

  const blob = (templateValue.startsWith('http:') || templateValue.startsWith('https:'))
    ? await (await fetch(templateValue)).blob()
    : await fetchFileBlob(templateValue);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
