const ENV_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME?.trim();

export const APP_NAME = ENV_APP_NAME || "MapPlaner";

export const APP_TAGLINE = "Wałbrzych · kursówki & GPS";
export const APP_TITLE = `${APP_NAME} — planer tras, kursówki Wałbrzych i PDF`;
export const APP_DESCRIPTION = `${APP_NAME} — planer tras autobusowych z kursówkami Wałbrzych GTFS, sygnalizacją świetlną, korkami oraz pozycjami GPS autobusów ZDKiUM, ŚKA i MZUK.`;

export const PRINT_BRAND_PLACEHOLDER = "{{APP_NAME}}";
export const PRINT_HEADER_TEMPLATE = "{{APP_NAME}} / {{SECTION}}";
export const PRINT_TITLE_TEMPLATE = "{{APP_NAME}} - cała trasa";

export function resolveBrandPlaceholders(
  template: string,
  brandName: string = APP_NAME,
  extras: Record<string, string> = {}
): string {
  const resolvedBrand = brandName.trim() || APP_NAME;
  let result = template
    .replace(/\{\{APP_NAME\}\}/g, resolvedBrand)
    .replace(/\{\{BRAND\}\}/g, resolvedBrand);
  for (const [key, value] of Object.entries(extras)) {
    result = result.split(`{{${key}}}`).join(value);
  }
  return result;
}

export function brandedHeading(section: string, brandName: string = APP_NAME): string {
  return resolveBrandPlaceholders(PRINT_HEADER_TEMPLATE, brandName, { SECTION: section });
}

function filenamePart(value: string, fallback: string): string {
  return (
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/ł/g, "l")
      .replace(/Ł/g, "L")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || fallback
  );
}

export function routeFilename(
  start: string,
  destination: string,
  extension: "pdf" | "csv",
  brigadeTitle?: string,
  brandName: string = APP_NAME
): string {
  const brandPart = filenamePart(brandName, "planer");
  if (brigadeTitle?.trim()) {
    return `${brandPart}-${filenamePart(brigadeTitle, "brygada")}.${extension}`;
  }
  return `${brandPart}-${filenamePart(start, "start")}-${filenamePart(destination, "meta")}.${extension}`;
}
