import { Trash2 } from "lucide-react";
import type { FormEvent } from "react";
import type {
  ClassException,
  LessonExceptionStatus,
  SchoolClass,
  Subject,
} from "@/lib/school";
import { weekdays } from "@/components/school/constants";
import { EditorFooter, FormField } from "@/components/school/fields";
import { TemporalField } from "@/app/ui/temporal-field";

type Props = {
  draft: ClassException;
  setDraft: (exception: ClassException) => void;
  classes: SchoolClass[];
  classExceptions: ClassException[];
  subjectFor: (id: string | null) => Subject | undefined;
  onDeleteException: (exception: ClassException) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/**
 * A one-off change to a recurring lesson — cancelled, or moved to another time
 * or room. The lesson itself is never edited, so the series stays intact.
 */
export function ExceptionEditor({
  draft,
  setDraft,
  classes,
  classExceptions,
  subjectFor,
  onDeleteException,
  onSubmit,
  onCancel,
}: Props) {
  return (
    <form onSubmit={onSubmit}>
      <FormField label="Lesson">
        <select
          required
          value={draft.classId}
          onChange={(event) =>
            setDraft({
              ...draft,
              classId: event.target.value,
            })
          }
        >
          {classes.map((lesson) => (
            <option value={lesson.id} key={lesson.id}>
              {subjectFor(lesson.subjectId)?.name} ·{" "}
              {weekdays[lesson.weekday - 1]} {lesson.startTime}
            </option>
          ))}
        </select>
      </FormField>
      <div className="form-pair">
        <FormField label="Original date">
          <TemporalField
            required
            mode="date"
            value={draft.occurrenceDate}
            onChange={(value) =>
              setDraft({
                ...draft,
                occurrenceDate: value,
              })
            }
            ariaLabel="Choose original lesson date"
          />
        </FormField>
        <FormField label="Change">
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({
                ...draft,
                status: event.target
                  .value as LessonExceptionStatus,
              })
            }
          >
            <option value="cancelled">Cancelled</option>
            <option value="rescheduled">Rescheduled</option>
          </select>
        </FormField>
      </div>
      {draft.status === "rescheduled" && (
        <>
          <FormField label="New date">
            <TemporalField
              required
              mode="date"
              value={draft.replacementDate ?? ""}
              onChange={(value) =>
                setDraft({
                  ...draft,
                  replacementDate: value || null,
                })
              }
              ariaLabel="Choose replacement date"
            />
          </FormField>
          <div className="form-pair">
            <FormField label="New start">
              <TemporalField
                required
                mode="time"
                value={draft.replacementStartTime ?? ""}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    replacementStartTime: value || null,
                  })
                }
                ariaLabel="Choose replacement start time"
              />
            </FormField>
            <FormField label="New end">
              <TemporalField
                required
                mode="time"
                value={draft.replacementEndTime ?? ""}
                onChange={(value) =>
                  setDraft({
                    ...draft,
                    replacementEndTime: value || null,
                  })
                }
                ariaLabel="Choose replacement end time"
              />
            </FormField>
          </div>
          <FormField label="New room">
            <input
              value={draft.replacementRoom}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  replacementRoom: event.target.value,
                })
              }
              placeholder="Optional"
            />
          </FormField>
        </>
      )}
      <FormField label="Note">
        <textarea
          value={draft.notes}
          onChange={(event) =>
            setDraft({
              ...draft,
              notes: event.target.value,
            })
          }
          placeholder="Reason or changed details"
        />
      </FormField>
      <EditorFooter onCancel={onCancel} />
      {classExceptions.some(
        (entry) =>
          entry.classId === draft.classId &&
          entry.occurrenceDate === draft.occurrenceDate,
      ) && (
        <button
          className="editor-delete"
          type="button"
          onClick={() => {
            const existing = classExceptions.find(
              (entry) =>
                entry.classId === draft.classId &&
                entry.occurrenceDate ===
                  draft.occurrenceDate,
            );
            if (existing) onDeleteException(existing);
            onCancel();
          }}
        >
          <Trash2 size={13} /> Remove this change
        </button>
      )}
    </form>
  );
}
