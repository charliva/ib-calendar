/**
 * Clerk appearance tuned to match the rest of the app: a calm, editorial
 * paper aesthetic built around `#fffefa` (paper), `#151419` (ink), the
 * lilac accent, and the Outfit / Space Grotesk fonts already loaded on
 * the page.
 *
 * Avoids the high-saturation "shadcn" default. Inputs are bordered instead
 * of underlined, the primary button keeps a quiet ink fill, and social
 * providers are demoted below email so a passwordless email code is the
 * obvious path. CSS-side overrides in `app/globals.css` cover everything
 * outside the variables block so we do not have to keep up with Clerk's
 * deep element-namespace churn.
 */

export const clerkVariables = {
  // Color
  colorPrimary: "#5c5590",
  colorBackground: "#fffefa",
  colorInputBackground: "#ffffff",
  colorInputText: "#151419",
  colorText: "#151419",
  colorTextSecondary: "#77736d",
  colorDanger: "#9a2436",
  colorSuccess: "#3b7a5c",
  colorWarning: "#b08947",
  colorNeutral: "#29272e",
  colorShimmer: "#f4f2ed",

  // Shape
  borderRadius: "10px",

  // Type
  fontFamily: "var(--font-sans), 'Outfit', system-ui, sans-serif",
  fontFamilyButtons: "var(--font-sans), 'Outfit', system-ui, sans-serif",
  fontSize: "14px",
  fontWeight: { normal: 400, medium: 500, semibold: 600, bold: 700 },

  // Spacing
  spacingUnit: "10px",
} as const;
