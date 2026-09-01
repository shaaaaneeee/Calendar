import React from 'react';

export default function BrandMark({ compact = false, className = '' }) {
  const classes = ['brand-mark', compact && 'brand-mark--compact', className]
    .filter(Boolean)
    .join(' ');
  return (
    <span className={classes}>
      <span className="brand-mark__dot" aria-hidden="true" />
      <span className="brand-mark__name">PlanWise</span>
    </span>
  );
}
