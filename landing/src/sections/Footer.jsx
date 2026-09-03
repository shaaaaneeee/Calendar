import React from 'react';
import { Link } from 'react-router-dom';
import { FOOTER_LINKS } from '../data/content';
import BrandMark from '../components/BrandMark';

export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="site-footer__topline" aria-hidden="true" />
      <div className="site-footer__inner">
        <Link to="/" className="site-footer__brand" aria-label="PlanWise home">
          <BrandMark compact />
        </Link>
        <p className="site-footer__tag">Built for people who make plans in chat.</p>
        <nav className="site-footer__links" aria-label="Footer navigation">
          {FOOTER_LINKS.map((link) => (
            link.href.startsWith('/')
              ? <Link key={link.label} to={link.href}>{link.label}</Link>
              : <a key={link.label} href={link.href}>{link.label}</a>
          ))}
        </nav>
        <p className="site-footer__copyright">© 2026 PlanWise</p>
      </div>
    </footer>
  );
}
