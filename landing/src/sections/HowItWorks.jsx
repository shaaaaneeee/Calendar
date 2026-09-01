import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { HOW_STEPS } from '../data/content';
import SectionHeader from '../components/SectionHeader';
import { clamp, easeOutCubic, runwayHeight, stickyStyle } from '../utils';

export default function HowItWorks({ wrapRef, anim, reducedMotion }) {
  const { how, isMobile } = anim;
  const progress = how.progress;
  const motionFactor = reducedMotion ? 0 : isMobile ? 0.55 : 1;
  const height = runwayHeight(220, isMobile, reducedMotion);

  return (
    <section ref={wrapRef} id="how" className="editorial-runway" style={{ height }} aria-label="How it works">
      <div className="section-sticky" style={reducedMotion ? { position: 'relative', minHeight: '100vh' } : stickyStyle(how.mode)}>
        <div className="section-shell how-shell">
          <SectionHeader
            index="02"
            eyebrow="HOW IT WORKS"
            title="From a stray message to a synced plan."
            intro="The quiet handoff between conversation and coordination."
          />
          <div className="how-content">
            <div className="how-aside">
              <span className="how-aside__line" aria-hidden="true" />
              <p>Less tab-switching. More time in the moment.</p>
              <a href="#features" className="text-link text-link--small">See what&apos;s included <ArrowUpRight size={14} strokeWidth={1.8} aria-hidden="true" /></a>
            </div>
            <div className="how-list" role="list">
              {HOW_STEPS.map((step, index) => {
                const start = index / 3;
                const local = clamp((progress - start) / (1 / 3 + 0.0001));
                const enter = reducedMotion ? 1 : easeOutCubic(clamp(local * 1.18));
                const style = {
                  opacity: enter,
                  ...(enter >= 1 ? {} : { transform: `translateY(${(1 - enter) * 28 * motionFactor}px)` }),
                };
                return (
                  <article key={step.number} className="how-step" style={style} role="listitem">
                    <div className="how-step__topline">
                      <span className="how-step__number">{step.number}</span>
                      <span className="how-step__bar" aria-hidden="true" />
                      <span className="how-step__verb">{index === 0 ? 'READ' : index === 1 ? 'SHAPE' : 'SHARE'}</span>
                    </div>
                    <h3>{step.title}</h3>
                    <p>{step.desc}</p>
                    <span className="how-step__marker" aria-hidden="true">↳</span>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
