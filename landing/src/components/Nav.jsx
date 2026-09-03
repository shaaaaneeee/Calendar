import React, { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { NAV_LINKS, CHROME_STORE_URL } from '../data/content';
import BrandMark from './BrandMark';

// Order matters: this is reading order down the page, used below to pick
// "the last section the scroll position has reached" as the active one.
const SECTION_ORDER = ['#how', '#features', '#platforms'];

export default function Nav({ anim }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuButtonRef = useRef(null);
  const firstMenuLinkRef = useRef(null);

  const location = useLocation();
  // In-page anchors like "#how" only resolve on the homepage itself, so from
  // any other route they need the homepage's path prefixed to still work.
  const onHomepage = location.pathname === '/';
  const sectionLinks = NAV_LINKS.map((link) => ({
    ...link,
    href: onHomepage ? link.href : `/${link.href}`,
  }));
  // Only offered from the homepage itself - no need to link to this page
  // from itself, and the brand-mark logo already covers "back to home".
  const pageLinks = onHomepage
    ? [...sectionLinks, { label: 'See it in detail', href: '/how-it-works' }]
    : sectionLinks;

  // Driven directly by the same scroll-pin state (anim.how/features/platforms
  // .mode) that already animates each section, rather than a separate
  // IntersectionObserver guessing against those sections' runway wrappers -
  // most of each runway is empty scroll space around the pinned content, so
  // observing the wrapper's raw visibility never lined up with which section
  // actually reads as "current." The active section is simply the last one
  // in page order that scroll has already reached (mode !== 'before').
  const modeByHref = {
    '#how': anim?.how?.mode,
    '#features': anim?.features?.mode,
    '#platforms': anim?.platforms?.mode,
  };
  const activeSection = anim
    ? SECTION_ORDER.reduce((current, href) => (modeByHref[href] !== 'before' ? href : current), '#how')
    : null;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      document.body.style.overflow = '';
      menuButtonRef.current?.focus();
      return;
    }
    document.body.style.overflow = 'hidden';
    firstMenuLinkRef.current?.focus();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header className={`site-nav ${scrolled ? 'site-nav--scrolled' : ''}`}>
      <div className="nav-shell">
        <Link to="/" className="nav-brand" aria-label="PlanWise home" onClick={closeMenu}>
          <BrandMark />
        </Link>

        <nav className="nav-desktop" aria-label="Main navigation">
          <span className="nav-desktop__label">PLANWISE / 2026</span>
          <span className="nav-desktop__divider" aria-hidden="true" />
          {pageLinks.map((link) => (
            <Link
              key={link.href}
              to={link.href}
              className={`nav-link ${activeSection === link.href ? 'nav-link--active' : ''}`}
              aria-current={activeSection === link.href ? 'page' : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <a href={CHROME_STORE_URL} className="nav-action" target="_blank" rel="noreferrer" onClick={closeMenu}>
          <span>Add to Chrome</span>
          <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden="true" />
        </a>

        <button
          ref={menuButtonRef}
          type="button"
          className="nav-menu-button"
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X size={21} strokeWidth={1.8} /> : <Menu size={21} strokeWidth={1.8} />}
        </button>
      </div>

      <div id="mobile-navigation" className={`nav-mobile ${menuOpen ? 'nav-mobile--open' : ''}`} aria-hidden={!menuOpen}>
        <div className="nav-mobile__meta">JUMP TO</div>
        <nav aria-label="Mobile navigation">
          {pageLinks.map((link, index) => (
            <Link
              key={link.href}
              ref={index === 0 ? firstMenuLinkRef : undefined}
              to={link.href}
              className={activeSection === link.href ? 'nav-mobile__link--active' : ''}
              aria-current={activeSection === link.href ? 'page' : undefined}
              onClick={closeMenu}
            >
              <span className="nav-mobile__index">0{index + 1}</span>
              <span>{link.label}</span>
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </Link>
          ))}
          <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" onClick={closeMenu} className="nav-mobile__cta">
            <span className="nav-mobile__index">0{pageLinks.length + 1}</span>
            <span>Add PlanWise to Chrome</span>
            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </a>
        </nav>
      </div>
    </header>
  );
}
