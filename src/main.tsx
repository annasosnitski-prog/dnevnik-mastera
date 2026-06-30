import React from 'react';
import ReactDOM from 'react-dom/client';
import TattoDiary from './components/TattoDiary';
import './index.css';

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch((err) => console.log('SW registration failed:', err));
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <TattoDiary />
  </React.StrictMode>,
);
