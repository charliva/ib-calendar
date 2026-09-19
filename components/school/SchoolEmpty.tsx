import { BookOpen, Plus } from "lucide-react";

/** The empty state for a school tab, with the one action that fills it. */
export function SchoolEmpty({
  icon: Icon,
  title,
  copy,
  action,
  onAction,
}: {
  icon: typeof BookOpen;
  title: string;
  copy: string;
  action: string;
  onAction: () => void;
}) {
  return (
    <div className="school-empty">
      <Icon size={24} />
      <h3>{title}</h3>
      <p>{copy}</p>
      <button type="button" onClick={onAction}>
        <Plus size={13} /> {action}
      </button>
    </div>
  );
}
