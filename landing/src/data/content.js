export const CHROME_STORE_URL = 'https://chromewebstore.google.com/search/PlanWise';

export const NAV_LINKS = [
  { label: 'How it works', href: '#how' },
  { label: 'Features', href: '#features' },
  { label: 'Platforms', href: '#platforms' },
];

export const HOW_STEPS = [
  {
    number: '01',
    title: 'Detect',
    desc: "PlanWise reads the message you're composing — never messages from anyone else — and flags dates, times, and places the moment you write them.",
  },
  {
    number: '02',
    title: 'Extract',
    desc: 'One click pulls the plan into a clean event card — title, time, location — no retyping.',
  },
  {
    number: '03',
    title: 'Sync',
    desc: 'It lands on a shared calendar with your group, ready for RSVPs and live comments.',
  },
];

export const FEATURES = [
  {
    label: 'DETECT',
    title: 'Automatic detection',
    desc: 'No copy-paste. PlanWise parses natural language as you type it, across WhatsApp, Telegram, and Gmail.',
  },
  {
    label: 'CALENDAR',
    title: 'Shared calendar',
    desc: 'Every plan lands in one place your whole group can see and edit.',
  },
  {
    label: 'RSVP',
    title: 'RSVPs built in',
    desc: "Everyone marks yes, no, or maybe without leaving the thread.",
  },
  {
    label: 'COMMENTS',
    title: 'Live comments',
    desc: "Coordinate details — who's driving, what to bring — right on the event.",
  },
];

export const PLATFORMS = [
  { name: 'WhatsApp Web', glyph: '◈', tone: 'moss' },
  { name: 'Telegram Web', glyph: '▶', tone: 'clay' },
  { name: 'Gmail', glyph: '✉', tone: 'vermilion' },
];

export const FOOTER_LINKS = [
  { label: 'Privacy', href: '/privacy.html' },
  { label: 'Terms', href: 'https://planwise.app/terms' },
  { label: 'Contact', href: 'mailto:hello@planwise.app' },
];
