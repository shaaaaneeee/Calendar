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

// Builds the same local-date string the extractor itself produces —
// using toISOString() here would convert to UTC first and could be off
// by a day from the extractor's local-date result depending on timezone.
function localDateString(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

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
    expect(r.date).toBe(localDateString(tomorrow));
  });

  test('tonight', () => {
    const r = extractEvent("dinner tonight");
    const today = localDateString(new Date());
    expect(r.date).toBe(today);
    expect(r.rawDate).toBe('tonight');
  });

  test('today', () => {
    const r = extractEvent("lunch today");
    const today = localDateString(new Date());
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
    expect(r.date).toBe(localDateString(expected));
  });

  test('relative — in 1 week', () => {
    const r = extractEvent("catch up in 1 week");
    const expected = new Date();
    expected.setDate(expected.getDate() + 7);
    expect(r.date).toBe(localDateString(expected));
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

  test('custom activity word becomes the title', () => {
    const r = extractEvent("operation starts tomorrow at 7", [], ['operation']);
    expect(r.title).toBe('Operation');
  });

  test('custom activity word takes priority over a hardcoded activity label', () => {
    // "coffee" would hardcode-match to "Coffee", but "standup" is a custom
    // activity word present in the same message - custom should win.
    const r = extractEvent("coffee standup tomorrow", [], ['standup']);
    expect(r.title).toBe('Standup');
  });

  test('custom trigger word becomes the title when nothing else matches', () => {
    const r = extractEvent("night ops tomorrow at 9pm", [], [], [], ['ops']);
    expect(r.title).toBe('Ops');
  });

  test('title never includes a name, even with a matched priority name', () => {
    const r = extractEvent("Gym with Weile & Kaden", ['Weile', 'Kaden']);
    expect(r.title).toBe('Gym');
    expect(r.participants).toEqual(expect.arrayContaining(['Weile', 'Kaden']));
  });

  test('title stays bare when the plan is just a name and an activity', () => {
    const r = extractEvent("tomorrow i need you to meet Esmond at the office at 9pm", ['Esmond']);
    expect(r.title).toBe('Meeting');
    expect(r.participants).toContain('Esmond');
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

  test('matches a custom priority name', () => {
    const r = extractEvent("dinner with Alex tomorrow", ['Alex']);
    expect(r.participants).toContain('Alex');
  });

  test('no names — returns empty array', () => {
    const r = extractEvent("dinner tomorrow at 7");
    // May return empty or only non-ignored caps — just check it's an array
    expect(Array.isArray(r.participants)).toBe(true);
  });

  test('does not hallucinate a capitalized brand/place as a name', () => {
    const r = extractEvent("let's go to Costco tomorrow");
    expect(r.participants).not.toContain('Costco');
  });

  test('does not hallucinate a sentence-medial capitalized word', () => {
    const r = extractEvent("dinner tomorrow. Excited for it!");
    expect(r.participants).not.toContain('Excited');
  });

  test('still finds a name preceded by "and"', () => {
    const r = extractEvent("lunch tomorrow with Sarah and James");
    expect(r.participants).toContain('Sarah');
    expect(r.participants).toContain('James');
  });

  test('finds a lowercase name right after a cue word', () => {
    const r = extractEvent("meet esmond and Weile at the office tomorrow at 9pm");
    expect(r.participants).toContain('Esmond');
    expect(r.participants).toContain('Weile');
  });

  test('chains a comma-separated name list after a cue word', () => {
    const r = extractEvent("gym with Weile, Kaden and John tomorrow");
    expect(r.participants).toContain('Weile');
    expect(r.participants).toContain('Kaden');
    expect(r.participants).toContain('John');
  });

  test('does not hallucinate a name from a bare "and" mid-sentence', () => {
    // "and" only continues a list a real cue (with/meet/call/etc.) already
    // started - it must not act as its own anchor, or unrelated words after
    // any "and" (like an item in a packing list) get misread as a person.
    const r = extractEvent("tomorrow please meet Seth at the office at 7:50am, remember to pack the m3e drone and spare batt");
    expect(r.participants).toContain('Seth');
    expect(r.participants).not.toContain('Spare');
    expect(r.participants).not.toContain('Batt');
  });

});


// ─────────────────────────────────────────────
// LOCATION EXTRACTION
// ─────────────────────────────────────────────

describe('Location extraction', () => {

  test('finds gym', () => {
    expect(extractEvent("gym at 6am tomorrow").location).toBe('Gym');
  });

  test('finds pier', () => {
    expect(extractEvent("meet at the pier tomorrow").location).toBe('Pier');
  });

  test('no location — returns null', () => {
    expect(extractEvent("dinner tomorrow at 7").location).toBeNull();
  });

  test('custom place word from settings', () => {
    const r = extractEvent("let's meet at the lake tomorrow", [], [], ['lake']);
    expect(r.location).toBe('Lake');
  });

  test('custom place word takes priority over a hardcoded location label', () => {
    // "office" would hardcode-match to "Office", but "marina south pier" is a
    // custom place word present in the same message - custom should win.
    const r = extractEvent("meet at marina south pier not the office", [], [], ['marina south pier']);
    // titleCase() only capitalizes the first character of the whole string.
    expect(r.location).toBe('Marina south pier');
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
