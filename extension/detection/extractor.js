/**
 * PlanWise Event Extractor
 *
 * Takes raw detected text and pulls out structured event data.
 * Returns a best-effort object - fields will be null if not found.
 *
 * Depends on: nothing. Fully standalone.
 */

function extractDateTime(text) {
  const now = new Date();
  let date = null;
  let time = null;
  let rawDate = null;
  let rawTime = null;

  if (/\btomorrow\b|\btmrw\b/i.test(text)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    date = toDateString(d);
    rawDate = "tomorrow";
  } else if (/\btonight\b/i.test(text)) {
    date = toDateString(now);
    rawDate = "tonight";
  } else if (/\btoday\b/i.test(text)) {
    date = toDateString(now);
    rawDate = "today";
  } else {
    const namedDay = text.match(
      /\b(next|this)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i
    );
    if (namedDay) {
      date = resolveNamedDay(namedDay[1], namedDay[2]);
      rawDate = namedDay[0];
    }

    const relative = text.match(/\bin\s+(\d+)\s+(hours?|days?|weeks?)\b/i);
    if (relative && !date) {
      const amount = parseInt(relative[1], 10);
      const unit = relative[2].toLowerCase();
      const d = new Date(now);
      if (unit.startsWith("hour")) d.setHours(d.getHours() + amount);
      if (unit.startsWith("day")) d.setDate(d.getDate() + amount);
      if (unit.startsWith("week")) d.setDate(d.getDate() + amount * 7);
      date = toDateString(d);
      rawDate = relative[0];
    }

    const explicit = text.match(/\b(\d{1,2})\/(\d{1,2})\b/);
    if (explicit && !date) {
      const month = parseInt(explicit[1], 10) - 1;
      const day = parseInt(explicit[2], 10);
      const d = new Date(now.getFullYear(), month, day);
      if (d < now) d.setFullYear(d.getFullYear() + 1);
      date = toDateString(d);
      rawDate = explicit[0];
    }
  }

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

  if (!time) {
    const bare = text.match(/\bat\s+(\d{1,2})\b/i);
    if (bare) {
      let hours = parseInt(bare[1], 10);
      // Heuristic: bare numbers 1-11 without am/pm default to PM
      // because social plans almost never mean 1am-11am
      if (hours >= 1 && hours <= 11) hours += 12;
      time = `${String(hours).padStart(2, "0")}:00`;
      rawTime = bare[0];
    }
  }

  return { date, time, rawDate, rawTime };
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

  return {
    title,
    date,
    time,
    participants: extractParticipants(text, contacts),
    notes: nameNote,
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
