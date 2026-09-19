import type { FormEvent } from "react";
import type { Subject } from "@/lib/school";
import { subjectColor } from "@/components/school/format";
import { EditorFooter, FormField } from "@/components/school/fields";

type Props = {
  draft: Subject;
  setDraft: (subject: Subject) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
};

/** Name, short name, teacher, room, and colour for one subject. */
export function SubjectEditor({ draft, setDraft, onSubmit, onCancel }: Props) {
  return (
    <form onSubmit={onSubmit}>
      <FormField label="Name">
        <input
          required
          maxLength={80}
          autoFocus
          value={draft.name}
          onChange={(event) =>
            setDraft({
              ...draft,
              name: event.target.value,
              shortName:
                draft.shortName ||
                event.target.value
                  .replace(/[^a-z0-9]/gi, "")
                  .slice(0, 8)
                  .toUpperCase(),
            })
          }
          placeholder="Biology"
        />
      </FormField>
      <div className="form-pair">
        <FormField label="Short name">
          <input
            required
            maxLength={12}
            value={draft.shortName}
            onChange={(event) =>
              setDraft({
                ...draft,
                shortName: event.target.value,
              })
            }
            placeholder="BIO"
          />
        </FormField>
        <FormField label="Icon">
          <input
            maxLength={16}
            value={draft.icon}
            onChange={(event) =>
              setDraft({
                ...draft,
                icon: event.target.value,
              })
            }
            placeholder="🧬"
          />
        </FormField>
      </div>
      <FormField label="Teacher">
        <input
          maxLength={120}
          value={draft.teacher}
          onChange={(event) =>
            setDraft({
              ...draft,
              teacher: event.target.value,
            })
          }
          placeholder="Ms Jensen"
        />
      </FormField>
      <div className="form-pair">
        <FormField label="Room">
          <input
            maxLength={80}
            value={draft.room}
            onChange={(event) =>
              setDraft({
                ...draft,
                room: event.target.value,
              })
            }
            placeholder="B204"
          />
        </FormField>
        <FormField label="Color">
          <input
            type="color"
            value={subjectColor(draft)}
            onChange={(event) =>
              setDraft({
                ...draft,
                color: event.target.value,
              })
            }
          />
        </FormField>
      </div>
      <EditorFooter onCancel={onCancel} />
    </form>
  );
}
