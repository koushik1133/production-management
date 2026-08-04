import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from './authConfig';

const msalInstance = new PublicClientApplication(msalConfig);
msalInstance.initialize().then(async () => {
  // Handle the redirect response when Microsoft bounces the user back
  try {
    const response = await msalInstance.handleRedirectPromise();
    if (response) {
      msalInstance.setActiveAccount(response.account);
      console.log("Microsoft login successful!", response.account?.username);
    }
  } catch (error) {
    console.error("Redirect handling error:", error);
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </MsalProvider>
    </StrictMode>,
  )
}).catch((error) => {
  console.error("MSAL Initialization failed:", error);
  // Use textContent instead of innerHTML to prevent XSS via error.message
  const root = document.getElementById('root')!;
  const h1 = document.createElement('h1');
  h1.style.cssText = 'font-family:sans-serif;color:#dc2626;padding:2rem;';
  h1.textContent = `App failed to initialize. Please refresh. (${error?.message ?? 'Unknown error'})`;
  root.appendChild(h1);
});
