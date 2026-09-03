import React from 'react';
import { useDocumentHead } from './hooks/useDocumentHead';
import './confirmed.css';

export default function ConfirmedPage() {
  useDocumentHead({
    title: 'Email confirmed — PlanWise',
    noindex: true,
  });

  return (
    <div className="confirmed-page">
      <div className="card">
        <div className="logo">Plan<strong>Wise</strong></div>
        <div className="check" aria-hidden="true">✓</div>
        <h1>Your email is confirmed</h1>
        <p>Your account is active — you can close this tab.</p>
        <p>Open the PlanWise extension icon in your browser toolbar and sign in with your email or username.</p>
        <div className="hint">Don't see the extension icon? Pin it from your browser's extensions menu.</div>
      </div>
    </div>
  );
}
