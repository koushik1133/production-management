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
  document.getElementById('root')!.innerHTML = `<h1>MSAL Init Failed: ${error.message}</h1>`;
});
