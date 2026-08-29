import React from 'react';
import SectionHeader from '../components/SectionHeader';
import { HOW_STEPS } from '../data/content';
import { clamp, lerp, stickyStyle, runwayHeight, easeOutCubic } from '../utils';

export default function HowItWorks({ wrapRef, anim, reducedMotion }) {
  const { how, isMobile } = anim;
  const p  = how.progress;
  const mo = reducedMotion ? 0 : (isMobile ? 0.55 : 1);

  const height = runwayHeight(220, isMobile, reducedMotion);

  const innerStyle = reducedMotion
    ? { position: 'relative', height: '100vh' }
    : stickyStyle(how.mode);

  return (
    <section
      ref={wrapRef}
      id="how"
      className="pin-wrap"
      style={{ height }}
      aria-label="How it works"
    >
      <div className="how-sticky" style={innerStyle}>
        <SectionHeader
          eyebrow="HOW IT WORKS"
          title="From a stray message to a synced plan."
        />

        <div className="how-track" role="list">
          {HOW_STEPS.map((step, i) => {
            // Each step animates in sequentially as progress advances
            const segStart = i / 3;
            const segEnd   = (i + 1) / 3;
            const local    = clamp((p - segStart) / (segEnd - segStart + 0.0001), 0, 1);
            const enter    = reducedMotion ? 1 : easeOutCubic(clamp(local * 1.2, 0, 1));
            const numScale = reducedMotion ? 1 : lerp(0.7, 1, enter);
            const entranceDone = enter >= 1;

            // Stop setting inline transform once the entrance finishes so the
            // CSS :hover lift can take over - an inline style always beats a
            // CSS class rule for the same property.
            const stepStyle = {
              opacity: enter,
              ...(entranceDone ? {} : { transform: `translateY(${(1 - enter) * 32 * mo}px)` }),
            };

            return (
              <div
                key={step.number}
                className="how-step"
                style={stepStyle}
                role="listitem"
              >
                <span
                  className="step-number"
                  aria-hidden="true"
                  style={{ transform: `scale(${numScale})` }}
                >
                  {step.number}
                </span>
                <h3 className="step-title">{step.title}</h3>
                <p className="step-desc">{step.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
