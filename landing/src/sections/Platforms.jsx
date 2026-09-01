import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { PLATFORMS } from '../data/content';
import SectionHeader from '../components/SectionHeader';
import { clamp, easeOutCubic, runwayHeight, stickyStyle } from '../utils';

export default function Platforms({ wrapRef, anim, reducedMotion }) {
  const { platforms, isMobile } = anim;
  const height = runwayHeight(160, isMobile, reducedMotion);

  return (
    <section ref={wrapRef} id="platforms" className="editorial-runway editorial-runway--warm" style={{ height }} aria-label="Supported platforms">
      <div className="section-sticky" style={reducedMotion ? { position: 'relative', minHeight: '100vh' } : stickyStyle(platforms.mode)}>
        <div className="section-shell platforms-shell">
          <SectionHeader
            index="04"
            eyebrow="WORKS WHERE YOU ALREADY TALK"
            title="Three inboxes. One calendar."
            intro="PlanWise meets people in the tools they already open every day."
          />
          <div className="platforms-layout">
            <div className="platforms-list">
              {PLATFORMS.map((platform, index) => {
                const start = index * 0.22;
                // Mobile drops the scroll-pin (see utils.js stickyStyle) - reveal
                // animations tied to that progress can get stuck invisible there,
                // so mobile gets the same "just show it" treatment as reducedMotion.
                const enter = reducedMotion || isMobile ? 1 : easeOutCubic(clamp((platforms.progress - start) / 0.5));
                const direction = index % 2 === 0 ? -1 : 1;
                return (
                  <a
                    key={platform.name}
                    href="#cta"
                    className={`platform-row platform-row--${platform.tone}`}
                    style={{ opacity: enter, ...(enter >= 1 ? {} : { transform: `translateX(${(1 - enter) * direction * 34}px)` }) }}
                  >
                    <span className="platform-row__glyph" aria-hidden="true">{platform.glyph}</span>
                    <span className="platform-row__name">{platform.name}</span>
                    <span className="platform-row__desc">Plans caught as you type</span>
                    <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
                  </a>
                );
              })}
            </div>
            <div className="platforms-note">
              <div className="platforms-note__art" aria-hidden="true">
                <span className="platforms-note__art-line platforms-note__art-line--one" />
                <span className="platforms-note__art-line platforms-note__art-line--two" />
                <span className="platforms-note__art-block platforms-note__art-block--moss" />
                <span className="platforms-note__art-block platforms-note__art-block--clay" />
                <span className="platforms-note__art-block platforms-note__art-block--vermilion" />
              </div>
              <p><span>05 / 05</span> The best tools disappear into the rhythm you already have.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
