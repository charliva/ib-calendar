# Gates: calendar redesign

Scope: implement the approved Home, day, week, URL navigation, and text capture redesign and run it on localhost.

- [x] G1: Home shows current class, room, remaining classes and after-school obligations.
  EVIDENCE: Browser fixture on isolated IPv6 loopback origin showed Chemistry HL, Room C204, two remaining classes with B12/A8 rooms, and extended essay work alongside; regression tests cover imported and recurring classes.
- [x] G2: Day/week navigation supports URLs and browser history while preserving manual planning.
  EVIDENCE: Browser loaded view=day and view=week dates, Calendar navigation changed the URL, history.back returned Home; manual room edit C204 to C205 saved and Cmd+Z restored C204.
- [x] G3: Mobile offers one-tap text capture and immediate clear NLP edits with Undo.
  EVIDENCE: At 390px Add opened text composer in one tap; offline add saved directly to Flexible work and exposed Undo. Editor NLP submits the selected event to the same validated immediate-apply path. Signed-out error retained the command. Live signed-in model execution was not exercised.
- [x] G4: Modern violet calendar renders legibly on desktop and mobile without cultural metadata.
  EVIDENCE: Inspected 1440px Home/day/week and 390px Home/agenda/composer; mobile document width equals viewport 390px; no rendered cultural metadata; room labels visible in week blocks and mobile agenda.
- [x] G5: Typecheck, lint, domain tests and build pass.
  CHECK: npm run typecheck && npm run lint && npm run build && node --experimental-strip-types --test tests/*.test.mjs
  EXPECT: fail 0
  EVIDENCE: exit=0; shell=/bin/sh; cwd=/Users/charlie/Desktop/Desktop - Charlie’s MacBook Air/new dev/ib-calendar; path=ed53f0977624/17 entries; EXPECT=matched; output-sha256=5bca4582c04551f2ae450c68e70258efa409b898ba184863652f94dd9442af3a; output-bytes=15268
- [x] G6: Localhost is running and browser smoke checks pass.
  EVIDENCE: npm run dev serves port 3000 with HTTP 200; Home/Calendar/manual edit/capture rendered and operated in collaborative browser. Consolidated competing IndexedDB versions into one version-8 connection, removing the loading deadlock.
