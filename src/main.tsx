import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';
import { listenForInstallPrompt } from './help/install';

listenForInstallPrompt(); // before anything renders, so the browser's install offer isn't missed

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
