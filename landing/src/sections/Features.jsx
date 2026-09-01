import React from 'react';
import { ArrowUpRight, ScanLine, CalendarDays, UsersRound, MessageCircleMore } from 'lucide-react';
import { FEATURES } from '../data/content';
import SectionHeader from '../components/SectionHeader';
import { clamp, easeOutCubic, runwayHeight, stickyStyle } from '../utils';

const ICONS = [ScanLine, CalendarDays, UsersRound, MessageCircleMore];

export default function Features({ wrapRef, anim, reducedMotion }) {
  const { features, isMobile } = anim;
  const height = runwayHeight(200, isMobile, reducedMotion);

  return (
    <section ref={wrapRef} id="features" className="editorial-runway editorial-runway--mist" style={{ height }} aria-label="Features">
      <div className="section-sticky" style={reducedMotion ? { position: 'relative', minHeight: '100vh' } : stickyStyle(features.mode)}>
        <div className="section-shell features-shell">
          <div className="features-heading-row">
            <SectionHeader
              index="03"
              eyebrow="FEATURES"
              title="Built for groups that plan in chat."
              intro="A small, focused toolkit for turning a passing idea into a plan everyone can see."
            />
            <a href="#platforms" className="section-jump" aria-label="Continue to platforms">
              <span>CONTINUE</span>
              <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
            </a>
          </div>
          <div className="features-layout">
            <div className="feature-grid">
              {FEATURES.map((feature, index) => {
                const Icon = ICONS[index];
                const start = index * 0.18;
                // Mobile drops the scroll-pin (see utils.js stickyStyle) - reveal
                // animations tied to that progress can get stuck invisible there,
                // so mobile gets the same "just show it" treatment as reducedMotion.
                const enter = reducedMotion || isMobile ? 1 : easeOutCubic(clamp((features.progress - start) / 0.48));
                return (
                  <article
                    key={feature.label}
                    className={`feature-tile feature-tile--${index + 1}`}
                    style={{ opacity: enter, ...(enter >= 1 ? {} : { transform: `translateY(${(1 - enter) * 20}px)` }) }}
                  >
                    <div className="feature-tile__topline">
                      <span className="feature-tile__index">0{index + 1}</span>
                      <Icon size={18} strokeWidth={1.7} aria-hidden="true" />
                    </div>
                    <p className="feature-tile__label">{feature.label}</p>
                    <h3>{feature.title}</h3>
                    <p className="feature-tile__desc">{feature.desc}</p>
                  </article>
                );
              })}
            </div>
            <div className="feature-visual">
              <div className="feature-visual__art" aria-hidden="true">
                <span className="feature-visual__art-rail" />
                <span className="feature-visual__art-tab">PLAN / 01</span>
                <span className="feature-visual__art-card">Saturday<br /><small>7:00 PM · Shared</small></span>
                <span className="feature-visual__art-square" />
              </div>
              <div className="feature-visual__caption">
                <span>THE GOOD STUFF</span>
                <span>quietly in the right place</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
