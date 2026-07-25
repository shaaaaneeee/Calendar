import React from 'react';
import SectionHeader from '../components/SectionHeader';
import { PLATFORMS } from '../data/content';
import { clamp, stickyStyle, runwayHeight } from '../utils';

export default function Platforms({ wrapRef, anim, reducedMotion }) {
  const { platforms, isMobile } = anim;
  const p  = platforms.progress;
  const mo = reducedMotion ? 0 : (isMobile ? 0.55 : 1);

  const height = runwayHeight(160, isMobile, reducedMotion);

  const innerStyle = reducedMotion
    ? { position: 'relative', height: '100vh' }
    : stickyStyle(platforms.mode);

  return (
    <section
      ref={wrapRef}
      id="platforms"
      className="pin-wrap"
      style={{ height }}
      aria-label="Supported platforms"
    >
      <div className="platforms-sticky" style={innerStyle}>
        <SectionHeader
          eyebrow="WORKS WHERE YOU ALREADY TALK"
          title="Three inboxes. One calendar."
        />

        <div className="platforms-row">
          {PLATFORMS.map((plat, i) => {
            const segStart = i * 0.22;
            const segEnd   = segStart + 0.5;
            const local    = clamp((p - segStart) / (segEnd - segStart), 0, 1);
            const enter    = reducedMotion ? 1 : clamp(local * 1.3, 0, 1);
            // Alternate slide-in direction: left, right, left
            const dir = i % 2 === 0 ? -1 : 1;

            return (
              <div
                key={plat.name}
                className="platform-card"
                style={{
                  opacity:   enter,
                  transform: `translateX(${(1 - enter) * dir * 40 * mo}px)`,
                }}
              >
                <span className="platform-glyph" aria-hidden="true">
                  {plat.glyph}
                </span>
                <span className="platform-name">{plat.name}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
