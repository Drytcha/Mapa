// Centralna konfiguracja nazwy aplikacji oraz placeholderów używanych na stronie,
// w eksporcie CSV, w schowku i na każdej stronie wydruku PDF.
// Możesz zmienić APP_NAME poniżej albo ustawić VITE_APP_NAME w .env.local.

const ENV_APP_NAME = import.meta.env.VITE_APP_NAME?.trim();
const ENV_APP_TAGLINE = import.meta.env.VITE_APP_TAGLINE?.trim();

export const APP_NAME = ENV_APP_NAME || "MapPlaner";

export const APP_TAGLINE = ENV_APP_TAGLINE || "routing & GIS";
export const APP_TITLE = `${APP_NAME} - planer tras i PDF`;
export const APP_DESCRIPTION = `${APP_NAME} - darmowy planer tras autobusowych do 50 punktów, własna średnia prędkość, planowanie godzin i cała trasa w PDF z marginesem 2 cm. Bez kluczy API.`;

/** Placeholdery szablonów wydruków — {{APP_NAME}} podmieniany jest na aktywną nazwę. */
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
  return value.normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/g, "l").replace(/Ł/g, "L")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || fallback;
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
