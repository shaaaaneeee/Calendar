import React from 'react';

/**
 * Shared eyebrow + h2 header used in every section below the hero.
 */
export default function SectionHeader({ eyebrow, title }) {
  return (
    <div className="section-head">
      <p className="section-eyebrow">{eyebrow}</p>
      <h2 className="section-title">{title}</h2>
    </div>
  );
}
