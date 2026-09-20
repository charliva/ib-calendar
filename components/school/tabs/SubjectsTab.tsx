import type { CSSProperties } from "react";
import {
  BookOpen,
  GraduationCap,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import {
  latestSignalFor,
  type LearningSource,
} from "@/lib/study-intelligence";
import type { Subject } from "@/lib/school";
import { subjectColor } from "@/components/school/format";
import { SchoolEmpty } from "@/components/school/SchoolEmpty";
import { LearningControls } from "@/app/learning-controls";
import type {
  Editor,
  SchoolTab,
  SchoolWorkspaceProps,
} from "@/components/school/types";

type Props = SchoolWorkspaceProps & {
  subjectFor: (id: string | null) => Subject | undefined;
  openEditor: (next: Editor) => void;
  setEditor: (editor: Editor | null) => void;
  setTab: (tab: SchoolTab) => void;
  setSubjectDraft: (subject: Subject | null) => void;
};

/** The subject list, each card carrying its own challenge controls. */
export function SubjectsTab(props: Props) {
  const {
    subjects,
    openEditor,
    setEditor,
    setSubjectDraft,
  } = props;
  return (
      <>
        <div className="school-section-bar">
          <div>
            <span className="micro-label">Defaults for lessons</span>
            <h2>Subjects</h2>
          </div>
          <button
            className="school-primary"
            type="button"
            onClick={() => openEditor("subject")}
          >
            <Plus size={14} /> Subject
          </button>
        </div>
        {subjects.length === 0 ? (
          <SchoolEmpty
            icon={BookOpen}
            title="No subjects yet"
            copy="Add the subjects you take, with optional teacher and room defaults."
            action="Add subject"
            onAction={() => openEditor("subject")}
          />
        ) : (
          <div className="subject-grid">
            {subjects.map((subject) => {
              const source: LearningSource = { type: "subject", id: subject.id, title: subject.name, subjectId: subject.id, subjectName: subject.name, context: [subject.teacher, subject.room].filter(Boolean).join(" · ") };
              return (
              <article
                className="subject-card"
                key={subject.id}
                style={
                  {
                    "--subject": subjectColor(subject),
                  } as CSSProperties
                }
              >
                <i />
                <header>
                  <span>{subject.icon || subject.shortName.slice(0, 2)}</span>
                  <div className="record-actions">
                    <button
                      type="button"
                      title="Edit subject"
                      onClick={() => {
                        setSubjectDraft(structuredClone(subject));
                        setEditor("subject");
                      }}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      title="Delete subject"
                      onClick={() => props.onDeleteSubject(subject)}
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </header>
                <strong>{subject.name}</strong>
                <small>{subject.shortName}</small>
                <LearningControls compact source={source} value={latestSignalFor(source, props.learningSignals)?.challengeLevel ?? null} onChallenge={props.onChallenge} onGoDeeper={props.onGoDeeper} />
                <footer>
                  <span>
                    <GraduationCap size={12} />
                    {subject.teacher || "No teacher"}
                  </span>
                  <span>
                    <MapPin size={12} />
                    {subject.room || "No room"}
                  </span>
                </footer>
              </article>
              );
            })}
          </div>
        )}
      </>
  );
}
