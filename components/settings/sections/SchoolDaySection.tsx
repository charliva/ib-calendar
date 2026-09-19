"use client";

import { useState, type FormEvent } from "react";
import type { SchoolDaySettings } from "@/lib/school";
import { SchoolDayEditor } from "@/components/school/editors/SchoolDayEditor";

type Props = {
  settings: SchoolDaySettings;
  onSave: (settings: SchoolDaySettings) => void;
};

/**
 * The school-day rules, now reachable from somewhere a student would look.
 *
 * These were previously behind a small "Rules" button inside the Timetable tab
 * of the School workspace, which is two levels deep and not named "settings".
 */
export function SchoolDaySection({ settings, onSave }: Props) {
  const [draft, setDraft] = useState(settings);
  // Reset the draft when the saved rules change underneath it — a sync from
  // another device, say. Adjusting state during render is React's documented
  // answer here; an effect would render once with the stale draft first.
  const [savedSettings, setSavedSettings] = useState(settings);
  if (savedSettings !== settings) {
    setSavedSettings(settings);
    setDraft(settings);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (draft.schoolDayEnd <= draft.schoolDayStart) return;
    if (draft.preferredStudyEnd <= draft.preferredStudyStart) return;
    if (draft.lowEnergyEnd <= draft.lowEnergyStart) return;
    onSave(draft);
  }

  return (
    <div className="settings-section-body settings-school-day">
      <SchoolDayEditor
        draft={draft}
        setDraft={setDraft}
        onSubmit={submit}
        onCancel={() => setDraft(settings)}
      />
    </div>
  );
}
