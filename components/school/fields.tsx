import { CheckCircle2 } from "lucide-react";
import type { Subject } from "@/lib/school";

// The shared form furniture for every school editor.

export function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="school-field">
      <span>{label}</span>
      {children}
    </label>
  );
}

export function SubjectSelect({
  subjects,
  value,
  allowEmpty = false,
  onChange,
}: {
  subjects: Subject[];
  value: string;
  allowEmpty?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <FormField label="Subject">
      <select
        required={!allowEmpty}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {allowEmpty && <option value="">No subject</option>}
        {!allowEmpty && subjects.length === 0 && (
          <option value="">Add a subject first</option>
        )}
        {subjects.map((subject) => (
          <option value={subject.id} key={subject.id}>
            {subject.name}
          </option>
        ))}
      </select>
    </FormField>
  );
}

export function EditorFooter({
  onCancel,
}: {
  onCancel: () => void;
}) {
  return (
    <footer className="school-editor-footer">
      <button type="button" onClick={onCancel}>
        Cancel
      </button>
      <button type="submit">
        <CheckCircle2 size={14} /> Save
      </button>
    </footer>
  );
}
