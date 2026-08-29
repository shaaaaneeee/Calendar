import React from 'react';
import SectionHeader from '../components/SectionHeader';
import { FEATURES } from '../data/content';
import { clamp, lerp, stickyStyle, runwayHeight, easeOutCubic } from '../utils';

export default function Features({ wrapRef, anim, reducedMotion }) {
  const { features, isMobile } = anim;
  const p  = features.progress;
  const mo = reducedMotion ? 0 : (isMobile ? 0.55 : 1);

  const height = runwayHeight(200, isMobile, reducedMotion);

  const innerStyle = reducedMotion
    ? { position: 'relative', height: '100vh' }
    : stickyStyle(features.mode);

  return (
    <section
      ref={wrapRef}
      id="features"
      className="pin-wrap"
      style={{ height }}
      aria-label="Features"
    >
      <div className="features-sticky" style={innerStyle}>
        <SectionHeader
          eyebrow="FEATURES"
          title="Built for groups that plan in chat."
        />

        <div className="features-grid">
          {FEATURES.map((feat, i) => {
            const segStart = i * 0.2;
            const segEnd   = segStart + 0.45;
            const local    = clamp((p - segStart) / (segEnd - segStart), 0, 1);
            const enter    = reducedMotion ? 1 : easeOutCubic(clamp(local * 1.15, 0, 1));

            // Once the entrance finishes, stop setting inline transform/clipPath
            // so the CSS :hover lift (landing.css .feature-cell:hover) can take
            // over that property - an inline style always beats a CSS class rule
            // for the same property, entrance-complete or not.
            const entranceDone = enter >= 1;
            const cellStyle = {
              opacity: enter,
              ...(entranceDone ? {} : { transform: `scale(${lerp(0.92, 1, enter)})` }),
              ...(entranceDone || reducedMotion ? {} : { clipPath: `inset(${(1 - enter) * 40}% 0 0 0)` }),
            };

            return (
              <div key={feat.label} className="feature-cell" style={cellStyle}>
                <span className="feature-label">{feat.label}</span>
                <h3 className="feature-title">{feat.title}</h3>
                <p className="feature-desc">{feat.desc}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
