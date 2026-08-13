import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from './authConfig';
import { ErrorBoundary } from './components/ErrorBoundary';

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
      <ErrorBoundary>
        <MsalProvider instance={msalInstance}>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </MsalProvider>
      </ErrorBoundary>
    </StrictMode>,
  )
}).catch((error) => {
  console.warn("MSAL Initialization skipped or failed:", error);
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ErrorBoundary>
    </StrictMode>,
  )
});
