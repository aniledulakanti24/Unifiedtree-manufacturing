import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { PeriodProvider } from './context/PeriodContext';
import { ToastProvider } from './context/ToastContext';
import { LangProvider } from './i18n';
import './styles.css';

// Offline support in the built app only (in development it would cache files that keep changing).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {}));
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter>
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
    </HashRouter>
  </React.StrictMode>,
);
