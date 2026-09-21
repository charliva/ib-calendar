import { z } from "zod";

/**
 * What /api/extract accepts.
 *
 * Two modes share the route. `calendar_document` is the general "turn this
 * file into a proposed calendar" path behind the command palette, and takes
 * anything the palette's file input accepts — an image, a PDF, plain text or
 * CSV. `school_timetable` is the weekly-screenshot import in the School tab,
 * which is image-only and has to be told which week the screenshot is of;
 * without that week there is nothing to anchor the extracted lessons to, so
 * the schema refuses the request rather than letting the model guess.
 *
 * It lives here rather than inline in the route so the contract can be tested
 * directly — a caller asking for timetable mode without a week is a wiring
 * bug, and it is worth failing loudly at the boundary.
 */
export const extractRequestSchema = z
  .object({
    filename: z.string().trim().min(1).max(180),
    mediaType: z
      .string()
      .refine(
        (value) =>
          value.startsWith("image/") ||
          value === "application/pdf" ||
          value.startsWith("text/"),
        "Unsupported file type",
      ),
    data: z.string().min(1).max(8_000_000),
    timezone: z.string().trim().min(1).max(80),
    mode: z
      .enum(["calendar_document", "school_timetable"])
      .default("calendar_document"),
    weekStart: z.string().date().optional(),
    subjects: z
      .array(
        z.object({
          name: z.string().trim().min(1).max(120),
          shortName: z.string().trim().max(30),
          teacher: z.string().trim().max(120),
          room: z.string().trim().max(80),
        }),
      )
      .max(50)
      .default([]),
  })
  .superRefine((value, context) => {
    if (value.mode === "school_timetable" && !value.weekStart) {
      context.addIssue({
        code: "custom",
        path: ["weekStart"],
        message: "A target week is required for timetable screenshots",
      });
    }
  });
