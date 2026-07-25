import React, { memo } from 'react';
import { NAV_LINKS } from '../data/content';
import { sh } from '../utils';

const Nav = memo(function Nav() {
  return (
    <nav className="nav" aria-label="Main navigation">
      <div className="nav-inner">
        <a href="#" className="nav-logo" aria-label="PlanWise home">
          <span className="nav-logo-dot" aria-hidden="true" />
          PlanWise
        </a>

        <ul className="nav-links" role="list">
          {NAV_LINKS.map(({ label, href }) => (
            <li key={href}>
              <a href={href} className="nav-link">{label}</a>
            </li>
          ))}
        </ul>

        <a
          href="#cta"
          className="nav-cta"
          style={{ boxShadow: sh(2) }}
        >
          Add to Chrome
        </a>
      </div>
    </nav>
  );
});

export default Nav;
