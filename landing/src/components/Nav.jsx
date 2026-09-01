import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, Menu, X } from 'lucide-react';
import { NAV_LINKS, CHROME_STORE_URL } from '../data/content';
import BrandMark from './BrandMark';

export default function Nav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState('#how');
  const menuButtonRef = useRef(null);
  const firstMenuLinkRef = useRef(null);

  // The site is a static multi-page build (index.html + how-it-works.html),
  // not a client-side router - in-page anchors like "#how" only resolve on
  // the homepage itself, so from any other page they need the homepage's
  // URL prefixed to still work.
  const onHomepage = typeof window === 'undefined' || !window.location.pathname.endsWith('how-it-works.html');
  const sectionLinks = NAV_LINKS.map((link) => ({
    ...link,
    href: onHomepage ? link.href : `./${link.href}`,
  }));
  // Only offered from the homepage itself - no need to link to this page
  // from itself, and the brand-mark logo already covers "back to home".
  const pageLinks = onHomepage
    ? [...sectionLinks, { label: 'See it in detail', href: 'how-it-works.html' }]
    : sectionLinks;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 18);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    if (!onHomepage) return;
    const sections = NAV_LINKS.map(({ href }) => document.querySelector(href)).filter(Boolean);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(`#${visible.target.id}`);
      },
      { rootMargin: '-22% 0px -62%', threshold: [0.1, 0.35, 0.7] }
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [onHomepage]);

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
        <a href="./" className="nav-brand" aria-label="PlanWise home" onClick={closeMenu}>
          <BrandMark />
        </a>

        <nav className="nav-desktop" aria-label="Main navigation">
          <span className="nav-desktop__label">PLANWISE / 2026</span>
          <span className="nav-desktop__divider" aria-hidden="true" />
          {pageLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className={`nav-link ${activeSection === link.href ? 'nav-link--active' : ''}`}
              aria-current={activeSection === link.href ? 'page' : undefined}
            >
              {link.label}
            </a>
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
            <a
              key={link.href}
              ref={index === 0 ? firstMenuLinkRef : undefined}
              href={link.href}
              className={activeSection === link.href ? 'nav-mobile__link--active' : ''}
              aria-current={activeSection === link.href ? 'page' : undefined}
              onClick={closeMenu}
            >
              <span className="nav-mobile__index">0{index + 1}</span>
              <span>{link.label}</span>
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </a>
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
