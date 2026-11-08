import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  Bus,
  ChevronDown,
  ChevronUp,
  Loader2,
  MapPin,
  Route as RouteIcon,
} from "lucide-react";
import { cn } from "../utils/cn";
import type { VehicleId } from "../lib/types";
import { APP_NAME, APP_TAGLINE } from "../config/branding";

export function VehicleGlyph({ id, className }: { id: VehicleId; className?: string }) {
  return <Bus data-vehicle-id={id} className={className} strokeWidth={1.9} aria-hidden="true" />;
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5" title={APP_NAME} data-testid="app-brand">
      <div className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-[11px] bg-brand text-on-brand shadow-[0_4px_12px_rgba(13,79,59,0.22)]">
        <RouteIcon className="h-[19px] w-[19px]" strokeWidth={2.1} />
        <span className="absolute -right-2 -top-2 h-4 w-4 rotate-45 bg-highlight" />
      </div>
      {!compact && (
        <div className="min-w-0 leading-none">
          <div className="flex min-w-0 items-baseline gap-[3px]">
            <span className="max-w-[120px] truncate text-[17px] font-extrabold tracking-[-0.045em] text-ink sm:max-w-[220px]" data-testid="brand-name">
              {APP_NAME}
            </span>
            <span className="mb-[7px] ml-0.5 h-[5px] w-[5px] rounded-full bg-highlight ring-1 ring-brand/20 dark:ring-highlight/20" />
          </div>
          <div className="mt-1 text-[8px] font-bold uppercase tracking-[0.23em] text-mute">
            {APP_TAGLINE}
          </div>
        </div>
      )}
    </div>
  );
}

export function IconButton({
  children,
  label,
  active,
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] border border-line bg-surface text-ink-soft transition-colors hover:border-line-strong hover:bg-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-not-allowed disabled:opacity-50",
        active && "border-brand/30 bg-brand-soft text-brand-ink",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Button({
  children,
  variant = "primary",
  className,
  loading,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: "primary" | "secondary" | "ghost" | "highlight";
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] px-3.5 text-[12px] font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:cursor-wait disabled:opacity-80",
        variant === "primary" &&
          "bg-brand text-on-brand shadow-[0_5px_14px_rgba(13,79,59,0.16)] hover:brightness-[1.06] active:translate-y-px",
        variant === "secondary" &&
          "border border-line bg-surface text-ink hover:border-line-strong hover:bg-soft",
        variant === "ghost" && "text-ink-soft hover:bg-soft hover:text-ink",
        variant === "highlight" &&
          "bg-highlight text-[#102016] hover:brightness-[0.97] active:translate-y-px",
        className
      )}
      {...props}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

export function Pill({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "lime" | "amber" | "outline";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[9.5px] font-bold leading-none",
        tone === "neutral" && "bg-soft text-ink-soft",
        tone === "green" && "bg-brand-soft text-brand-ink",
        tone === "lime" && "bg-highlight text-[#1c2c11]",
        tone === "amber" && "bg-warning-soft text-warning",
        tone === "outline" && "border border-line text-mute",
        className
      )}
    >
      {children}
    </span>
  );
}

export function Pin({ kind }: { kind: "from" | "via" | "to" }) {
  if (kind === "from") {
    return (
      <span className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-brand bg-brand-soft font-mono text-[9px] font-bold text-brand-ink">
        A
      </span>
    );
  }
  if (kind === "to") {
    return (
      <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-ink font-mono text-[9px] font-bold text-[#d7f36e]">
        B
      </span>
    );
  }
  return (
    <span className="grid h-[22px] w-[22px] place-items-center rounded-full border border-line-strong bg-surface font-mono text-[9px] font-bold text-ink-soft">
      <MapPin className="h-[11px] w-[11px]" strokeWidth={2.4} />
    </span>
  );
}

export function FieldLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-[8.5px] font-extrabold uppercase tracking-[0.16em] text-mute",
        className
      )}
    >
      {children}
    </span>
  );
}

export function CollapseToggle({
  collapsed,
  onToggle,
  sectionName,
  className,
}: {
  collapsed: boolean;
  onToggle: () => void;
  sectionName: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={!collapsed}
      aria-label={collapsed ? `Rozwiń sekcję ${sectionName}` : `Zwiń sekcję ${sectionName}`}
      title={collapsed ? `Rozwiń: ${sectionName}` : `Zwiń: ${sectionName}`}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-md text-mute transition-colors hover:bg-soft hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40",
        className
      )}
    >
      {collapsed ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={2.3} /> : <ChevronUp className="h-3.5 w-3.5" strokeWidth={2.3} />}
    </button>
  );
}
