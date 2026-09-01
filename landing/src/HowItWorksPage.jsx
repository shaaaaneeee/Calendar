import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import Nav from './components/Nav';
import Footer from './sections/Footer';
import { CHROME_STORE_URL } from './data/content';
import './landing.css';

const STEPS = [
  {
    number: '01',
    title: 'PlanWise watches for plans as you type',
    desc: "The detection engine reads only the message you're composing — never anyone else's — and flags dates, times, and places the moment you write them. Trigger words and sensitivity are yours to tune in Settings.",
    image: '/how-it-works/2-settings-detection.png',
    alt: 'PlanWise settings screen showing detection sensitivity and trigger words',
  },
  {
    number: '02',
    title: 'One click turns it into a real event',
    desc: 'A plan gets flagged, the popup shows the extracted title, date, time, and location — already filled in and editable. No retyping, no switching tabs to open a calendar.',
    image: '/how-it-works/1-popup-detected-plan.png',
    alt: 'PlanWise popup showing a detected plan ready to add to the calendar',
  },
  {
    number: '03',
    title: 'It lands on one shared calendar',
    desc: 'Every confirmed plan shows up on the PlanWise dashboard — a real month view your whole group can see, alongside anything else you have coming up.',
    image: '/how-it-works/3-dashboard-month-view.png',
    alt: 'PlanWise dashboard month view showing upcoming plans',
  },
];

export default function HowItWorksPage() {
  return (
    <div className="landing">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Nav />
      <main id="main-content">
        <section className="hiw-hero">
          <div className="hiw-hero__inner">
            <div className="hero-copy__meta">
              <span className="meta-rule" aria-hidden="true" />
              <span>HOW IT WORKS</span>
            </div>
            <h1 className="section-title" style={{ marginTop: '0.85rem' }}>From a stray message to a synced plan.</h1>
            <p className="section-intro">
              Three steps, no manual data entry. Here&apos;s exactly what that looks like inside PlanWise.
            </p>
          </div>
        </section>

        {STEPS.map((step) => (
          <section key={step.number} className="hiw-step">
            <div className="hiw-step__shot">
              <img src={step.image} alt={step.alt} loading="lazy" />
            </div>
            <div className="hiw-step__copy">
              <span className="how-step__number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.desc}</p>
            </div>
          </section>
        ))}

        <section className="hiw-step">
          <div className="hiw-step__shot hiw-step__shot--pair">
            <img src="/how-it-works/4-groups-rsvp.png" alt="PlanWise group with shared events and RSVP status" loading="lazy" />
            <img src="/how-it-works/5-tasks-kanban.png" alt="PlanWise tasks board in a kanban layout" loading="lazy" />
          </div>
          <div className="hiw-step__copy">
            <span className="how-step__number">04</span>
            <h3>Plus groups and tasks</h3>
            <p>
              Share a plan with a group and everyone can RSVP and comment right on the event. PlanWise also
              tracks tasks separately, so deadlines and plans live side by side without getting mixed up.
            </p>
          </div>
        </section>

        <section className="hiw-cta">
          <a href={CHROME_STORE_URL} target="_blank" rel="noreferrer" className="button button--primary">
            <span>Add to Chrome — it&apos;s free</span>
            <ArrowUpRight size={17} strokeWidth={1.8} aria-hidden="true" />
          </a>
        </section>
      </main>
      <Footer />
    </div>
  );
}
