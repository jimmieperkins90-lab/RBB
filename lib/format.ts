// Shared number formatting for everything displayed on the site.
//
// fmtNum(1234.56)    -> "1,234.6"   (default: 1 decimal place, like the old .toFixed(1))
// fmtNum(1234.56, 2) -> "1,234.56"
// fmtNum(1500, 0)    -> "1,500"
// fmtNum(98.4)       -> "98.4"      (numbers under 1,000 look exactly as before)
//
// Always a fixed number of decimals, so columns of numbers stay aligned. Pure function
// (no React, no Supabase), safe to import from server and "use client" components.
export function fmtNum(value: number | string | null | undefined, decimals = 1): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}
