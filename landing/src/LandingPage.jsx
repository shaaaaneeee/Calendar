import React, { useRef } from 'react';
import { useReducedMotion }   from './hooks/useReducedMotion';
import { useScrollAnimation } from './hooks/useScrollAnimation';
import Nav        from './components/Nav';
import Hero       from './sections/Hero';
import HowItWorks from './sections/HowItWorks';
import Features   from './sections/Features';
import Platforms  from './sections/Platforms';
import CtaBand    from './sections/CtaBand';
import Footer     from './sections/Footer';
import './landing.css';

export default function LandingPage() {
  const heroRef      = useRef(null);
  const howRef       = useRef(null);
  const featuresRef  = useRef(null);
  const platformsRef = useRef(null);
  const ctaRef       = useRef(null);

  const reducedMotion = useReducedMotion();
  const anim = useScrollAnimation({
    heroRef, howRef, featuresRef, platformsRef, ctaRef,
  });

  return (
    <div className="landing">
      <a href="#main-content" className="skip-link">Skip to main content</a>

      <Nav anim={anim} />

      <main id="main-content">
        <Hero
          wrapRef={heroRef}
          anim={anim}
          reducedMotion={reducedMotion}
        />
        <HowItWorks
          wrapRef={howRef}
          anim={anim}
          reducedMotion={reducedMotion}
        />
        <Features
          wrapRef={featuresRef}
          anim={anim}
          reducedMotion={reducedMotion}
        />
        <Platforms
          wrapRef={platformsRef}
          anim={anim}
          reducedMotion={reducedMotion}
        />
        <CtaBand
          wrapRef={ctaRef}
          anim={anim}
          reducedMotion={reducedMotion}
        />
      </main>

      <Footer />
    </div>
  );
}
