import { Clock3 } from "lucide-react";
import type { FormEvent } from "react";
import type { SchoolClass, Subject } from "@/lib/school";
import { weekdays } from "@/components/school/constants";
import {
  EditorFooter,
  FormField,
  SubjectSelect,
} from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  draft: SchoolClass;
  setDraft: (schoolClass: SchoolClass) => void;
  subjects: Subject[];
  subjectFor: (id: string | null) => Subject | undefined;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/** A recurring timetable lesson: its subject, weekday, and time. */
export function ClassEditor({
  draft,
  setDraft,
  subjects,
  subjectFor,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <form className="school-class-form" onSubmit={onSubmit}>
      <section className="class-subject-field">
        <SubjectSelect
          subjects={subjects}
          value={draft.subjectId}
          onChange={(subjectId) =>
            setDraft({ ...draft, subjectId })
          }
        />
      </section>
      <section className="class-schedule-card">
        <header>
          <Clock3 size={16} />
          <div>
            <strong>Weekly time</strong>
            <small>
              {weekdays[draft.weekday - 1]} · {draft.startTime}–
              {draft.endTime}
            </small>
          </div>
        </header>
        <FormField label="Day">
          <select
            value={draft.weekday}
            onChange={(event) =>
              setDraft({
                ...draft,
                weekday: Number(event.target.value),
              })
            }
          >
            {weekdays.map((day, index) => (
              <option value={index + 1} key={day}>
                {day}
              </option>
            ))}
          </select>
        </FormField>
        <FormField label="Repeats">
          <select
            value={draft.weekPattern}
            onChange={(event) =>
              setDraft({
                ...draft,
                weekPattern: event.target.value as SchoolClass["weekPattern"],
              })
            }
          >
            <option value="every">Every week</option>
            <option value="a">Week A only</option>
            <option value="b">Week B only</option>
          </select>
        </FormField>
        <div className="form-pair class-time-pair">
          <FormField label="Starts">
            <TemporalField
              required
              mode="time"
              value={draft.startTime}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  startTime: value,
                })
              }
              ariaLabel="Choose lesson start time"
            />
          </FormField>
          <FormField label="Ends">
            <TemporalField
              required
              mode="time"
              value={draft.endTime}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  endTime: value,
                })
              }
              ariaLabel="Choose lesson end time"
            />
          </FormField>
        </div>
      </section>
      <details className="school-editor-details">
        <summary>
          <span>Class details</span>
          <small>Room and teacher</small>
        </summary>
        <div className="form-pair">
          <FormField label="Room">
            <input
              value={draft.room}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  room: event.target.value,
                })
              }
              placeholder={
                subjectFor(draft.subjectId)?.room || "Use subject"
              }
            />
          </FormField>
          <FormField label="Teacher">
            <input
              value={draft.teacher}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  teacher: event.target.value,
                })
              }
              placeholder={
                subjectFor(draft.subjectId)?.teacher ||
                "Use subject"
              }
            />
          </FormField>
        </div>
      </details>
      <details className="school-editor-details">
        <summary>
          <span>Repeats</span>
          <small>Every week from {draft.validFrom}</small>
        </summary>
        <div className="form-pair">
          <FormField label="First week">
            <TemporalField
              required
              mode="date"
              value={draft.validFrom}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  validFrom: value,
                })
              }
              ariaLabel="Choose first date"
            />
          </FormField>
          <FormField label="Last week">
            <TemporalField
              mode="date"
              value={draft.validUntil ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  validUntil: value || null,
                })
              }
              placeholder="No end date"
              ariaLabel="Choose last date"
            />
          </FormField>
        </div>
      </details>
      <EditorFooter onCancel={onCancel} />
    </form>
  );
}
