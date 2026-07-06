import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../lib/supabase';

const BUCKET_NAME = 'trailers-files';

export function isRelativePath(path: string | undefined | null): boolean {
  if (!path) return false;
  return !path.startsWith('data:') && !path.startsWith('http:') && !path.startsWith('https:');
}

export async function fetchFileBlob(relativePath: string): Promise<Blob> {
  const { data, error } = await supabase.storage.from(BUCKET_NAME).download(relativePath);
  if (error) {
    throw new Error(`Failed to fetch file from Supabase: ${error.message}`);
  }
  return data;
}

export function useResolvedUrl(path: string | undefined | null): string {
  const [url, setUrl] = useState<string>('');

  const resolvedSyncUrl = useMemo(() => {
    if (!path) return '';
    if (!isRelativePath(path)) return path; 
    const { data } = supabase.storage.from(BUCKET_NAME).getPublicUrl(path);
    return data.publicUrl;
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

export async function uploadFileToSupabase(file: File, type: string, id: string): Promise<string> {
  let folderPath = '';
  if (type === 'spec_sheet_template') {
    folderPath = `templates/${id}`;
  } else if (type === 'spec_sheet' || type === 'inspection_sheet' || type.startsWith('photo_')) {
    // We assume if it has a type, it goes into the relevant trailer folder.
    // If we need to distinguish shipped vs active, we could use an optional category param, but let's just use trailers
    // For shipped trailers, the serial number is the ID usually in this context.
    folderPath = `trailers/${id}`;
  } else {
    folderPath = `misc/${id}`;
  }

  const fileName = `${type}_${Date.now()}_${file.name}`;
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

  const { data: publicUrlData } = supabase.storage.from(BUCKET_NAME).getPublicUrl(data.path);
  return publicUrlData.publicUrl;
}

export async function deleteFileFromSupabase(publicUrl: string): Promise<void> {
  if (!publicUrl || publicUrl.startsWith('data:')) return;

  const bucketUrlPart = `/storage/v1/object/public/${BUCKET_NAME}/`;
  const pathIndex = publicUrl.indexOf(bucketUrlPart);
  
  if (pathIndex === -1) return;
  
  const path = publicUrl.substring(pathIndex + bucketUrlPart.length);

  const { error } = await supabase.storage.from(BUCKET_NAME).remove([path]);
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
  const a = document.createElement('a');
  a.href = path;
  a.download = defaultName;
  a.target = '_blank';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export async function fetchTemplateAsBase64(templateValue: string): Promise<string> {
  if (!templateValue) return '';
  if (templateValue.startsWith('data:')) return templateValue;

  try {
    const res = await fetch(templateValue);
    const blob = await res.blob();
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
