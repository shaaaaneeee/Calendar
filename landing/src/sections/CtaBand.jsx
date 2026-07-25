import React from 'react';
import { ACCENT, sh } from '../utils';

export default function CtaBand({ wrapRef, anim, reducedMotion }) {
  const { ctaIn } = anim;
  const visible = reducedMotion || ctaIn;

  return (
    <section
      ref={wrapRef}
      id="cta"
      className="cta-band"
      aria-label="Call to action"
    >
      <div
        className="cta-inner"
        style={{
          opacity:   visible ? 1 : 0,
          transform: visible ? 'none' : 'translateY(24px)',
        }}
      >
        <p className="cta-eyebrow" style={{ color: ACCENT }}>
          GET PLANWISE
        </p>
        <h2 className="cta-title">Stop scrolling back to find the date.</h2>
        <a
          href="#"
          className="cta-btn"
          style={{ boxShadow: `4px 4px 0 ${ACCENT}` }}
        >
          Add to Chrome — it&apos;s free
        </a>
        <p className="cta-sub">
          Free · Manifest V3 · No account required to start
        </p>
      </div>
    </section>
  );
}
