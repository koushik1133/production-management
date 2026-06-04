import React, { useState, useEffect } from 'react';
import { useMsal } from "@azure/msal-react";
import { InteractionStatus } from "@azure/msal-browser";
import { loginRequest } from "../authConfig";
import { X, ExternalLink, RefreshCw, AlertTriangle, LogIn } from 'lucide-react';

interface Props {
  base64File: string;
  serialNumber: string;
  onSave: (newBase64: string) => void;
  onClose: () => void;
}

export const MicrosoftExcelEditor: React.FC<Props> = ({ base64File, serialNumber, onSave, onClose }) => {
  const { instance, accounts, inProgress } = useMsal();
  const [status, setStatus] = useState<"initializing" | "uploading" | "ready" | "syncing" | "error">("initializing");
  const [errorMessage, setErrorMessage] = useState("");
  const [driveItemId, setDriveItemId] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);

  const isLoggedIn = accounts.length > 0 || instance.getActiveAccount() !== null;

  const getAccessToken = async (): Promise<string> => {
    const activeAccount = accounts[0] || instance.getActiveAccount();
    if (!activeAccount) {
      throw new Error("Not logged in");
    }
    try {
      const response = await instance.acquireTokenSilent({
        ...loginRequest,
        account: activeAccount
      });
      return response.accessToken;
    } catch {
      await instance.acquireTokenRedirect({
        ...loginRequest,
        account: activeAccount
      });
      throw new Error("Redirecting for token...");
    }
  };

  const handleLogin = () => {
    instance.loginRedirect(loginRequest);
  };

  const uploadFile = async () => {
    if (inProgress !== InteractionStatus.None) return;

    try {
      setStatus("uploading");
      const token = await getAccessToken();

      // Convert base64 to Uint8Array (browser-native, no Buffer needed)
      const base64Data = base64File.includes(',') ? base64File.split(',')[1] : base64File;
      const binaryString = window.atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      const fileName = `SalesManager_${serialNumber}_Temp.xlsx`;

      // Upload using plain fetch instead of the Graph SDK (avoids Buffer polyfill)
      const uploadRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/${fileName}:/content`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        },
        body: bytes,
      });

      if (!uploadRes.ok) {
        const errText = await uploadRes.text();
        throw new Error(`Upload failed (${uploadRes.status}): ${errText}`);
      }

      const uploadData = await uploadRes.json();
      setDriveItemId(uploadData.id);
      setEditUrl(uploadData.webUrl);
      setStatus("ready");
    } catch (err: any) {
      if (err.message === "Redirecting for token...") return;
      console.error(err);
      setErrorMessage(err.message || "An unknown error occurred.");
      setStatus("error");
    }
  };

  // If already logged in, auto-start the upload
  useEffect(() => {
    if (isLoggedIn && inProgress === InteractionStatus.None && status === "initializing") {
      uploadFile();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn, inProgress]);

  const handleSync = async () => {
    if (!driveItemId) return;
    try {
      setStatus("syncing");
      const token = await getAccessToken();

      // Download using plain fetch
      const downloadRes = await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${driveItemId}/content`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!downloadRes.ok) {
        throw new Error(`Download failed (${downloadRes.status})`);
      }

      const arrayBuffer = await downloadRes.arrayBuffer();
      const byteArray = new Uint8Array(arrayBuffer);
      let binaryStr = '';
      for (let i = 0; i < byteArray.length; i++) {
        binaryStr += String.fromCharCode(byteArray[i]);
      }
      const newBase64Data = btoa(binaryStr);
      const finalFile = `data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${newBase64Data}`;

      // Cleanup: delete temp file from OneDrive
      await fetch(`https://graph.microsoft.com/v1.0/me/drive/items/${driveItemId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` },
      }).catch(e => console.warn("Failed to delete temp file", e));

      onSave(finalFile);
    } catch (err: any) {
      if (err.message === "Redirecting for token...") return;
      console.error(err);
      setErrorMessage(err.message || "Failed to sync file from OneDrive.");
      setStatus("error");
    }
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 10000, padding: '2rem' }}>
      <div className="modal-content" style={{ maxWidth: '600px', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: 0, color: '#107c41' }}>
            <svg width="28" height="28" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
              <rect x="1" y="6" width="18" height="20" rx="2" fill="#107c41"/>
              <path d="M19 6h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2h-8V6z" fill="#21a366"/>
              <text x="6" y="20" fontFamily="Arial" fontWeight="bold" fontSize="12" fill="white">X</text>
            </svg>
            Microsoft Excel
          </h2>
          <button onClick={onClose} className="btn btn-secondary" style={{ padding: '0.5rem' }}><X size={16}/></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', textAlign: 'center', padding: '2rem 0' }}>

          {!isLoggedIn && status === "initializing" && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', alignItems: 'center' }}>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>You need to sign in with your Microsoft account first.</p>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>You will be redirected to Microsoft's login page and brought back here automatically.</p>
              <button
                onClick={handleLogin}
                disabled={inProgress !== InteractionStatus.None}
                className="btn btn-primary shimmer"
                style={{ padding: '0.75rem 1.5rem', fontSize: '1rem', background: '#107c41', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <LogIn size={18} /> Sign in with Microsoft
              </button>
            </div>
          )}

          {isLoggedIn && status === "initializing" && (
            <>
              <div className="spinner" style={{ borderColor: '#107c41', borderRightColor: 'transparent' }}></div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Preparing upload...</p>
            </>
          )}

          {status === "uploading" && (
            <>
              <div className="spinner" style={{ borderColor: '#10b981', borderRightColor: 'transparent' }}></div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Uploading file to OneDrive...</p>
            </>
          )}
          {status === "syncing" && (
            <>
              <div className="spinner" style={{ borderColor: '#8b5cf6', borderRightColor: 'transparent' }}></div>
              <p style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Downloading changes to Supabase...</p>
            </>
          )}
          {status === "error" && (
            <div style={{ background: 'rgba(239, 68, 68, 0.1)', padding: '1rem', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)', width: '100%' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.5rem', justifyContent: 'center' }}>
                <AlertTriangle size={18} /> Error Occurred
              </div>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{errorMessage}</p>
              <button onClick={isLoggedIn ? uploadFile : handleLogin} className="btn btn-primary" style={{ marginTop: '1rem' }}>
                {isLoggedIn ? "Try Again" : "Sign in with Microsoft"}
              </button>
            </div>
          )}

          {status === "ready" && editUrl && (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center' }}>
              <div style={{ background: 'rgba(16, 124, 65, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(16, 124, 65, 0.2)', width: '100%' }}>
                <p style={{ margin: '0 0 1rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>1. Edit your file in Excel Online</p>
                <a
                  href={editUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary shimmer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', background: '#107c41' }}
                >
                  <ExternalLink size={16} /> Open in Microsoft Excel
                </a>
                <p style={{ margin: '1rem 0 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Excel Online auto-saves your changes instantly.</p>
              </div>
              <div style={{ width: '2px', height: '24px', background: 'var(--border-default)' }}></div>
              <div style={{ background: 'rgba(16, 185, 129, 0.05)', padding: '1.5rem', borderRadius: '12px', border: '1px solid rgba(16, 185, 129, 0.2)', width: '100%' }}>
                <p style={{ margin: '0 0 1rem 0', fontWeight: 600, color: 'var(--text-primary)' }}>2. Pull changes back into Sales Manager</p>
                <button
                  onClick={handleSync}
                  className="btn btn-primary"
                  style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
                >
                  <RefreshCw size={16} /> Sync Changes & Close
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
