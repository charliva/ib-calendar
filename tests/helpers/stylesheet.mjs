import { readFileSync } from "node:fs";

// `app/globals.css` is an index of `@import` statements, so reading it alone
// sees no rules. This resolves that graph in import order, which is also
// cascade order, giving tests the stylesheet the browser actually gets.
export function readStylesheet(entry = new URL("../../app/globals.css", import.meta.url)) {
  const source = readFileSync(entry, "utf8");
  return source.replace(/@import\s+"(\.[^"]+)";/g, (match, specifier) =>
    readStylesheet(new URL(specifier, entry)),
  );
}
