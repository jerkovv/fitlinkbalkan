import { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  value: ReactNode;
  label: string;
  tone?: "trainer" | "athlete" | "success" | "warning" | "neutral";
  className?: string;
}

const toneClasses = {
  trainer: "bg-primary-soft text-primary-soft-foreground",
  athlete: "bg-accent-soft text-accent-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-accent-soft text-accent-bright",
  neutral: "bg-surface-3 text-foreground",
};

export const StatCard = ({ value, label, tone = "neutral", className }: StatCardProps) => (
  <div className={cn("rounded-xl px-4 py-3 text-center", toneClasses[tone], className)}>
    <div className="text-2xl font-extrabold leading-none font-display">{value}</div>
    <div className="mt-1.5 text-[10px] uppercase tracking-wider opacity-80">{label}</div>
  </div>
);

interface ProgressBarProps {
  label: string;
  trailing?: ReactNode;
  value: number;
  tone?: "trainer" | "athlete" | "success";
}

export const ProgressBar = ({ label, trailing, value, tone = "trainer" }: ProgressBarProps) => {
  const fillClasses = {
    trainer: "bg-gradient-trainer",
    athlete: "bg-gradient-athlete",
    success: "bg-gradient-success",
  };
  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
        <span>{label}</span>
        <span className="text-foreground font-semibold">{trailing}</span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", fillClasses[tone])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
};

interface ChipProps {
  children: ReactNode;
  tone?: "success" | "warning" | "info" | "muted" | "danger";
  className?: string;
}

export const Chip = ({ children, tone = "muted", className }: ChipProps) => {
  const tones = {
    success: "bg-success-soft text-success-soft-foreground",
    warning: "bg-accent-soft text-accent-bright",
    info: "bg-primary-soft text-primary-soft-foreground",
    muted: "bg-surface-3 text-muted-foreground",
    danger: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide", tones[tone], className)}>
      {children}
    </span>
  );
};

interface AvatarProps {
  initials: string;
  tone?: "trainer" | "athlete" | "success";
  size?: "sm" | "md" | "lg";
}

export const Avatar = ({ initials, tone = "trainer", size = "md" }: AvatarProps) => {
  const sizes = { sm: "h-8 w-8 text-[11px]", md: "h-10 w-10 text-sm", lg: "h-14 w-14 text-base" };
  const gradients = {
    trainer: "bg-gradient-trainer",
    athlete: "bg-gradient-athlete",
    success: "bg-gradient-success",
  };
  return (
    <div className={cn("inline-flex items-center justify-center rounded-full font-extrabold text-white shrink-0", sizes[size], gradients[tone])}>
      {initials}
    </div>
  );
};
