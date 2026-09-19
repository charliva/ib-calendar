"use client";

import { useState } from "react";
import type { OnboardingMode } from "@/lib/onboarding/entry";
import type { OnboardingState } from "@/lib/onboarding/state";
import type { DeadLetterMutation } from "@/lib/offline";
import type { SchoolDaySettings } from "@/lib/school";
import type { AccountPreferences } from "@/lib/settings/account-preferences";
import { OverlayPanel } from "@/components/overlay/OverlayPanel";
import {
  SETTINGS_SECTIONS,
  type SettingsSectionId,
} from "@/components/settings/sections";
import { OnboardingSection } from "@/components/settings/sections/OnboardingSection";
import { ProfileSection } from "@/components/settings/sections/ProfileSection";
import { SchoolDaySection } from "@/components/settings/sections/SchoolDaySection";
import { SyncSection } from "@/components/settings/sections/SyncSection";
import { WeekCycleSection } from "@/components/settings/sections/WeekCycleSection";

type Props = {
  open: boolean;
  onClose: () => void;
  hasAccount: boolean;
  showDeveloperOverride: boolean;
  /** Opened directly on a section when something deep-links into settings. */
  initialSection?: SettingsSectionId | null;
  schoolDaySettings: SchoolDaySettings;
  onSaveSchoolDaySettings: (settings: SchoolDaySettings) => void;
  accountPreferences: AccountPreferences;
  onSaveAccountPreferences: (preferences: AccountPreferences) => void;
  onboardingState: OnboardingState;
  onReplayTour: () => void;
  onReimportTimetable: () => void;
  onForceOnboardingMode: (mode: OnboardingMode | null) => void;
  pendingCount: number;
  deadLettered: DeadLetterMutation[];
  onRetryDeadLetter: (mutation: DeadLetterMutation) => void;
  onDiscardDeadLetter: (mutation: DeadLetterMutation) => void;
};

/**
 * Everything a student can configure, in one place.
 *
 * Before this existed the only preference surface in the app was a form behind
 * a button labelled "Rules" inside the Timetable tab, and the account panel
 * held no preferences at all. Sections are described as data in
 * `sections/index.ts` so that adding one is an edit to a list rather than to
 * this component.
 */
export function SettingsPanel(props: Props) {
  const [expanded, setExpanded] = useState<SettingsSectionId | null>(
    props.initialSection ?? "school-day",
  );

  const sections = SETTINGS_SECTIONS.filter(
    (section) => props.hasAccount || !section.requiresAccount,
  );

  function renderSection(id: SettingsSectionId) {
    switch (id) {
      case "school-day":
        return (
          <SchoolDaySection
            settings={props.schoolDaySettings}
            onSave={props.onSaveSchoolDaySettings}
          />
        );
      case "week-cycle":
        return (
          <WeekCycleSection
            anchor={props.schoolDaySettings.weekPatternAnchor}
            onChange={(weekPatternAnchor) =>
              props.onSaveSchoolDaySettings({
                ...props.schoolDaySettings,
                weekPatternAnchor,
              })
            }
          />
        );
      case "profile":
        return (
          <ProfileSection
            preferences={props.accountPreferences}
            onChange={props.onSaveAccountPreferences}
          />
        );
      case "onboarding":
        return (
          <OnboardingSection
            state={props.onboardingState}
            showDeveloperOverride={props.showDeveloperOverride}
            onReplayTour={() => {
              props.onReplayTour();
              props.onClose();
            }}
            onReimportTimetable={() => {
              props.onReimportTimetable();
              props.onClose();
            }}
            onForceMode={(mode) => {
              props.onForceOnboardingMode(mode);
              props.onClose();
            }}
          />
        );
      case "sync":
        return (
          <SyncSection
            hasAccount={props.hasAccount}
            pendingCount={props.pendingCount}
            deadLettered={props.deadLettered}
            onRetryDeadLetter={props.onRetryDeadLetter}
            onDiscardDeadLetter={props.onDiscardDeadLetter}
          />
        );
    }
  }

  return (
    <OverlayPanel
      id="settings"
      open={props.open}
      onClose={props.onClose}
      title="Settings"
      className="settings-panel"
    >
      <ul className="settings-sections">
        {sections.map((section) => {
          const isOpen = expanded === section.id;
          return (
            <li
              key={section.id}
              className={`settings-section${isOpen ? " is-open" : ""}`}
            >
              <button
                type="button"
                className="settings-section-toggle"
                aria-expanded={isOpen}
                onClick={() => setExpanded(isOpen ? null : section.id)}
              >
                <span>
                  <strong>{section.title}</strong>
                  <small>{section.summary}</small>
                </span>
                <span aria-hidden="true" className="settings-section-chevron">
                  {isOpen ? "–" : "+"}
                </span>
              </button>
              {isOpen ? renderSection(section.id) : null}
            </li>
          );
        })}
      </ul>
    </OverlayPanel>
  );
}
