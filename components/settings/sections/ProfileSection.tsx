"use client";

import {
  availableTimezones,
  detectTimezone,
  type AccountPreferences,
} from "@/lib/settings/account-preferences";
import { FormField } from "@/components/school/fields";

type Props = {
  preferences: AccountPreferences;
  onChange: (preferences: AccountPreferences) => void;
};

export function ProfileSection({ preferences, onChange }: Props) {
  const detected = detectTimezone();
  const zones = availableTimezones();

  return (
    <div className="settings-section-body">
      <FormField label="Name">
        <input
          value={preferences.displayName}
          placeholder="What should we call you?"
          onChange={(event) =>
            onChange({ ...preferences, displayName: event.target.value })
          }
        />
      </FormField>
      <FormField label="Timezone">
        <select
          value={preferences.timezone}
          onChange={(event) =>
            onChange({ ...preferences, timezone: event.target.value })
          }
        >
          {zones.includes(preferences.timezone) ? null : (
            <option value={preferences.timezone}>{preferences.timezone}</option>
          )}
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
      </FormField>
      {preferences.timezone === detected ? null : (
        <button
          type="button"
          className="settings-inline-action"
          onClick={() => onChange({ ...preferences, timezone: detected })}
        >
          Use this device&rsquo;s timezone ({detected})
        </button>
      )}
    </div>
  );
}
