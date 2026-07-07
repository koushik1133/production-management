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
  if (type === 'spec_sheet_template') {
    folderPath = `templates/${id}`;
  } else if (type === 'spec_sheet' || type === 'inspection_sheet' || type.startsWith('photo_')) {
    folderPath = `trailers/${id}`;
  } else {
    folderPath = `misc/${id}`;
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
  if (!path) return;
  
  if (path.startsWith('data:')) {
    try {
      const file = dataURLtoFile(path, defaultName);
      const objectUrl = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
      return;
    } catch (err) {
      console.error("Failed to download dataURL via blob:", err);
      const a = document.createElement('a');
      a.href = path;
      a.download = defaultName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
  }
  
  let downloadUrl = path;
  if (isRelativePath(path)) {
    const normalized = path.replace(/\\/g, '/');
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(normalized);
    downloadUrl = data.publicUrl;
  }

  try {
    const response = await fetch(downloadUrl);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    
    let finalName = defaultName;
    if (!finalName.includes('.')) {
      const ext = path.split('.').pop()?.split('?')[0] || '';
      if (ext && ext.length <= 4) {
        finalName = `${finalName}.${ext}`;
      }
    }

    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = finalName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
  } catch (err) {
    console.error("Failed to download file via blob:", err);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = defaultName;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function fetchTemplateAsBase64(templateValue: string): Promise<string> {
  if (!templateValue) return '';
  if (templateValue.startsWith('data:')) return templateValue;

  try {
    let blob: Blob;
    if (templateValue.startsWith('http:') || templateValue.startsWith('https:')) {
      const res = await fetch(templateValue);
      blob = await res.blob();
    } else {
      blob = await fetchFileBlob(templateValue);
    }

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('Failed to fetch template as base64:', error);
    throw error;
  }
}
