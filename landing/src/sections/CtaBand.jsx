import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { CHROME_STORE_URL } from '../data/content';

export default function CtaBand({ wrapRef, anim, reducedMotion }) {
  const visible = reducedMotion || anim.ctaIn;
  return (
    <section ref={wrapRef} id="cta" className="cta-band" aria-label="Call to action">
      <div className={`cta-band__inner ${visible ? 'cta-band__inner--visible' : ''}`}>
        <div className="cta-band__index">05</div>
        <div className="cta-band__copy">
          <p className="section-kicker section-kicker--inverse">GET PLANWISE</p>
          <h2>Stop scrolling back to find the date.</h2>
          <p className="cta-band__body">Keep the conversation moving. PlanWise keeps the plan moving with it.</p>
        </div>
        <div className="cta-band__action">
          <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" className="button button--light">
            <span>Add to Chrome, it&apos;s free</span>
            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </a>
          <p>Free · Manifest V3 · No account required to start</p>
        </div>
      </div>
    </section>
  );
}
