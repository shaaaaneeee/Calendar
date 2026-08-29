import React from 'react';
import ChatDemo from '../components/ChatDemo';
import { clamp, lerp, stickyStyle, runwayHeight, easeInOutSine } from '../utils';

export default function Hero({ wrapRef, anim, reducedMotion }) {
  const { hero, demoT, isMobile } = anim;
  const p  = easeInOutSine(hero.progress);
  const mo = reducedMotion ? 0 : (isMobile ? 0.55 : 1);

  // Hero content fades out and lifts as you scroll into its runway
  const heroFade  = reducedMotion ? 1 : clamp(1 - p * 1.1, 0, 1);
  const heroLift  = reducedMotion ? 0 : -p * 60 * mo;
  const heroScale = reducedMotion ? 1 : 1 - p * 0.06 * mo;

  // Chat demo tilts in 3-D and lifts independently
  const chatRot  = reducedMotion ? 0 : lerp(6, -4, p) * mo;
  const chatLift = reducedMotion ? 0 : -p * 90 * mo;

  const height = runwayHeight(160, isMobile, reducedMotion);

  const innerStyle = reducedMotion
    ? { position: 'relative', height: '100vh' }
    : stickyStyle(hero.mode);

  return (
    <div ref={wrapRef} className="hero-wrap" style={{ height }}>
      <div
        className="hero-sticky"
        style={innerStyle}
        aria-label="Hero"
      >
        <div
          className="hero-inner"
          style={{
            opacity:   heroFade,
            transform: `translateY(${heroLift}px) scale(${heroScale})`,
          }}
        >
          {/* Left: copy */}
          <div className="hero-left">
            <p className="eyebrow">CHROME EXTENSION — MV3</p>
            <h1 className="hero-headline">
              Every plan in your chats,<br />
              highlighted automatically.
            </h1>
            <p className="hero-sub">
              PlanWise reads the message you&apos;re typing in WhatsApp, Telegram,
              or Gmail — never anyone else&apos;s. The moment you write a date,
              it&apos;s captured to one shared calendar with RSVPs and live comments.
            </p>
            <div className="hero-cta-row">
              <a href="#cta" className="btn-primary">
                Add to Chrome — it&apos;s free
              </a>
              <a href="#how" className="btn-secondary">
                See how it works ↓
              </a>
            </div>
          </div>

          {/* Right: animated demo */}
          <div className="hero-right" style={{ perspective: 1200 }}>
            <div
              style={{
                transform: `rotateY(${chatRot}deg) translateY(${chatLift}px)`,
                width: '100%',
                maxWidth: 420,
              }}
            >
              <ChatDemo demoT={demoT} reducedMotion={reducedMotion} />
            </div>
          </div>
        </div>

        <p
          className="scroll-hint"
          aria-hidden="true"
          style={{ opacity: reducedMotion ? 0 : clamp(1 - p * 3, 0, 1) }}
        >
          SCROLL
        </p>
      </div>
    </div>
  );
}
