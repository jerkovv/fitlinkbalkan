import { ReactNode } from "react";
import { cn } from "@/lib/utils";

/* ============== Card (premium) ============== */

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  as?: "div" | "section" | "article";
}

export const Card = ({ children, className, hover = false, as: Tag = "div" }: CardProps) => (
  <Tag className={cn(hover ? "card-premium-hover" : "card-premium", className)}>{children}</Tag>
);

/* ============== StatCard ============== */

interface StatCardProps {
  value: ReactNode;
  label: string;
  unit?: ReactNode;
  tone?: "brand" | "trainer" | "athlete" | "success" | "warning" | "neutral";
  className?: string;
}

const toneText = {
  brand: "text-gradient-brand",
  trainer: "text-trainer",
  athlete: "text-athlete",
  success: "text-success-soft-foreground",
  warning: "text-warning-soft-foreground",
  neutral: "text-foreground",
};

export const StatCard = ({ value, label, unit, tone = "neutral", className }: StatCardProps) => (
  <Card className={cn("p-4", className)}>
    <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
      {label}
    </div>
    <div className="flex items-baseline gap-1.5">
      <span className={cn("font-display text-[30px] leading-none font-bold tracking-tightest", toneText[tone])}>
        {value}
      </span>
      {unit && <span className="text-sm font-medium text-muted-foreground">{unit}</span>}
    </div>
  </Card>
);

/* ============== Chip ============== */

interface ChipProps {
  children: ReactNode;
  tone?: "success" | "warning" | "info" | "muted" | "danger" | "brand";
  className?: string;
  size?: "sm" | "md";
}

export const Chip = ({ children, tone = "muted", className, size = "sm" }: ChipProps) => {
  const tones = {
    success: "bg-success-soft text-success-soft-foreground",
    warning: "bg-warning-soft text-warning-soft-foreground",
    info: "bg-trainer-soft text-trainer-soft-foreground",
    muted: "bg-surface-2 text-muted-foreground",
    danger: "bg-destructive-soft text-destructive-soft-foreground",
    brand: "bg-primary-soft text-primary-soft-foreground",
  };
  const sizes = {
    sm: "px-2.5 py-0.5 text-[11px]",
    md: "px-3 py-1 text-xs",
  };
  return (
    <span className={cn("pill font-semibold", sizes[size], tones[tone], className)}>
      {children}
    </span>
  );
};

/* ============== Avatar ============== */

interface AvatarProps {
  initials: string;
  tone?: "brand" | "trainer" | "athlete" | "success";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

export const Avatar = ({ initials, tone = "brand", size = "md", className }: AvatarProps) => {
  const sizes = {
    sm: "h-9 w-9 text-[12px]",
    md: "h-11 w-11 text-sm",
    lg: "h-14 w-14 text-base",
    xl: "h-20 w-20 text-2xl",
  };
  const gradients = {
    brand: "bg-gradient-brand",
    trainer: "bg-gradient-trainer",
    athlete: "bg-gradient-athlete",
    success: "bg-gradient-success",
  };
  return (
    <div
      className={cn(
        "inline-flex items-center justify-center rounded-full font-bold text-white shrink-0 ring-4 ring-surface",
        sizes[size],
        gradients[tone],
        className,
      )}
    >
      {initials}
    </div>
  );
};

/* ============== ProgressBar ============== */

interface ProgressBarProps {
  label?: string;
  trailing?: ReactNode;
  value: number;
  tone?: "brand" | "trainer" | "athlete" | "success";
  size?: "sm" | "md";
}

export const ProgressBar = ({ label, trailing, value, tone = "brand", size = "md" }: ProgressBarProps) => {
  const fill = {
    brand: "bg-gradient-brand",
    trainer: "bg-gradient-trainer",
    athlete: "bg-gradient-athlete",
    success: "bg-gradient-success",
  };
  const heights = { sm: "h-1.5", md: "h-2" };
  return (
    <div>
      {(label || trailing) && (
        <div className="flex items-center justify-between mb-1.5">
          {label && <span className="text-[13px] font-medium text-foreground">{label}</span>}
          {trailing && <span className="text-[12px] font-semibold text-muted-foreground tnum">{trailing}</span>}
        </div>
      )}
      <div className={cn("rounded-full bg-surface-3 overflow-hidden", heights[size])}>
        <div
          className={cn("h-full rounded-full transition-all duration-500", fill[tone])}
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
    </div>
  );
};

/* ============== Button (premium variants) ============== */

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "brand" | "trainer" | "athlete" | "success" | "ghost" | "outline" | "secondary";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
}

export const Button = ({
  variant = "brand",
  size = "md",
  fullWidth,
  leadingIcon,
  trailingIcon,
  className,
  children,
  ...props
}: ButtonProps) => {
  const variants = {
    brand: "bg-gradient-brand text-white shadow-brand hover:opacity-95",
    trainer: "bg-gradient-trainer text-white shadow-trainer hover:opacity-95",
    athlete: "bg-gradient-athlete text-white shadow-athlete hover:opacity-95",
    success: "bg-gradient-success text-white shadow-success hover:opacity-95",
    ghost: "bg-transparent text-foreground hover:bg-surface-2",
    outline: "bg-surface text-foreground border border-hairline hover:border-foreground/20 shadow-xs",
    secondary: "bg-surface-2 text-foreground hover:bg-surface-3",
  };
  const sizes = {
    sm: "h-10 px-4 text-[13px] rounded-xl",
    md: "h-12 px-5 text-[14px] rounded-2xl",
    lg: "h-14 px-6 text-[15px] rounded-2xl",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className,
      )}
    >
      {leadingIcon}
      {children}
      {trailingIcon}
    </button>
  );
};

/* ============== Section Title ============== */

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between mb-3">
    <h2 className="font-display text-[15px] font-semibold tracking-tighter text-foreground">{children}</h2>
    {action}
  </div>
);

/* ============== Icon Button ============== */

export const IconButton = ({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    {...props}
    className={cn(
      "inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface border border-hairline text-foreground hover:bg-surface-2 transition active:scale-95 shadow-xs",
      className,
    )}
  >
    {children}
  </button>
);
