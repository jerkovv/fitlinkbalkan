import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { ReactNode } from "react";

interface PhoneShellProps {
  title: ReactNode;
  back?: string;
  variant?: "trainer" | "athlete" | "neutral";
  children: ReactNode;
  rightSlot?: ReactNode;
}

const variantClasses = {
  trainer: "text-primary-soft-foreground",
  athlete: "text-accent-soft-foreground",
  neutral: "text-foreground",
};

export const PhoneShell = ({ title, back, variant = "neutral", children, rightSlot }: PhoneShellProps) => {
  return (
    <div className="phone-shell pb-28 animate-fade-in">
      {/* Status bar */}
      <div className="flex items-center justify-between px-5 pt-3 pb-1 text-[10px] text-muted-foreground/60">
        <span>9:41</span>
        <span>●●●</span>
      </div>

      {/* Title bar */}
      <header className={`flex items-center gap-2 px-5 py-3 border-b border-border/60 ${variantClasses[variant]}`}>
        {back && (
          <Link
            to={back}
            className="-ml-1 mr-1 inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-surface-3 transition"
            aria-label="Nazad"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
        )}
        <h1 className="text-base font-bold tracking-tight flex-1">{title}</h1>
        {rightSlot}
      </header>

      <main className="px-5 py-4">{children}</main>
    </div>
  );
};
