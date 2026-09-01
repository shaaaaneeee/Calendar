import React from 'react';
import { createRoot } from 'react-dom/client';
import HowItWorksPage from './HowItWorksPage';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HowItWorksPage />
  </React.StrictMode>
);
