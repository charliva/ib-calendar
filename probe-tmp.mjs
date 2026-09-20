import { classCalendarItems } from "./lib/calendar/interactions.ts";
import { buildAttentionSnapshot } from "./lib/attention-engine.ts";
import { DEFAULT_SCHOOL_DAY_SETTINGS } from "./lib/school.ts";
import { weekPatternFor, anchorForWeekOf } from "./lib/school/week-pattern.ts";

const subject = { id:"eng", name:"English", shortName:"Eng", teacher:"", room:"G4", color:"#8b7abb", icon:"book", createdAt:"2026-09-01" };
const mk = (p) => ({ id:"lesson-"+p, subjectId:"eng", weekday:1, startTime:"08:30", endTime:"10:00",
  weekPattern:p, teacher:"", room:"G4", validFrom:"2026-09-01", validUntil:null,
  energyUsage:4, locationContext:"school", createdAt:"2026-09-01" });

const monday = new Date("2026-09-21T07:00");
// Student tells onboarding "this week is Week B"
const anchor = anchorForWeekOf(monday, "b");
console.log("stored anchor:", anchor);
console.log("default-epoch pattern:", weekPatternFor(monday));
console.log("student pattern      :", weekPatternFor(monday, anchor));

const settings = { ...DEFAULT_SCHOOL_DAY_SETTINGS, weekPatternAnchor: anchor, schoolLocation: "School" };
const classes = [mk("a"), mk("b")];

const cal = classCalendarItems(classes, [], [subject], monday, new Date("2026-09-27T23:00"), anchor);
console.log("week calendar lessons:", cal.map(i=>i.id));

const snap = buildAttentionSnapshot({
  now: monday, items: [], assignments: [], assessments: [], intentions: [],
  subjects: [subject], classes, classExceptions: [], settings,
  currentLocation: "home", currentEnergy: "medium", computerAvailable: true, learningSignals: [],
});
console.log("attention todayClasses:", snap.todayClasses.map(c=>c.id + " / " + c.sourceId));
