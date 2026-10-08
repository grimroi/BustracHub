import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

PouchDB.plugin(PouchDBFind);

const rootEl = document.documentElement;
const savedTheme = localStorage.getItem('theme');
const theme = savedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
rootEl.setAttribute('data-theme', theme);
rootEl.classList.remove('light', 'dark');
rootEl.classList.add(theme);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerSW({ immediate: true });