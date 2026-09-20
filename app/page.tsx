import { redirect } from "next/navigation";

/**
 * The app itself lives at /calendar; this only forwards.
 *
 * The query string has to come with it. Invitation links are handed out as
 * `/?invite=<token>`, and app/calendar/page.tsx reads that token back out of
 * window.location.search — so a bare `redirect("/calendar")` dropped it and
 * made every invite unredeemable. Carrying the whole query rather than just
 * `invite` keeps any future entry-point parameter working too.
 */
export default async function RootPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (Array.isArray(value)) for (const entry of value) params.append(key, entry);
    else if (value !== undefined) params.set(key, value);
  }
  const query = params.toString();
  redirect(query ? `/calendar?${query}` : "/calendar");
}
