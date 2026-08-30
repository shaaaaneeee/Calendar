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

  test('explicit date MM/DD/YYYY', () => {
    const r = extractEvent("dinner on 3/3/2027");
    expect(r.date).toBe('2027-03-03');
  });

  test('explicit date MM/DD/YY (2-digit year)', () => {
    const r = extractEvent("dinner on 3/3/27");
    expect(r.date).toBe('2027-03-03');
  });

  test('explicit past year is honored, not rolled forward', () => {
    const r = extractEvent("we met on 3/3/2020");
    expect(r.date).toBe('2020-03-03');
  });

  test('month name with explicit year', () => {
    const r = extractEvent("let's do March 3, 2027");
    expect(r.date).toBe('2027-03-03');
  });

  test('day-then-month with explicit year', () => {
    const r = extractEvent("catch up on 3 March 2027");
    expect(r.date).toBe('2027-03-03');
  });

  // Spelled-out day ordinals ("march fifteenth") — found via a real-world
  // phrase-diversity check against the MASSIVE dataset's calendar-domain
  // slot annotations (github.com/alexa/massive), which surfaced this as a
  // common typed pattern the numeric-only "15th" cascade didn't cover.
  test('month name with spelled-out ordinal day', () => {
    const r = extractEvent("let's do march fifteenth");
    expect(r.date).toBe('2027-03-15');
  });

  test('spelled-out ordinal day then month name', () => {
    const r = extractEvent("catch up the twenty third of april");
    expect(r.date).toBe('2027-04-23');
  });

  test('compound twenty-something ordinal, month first', () => {
    const r = extractEvent("trip june twenty seventh");
    expect(r.date).toBe('2027-06-27');
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

  test('named day abbreviation — next Fri', () => {
    const r = extractEvent("drinks next Fri");
    expect(r.date).not.toBeNull();
    expect(r.rawDate.toLowerCase()).toBe('next fri');
  });

  test('weekday range — start date extracted, range preserved in notes', () => {
    const r = extractEvent("road trip next Fri-Sun, you in?");
    expect(r.date).not.toBeNull();
    expect(r.rawDate.toLowerCase()).toBe('next fri');
    expect(r.notes.toLowerCase()).toContain('fri-sun');
  });

  test('month-day range — start date extracted, range preserved in notes', () => {
    const r = extractEvent("trip March 3-5, you in?");
    expect(r.date).not.toBeNull();
    expect(r.notes).toContain('March 3-5');
  });

});


// ─────────────────────────────────────────────
// RECURRING EXTRACTION — weekly/bi-weekly only (Phase 1d). See
// docs/superpowers/specs/2026-08-30-recurring-events-design.md for the
// full data model this feeds into.
// ─────────────────────────────────────────────

describe('Recurring extraction', () => {

  test('"every Tuesday" sets recurrenceDayOfWeek and a weekly interval', () => {
    const r = extractEvent("gym every Tuesday");
    expect(r.date).not.toBeNull(); // next Tuesday's date
    expect(r.recurrenceDayOfWeek).toBe(2); // Tuesday
    expect(r.recurrenceIntervalWeeks).toBe(1);
    expect(r.title).toBe('Gym');
  });

  test('"every other Friday" sets a bi-weekly interval', () => {
    const r = extractEvent("board game night every other Friday");
    expect(r.date).not.toBeNull(); // resolves to next Friday
    expect(r.recurrenceDayOfWeek).toBe(5); // Friday
    expect(r.recurrenceIntervalWeeks).toBe(2);
  });

  test('a bare weekday with no "every" is not treated as recurring', () => {
    const r = extractEvent("lunch tuesday");
    expect(r.date).not.toBeNull();
    expect(r.recurrenceDayOfWeek).toBeNull();
    expect(r.recurrenceIntervalWeeks).toBeNull();
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

  test('bare number 5-11 defaults to PM (evening-shaped hours)', () => {
    const r = extractEvent("dinner at 7 tomorrow");
    expect(r.time).toBe('19:00');
  });

  test('bare number 6 defaults to PM', () => {
    const r = extractEvent("gym at 6");
    expect(r.time).toBe('18:00');
  });

  test('bare number 1-4 is ambiguous — left null rather than guessed', () => {
    const r = extractEvent("call me at 3");
    expect(r.time).toBeNull();
  });

  test('bare number 1 is ambiguous — left null', () => {
    const r = extractEvent("meet at 1");
    expect(r.time).toBeNull();
  });

  test('bare number 12 still resolves to noon', () => {
    const r = extractEvent("lunch at 12");
    expect(r.time).toBe('12:00');
  });

  test('no time — returns null', () => {
    const r = extractEvent("dinner tomorrow");
    expect(r.time).toBeNull();
  });

  // Spelled-out hours ("dinner at seven", "six thirty pm") — same
  // real-world-diversity check against MASSIVE's calendar/datetime/alarm
  // slot annotations as the date tests above.
  test('spelled-out hour with explicit pm — no "at" needed', () => {
    const r = extractEvent("dinner tomorrow six pm");
    expect(r.time).toBe('18:00');
  });

  test('spelled-out hour and minutes with explicit am', () => {
    const r = extractEvent("meeting seven thirty am");
    expect(r.time).toBe('07:30');
  });

  test('spelled-out hour with dotted am/pm ("p. m.")', () => {
    const r = extractEvent("call at eight forty five p. m.");
    expect(r.time).toBe('20:45');
  });

  test('bare spelled-out hour, evening-shaped, defaults PM', () => {
    const r = extractEvent("dinner at six");
    expect(r.time).toBe('18:00');
  });

  test('bare spelled-out hour, ambiguous 1-4, left null', () => {
    const r = extractEvent("call me at three");
    expect(r.time).toBeNull();
  });

  test('bare spelled-out hour with minutes, evening-shaped', () => {
    const r = extractEvent("meet at six thirty");
    expect(r.time).toBe('18:30');
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

  test('finds a name with no anchor cue word — "is coming"', () => {
    const r = extractEvent("dinner tomorrow, Alex is coming too");
    expect(r.participants).toContain('Alex');
  });

  test('finds a name with no anchor cue word — possessive "\'s in"', () => {
    const r = extractEvent("dinner tomorrow, Sam's in");
    expect(r.participants).toContain('Sam');
  });

  test('finds a name with no anchor cue word — "said yes"', () => {
    const r = extractEvent("dinner tomorrow, Jordan said yes");
    expect(r.participants).toContain('Jordan');
  });

  test('does not match a lowercase name via the presence-verb path', () => {
    const r = extractEvent("dinner tomorrow, alex is coming too");
    expect(r.participants).not.toContain('alex');
    expect(r.participants).not.toContain('Alex');
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

  test('chains a larger 4-name comma-separated list (group plan)', () => {
    const r = extractEvent("lunch with Weile, Kaden, John and Priya tomorrow");
    expect(r.participants).toEqual(
      expect.arrayContaining(['Weile', 'Kaden', 'John', 'Priya'])
    );
    expect(r.participants).toHaveLength(4);
  });

  test('does not hallucinate a preposition right after a cue word as a name — "at"', () => {
    const r = extractEvent("let's meet at the gym tomorrow");
    expect(r.participants).not.toContain('At');
  });

  test('does not hallucinate a preposition right after a cue word as a name — "in"/"by"/"on"/"for"/"to"/"of"', () => {
    expect(extractEvent("meet in the lobby").participants).not.toContain('In');
    expect(extractEvent("meet by the entrance").participants).not.toContain('By');
    expect(extractEvent("meet on Friday").participants).not.toContain('On');
    expect(extractEvent("meet for lunch").participants).not.toContain('For');
    expect(extractEvent("meet to discuss").participants).not.toContain('To');
    expect(extractEvent("meet of the club").participants).not.toContain('Of');
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

  test('prefers the real plan location over an unrelated place mentioned earlier in the message', () => {
    // Verified this already works — PLACE_LABELS is a first-match loop with
    // no recency preference, so this was worth locking in with a test
    // rather than assuming it was broken.
    const r = extractEvent("I was at the mall yesterday but let's meet at the gym tomorrow");
    expect(r.location).toBe('Gym');
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

  test('group-size phrase — numeric', () => {
    const r = extractEvent("dinner tomorrow, the 4 of us");
    expect(r.notes).toContain('4 of us');
  });

  test('group-size phrase — written number', () => {
    const r = extractEvent("dinner tomorrow, six of us");
    expect(r.notes).toContain('six of us');
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

  test('emoji does not break time/date extraction', () => {
    const r = extractEvent("dinner tomorrow 🍕 at 7pm");
    expect(r.date).not.toBeNull();
    expect(r.time).toBe('19:00');
  });

  test('emoji does not break participant extraction', () => {
    const r = extractEvent("dinner tomorrow with Alex 🎉");
    expect(r.participants).toContain('Alex');
  });

});
