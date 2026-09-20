import type { SupabaseClient } from "@supabase/supabase-js";
import type { RefObject } from "react";
import {
  applyProposal,
  flexibilityForNewItem,
  makeItem,
  validateProposal,
  type CalendarItem,
  type CalendarProposal,
  type ProposalChange,
} from "@/lib/calendar-engine";
import {
  documentMediaType,
  isExtractionResponse,
} from "@/lib/ai/timetable-parser";
import {
  isImportedTimetableItem,
  isItemInWeek,
  reconcileTimetableImport,
  removeSubjectFromTimetableProposal,
  type RejectedTimetableCandidate,
} from "@/lib/timetable-import";
import { subjectToRow, type Subject } from "@/lib/school";
import type { PendingMutation } from "@/lib/offline";
import { transitionState } from "@/app/calendar/view-types";

type TimetableSubjectProposal = {
  proposalId: string;
  subjects: Subject[];
  reviewed: boolean;
};

type TimetableImportIssues = {
  proposalId: string;
  issues: RejectedTimetableCandidate[];
};

type ProposalsParams = {
  supabase: SupabaseClient;
  items: CalendarItem[];
  subjects: Subject[];
  proposal: CalendarProposal | null;
  timetableSubjectProposal: TimetableSubjectProposal | null;
  /** Cleared after every import so the same file can be picked again. */
  fileInputRef: RefObject<HTMLInputElement | null>;
  setItems: (items: CalendarItem[]) => void;
  setSubjects: React.Dispatch<React.SetStateAction<Subject[]>>;
  setProposal: React.Dispatch<React.SetStateAction<CalendarProposal | null>>;
  setTimetableSubjectProposal: React.Dispatch<
    React.SetStateAction<TimetableSubjectProposal | null>
  >;
  setTimetableImportIssues: (issues: TimetableImportIssues | null) => void;
  setTimetableImportBusy: (busy: boolean) => void;
  setCommandBusy: (busy: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  setAnchorDate: (day: string) => void;
  setSelectedDay: (day: string) => void;
  setNotice: (notice: string) => void;
  persistMutation: (mutation: PendingMutation) => Promise<boolean>;
  recordHistory: (label: string) => void;
  syncSnapshotDiff: (
    before: CalendarItem[],
    after: CalendarItem[],
    dependencyForItem?: (item: CalendarItem) => string | undefined,
  ) => void;
};

/**
 * Document and timetable extraction, and the review step every proposal goes
 * through before it is applied.
 *
 * Nothing extracted is written straight to the calendar: it becomes a proposal
 * the user reviews, so an unclear screenshot costs a dismissal rather than a
 * corrupted week. A timetable import additionally holds back until its newly
 * detected subjects have been named and confirmed.
 */
export function useProposals({
  supabase,
  items,
  subjects,
  proposal,
  timetableSubjectProposal,
  fileInputRef,
  setItems,
  setSubjects,
  setProposal,
  setTimetableSubjectProposal,
  setTimetableImportIssues,
  setTimetableImportBusy,
  setCommandBusy,
  setPaletteOpen,
  setAnchorDate,
  setSelectedDay,
  setNotice,
  persistMutation,
  recordHistory,
  syncSnapshotDiff,
}: ProposalsParams) {
  async function onDocumentSelected(
    file: File | null,
    options: {
      mode?: "calendar_document" | "school_timetable";
      weekStart?: string;
    } = {},
  ) {
    if (!file) return;
    const timetableMode = options.mode === "school_timetable";
    const mediaType = documentMediaType(file);
    if (timetableMode && !mediaType.startsWith("image/")) {
      setNotice("Choose an image screenshot for the weekly timetable import.");
      return;
    }
    if (file.size > 5_000_000) {
      setNotice("Choose a document smaller than 5 MB.");
      return;
    }
    if (timetableMode) setTimetableImportBusy(true);
    else setCommandBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session?.access_token)
        throw new Error("Sign in to use document extraction");
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result);
          resolve(
            result.startsWith("data:;base64,")
              ? result.replace("data:;base64,", `data:${mediaType};base64,`)
              : result,
          );
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session.access_token}`,
        },
        body: JSON.stringify({
          filename: file.name,
          mediaType,
          data,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          mode: options.mode ?? "calendar_document",
          weekStart: options.weekStart,
          subjects: timetableMode
            ? subjects.map((subject) => ({
                name: subject.name ?? "",
                shortName: subject.shortName ?? "",
                teacher: subject.teacher ?? "",
                room: subject.room ?? "",
              }))
            : [],
        }),
      });
      const raw: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const message =
          raw &&
          typeof raw === "object" &&
          "error" in raw &&
          typeof raw.error === "string"
            ? raw.error
            : "Extraction failed";
        throw new Error(message);
      }
      if (!isExtractionResponse(raw)) {
        throw new Error("AI returned an invalid document proposal");
      }
      if (timetableMode && options.weekStart) {
        const { lessons, newSubjects, rejected } = reconcileTimetableImport(
          raw.items,
          options.weekStart,
          subjects,
        );
        if (!lessons.length) {
          throw new Error("No exact lessons found in the selected week");
        }
        const previousWeek = items.filter(
          (item) =>
            isImportedTimetableItem(item) &&
            isItemInWeek(item, options.weekStart!),
        );
        const changes: ProposalChange[] = [
          ...previousWeek.map((item) => ({
            id: crypto.randomUUID(),
            type: "delete" as const,
            itemId: item.id,
            reason: "Replace the previous screenshot import for this week.",
            before: item,
            after: null,
          })),
          ...lessons.map(({ item, evidence }) => ({
            id: crypto.randomUUID(),
            type: "create" as const,
            itemId: null,
            reason: evidence,
            before: null,
            after: item,
          })),
        ];
        const proposalId = crypto.randomUUID();
        setProposal({
          id: proposalId,
          title: `Import ${lessons.length} timetable lesson${lessons.length === 1 ? "" : "s"}`,
          summary: `${previousWeek.length ? `Replace ${previousWeek.length} earlier imported lesson${previousWeek.length === 1 ? "" : "s"}. ` : ""}${newSubjects.length ? `Add ${newSubjects.length} new subject${newSubjects.length === 1 ? "" : "s"}; similar labels were matched to subjects you already have. ` : ""}${rejected.length ? `Hold ${rejected.length} unclear or conflicting row${rejected.length === 1 ? "" : "s"} for review. ` : ""}This applies only to the week of ${options.weekStart}. Review everything before applying.`,
          source: "document",
          changes,
        });
        setTimetableImportIssues(
          rejected.length ? { proposalId, issues: rejected } : null,
        );
        setTimetableSubjectProposal(
          newSubjects.length
            ? { proposalId, subjects: newSubjects, reviewed: false }
            : null,
        );
        setAnchorDate(options.weekStart);
        setSelectedDay(options.weekStart);
        setPaletteOpen(false);
        return;
      }
      const changes: ProposalChange[] = raw.items.map((candidate) => ({
        id: crypto.randomUUID(),
        type: "create",
        itemId: null,
        reason: candidate.evidence,
        before: null,
        after: makeItem({
          ...candidate,
          id: crypto.randomUUID(),
          flexibility: flexibilityForNewItem({
            kind: candidate.kind,
            flexibility: candidate.flexibility,
            constraints: candidate.constraints,
          }),
          source: "document",
          syncStatus: "pending",
        }),
      }));
      setProposal({
        id: crypto.randomUUID(),
        title: raw.title,
        summary: raw.summary,
        source: "document",
        changes,
      });
      setTimetableSubjectProposal(null);
      setPaletteOpen(false);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "";
      setNotice(
        timetableMode
          ? reason ||
              "I couldn’t find exact lessons in that screenshot. Check the selected week and try a clearer full timetable image."
          : "I couldn’t read that file. Try a clear image, text file, or PDF.",
      );
    } finally {
      if (timetableMode) setTimetableImportBusy(false);
      else setCommandBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function approveProposal() {
    if (!proposal) return;
    if (
      timetableSubjectProposal?.proposalId === proposal.id &&
      !timetableSubjectProposal.reviewed
    ) {
      setNotice("Review the detected subjects before applying the timetable.");
      return;
    }
    const validation = validateProposal(proposal, items);
    if (!validation.valid) {
      setNotice("This proposal failed deterministic scheduling checks.");
      return;
    }
    const importedSubjects =
      timetableSubjectProposal?.proposalId === proposal.id
        ? timetableSubjectProposal.subjects
        : [];
    const failedSubjectIds = new Set<string>();
    if (importedSubjects.length) {
      setSubjects((current) => [
        ...current.filter(
          (subject) =>
            !importedSubjects.some((candidate) => candidate.id === subject.id),
        ),
        ...importedSubjects,
      ]);
      const results = await Promise.all(
        importedSubjects.map(async (subject) => ({
          id: subject.id,
          synced: await persistMutation({
            table: "subjects",
            action: "upsert",
            recordId: subject.id,
            payload: subjectToRow(subject),
          }),
        })),
      );
      results.forEach(({ id, synced }) => {
        if (!synced) failedSubjectIds.add(id);
      });
    }
    recordHistory(proposal.title);
    const next = applyProposal(proposal, items).map((item) => ({
      ...item,
      syncStatus: "pending" as const,
    }));
    transitionState(() => setItems(next));
    syncSnapshotDiff(items, next, (item) =>
      item.subjectId && failedSubjectIds.has(item.subjectId)
        ? `subjects:record:${item.subjectId}`
        : undefined,
    );
    setProposal(null);
    setTimetableSubjectProposal(null);
    setTimetableImportIssues(null);
    setNotice(
      `Applied: ${proposal.title}.${
        importedSubjects.length
          ? ` Added ${importedSubjects.length} subject${importedSubjects.length === 1 ? "" : "s"}.`
          : ""
      } Cmd+Z to undo calendar changes.`,
    );
  }

  function closeProposal() {
    setProposal(null);
    setTimetableSubjectProposal(null);
    setTimetableImportIssues(null);
  }

  function skipProposalChange(changeId: string) {
    setProposal((current) =>
      current
        ? {
            ...current,
            changes: current.changes.filter((change) => change.id !== changeId),
          }
        : current,
    );
  }

  function updateTimetableSubject(
    subjectId: string,
    patch: Partial<
      Pick<Subject, "name" | "shortName" | "teacher" | "room" | "color">
    >,
  ) {
    const currentSubject = timetableSubjectProposal?.subjects.find(
      (subject) => subject.id === subjectId,
    );
    if (!currentSubject) return;
    if (patch.name !== undefined && patch.name !== currentSubject.name) {
      setProposal((current) =>
        current
          ? {
              ...current,
              changes: current.changes.map((change) =>
                change.after?.title === currentSubject.name
                  ? {
                      ...change,
                      after: {
                        ...change.after,
                        title: patch.name || currentSubject.name,
                      },
                    }
                  : change,
              ),
            }
          : current,
      );
    }
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            subjects: current.subjects.map((subject) =>
              subject.id === subjectId ? { ...subject, ...patch } : subject,
            ),
          }
        : current,
    );
  }

  function addTimetableSubject() {
    const subject: Subject = {
      id: crypto.randomUUID(),
      name: "",
      shortName: "",
      teacher: "",
      room: "",
      color: "#7f70e8",
      icon: "",
      createdAt: new Date().toISOString(),
    };
    setTimetableSubjectProposal((current) =>
      current
        ? { ...current, subjects: [...current.subjects, subject] }
        : current,
    );
  }

  function removeTimetableSubject(subjectId: string) {
    setProposal((current) =>
      current ? removeSubjectFromTimetableProposal(current, subjectId) : current,
    );
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            subjects: current.subjects.filter(
              (subject) => subject.id !== subjectId,
            ),
          }
        : current,
    );
  }

  function finishTimetableSubjectReview() {
    const pending = timetableSubjectProposal?.subjects ?? [];
    if (
      pending.some(
        (subject) => !subject.name.trim() || !subject.shortName.trim(),
      )
    ) {
      setNotice("Give every new subject a name and short name, or remove it.");
      return;
    }
    setProposal((current) =>
      current
        ? {
            ...current,
            changes: current.changes.map((change) => {
              const subject = pending.find(
                (candidate) => candidate.name === change.after?.title,
              );
              return subject && change.after
                ? {
                    ...change,
                    after: { ...change.after, title: subject.name.trim() },
                  }
                : change;
            }),
          }
        : current,
    );
    setTimetableSubjectProposal((current) =>
      current
        ? {
            ...current,
            reviewed: true,
            subjects: current.subjects.map((subject) => ({
              ...subject,
              name: subject.name.trim(),
              shortName: subject.shortName.trim().toUpperCase(),
              teacher: subject.teacher.trim(),
              room: subject.room.trim(),
            })),
          }
        : current,
    );
  }

  return {
    onDocumentSelected,
    approveProposal,
    closeProposal,
    skipProposalChange,
    updateTimetableSubject,
    addTimetableSubject,
    removeTimetableSubject,
    finishTimetableSubjectReview,
  };
}
