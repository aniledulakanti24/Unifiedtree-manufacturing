import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './context/AuthContext';
import { StoreProvider } from './context/StoreContext';
import { ToastProvider } from './context/ToastContext';
import { LangProvider } from './i18n';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LangProvider>
        <ToastProvider>
          <AuthProvider>
            <StoreProvider>
              <App />
            </StoreProvider>
          </AuthProvider>
        </ToastProvider>
      </LangProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
