import React from 'react';
import { clamp, easeOutCubic, ACCENT, PRIMARY, ON_PRIMARY } from '../utils';

/**
 * Animated chat demo shown in the hero.
 * All animation is driven by `demoT` (0–9500ms, cycling) so the parent
 * controls the clock and this component stays pure / easy to test.
 */
export default function ChatDemo({ demoT, reducedMotion }) {
  /** Fade-in style for each message bubble */
  const msgStyle = (threshold) => {
    const v = reducedMotion ? 1 : easeOutCubic(clamp((demoT - threshold) / 260, 0, 1));
    return {
      opacity: v,
      transform: `translateY(${(1 - v) * 14}px)`,
    };
  };

  const highlightOn = demoT > 3600 && demoT < 8800;
  const markStyle = {
    padding: '0 3px',
    background: highlightOn ? ACCENT : 'transparent',
    color: highlightOn ? '#1A1C1C' : 'inherit',
    transition: 'background 0.4s var(--ease-out), color 0.4s var(--ease-out)',
  };

  const stripV = reducedMotion ? 1 : easeOutCubic(clamp((demoT - 4600) / 260, 0, 1));
  const stripVisible = demoT > 4600 && demoT < 8800;

  const cardV = reducedMotion ? 1 : easeOutCubic(clamp((demoT - 5600) / 320, 0, 1));
  const cardVisible = demoT > 5600 && demoT < 8800;

  return (
    <div className="demo-shell">
      {/* Title bar */}
      <div className="demo-titlebar">
        <div className="traffic-lights" aria-hidden="true">
          <span className="tl-dot tl-dot--red"    />
          <span className="tl-dot tl-dot--yellow" />
          <span className="tl-dot tl-dot--green"  />
        </div>
        <span className="demo-platform-label">WhatsApp Web</span>
      </div>

      {/* Chat body */}
      <div className="demo-body" aria-label="Simulated chat conversation">
        <div className="demo-contact-row">
          <div className="demo-avatar" aria-hidden="true">A</div>
          <span className="demo-contact-name">Alex Rivera</span>
        </div>

        <div className="msg msg--in" style={msgStyle(250)}>
          <div className="bubble bubble--in">
            Hey, wanna grab dinner this weekend?
          </div>
        </div>

        <div className="msg msg--out" style={msgStyle(1300)}>
          <div className="bubble bubble--out">
            Yeah! Let's do <mark style={markStyle}>Saturday</mark> at{' '}
            <mark style={markStyle}>7</mark>
          </div>
        </div>

        <div className="msg msg--in" style={msgStyle(2350)}>
          <div className="bubble bubble--in">Perfect, see you then</div>
        </div>

        {/* Detection strip */}
        <div
          className="plan-strip"
          style={{
            opacity:   stripVisible ? stripV : 0,
            transform: `translateY(${(1 - stripV) * 8}px)`,
            animation: stripVisible ? 'pw-pulse 1.6s cubic-bezier(0.37, 0, 0.63, 1) 1' : 'none',
          }}
          aria-live="polite"
          aria-atomic="true"
        >
          Plan detected
        </div>

        {/* Extracted event card */}
        <div
          className="event-card"
          style={{
            opacity:   cardVisible ? cardV : 0,
            transform: `translateY(${(1 - cardV) * 20}px)`,
          }}
          aria-hidden={!cardVisible}
        >
          <div
            className="event-card-icon"
            style={{ background: PRIMARY, color: ON_PRIMARY }}
            aria-hidden="true"
          >
            ＋
          </div>
          <div className="event-card-info">
            <div className="event-card-title">Dinner</div>
            <div className="event-card-meta">Saturday · 7:00 PM</div>
          </div>
          <button
            type="button"
            className="event-card-add"
            tabIndex={cardVisible ? 0 : -1}
          >
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
