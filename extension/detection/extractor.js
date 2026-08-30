/**
 * PlanWise Event Extractor
 *
 * Takes raw detected text and pulls out structured event data.
 * Returns a best-effort object - fields will be null if not found.
 *
 * Depends on: nothing. Fully standalone.
 */

const WORD_TO_NUM = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5,
  six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
};

const MONTH_INDEX = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6,
  aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

const WRITTEN_NUM = "a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen";

const MONTH_NAMES_PATTERN = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";

// Abbreviated weekdays, so "next Fri" resolves the same as "next Friday" —
// also used as the start-of-range token for date-range notes (see
// extractNotes()), since neither adds a dateEnd field yet (single-date
// return shape — see extractDateTime()'s range handling comment).
const DAY_ABBREV = {
  mon: "monday", tue: "tuesday", tues: "tuesday", wed: "wednesday",
  thu: "thursday", thur: "thursday", thurs: "thursday",
  fri: "friday", sat: "saturday", sun: "sunday",
};
const WEEKDAY_PATTERN = "mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday";

// 0=Sunday..6=Saturday — matches both JS Date.getDay() and Postgres
// extract(dow from ...), so no conversion is needed at the Supabase layer.
const DAY_INDEX = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3,
  thursday: 4, friday: 5, saturday: 6,
};

function fullDayName(name) {
  const lower = name.toLowerCase();
  return DAY_ABBREV[lower] || lower;
}

// Spelled-out day-of-month ordinals ("march fifteenth", "the twenty third of
// april") — real, common typed-chat phrasing that the numeric-only "15th"
// cascade above doesn't cover. ONES covers 1st-9th standalone AND as the
// second half of a compound tens word ("twenty-first"); the rest are
// complete on their own.
const ORDINAL_ONES = {
  first: 1, second: 2, third: 3, fourth: 4, fifth: 5,
  sixth: 6, seventh: 7, eighth: 8, ninth: 9,
};
const ORDINAL_WHOLE = {
  ...ORDINAL_ONES,
  tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14,
  fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19,
  twentieth: 20, thirtieth: 30,
};
const ORDINAL_ONES_PATTERN = Object.keys(ORDINAL_ONES).join("|");
const ORDINAL_WHOLE_PATTERN = Object.keys(ORDINAL_WHOLE).join("|");
// Matches either a compound ("twenty first"/"twenty-first"/"thirty second")
// or a standalone ordinal word, as two alternatives so the caller can tell
// which one matched from which capture groups are populated.
const ORDINAL_DAY_WORD_PATTERN =
  `(?:(twenty|thirty)[\\s-]?(${ORDINAL_ONES_PATTERN})|(${ORDINAL_WHOLE_PATTERN}))`;

function ordinalWordToNum(tensWord, onesWord, wholeWord) {
  if (wholeWord) return ORDINAL_WHOLE[wholeWord.toLowerCase()];
  const tens = tensWord.toLowerCase() === "twenty" ? 20 : 30;
  return tens + ORDINAL_ONES[onesWord.toLowerCase()];
}

// Spelled-out hours ("dinner at seven", "six thirty pm") — real typed-chat
// phrasing, not just a voice-transcription artifact, though kept deliberately
// narrow (whole hours + the 4 common quarter-marks only) rather than chasing
// every ASR-style number-word combination ("seven hundred and thirty").
const HOUR_WORDS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const MINUTE_WORDS = { fifteen: 15, thirty: 30, "forty five": 45, "forty-five": 45 };
const HOUR_WORD_PATTERN = Object.keys(HOUR_WORDS).join("|");
const MINUTE_WORD_PATTERN = "fifteen|thirty|forty[\\s-]five";

function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;
  let rawDate = null;
  let rawTime = null;
  let recurrenceDayOfWeek = null;
  let recurrenceIntervalWeeks = null;

  // ── DATE ────────────────────────────────────────────────────────────────

  // tomorrow / tmrw
  if (/\btomorrow\b|\btmrw\b/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = toDateString(d);
    rawDate = "tomorrow";

  // tonight → today
  } else if (/\btonight\b/i.test(text)) {
    date = toDateString(now);
    rawDate = "tonight";

  // today
  } else if (/\btoday\b/i.test(text)) {
    date = toDateString(now);
    rawDate = "today";

  } else {
    // every [other] [weekday] → recurring weekly/bi-weekly plan. Must run
    // before the standalone-weekday check below, which would otherwise
    // silently swallow "every Tuesday" down to just "tuesday" and lose
    // the recurrence entirely (the documented gap this task closes).
    const everyDay = text.match(
      new RegExp(`\\bevery\\s+(other\\s+)?(${WEEKDAY_PATTERN})\\b`, "i")
    );
    if (everyDay) {
      const dayName = fullDayName(everyDay[2]);
      date = resolveStandaloneDay(dayName);
      rawDate = everyDay[0];
      recurrenceDayOfWeek = DAY_INDEX[dayName];
      recurrenceIntervalWeeks = everyDay[1] ? 2 : 1;
    }

    // next/this [weekday] — also matches the start of an abbreviated
    // weekday range ("next Fri-Sun" resolves to next Friday; the "-Sun"
    // half is picked up separately by extractNotes() below since this
    // function only returns a single date, not a range).
    const qualifiedDay = text.match(
      new RegExp(`\\b(next|this)\\s+(${WEEKDAY_PATTERN})\\b`, "i")
    );
    if (qualifiedDay) {
      date = resolveNamedDay(qualifiedDay[1], fullDayName(qualifiedDay[2]));
      rawDate = qualifiedDay[0];
    }

    // next week → 7 days forward
    if (!date && /\bnext\s+week\b/i.test(text)) {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      date = toDateString(d);
      rawDate = "next week";
    }

    // (next|this) weekend → Saturday of that week
    if (!date) {
      const weekend = text.match(/\b(next|this)\s+weekend\b/i);
      if (weekend) {
        date = resolveNamedDay(weekend[1], "saturday");
        rawDate = weekend[0];
      } else if (/\bweekend\b/i.test(text)) {
        date = resolveStandaloneDay("saturday");
        rawDate = "weekend";
      }
    }

    // standalone [weekday] with no qualifier → nearest upcoming occurrence
    if (!date) {
      const standaloneDay = text.match(
        /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
      );
      if (standaloneDay) {
        date = resolveStandaloneDay(standaloneDay[1]);
        rawDate = standaloneDay[0];
      }
    }

    // in N units — numeric ("in 3 days", "in 2 weeks")
    if (!date) {
      const numericRel = text.match(/\bin\s+(\d+)\s+(hours?|days?|weeks?|months?)\b/i);
      if (numericRel) {
        date = shiftDate(now, parseInt(numericRel[1], 10), numericRel[2]);
        rawDate = numericRel[0];
      }
    }

    // written-out relative: "three days from now", "in two weeks", "a week from today"
    if (!date) {
      const writtenRel = text.match(
        new RegExp(
          `\\b(${WRITTEN_NUM})\\s+(hours?|days?|weeks?|months?)\\s+(?:from\\s+(?:now|today)|later|hence)\\b`,
          "i"
        )
      ) || text.match(
        new RegExp(`\\bin\\s+(${WRITTEN_NUM})\\s+(hours?|days?|weeks?|months?)\\b`, "i")
      ) || text.match(
        new RegExp(
          `\\b(${WRITTEN_NUM})\\s+(hours?|days?|weeks?|months?)\\s+out\\b`,
          "i"
        )
      );
      if (writtenRel) {
        const amount = WORD_TO_NUM[writtenRel[1].toLowerCase()] || 1;
        date = shiftDate(now, amount, writtenRel[2]);
        rawDate = writtenRel[0];
      }
    }

    // MM/DD, optionally with an explicit year: "3/3", "3/3/2027", "3/3/27"
    if (!date) {
      const explicit = text.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
      if (explicit) {
        const month = parseInt(explicit[1], 10) - 1;
        const day   = parseInt(explicit[2], 10);
        const explicitYear = explicit[3]
          ? (explicit[3].length === 2 ? 2000 + parseInt(explicit[3], 10) : parseInt(explicit[3], 10))
          : null;
        const d = new Date(explicitYear || now.getFullYear(), month, day);
        // Only roll forward to next year when the year was inferred, not typed —
        // an explicit past year ("3/3/2020") means exactly that date, not a guess.
        if (!explicitYear && d < now) d.setFullYear(d.getFullYear() + 1);
        date = toDateString(d);
        rawDate = explicit[0];
      }
    }

    // Month name + day, optionally with an explicit year: "July 15th",
    // "15th of July", "July 15", "March 3, 2027", "3 March 2027"
    if (!date) {
      const monthDay = text.match(
        new RegExp(`\\b(${MONTH_NAMES_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, "i")
      ) || text.match(
        new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES_PATTERN})(?:,?\\s+(\\d{4}))?\\b`, "i")
      );
      if (monthDay) {
        let monthIdx, day;
        const first = monthDay[1].toLowerCase();
        if (MONTH_INDEX[first] !== undefined) {
          monthIdx = MONTH_INDEX[first];
          day = parseInt(monthDay[2], 10);
        } else {
          day = parseInt(monthDay[1], 10);
          monthIdx = MONTH_INDEX[monthDay[2].toLowerCase()];
        }
        const explicitYear = monthDay[3] ? parseInt(monthDay[3], 10) : null;
        if (monthIdx !== undefined && day >= 1 && day <= 31) {
          const d = new Date(explicitYear || now.getFullYear(), monthIdx, day);
          if (!explicitYear && d < now) d.setFullYear(d.getFullYear() + 1);
          date = toDateString(d);
          rawDate = monthDay[0];
        }
      }
    }

    // Month name + spelled-out day ordinal: "march fifteenth", "the twenty
    // third of april", "twenty second march". No explicit-year support here
    // (spelled-out years are an ASR-transcription artifact, not realistic
    // typed-chat phrasing) — keep this bounded to what people actually type.
    if (!date) {
      const wordDay = text.match(
        new RegExp(`\\b(${MONTH_NAMES_PATTERN})\\s+${ORDINAL_DAY_WORD_PATTERN}\\b`, "i")
      ) || text.match(
        new RegExp(`\\b${ORDINAL_DAY_WORD_PATTERN}\\s+(?:of\\s+)?(${MONTH_NAMES_PATTERN})\\b`, "i")
      );
      if (wordDay) {
        let monthIdx, day;
        if (MONTH_INDEX[wordDay[1]?.toLowerCase()] !== undefined) {
          // "march fifteenth" — groups 1=month, 2=tens, 3=ones, 4=whole
          monthIdx = MONTH_INDEX[wordDay[1].toLowerCase()];
          day = ordinalWordToNum(wordDay[2], wordDay[3], wordDay[4]);
        } else {
          // "fifteenth of march" — groups 1=tens, 2=ones, 3=whole, 4=month
          monthIdx = MONTH_INDEX[wordDay[4].toLowerCase()];
          day = ordinalWordToNum(wordDay[1], wordDay[2], wordDay[3]);
        }
        if (monthIdx !== undefined && day >= 1 && day <= 31) {
          const d = new Date(now.getFullYear(), monthIdx, day);
          if (d < now) d.setFullYear(d.getFullYear() + 1);
          date = toDateString(d);
          rawDate = wordDay[0];
        }
      }
    }

    // Bare ordinal: "the 15th", "on the 3rd" → that day this or next month
    if (!date) {
      const ordinal = text.match(/\b(?:on\s+)?the\s+(\d{1,2})(?:st|nd|rd|th)\b/i);
      if (ordinal) {
        const day = parseInt(ordinal[1], 10);
        const d = new Date(now.getFullYear(), now.getMonth(), day);
        if (d <= now) d.setMonth(d.getMonth() + 1);
        date = toDateString(d);
        rawDate = ordinal[0];
      }
    }
  }

  // ── TIME ────────────────────────────────────────────────────────────────

  // H:MM am/pm or H am/pm
  const ampm = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (ampm) {
    let hours = parseInt(ampm[1], 10);
    const mins = ampm[2] ? parseInt(ampm[2], 10) : 0;
    const period = ampm[3].toLowerCase();
    if (period === "pm" && hours !== 12) hours += 12;
    if (period === "am" && hours === 12) hours = 0;
    time = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
    rawTime = ampm[0];
  }

  // Spelled-out hour with an explicit am/pm — "six pm", "seven thirty am".
  // The am/pm marker makes this unambiguous, so (unlike the bare-hour-word
  // case below) it doesn't need an "at" anchor to be safe from false
  // positives.
  if (!time) {
    const wordAmpm = text.match(
      new RegExp(`\\b(${HOUR_WORD_PATTERN})(?:[\\s-](${MINUTE_WORD_PATTERN}))?\\s*(a\\.?\\s*m\\.?|p\\.?\\s*m\\.?)\\b`, "i")
    );
    if (wordAmpm) {
      let hours = HOUR_WORDS[wordAmpm[1].toLowerCase()];
      const mins = wordAmpm[2] ? MINUTE_WORDS[wordAmpm[2].toLowerCase().replace(/-/, " ")] : 0;
      const period = wordAmpm[3].replace(/[.\s]/g, "").toLowerCase();
      if (period === "pm" && hours !== 12) hours += 12;
      if (period === "am" && hours === 12) hours = 0;
      time = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
      rawTime = wordAmpm[0];
    }
  }

  // bare "at N" — 5-11 is evening-shaped enough (dinner/drinks/calls) to
  // guess PM safely, but 1-4 is genuinely ambiguous (could be 1-4am or
  // 1-4pm with no other signal in the message) — silently guessing wrong
  // there produces a calendar event at the wrong time with no warning, so
  // leave it unset instead and let a later cascade (or the user) fill it in.
  if (!time) {
    const bare = text.match(/\bat\s+(\d{1,2})\b/i);
    if (bare) {
      const hours = parseInt(bare[1], 10);
      if (hours >= 5 && hours <= 11) {
        time = `${String(hours + 12).padStart(2, "0")}:00`;
        rawTime = bare[0];
      } else if (hours === 12 || hours >= 13) {
        time = `${String(hours).padStart(2, "0")}:00`;
        rawTime = bare[0];
      }
    }
  }

  // bare "at <hour word>" — word-form equivalent of the above, same
  // evening-shaped-hours PM guess and same 1-4 ambiguity guard. Anchored on
  // "at" (unlike the am/pm word case above) since a bare hour word with no
  // marker either way needs that context to be a safe, low-false-positive match.
  if (!time) {
    const bareWord = text.match(
      new RegExp(`\\bat\\s+(${HOUR_WORD_PATTERN})(?:[\\s-](${MINUTE_WORD_PATTERN}))?\\b`, "i")
    );
    if (bareWord) {
      const hours = HOUR_WORDS[bareWord[1].toLowerCase()];
      const mins = bareWord[2] ? MINUTE_WORDS[bareWord[2].toLowerCase().replace(/-/, " ")] : 0;
      if (hours >= 5 && hours <= 11) {
        time = `${String(hours + 12).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
        rawTime = bareWord[0];
      } else if (hours === 12) {
        time = `12:${String(mins).padStart(2, "0")}`;
        rawTime = bareWord[0];
      }
    }
  }

  // noon / midday
  if (!time && /\bnoon\b|\bmidday\b/i.test(text)) {
    time = "12:00";
    rawTime = "noon";
  }

  // midnight
  if (!time && /\bmidnight\b/i.test(text)) {
    time = "00:00";
    rawTime = "midnight";
  }

  // time-of-day hints → approximate hour
  if (!time) {
    if (/\bmorning\b/i.test(text)) {
      time = "09:00"; rawTime = "morning";
    } else if (/\bafternoon\b/i.test(text)) {
      time = "14:00"; rawTime = "afternoon";
    } else if (/\bevening\b/i.test(text)) {
      time = "19:00"; rawTime = "evening";
    } else if (/\btonight\b/i.test(text)) {
      time = "20:00"; rawTime = "tonight";
    }
  }

  return { date, time, rawDate, rawTime, recurrenceDayOfWeek, recurrenceIntervalWeeks };
}

function shiftDate(base, amount, unitStr) {
  const d = new Date(base);
  const unit = unitStr.toLowerCase();
  if (unit.startsWith("hour"))  d.setHours(d.getHours() + amount);
  if (unit.startsWith("day"))   d.setDate(d.getDate() + amount);
  if (unit.startsWith("week"))  d.setDate(d.getDate() + amount * 7);
  if (unit.startsWith("month")) d.setMonth(d.getMonth() + amount);
  return toDateString(d);
}

function resolveStandaloneDay(dayName) {
  const DAYS = { sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6 };
  const target  = DAYS[dayName.toLowerCase()];
  const today   = new Date();
  const current = today.getDay();
  let delta = target - current;
  if (delta < 0) delta += 7; // past day this week → next occurrence
  const result = new Date(today);
  result.setDate(today.getDate() + delta);
  return toDateString(result);
}

const ACTIVITY_LABELS = [
  { pattern: /\bhang\s*out\b/i,                                        label: "Hang out" },
  { pattern: /\bcatch\s*up\b/i,                                        label: "Catch up" },
  { pattern: /\bpick\s*up\b/i,                                         label: "Pickup" },
  { pattern: /\bdrop\s*off\b/i,                                        label: "Drop off" },
  { pattern: /\bbrunch\b/i,                                            label: "Brunch" },
  { pattern: /\bbreakfast\b/i,                                         label: "Breakfast" },
  { pattern: /\bcoffee\b/i,                                            label: "Coffee" },
  { pattern: /\blunch\b/i,                                             label: "Lunch" },
  { pattern: /\bdinner\b/i,                                            label: "Dinner" },
  { pattern: /\bdrinks?\b/i,                                           label: "Drinks" },
  { pattern: /\bgym\b/i,                                               label: "Gym" },
  { pattern: /\bworkout\b/i,                                           label: "Workout" },
  { pattern: /\bconcert\b/i,                                           label: "Concert" },
  { pattern: /\bappointment\b/i,                                       label: "Appointment" },
  { pattern: /\bhike\b/i,                                              label: "Hike" },
  { pattern: /\brun\b/i,                                               label: "Run" },
  { pattern: /\bwalk\b/i,                                              label: "Walk" },
  { pattern: /\bstudy\b/i,                                             label: "Study" },
  { pattern: /\bmovies?\b/i,                                           label: "Movie" },
  { pattern: /\bwatch\b/i,                                             label: "Watch" },
  { pattern: /\bgames?\b/i,                                            label: "Game" },
  { pattern: /\bparty\b/i,                                             label: "Party" },
  { pattern: /\bpicnic\b/i,                                            label: "Picnic" },
  { pattern: /\bbarbecue\b|\bbbq\b/i,                                  label: "BBQ" },
  { pattern: /\btrip\b/i,                                              label: "Trip" },
  { pattern: /\bvisit\b/i,                                             label: "Visit" },
  { pattern: /\berrands?\b/i,                                          label: "Errand" },
  { pattern: /\bshopping\b/i,                                          label: "Shopping" },
  { pattern: /\bcall\b/i,                                              label: "Call" },
  { pattern: /\bmeet(ing)?\b/i,                                        label: "Meeting" },
  { pattern: /\b(?:go\s+on\s+a\s+date|on\s+a\s+date|date\s+night|(?:dinner|coffee|lunch|romantic)\s+date)\b/i, label: "Date" }
];

function titleCase(word) {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

function extractTitle(text, activityWords = [], triggerWords = []) {
  // Custom words win over the built-in label set - if you've specifically
  // taught PlanWise that "ops" or "rehearsal" is your activity word, that's a
  // more precise signal than the generic hardcoded list.
  for (const word of [...activityWords, ...triggerWords]) {
    if (!word || typeof word !== "string") continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      return titleCase(word);
    }
  }

  for (const { pattern, label } of ACTIVITY_LABELS) {
    if (pattern.test(text)) {
      return label;
    }
  }

  return "Plan";
}

// Common words that sit right after a relational cue but are never names
// ("with you", "meet up", "call me later").
const PARTICIPANT_IGNORE = new Set([
  "i", "me", "the", "a", "an", "and", "but", "or", "so", "we", "you", "he", "she",
  "they", "it", "this", "that", "my", "your", "his", "her", "our", "their", "its",
  "us", "him", "them",
  // Prepositions that commonly sit right after an anchor cue ("meet at the
  // gym", "meet in the lobby", "meet by/for/to/on/of ...") — without these,
  // each one was getting title-cased and captured as a person's name.
  "at", "in", "on", "by", "for", "to", "of",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "tomorrow", "tonight", "today",
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
  "up", "down", "out", "over", "later", "soon", "again", "back",
  "some", "everyone", "everybody", "all", "both",
]);

// Words that start a note-trigger phrase — instructions, not names.
const NOTE_TRIGGER_WORDS = new Set(["bring", "remember", "forget", "please", "can", "could"]);

// A cue word almost always has a name right after it ("with Alex", "meet Esmond",
// "call Sarah"). Anchoring on the cue - rather than requiring the following word to
// be capitalized - is what lets this survive casually-typed lowercase names.
// "and"/"&" are NOT anchors on their own - they only continue a list that one of
// these already started. Treating bare "and" as its own anchor means literally
// any "and X" in the message (e.g. "the drone and spare batt") gets scanned for
// a name, which is how unrelated words like "spare" got misdetected as people.
const ANCHOR_CUES = new Set([
  "with", "meet", "join", "call", "text", "from", "invite", "&"
]);

// Words that continue a name list once an anchor above has already started one
// ("with Weile, Kaden and John").
const LIST_JOINERS = new Set(["and", "&"]);

const ALL_CUE_WORDS = new Set([...ANCHOR_CUES, ...LIST_JOINERS]);

function isParticipantCandidate(word) {
  if (!word || word.length < 2) return false;
  const lower = word.toLowerCase();
  return !PARTICIPANT_IGNORE.has(lower) && !NOTE_TRIGGER_WORDS.has(lower) && !ALL_CUE_WORDS.has(lower);
}

function normalizeParticipantName(word) {
  return /^[a-z]+$/.test(word) ? titleCase(word) : word;
}

function extractParticipants(text) {
  const found = new Set();
  const rawWords = text.split(/\s+/);
  const cleanWords = rawWords.map(w => w.replace(/[^a-zA-Z']/g, ""));

  for (let i = 0; i < cleanWords.length; i += 1) {
    if (!ANCHOR_CUES.has(cleanWords[i].toLowerCase())) continue;

    let j = i + 1;
    while (j < cleanWords.length) {
      const candidate = cleanWords[j];
      if (!isParticipantCandidate(candidate)) break;
      found.add(normalizeParticipantName(candidate));

      const nextIsJoiner = j + 1 < cleanWords.length && LIST_JOINERS.has(cleanWords[j + 1].toLowerCase());
      const trailingComma = /,\s*$/.test(rawWords[j]);

      if (nextIsJoiner) {
        j += 2;
      } else if (trailingComma) {
        j += 1;
      } else {
        break;
      }
    }
  }

  // Second, independent pattern: a capitalized name immediately followed by
  // a presence-verb phrase ("Alex is coming too", "Sam's in", "Jordan said
  // yes") has no ANCHOR_CUES word to anchor on above, so it's otherwise
  // invisible. Unlike the anchor-cue path (which deliberately allows
  // lowercase names — see its comment), this path requires capitalization
  // as its own false-positive guard, since it has nothing else to anchor on.
  const PRESENCE_VERB_RE =
    /\b([A-Z][a-zA-Z']{1,})(?:'s|\s+is)\s+(?:coming|in|down|game)\b|\b([A-Z][a-zA-Z']{1,})\s+said\s+yes\b/g;
  let presenceMatch;
  while ((presenceMatch = PRESENCE_VERB_RE.exec(text)) !== null) {
    const name = presenceMatch[1] || presenceMatch[2];
    if (isParticipantCandidate(name)) found.add(name);
  }

  return [...found];
}

function extractNotes(text) {
  const notes = [];
  const patterns = [
    /\bbring\s+(.+?)(?:\.|,|$)/i,
    /\bdon'?t\s+forget\s+(.+?)(?:\.|,|$)/i,
    /\bremember\s+to\s+(.+?)(?:\.|,|$)/i,
    /\bcan\s+you\s+(?:get|bring|grab)\s+(.+?)(?:\.|,|$)/i,
    /\bplease\s+(?:get|bring|grab)\s+(.+?)(?:\.|,|$)/i
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      const note = match[1].trim();
      if (note.length > 0 && note.length < 80) {
        notes.push(note);
      }
    }
  }

  // Date ranges ("next Fri-Sun", "March 3-5") — extractDateTime() only
  // returns a single start date, so the raw range text is preserved here
  // rather than silently dropping the "through Sunday"/"-5" half.
  const RANGE_PATTERNS = [
    new RegExp(`\\b(?:next|this)\\s+(?:${WEEKDAY_PATTERN})\\s*(?:-|–|to)\\s*(?:${WEEKDAY_PATTERN})\\b`, "i"),
    new RegExp(`\\b(?:${MONTH_NAMES_PATTERN})\\s+\\d{1,2}(?:st|nd|rd|th)?\\s*(?:-|–|to)\\s*\\d{1,2}(?:st|nd|rd|th)?\\b`, "i"),
  ];
  for (const pattern of RANGE_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      notes.push(match[0]);
      break;
    }
  }

  // Group-size phrases ("the four of us", "six of us") — no specific name
  // to extract, so this can't go in participants; note it instead of
  // silently dropping the headcount.
  const groupSize = text.match(
    new RegExp(`\\b(?:the\\s+)?(?:\\d+|${WRITTEN_NUM})\\s+of\\s+us\\b`, "i")
  );
  if (groupSize) notes.push(groupSize[0]);

  // Exact dedup
  const unique = [...new Set(notes)];
  // Drop any note that contains a shorter note — keep the more precise capture
  const deduped = unique.filter(note =>
    !unique.some(other => other !== note && note.includes(other))
  );

  return deduped.join("; ");
}

const PLACE_LABELS = [
  { pattern: /\bgym\b/i,                    label: "Gym" },
  { pattern: /\bpier\b/i,                   label: "Pier" },
  { pattern: /\boffice\b/i,                 label: "Office" },
  { pattern: /\bhome\b/i,                   label: "Home" },
  { pattern: /\bschool\b/i,                 label: "School" },
  { pattern: /\bmall\b/i,                   label: "Mall" },
  { pattern: /\bbeach\b/i,                  label: "Beach" },
  { pattern: /\bpark\b/i,                   label: "Park" },
  { pattern: /\brestaurant\b/i,             label: "Restaurant" },
  { pattern: /\bbar\b/i,                    label: "Bar" },
  { pattern: /\bcaf[eé]\b/i,                label: "Cafe" },
  { pattern: /\bairport\b/i,                label: "Airport" },
  { pattern: /\bstation\b/i,                label: "Station" },
  { pattern: /\bdowntown\b/i,               label: "Downtown" },
  { pattern: /\bcampus\b/i,                 label: "Campus" },
  { pattern: /\bhouse\b/i,                  label: "House" },
];

function extractLocation(text, placeWords = []) {
  // Custom place words win over the built-in label set, same rationale as
  // extractTitle: a word you specifically taught PlanWise is more precise
  // than the generic hardcoded list.
  for (const word of placeWords) {
    if (!word || typeof word !== "string") continue;
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
      return titleCase(word);
    }
  }

  for (const { pattern, label } of PLACE_LABELS) {
    if (pattern.test(text)) {
      return label;
    }
  }

  return null;
}

function extractMatchedPriorityNames(text, priorityNames) {
  if (!Array.isArray(priorityNames)) return [];
  const found = [];
  for (const name of priorityNames) {
    if (!name || typeof name !== "string") continue;
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) found.push(name);
  }
  return found;
}

function extractEvent(text, priorityNames = [], activityWords = [], placeWords = [], triggerWords = []) {
  const { date, time, rawDate, rawTime, recurrenceDayOfWeek, recurrenceIntervalWeeks } = extractDateTime(text);
  const title = extractTitle(text, activityWords, triggerWords);
  const location = extractLocation(text, placeWords);
  const matchedNames = extractMatchedPriorityNames(text, priorityNames);
  const participants = [...new Set([...extractParticipants(text), ...matchedNames])];

  const notes = extractNotes(text);

  return {
    title,
    date,
    time,
    location,
    participants,
    notes,
    rawDate,
    rawTime,
    recurrenceDayOfWeek,
    recurrenceIntervalWeeks,
    sourceText: text.trim()
  };
}

function toDateString(date) {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day   = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function resolveNamedDay(qualifier, dayName) {
  const DAYS = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6
  };

  const target = DAYS[dayName.toLowerCase()];
  const today = new Date();
  const current = today.getDay();
  let delta = target - current;

  if (qualifier.toLowerCase() === "next") {
    if (delta <= 0) delta += 7;
    delta += 7;
  } else if (delta <= 0) {
    delta += 7;
  }

  const result = new Date(today);
  result.setDate(today.getDate() + delta);
  return toDateString(result);
}

if (typeof window !== "undefined") {
  window.PlanWiseExtractor = { extractEvent, extractNotes };
}
