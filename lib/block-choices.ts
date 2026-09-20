import { filterSuggestionsForPicker } from "./block-suggestion-safety.ts";
import {
  type BlockChoice,
  type BlockChoiceInput,
  type BlockChoiceStatus,
  type BlockSuggestion,
  type TimeBlockContext,
  type TimeBlockType,
} from "./block-choices/types.ts";
import { inferCurrentTimeBlock } from "./block-choices/blocks.ts";
import {
  emitBlockSuggestionTelemetry,
  meaningfulSuggestion,
  recoverySuggestion,
  responsibilitySuggestion,
} from "./block-choices/suggestions.ts";

// The contextual block picker: given where the student is in their day, offer
// a small set of things they could do next, and remember which one they chose.
//
// This file is the entry point. The work is split across `block-choices/`:
// `types` (vocabulary), `blocks` (which block is it), `activities` (what could
// fill it), and `suggestions` (the three offers). Everything the rest of the
// app imports is re-exported here, so `@/lib/block-choices` stays the one
// import path.

export * from "./block-choices/types.ts";
export { inferCurrentTimeBlock } from "./block-choices/blocks.ts";

export function buildBlockChoice(input: BlockChoiceInput): BlockChoice | null {
  // CHOKEPORT INVARIANT (PR1): every suggestion emitted from this function
  // MUST pass through `filterSuggestionsForPicker`. No caller may render or
  // return picker suggestions without going through the safety filter. The
  // filter is the single public chokepoint; see lib/block-suggestion-safety.ts.
  // It fails closed: unknown sources, unknown categories, missing fields, and
  // blocked terms are dropped, never passed through.
  const block = inferCurrentTimeBlock(input);
  if (!block.context.flexible || block.context.availableMinutes < 5) return null;
  const existing = input.recentChoices.find(
    (choice) => choice.blockKey === block.key,
  );
  if (existing) return existing;
  const nowIso = input.now.toISOString();
  const rawSuggestions = [
    recoverySuggestion(block, input),
    responsibilitySuggestion(block, input),
    meaningfulSuggestion(block, input),
  ];
  const safeSuggestions = filterSuggestionsForPicker(rawSuggestions).slice(0, 2);
  if (safeSuggestions.length === 0) return null;
  emitBlockSuggestionTelemetry(safeSuggestions, input.currentEnergy);
  return {
    id: crypto.randomUUID(),
    blockKey: block.key,
    blockType: block.type,
    startsAt: block.startsAt,
    endsAt: block.endsAt,
    context: block.context,
    suggestions: safeSuggestions,
    selectedSuggestionId: null,
    status: "suggested",
    selectedAt: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

export function updateBlockChoice(
  choice: BlockChoice,
  selectedSuggestionId: string | null,
  status: BlockChoiceStatus,
  now = new Date(),
): BlockChoice {
  const hasSelection = Boolean(
    selectedSuggestionId &&
      choice.suggestions.some((suggestion) => suggestion.id === selectedSuggestionId),
  );
  return {
    ...choice,
    selectedSuggestionId: hasSelection ? selectedSuggestionId : null,
    status: hasSelection ? (status === "suggested" ? "selected" : status) : "suggested",
    selectedAt: hasSelection ? now.toISOString() : null,
    updatedAt: now.toISOString(),
  };
}

export function blockChoiceToRow(choice: BlockChoice) {
  return {
    id: choice.id,
    block_key: choice.blockKey,
    block_type: choice.blockType,
    starts_at: choice.startsAt,
    ends_at: choice.endsAt,
    context: choice.context,
    suggestions: choice.suggestions,
    selected_suggestion_id: choice.selectedSuggestionId,
    status: choice.status,
    selected_at: choice.selectedAt,
  };
}

export function rowToBlockChoice(row: Record<string, unknown>): BlockChoice {
  return {
    id: String(row.id),
    blockKey: String(row.block_key),
    blockType: row.block_type as TimeBlockType,
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    context: row.context as TimeBlockContext,
    suggestions: Array.isArray(row.suggestions)
      ? filterSuggestionsForPicker(
          (row.suggestions as BlockSuggestion[]).slice(0, 3),
        )
      : [],  // The DB constraint allows 1–3 elements (PR1). Re-validate
      // through the chokepoint on read so the invariant holds for legacy
      // rows, out-of-band writes, and any other client that bypasses the
      // app's write path.
    selectedSuggestionId:
      typeof row.selected_suggestion_id === "string"
        ? row.selected_suggestion_id
        : null,
    status: row.status as BlockChoiceStatus,
    selectedAt: typeof row.selected_at === "string" ? row.selected_at : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}
