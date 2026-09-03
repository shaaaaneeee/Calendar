import React from 'react';
import { Link } from 'react-router-dom';
import { useDocumentHead } from './hooks/useDocumentHead';
import './privacy.css';

export default function PrivacyPage() {
  useDocumentHead({
    title: 'Privacy Policy — PlanWise',
    description: 'PlanWise privacy policy — what we read, what we store, and what never leaves your device.',
  });

  return (
    <div className="privacy-page">
      <header>
        <Link className="logo" to="/"><span className="dot" aria-hidden="true" />PlanWise</Link>
        <Link className="back-link" to="/">← Back to home</Link>
      </header>

      <main>
        <p className="eyebrow">Legal</p>
        <h1>Privacy Policy</h1>
        <p className="updated">Last updated: August 30, 2026</p>

        <div className="tldr">
          <p className="tldr-label">The short version</p>
          <ul>
            <li>PlanWise reads text <strong>only in your own compose box</strong> — WhatsApp Web, Telegram Web, or Gmail — as you type it, before you send it. It never reads messages from other people.</li>
            <li>Every message it analyzes is checked <strong>on your device</strong>. Nothing is sent to our servers unless you explicitly confirm a detected plan.</li>
            <li>We don't use advertising or tracking software, and we don't sell your data.</li>
          </ul>
        </div>

        <h2>What PlanWise reads</h2>
        <p>PlanWise is a browser extension that watches the text box you're typing into on supported sites (WhatsApp Web, Telegram Web, Gmail) and checks whether the message you're composing looks like you're proposing a plan — a time, a place, a person, an activity. It does this the moment you type, before you send anything, the same way a spell-checker reads your draft.</p>
        <p><strong>It only ever reads your own compose box.</strong> It does not read, store, or transmit messages sent to you by anyone else, and it does not read any other content on the page.</p>

        <h2>What we store, and where</h2>

        <h3>On your device only</h3>
        <p>Each message you type is analyzed in memory as you type it and is not retained afterward unless it looks like a plan. When PlanWise thinks it's found one, the extracted details are held in your browser's local extension storage (<code>chrome.storage.local</code>) only until you review it in the popup and either confirm or dismiss it. <strong>None of this ever leaves your device</strong> at this stage — it is not transmitted to us or anyone else.</p>

        <h3>Synced to our servers — only when you confirm a plan</h3>
        <p>When PlanWise detects a plan, it shows you a card with the extracted details (title, date, time, location, people, notes) before anything is saved anywhere. Nothing is sent to our servers at this stage. Only if you click <strong>Add</strong> do we store that specific event — including the original message text for that one plan — in our database (hosted on Supabase), tied to your account.</p>

        <h3>Account &amp; settings</h3>
        <p>Creating an account requires an email and password, handled via Supabase Auth. Any custom words you configure (trigger words, activity words, place words, custom names, items) are stored locally immediately and synced to our servers when you save your settings, so they carry across devices.</p>

        <h3>Groups &amp; sharing</h3>
        <p>If you choose to share a confirmed event with a group you've created or joined, the event's details (not your original message text) become visible to that group's other members, along with any RSVP or comments you or they add.</p>

        <h2>What we don't do</h2>
        <ul>
          <li>We don't read messages sent to you by other people.</li>
          <li>We don't read anything outside the text box you're actively composing in.</li>
          <li>We don't use advertising networks, third-party analytics, or tracking pixels.</li>
          <li>We don't sell, rent, or share your data with third parties for marketing purposes.</li>
        </ul>

        <h2>Data security</h2>
        <p>Confirmed events, account info, and settings are stored in a Postgres database on Supabase, protected by row-level security policies that restrict every query to the signed-in user's own data (and, where explicitly shared, their group members'). Unconfirmed message text never reaches this database at all — it stays in your browser's local storage.</p>

        <h2>Your controls</h2>
        <ul>
          <li><strong>Pending detections:</strong> confirm or dismiss them from the extension popup — dismissed ones are discarded immediately.</li>
          <li><strong>Confirmed events:</strong> edit or delete them from the calendar dashboard.</li>
          <li><strong>Account data:</strong> to request deletion of your account and associated data, contact us at planwisecalendar@gmail.com.</li>
        </ul>

        <h2>Children's privacy</h2>
        <p>PlanWise is not directed at, and we do not knowingly collect information from, children under 13.</p>

        <h2>Changes to this policy</h2>
        <p>If this policy changes, we'll update the date at the top of this page. Material changes will be noted in the extension's release notes.</p>

        <h2>Contact</h2>
        <p>Questions about this policy or your data can be sent to planwisecalendar@gmail.com.</p>

        <hr className="divider" />
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--muted)' }}>
          This policy describes PlanWise's Chrome extension as of the date above. Future PlanWise apps on other platforms (desktop, iOS, Android) will link to their own version of this policy reflecting how they read text on that platform.
        </p>
      </main>

      <footer>
        © 2026 PlanWise.
      </footer>
    </div>
  );
}
