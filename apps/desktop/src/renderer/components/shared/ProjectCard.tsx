import type { ReactNode } from "react";

function getProjectInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}

export interface ProjectCardProps {
  name: string;
  rootPath: string;
  isActive: boolean;
  onClick: () => void;
  /** Right-top indicator (scanning spinner, etc.) */
  indicator?: ReactNode;
  /** Footer area below the name/path (skill count, rule status, etc.) */
  footer?: ReactNode;
  /** Action buttons shown on the right side */
  actions?: ReactNode;
}

/**
 * Unified project card used across Projects, Skills → Project Skill,
 * and Rules → Project Rules sidebar sections.
 */
export function ProjectCard({
  name,
  rootPath,
  isActive,
  onClick,
  indicator,
  footer,
  actions,
}: ProjectCardProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors ${
        isActive
          ? "border-primary/40 bg-primary/5"
          : "border-border app-wallpaper-surface hover:bg-accent"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-sm font-semibold text-primary">
            {getProjectInitial(name)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-foreground">{name}</div>
            <div className="mt-1 truncate text-[11px] text-muted-foreground">
              {rootPath}
            </div>
          </div>
        </div>
        {indicator ? (
          <div className="shrink-0">{indicator}</div>
        ) : null}
        {actions ? (
          <div className="flex items-center gap-1 shrink-0">{actions}</div>
        ) : null}
      </div>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </button>
  );
}
