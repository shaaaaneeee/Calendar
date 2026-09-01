import React, { useState } from 'react';
import { Check, Plus } from 'lucide-react';
import { clamp, easeOutCubic } from '../utils';

/**
 * Animated + interactive chat demo shown in the hero.
 * Message/highlight timing is driven by `demoT` (0–9500ms, cycling) so the
 * parent controls the clock; the date field and Capture button are real
 * local state so a visitor can actually try the interaction.
 */
export default function ChatDemo({ demoT, reducedMotion }) {
  const [added, setAdded] = useState(false);
  const [eventDate, setEventDate] = useState('2026-09-12');

  const messageStyle = (threshold) => {
    const value = reducedMotion ? 1 : easeOutCubic(clamp((demoT - threshold) / 260));
    return { opacity: value, transform: `translateY(${(1 - value) * 14}px)` };
  };

  const highlightOn = demoT > 3600 && demoT < 8800;
  const cardVisible = demoT > 5600 && demoT < 8800;
  const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(
    new Date(`${eventDate}T12:00:00`)
  );

  return (
    <div className="chat-demo" aria-label="Interactive PlanWise chat detection demo">
      <div className="chat-demo__topbar">
        <div className="chat-demo__window-controls" aria-hidden="true"><span /><span /><span /></div>
        <div className="chat-demo__app-label"><span className="status-dot" aria-hidden="true" />WhatsApp Web</div>
        <div className="chat-demo__counter">LIVE / 01</div>
      </div>
      <div className="chat-demo__body">
        <div className="chat-demo__contact">
          <div className="chat-demo__avatar" aria-hidden="true">A</div>
          <div>
            <div className="chat-demo__contact-name">Alex Rivera</div>
            <div className="chat-demo__contact-status">typing a plan</div>
          </div>
          <span className="chat-demo__menu" aria-hidden="true">•••</span>
        </div>
        <div className="chat-demo__messages" aria-live="polite">
          <div className="chat-message chat-message--in" style={messageStyle(250)}>
            <div className="chat-bubble chat-bubble--in">Hey, wanna grab dinner this weekend?</div>
            <span className="chat-message__time">6:42</span>
          </div>
          <div className="chat-message chat-message--out" style={messageStyle(1300)}>
            <div className="chat-bubble chat-bubble--out">
              Yeah! Let&apos;s do <mark className={highlightOn ? 'chat-mark chat-mark--active' : 'chat-mark'}>Saturday</mark> at{' '}
              <mark className={highlightOn ? 'chat-mark chat-mark--active' : 'chat-mark'}>7</mark>
            </div>
            <span className="chat-message__time">6:43</span>
          </div>
          <div className="chat-message chat-message--in" style={messageStyle(2350)}>
            <div className="chat-bubble chat-bubble--in">Perfect, see you then</div>
            <span className="chat-message__time">6:43</span>
          </div>
        </div>
        <div
          className="plan-strip"
          style={{ opacity: cardVisible || added ? 1 : 0, transform: `translateY(${cardVisible || added ? 0 : 8}px)` }}
          aria-hidden={!cardVisible && !added}
        >
          <span className="plan-strip__pulse" aria-hidden="true" />
          {added ? 'Plan captured' : 'Plan detected'}
          <span className="plan-strip__meta">2 entities</span>
        </div>
        <div
          className={`event-card ${added ? 'event-card--success' : ''}`}
          style={{ opacity: cardVisible || added ? 1 : 0, transform: `translateY(${cardVisible || added ? 0 : 20}px)` }}
          aria-hidden={!cardVisible && !added}
        >
          <div className="event-card__icon" aria-hidden="true">
            {added ? <Check size={18} strokeWidth={2.5} /> : <Plus size={18} strokeWidth={2} />}
          </div>
          <div className="event-card__info">
            <div className="event-card__eyebrow">{added ? 'ADDED TO SHARED CALENDAR' : 'NEW EVENT'}</div>
            <div className="event-card__title">Dinner</div>
            <div className="event-card__meta">{formattedDate} · 7:00 PM · Shared</div>
          </div>
          <button
            type="button"
            className={`event-card__add ${added ? 'event-card__add--added' : ''}`}
            tabIndex={cardVisible || added ? 0 : -1}
            onClick={() => setAdded(true)}
          >
            {added ? <><Check size={13} strokeWidth={2.5} /> Captured</> : 'Capture'}
          </button>
        </div>
        <label className="chat-demo__date">
          Choose a date
          <input
            type="date"
            value={eventDate}
            onChange={(event) => { setEventDate(event.target.value); setAdded(false); }}
          />
        </label>
      </div>
      <div className="chat-demo__footer"><span>PlanWise extension</span><span className="chat-demo__footer-line" aria-hidden="true" /><span>Privacy first</span></div>
    </div>
  );
}
