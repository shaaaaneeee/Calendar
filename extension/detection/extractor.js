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

function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;
  let rawDate = null;
  let rawTime = null;

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
    // next/this [weekday]
    const qualifiedDay = text.match(
      /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (qualifiedDay) {
      date = resolveNamedDay(qualifiedDay[1], qualifiedDay[2]);
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

    // MM/DD
    if (!date) {
      const explicit = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
      if (explicit) {
        const month = parseInt(explicit[1], 10) - 1;
        const day   = parseInt(explicit[2], 10);
        const d = new Date(now.getFullYear(), month, day);
        if (d < now) d.setFullYear(d.getFullYear() + 1);
        date = toDateString(d);
        rawDate = explicit[0];
      }
    }

    // Month name + day: "July 15th", "15th of July", "July 15"
    if (!date) {
      const MONTH_NAMES = "january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec";
      const monthDay = text.match(
        new RegExp(`\\b(${MONTH_NAMES})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, "i")
      ) || text.match(
        new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?(${MONTH_NAMES})\\b`, "i")
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
        if (monthIdx !== undefined && day >= 1 && day <= 31) {
          const d = new Date(now.getFullYear(), monthIdx, day);
          if (d < now) d.setFullYear(d.getFullYear() + 1);
          date = toDateString(d);
          rawDate = monthDay[0];
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

  // bare "at N" — default to PM for 1-11
  if (!time) {
    const bare = text.match(/\bat\s+(\d{1,2})\b/i);
    if (bare) {
      let hours = parseInt(bare[1], 10);
      if (hours >= 1 && hours <= 11) hours += 12;
      time = `${String(hours).padStart(2, "0")}:00`;
      rawTime = bare[0];
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

  return { date, time, rawDate, rawTime };
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
  const { date, time, rawDate, rawTime } = extractDateTime(text);
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
