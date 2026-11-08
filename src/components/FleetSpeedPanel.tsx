import { Bus, Plus, Settings2 } from "lucide-react";
import { fleetSpec, getFleet } from "../lib/fleet";
import type { VehicleId } from "../lib/types";
import { cn } from "../utils/cn";
import SpeedControl from "./SpeedControl";
import { CollapseToggle, FieldLabel, Pill, VehicleGlyph } from "./UI";

interface FleetSpeedPanelProps {
  vehicle: VehicleId;
  speed?: number;
  automaticSpeed: number;
  distance: number;
  onVehicleChange: (vehicle: VehicleId) => void;
  onSpeedChange: (speed: number | undefined) => void;
  onSaveVehicleAverageSpeed: (vehicle: VehicleId, speed: number) => void;
  onOpenFleet: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function FleetSpeedPanel({
  vehicle,
  speed,
  automaticSpeed,
  distance,
  onVehicleChange,
  onSpeedChange,
  onSaveVehicleAverageSpeed,
  onOpenFleet,
  collapsed,
  onToggleCollapse,
}: FleetSpeedPanelProps) {
  const fleet = getFleet();
  const activeProfile = fleet.find((profile) => profile.id === vehicle) ?? fleet[0];
  const shownSpeed = speed ?? activeProfile.averageSpeed;

  return (
    <section
      className="overflow-hidden rounded-[16px] border border-line bg-surface shadow-[0_1px_2px_rgba(16,40,27,0.04)]"
      data-testid="fleet-speed-panel"
    >
      <div className="flex items-center justify-between gap-2 border-b border-line px-3.5 py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-brand-soft text-brand-ink">
            <Bus className="h-3 w-3" strokeWidth={2.2} />
          </span>
          <h2 className="truncate text-[11.5px] font-extrabold tracking-[-0.01em] text-ink">
            Flota i prędkość
          </h2>
          <Pill tone="neutral" className="max-w-[140px] truncate font-mono text-[8px]">
            {activeProfile.short} · {speed === undefined ? "Auto" : `${shownSpeed.toLocaleString("pl-PL")} km/h`}
          </Pill>
        </button>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={onOpenFleet}
            className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[8.5px] font-bold text-mute transition-colors hover:bg-soft hover:text-brand-ink"
          >
            <Settings2 className="h-2.5 w-2.5" />
            Zarządzaj
          </button>
          <CollapseToggle
            collapsed={collapsed}
            onToggle={onToggleCollapse}
            sectionName="Flota i prędkość"
          />
        </div>
      </div>

      {!collapsed && (
        <div className="px-3.5 pb-3 pt-2.5">
          <div className="flex items-center justify-between">
            <FieldLabel>Flota autobusów</FieldLabel>
            <button
              type="button"
              onClick={onOpenFleet}
              className="flex items-center gap-1 text-[8.5px] font-bold text-mute transition-colors hover:text-brand-ink"
            >
              <Settings2 className="h-2.5 w-2.5" />
              Dodaj / edytuj prędkość wozu
            </button>
          </div>

          <div className="no-scrollbar mt-1.5 flex gap-1 overflow-x-auto pb-0.5">
            {fleet.map((profile) => {
              const selected = profile.id === vehicle;
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-testid={`vehicle-chip-${profile.id}`}
                  aria-label={`Wybierz ${profile.name}`}
                  aria-pressed={selected}
                  onClick={() => onVehicleChange(profile.id)}
                  className={cn(
                    "group flex h-12 min-w-[82px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1.5 text-[9px] font-bold transition-all",
                    selected
                      ? "border-brand bg-brand text-on-brand shadow-[0_3px_10px_rgba(13,79,59,0.17)]"
                      : "border-line bg-raised text-ink-soft hover:border-line-strong hover:bg-soft hover:text-ink"
                  )}
                >
                  <VehicleGlyph
                    id={profile.id}
                    className={cn("h-[15px] w-[15px]", selected ? "text-on-brand" : "text-ink-soft")}
                  />
                  <span className="w-full truncate text-center leading-none">{profile.short}</span>
                  <span className={cn("font-mono text-[7.5px] leading-none", selected ? "opacity-85" : "text-mute")}>
                    {profile.averageSpeed.toLocaleString("pl-PL")} km/h
                  </span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={onOpenFleet}
              aria-label="Dodaj pojazd do floty"
              className="flex h-12 min-w-[40px] shrink-0 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-line-strong text-mute transition-colors hover:border-brand/50 hover:bg-brand-soft hover:text-brand-ink"
            >
              <Plus className="h-4 w-4" strokeWidth={2.5} />
              <span className="text-[8px] font-bold">Dodaj</span>
            </button>
          </div>

          <div className="mt-1.5 flex items-center justify-between gap-2 rounded-md bg-raised px-2 py-1">
            <span className="truncate text-[8.5px] font-semibold text-mute" title={activeProfile.name}>
              {fleetSpec(activeProfile)} · śr. {activeProfile.averageSpeed.toLocaleString("pl-PL")} km/h
            </span>
            <span className="shrink-0 font-mono text-[8px] font-bold text-brand-ink">
              {activeProfile.limits.motorway} km/h max
            </span>
          </div>

          <SpeedControl
            key={vehicle}
            speed={speed}
            assignedSpeed={activeProfile.averageSpeed}
            automaticSpeed={automaticSpeed}
            distance={distance}
            maximumSpeed={activeProfile.limits.motorway}
            onChange={onSpeedChange}
            onSaveToVehicle={(nextSpeed) => onSaveVehicleAverageSpeed(vehicle, nextSpeed)}
          />
        </div>
      )}
    </section>
  );
}
