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

function extractTitle(text) {
  for (const { pattern, label } of ACTIVITY_LABELS) {
    if (pattern.test(text)) {
      return label;
    }
  }
  return "Plan";
}

function extractParticipants(text, contacts = []) {
  const found = new Set();

  for (const contact of contacts) {
    const namesToCheck = [contact.name, ...(contact.nicknames || [])];
    for (const name of namesToCheck) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`\\b${escaped}\\b`, "i").test(text)) {
        found.add(contact.name);
        break;
      }
    }
  }

  if (found.size === 0) {
    const IGNORE = new Set([
      // Articles, conjunctions, pronouns
      "I", "The", "A", "An", "And", "But", "Or", "So", "We", "You", "He", "She", "They", "It",
      "This", "That", "My", "Your", "His", "Her", "Our", "Their", "Its",
      // Days / months / time words
      "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday",
      "Tomorrow", "Tonight", "Today",
      "January", "February", "March", "April", "May", "June",
      "July", "August", "September", "October", "November", "December",
      // Common action/instruction verbs that appear capitalized mid-sentence
      "Bring", "Get", "Take", "Have", "Come", "Go", "See", "Tell", "Ask",
      "Let", "Make", "Try", "Need", "Keep", "Put", "Give", "Call", "Meet",
      "Be", "Know", "Think", "Feel", "Want", "Like", "Look", "Use", "Find",
      "Work", "Remember", "Forget", "Please", "Wait", "Check", "Watch", "Send",
      "Pick", "Drop", "Grab", "Buy", "Book", "Plan", "Stay", "Head", "Show",
      // Common qualifiers / fillers
      "Just", "Sure", "Still", "Also", "Even", "Only", "Really", "Actually",
      "Probably", "Definitely", "Maybe", "Ok", "Okay", "Yeah", "Yes", "No",
      "Oh", "Ah", "Hey", "Hi", "Lol", "Haha", "Sorry", "Thanks", "Thank",
      "Cool", "Nice", "Good", "Great", "Wow", "Right", "Alright",
      // Prepositions / connectors
      "About", "After", "Before", "Around", "With", "For", "From", "By",
      "Up", "Down", "Out", "On", "Off", "Away", "Near", "Into", "Over",
      // Contractions (cleaned forms)
      "Dont", "Wont", "Cant", "Didnt", "Doesnt", "Isnt", "Wasnt", "Havent",
      "Wouldnt", "Couldnt", "Shouldnt", "Im", "Ill", "Ive", "Id", "Were", "Thats",
      // Misc common chat words not likely to be names
      "Its", "Hes", "Shes", "Theyre", "Weve", "Youre", "Youll", "Well"
    ]);

    // Also exclude any word that starts a note-trigger phrase — those are instructions, not names.
    const NOTE_TRIGGER_WORDS = new Set(["Bring", "Remember", "Forget", "Please", "Can", "Could"]);

    const words = text.split(/\s+/);
    for (let i = 1; i < words.length; i += 1) {
      const word = words[i].replace(/[^a-zA-Z]/g, "");
      if (
        word.length > 1 &&
        word[0] === word[0].toUpperCase() &&
        word[0] !== word[0].toLowerCase() &&
        !IGNORE.has(word) &&
        !NOTE_TRIGGER_WORDS.has(word)
      ) {
        found.add(word);
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

function extractEvent(text, contacts = [], priorityNames = []) {
  const { date, time, rawDate, rawTime } = extractDateTime(text);
  const baseTitle = extractTitle(text);
  const matchedNames = extractMatchedPriorityNames(text, priorityNames);

  const title = matchedNames.length > 0
    ? (baseTitle === "Plan" ? matchedNames[0] : `${baseTitle} with ${matchedNames[0]}`)
    : baseTitle;

  const nameNote = matchedNames.length > 0
    ? `With: ${matchedNames.join(", ")}`
    : "";

  const patternNotes = extractNotes(text);
  const mergedNotes = [nameNote, patternNotes].filter(Boolean).join("; ");

  return {
    title,
    date,
    time,
    participants: extractParticipants(text, contacts),
    notes: mergedNotes,
    rawDate,
    rawTime,
    sourceText: text.trim()
  };
}

function toDateString(date) {
  return date.toISOString().split("T")[0];
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
