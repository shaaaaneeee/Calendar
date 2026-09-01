import React from 'react';

export default function SectionHeader({ index, eyebrow, title, intro, dark = false }) {
  return (
    <header className={`section-header ${dark ? 'section-header--dark' : ''}`}>
      <div className="section-header__index">{index}</div>
      <div className="section-header__copy">
        <p className="section-kicker">{eyebrow}</p>
        <h2 className="section-title">{title}</h2>
        {intro ? <p className="section-intro">{intro}</p> : null}
      </div>
    </header>
  );
}
