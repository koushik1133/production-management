import type { Configuration, PopupRequest } from "@azure/msal-browser";

// Default to placeholders so the app doesn't crash, but it won't work until configured
const clientId = import.meta.env.VITE_AZURE_CLIENT_ID || "YOUR_AZURE_CLIENT_ID_HERE";

export const msalConfig: Configuration = {
  auth: {
    clientId: clientId,
    // Use 'common' to allow any Microsoft account (personal, student, work) to sign in
    authority: `https://login.microsoftonline.com/common`,
    redirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage", 
  }
};

export const loginRequest: PopupRequest = {
  scopes: ["User.Read", "Files.ReadWrite"],
  prompt: "select_account"
};
