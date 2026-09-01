import React from 'react';
import { ArrowDown, ArrowUpRight } from 'lucide-react';
import ChatDemo from '../components/ChatDemo';
import { CHROME_STORE_URL } from '../data/content';
import { clamp, easeInOutSine, lerp, runwayHeight, stickyStyle } from '../utils';

export default function Hero({ wrapRef, anim, reducedMotion }) {
  const { hero, demoT, isMobile } = anim;
  const progress = easeInOutSine(hero.progress);
  const motionFactor = reducedMotion ? 0 : isMobile ? 0.55 : 1;
  const opacity = reducedMotion ? 1 : clamp(1 - progress * 1.1);
  const lift = reducedMotion ? 0 : -progress * 46 * motionFactor;
  const scale = reducedMotion ? 1 : 1 - progress * 0.035 * motionFactor;
  const height = runwayHeight(82, isMobile, reducedMotion);
  const chatRotation = reducedMotion ? 0 : lerp(4, -3, progress) * motionFactor;
  const chatLift = reducedMotion ? 0 : -progress * 55 * motionFactor;

  return (
    <div ref={wrapRef} className="hero-runway" style={{ height }}>
      <div
        className="hero-sticky"
        style={reducedMotion ? { position: 'relative', minHeight: '100vh' } : stickyStyle(hero.mode)}
        aria-label="PlanWise introduction"
      >
        <div className="hero-inner" style={{ opacity, transform: `translateY(${lift}px) scale(${scale})` }}>
          <div className="hero-copy">
            <div className="hero-copy__meta">
              <span className="meta-rule" aria-hidden="true" />
              <span>CHROME EXTENSION / MV3</span>
              <span className="meta-index">01—05</span>
            </div>
            <h1 className="hero-title">Every plan in your chats, <em>highlighted automatically.</em></h1>
            <p className="hero-subtitle">
              PlanWise reads the message you&apos;re typing in WhatsApp, Telegram, or Gmail — never
              anyone else&apos;s. The moment you write a date, it&apos;s captured to one shared calendar
              with RSVPs and live comments.
            </p>
            <div className="hero-actions">
              <a href="#cta" className="button button--primary">
                <span>Add to Chrome — it&apos;s free</span>
                <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
              </a>
              <a href="#how" className="text-link">See how it works <ArrowDown size={15} strokeWidth={1.8} aria-hidden="true" /></a>
            </div>
            <div className="hero-footnote">
              <span className="hero-footnote__dot" aria-hidden="true" />
              <span>Private by default</span>
              <span className="hero-footnote__separator" aria-hidden="true" />
              <span>No account required to start</span>
            </div>
          </div>
          <div className="hero-visual" style={{ perspective: 1200 }}>
            <div className="hero-visual__wash" aria-hidden="true" />
            <div className="hero-visual__caption" aria-hidden="true"><span>01</span><span>message → plan</span></div>
            <div className="hero-chat" style={{ transform: `rotateY(${chatRotation}deg) translateY(${chatLift}px)` }}>
              <ChatDemo demoT={demoT} reducedMotion={reducedMotion} />
            </div>
          </div>
        </div>
        <div className="hero-scroll-cue" aria-hidden="true"><span>SCROLL TO EXPLORE</span><span className="hero-scroll-cue__line" /></div>
      </div>
    </div>
  );
}
