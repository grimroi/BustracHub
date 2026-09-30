import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import PouchDB from 'pouchdb-browser';
import PouchDBFind from 'pouchdb-find';
import { registerSW } from 'virtual:pwa-register';
import App from './App.jsx';
import './index.css';

PouchDB.plugin(PouchDBFind);

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
);

registerSW({ immediate: true });