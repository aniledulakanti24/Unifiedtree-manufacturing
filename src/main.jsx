import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { PeriodProvider } from './context/PeriodContext';
import { ToastProvider } from './context/ToastContext';
import { LangProvider } from './i18n';
import './styles.css';

// Offline support in the built app only (in development it would cache files that keep changing).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
        <ToastProvider>
          <AuthProvider>
            <StoreProvider>
              <PeriodProvider>
                <App />
              </PeriodProvider>
            </StoreProvider>
          </AuthProvider>
        </ToastProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
