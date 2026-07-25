import React, { memo } from 'react';
import { FOOTER_LINKS } from '../data/content';

const Footer = memo(function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-logo">
          <span
            style={{
              width: 8, height: 8,
              borderRadius: '50%',
              background: 'var(--accent)',
              display: 'inline-block',
              flexShrink: 0,
            }}
            aria-hidden="true"
          />
          PlanWise
        </div>

        <ul className="footer-links" role="list">
          {FOOTER_LINKS.map((label) => (
            <li key={label}>
              <a href="#" className="footer-link">{label}</a>
            </li>
          ))}
        </ul>

        <p className="footer-tag">
          © 2026 PlanWise. Built for people who make plans in chat.
        </p>
      </div>
    </footer>
  );
});

export default Footer;
