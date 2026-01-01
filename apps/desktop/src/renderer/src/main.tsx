import React from 'react';
import ReactDOM from 'react-dom/client';
import './fonts.css';
import '@specwave/ui-next/src/styles.css';
import { App } from './ui/App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
