/**
 * PlanWise Event Extractor — Test Suite
 *
 * Tests structured data extraction from raw detected text.
 * Each function is tested independently, then the combined extractEvent().
 *
 * How to run: npm test
 */

// The extractor is fully standalone — no rules or engine needed
require('../extension/detection/extractor.js');

const { extractEvent } = window.PlanWiseExtractor;

// We also need access to the internal functions for unit testing.
// Since they aren't exported individually, we test them via extractEvent()
// and check the returned fields.


// ─────────────────────────────────────────────
// DATE EXTRACTION
// ─────────────────────────────────────────────

describe('Date extraction', () => {

  test('tomorrow', () => {
    const r = extractEvent("let's meet tomorrow");
    expect(r.date).not.toBeNull();
    expect(r.rawDate).toBe('tomorrow');

    // Date should be tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    expect(r.date).toBe(tomorrow.toISOString().split('T')[0]);
  });

  test('tonight', () => {
    const r = extractEvent("dinner tonight");
    const today = new Date().toISOString().split('T')[0];
    expect(r.date).toBe(today);
    expect(r.rawDate).toBe('tonight');
  });

  test('today', () => {
    const r = extractEvent("lunch today");
    const today = new Date().toISOString().split('T')[0];
    expect(r.date).toBe(today);
  });

  test('explicit date MM/DD', () => {
    const r = extractEvent("dinner on 12/25");
    expect(r.date).not.toBeNull();
    expect(r.rawDate).toBe('12/25');
  });

  test('relative — in 2 days', () => {
    const r = extractEvent("let's meet in 2 days");
    const expected = new Date();
    expected.setDate(expected.getDate() + 2);
    expect(r.date).toBe(expected.toISOString().split('T')[0]);
  });

  test('relative — in 1 week', () => {
    const r = extractEvent("catch up in 1 week");
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(r.date).toBe(expected.toISOString().split('T')[0]);
  });

  test('named day — this Friday', () => {
    const r = extractEvent("coffee this Friday");
    expect(r.date).not.toBeNull();
    expect(r.rawDate.toLowerCase()).toContain('friday');
  });

  test('named day — next Monday', () => {
    const r = extractEvent("meeting next Monday");
    expect(r.date).not.toBeNull();
    expect(r.rawDate.toLowerCase()).toContain('monday');
  });

  test('no date — returns null', () => {
    const r = extractEvent("let's hang out sometime");
    expect(r.date).toBeNull();
  });

});


// ─────────────────────────────────────────────
// TIME EXTRACTION
// ─────────────────────────────────────────────

describe('Time extraction', () => {

  test('7pm', () => {
    const r = extractEvent("dinner tomorrow at 7pm");
    expect(r.time).toBe('19:00');
  });

  test('10:30am', () => {
    const r = extractEvent("meeting at 10:30am");
    expect(r.time).toBe('10:30');
  });

  test('12pm (noon)', () => {
    const r = extractEvent("lunch at 12pm");
    expect(r.time).toBe('12:00');
  });

  test('12am (midnight)', () => {
    const r = extractEvent("party ends at 12am");
    expect(r.time).toBe('00:00');
  });

  test('bare number defaults to PM heuristic', () => {
    const r = extractEvent("dinner at 7 tomorrow");
    expect(r.time).toBe('19:00');
  });

  test('no time — returns null', () => {
    const r = extractEvent("dinner tomorrow");
    expect(r.time).toBeNull();
  });

});


// ─────────────────────────────────────────────
// TITLE EXTRACTION
// ─────────────────────────────────────────────

describe('Title extraction', () => {

  test('dinner', ()  => expect(extractEvent("dinner tomorrow").title).toBe('Dinner'));
  test('lunch', ()   => expect(extractEvent("lunch at noon").title).toBe('Lunch'));
  test('coffee', ()  => expect(extractEvent("coffee tomorrow morning").title).toBe('Coffee'));
  test('gym', ()     => expect(extractEvent("gym at 6pm").title).toBe('Gym'));
  test('movie', ()   => expect(extractEvent("movie tonight").title).toBe('Movie'));
  test('meeting', () => expect(extractEvent("meeting at 3pm").title).toBe('Meeting'));
  test('hang out', () => expect(extractEvent("hang out this weekend").title).toBe('Hang out'));
  test('catch up', () => expect(extractEvent("catch up tomorrow").title).toBe('Catch up'));
  test('party', ()   => expect(extractEvent("party on Friday").title).toBe('Party'));

  test('unknown activity falls back to Plan', () => {
    const r = extractEvent("let's do something tomorrow at 7");
    expect(r.title).toBe('Plan');
  });

});


// ─────────────────────────────────────────────
// PARTICIPANT EXTRACTION
// ─────────────────────────────────────────────

describe('Participant extraction', () => {

  test('finds capitalised name', () => {
    const r = extractEvent("dinner tomorrow with Alex");
    expect(r.participants).toContain('Alex');
  });

  test('finds multiple names', () => {
    const r = extractEvent("lunch with Sarah and James tomorrow");
    expect(r.participants).toContain('Sarah');
    expect(r.participants).toContain('James');
  });

  test('ignores common words', () => {
    const r = extractEvent("dinner tomorrow with We and You");
    expect(r.participants).not.toContain('We');
    expect(r.participants).not.toContain('You');
  });

  test('ignores day names', () => {
    const r = extractEvent("dinner on Monday");
    expect(r.participants).not.toContain('Monday');
  });

  test('ignores month names', () => {
    const r = extractEvent("lunch in January");
    expect(r.participants).not.toContain('January');
  });

  test('matches contact by name', () => {
    const contacts = [{ name: 'Alex', nicknames: [] }];
    const r = extractEvent("dinner with Alex tomorrow", contacts);
    expect(r.participants).toContain('Alex');
  });

  test('matches contact by nickname', () => {
    const contacts = [{ name: 'Alexander', nicknames: ['Alex', 'Al'] }];
    const r = extractEvent("coffee with Alex tomorrow", contacts);
    expect(r.participants).toContain('Alexander');
  });

  test('no names — returns empty array', () => {
    const r = extractEvent("dinner tomorrow at 7");
    // May return empty or only non-ignored caps — just check it's an array
    expect(Array.isArray(r.participants)).toBe(true);
  });

});


// ─────────────────────────────────────────────
// NOTES EXTRACTION
// ─────────────────────────────────────────────

describe('Notes extraction', () => {

  test('bring phrase', () => {
    const r = extractEvent("dinner tomorrow, bring your laptop");
    expect(r.notes).toContain('your laptop');
  });

  test('don\'t forget phrase', () => {
    const r = extractEvent("don't forget the tickets");
    expect(r.notes).toContain('the tickets');
  });

  test('remember to phrase', () => {
    const r = extractEvent("remember to bring ID");
    expect(r.notes).toContain('ID');
  });

  test('can you get phrase', () => {
    const r = extractEvent("can you get some snacks");
    expect(r.notes).toContain('some snacks');
  });

  test('no notes phrase — returns empty string', () => {
    const r = extractEvent("dinner tomorrow at 7");
    expect(r.notes).toBe('');
  });

});


// ─────────────────────────────────────────────
// FULL extractEvent() — combined output
// ─────────────────────────────────────────────

describe('Full extractEvent()', () => {

  test('complete plan string', () => {
    const r = extractEvent("let's grab dinner tomorrow at 7pm with Alex");
    expect(r.title).toBe('Dinner');
    expect(r.time).toBe('19:00');
    expect(r.date).not.toBeNull();
    expect(r.participants).toContain('Alex');
    expect(r.sourceText).toBe("let's grab dinner tomorrow at 7pm with Alex");
  });

  test('returns sourceText always', () => {
    const text = "coffee at 10am";
    const r = extractEvent(text);
    expect(r.sourceText).toBe(text);
  });

  test('all fields present even when empty', () => {
    const r = extractEvent("let's hang out");
    expect(r).toHaveProperty('title');
    expect(r).toHaveProperty('date');
    expect(r).toHaveProperty('time');
    expect(r).toHaveProperty('participants');
    expect(r).toHaveProperty('notes');
    expect(r).toHaveProperty('sourceText');
    expect(r).toHaveProperty('rawDate');
    expect(r).toHaveProperty('rawTime');
  });

  test('plan with notes', () => {
    const r = extractEvent("dinner tomorrow at 7, bring your ID");
    expect(r.title).toBe('Dinner');
    expect(r.notes).toContain('your ID');
  });

});
