import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User as UserIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const initialsOf = (name: string | null, email: string | null) => {
  const src = name?.trim() || email?.split("@")[0] || "";
  if (!src) return "??";
  const parts = src.split(/[\s._-]+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || src.slice(0, 2).toUpperCase();
};

export const UserMenu = () => {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setFullName((data as any)?.full_name ?? null));
  }, [user]);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      toast.success("Odjavljen si");
      navigate("/auth", { replace: true });
    } catch (e: any) {
      toast.error(e.message ?? "Greška pri odjavi");
    } finally {
      setSigningOut(false);
    }
  };

  if (!user) return null;

  const initials = initialsOf(fullName, user.email ?? null);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Korisnički meni"
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            "bg-gradient-brand text-white font-bold text-[13px] tracking-tight",
            "shadow-brand active:scale-95 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50",
          )}
        >
          {initials}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-semibold text-sm truncate">{fullName ?? "Korisnik"}</span>
            <span className="text-xs text-muted-foreground truncate font-normal">{user.email}</span>
            {role && (
              <span className="text-[10px] uppercase tracking-wider text-primary font-bold mt-1">
                {role === "trainer" ? "Trener" : role === "athlete" ? "Vežbač" : role}
              </span>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            navigate(role === "trainer" ? "/trener" : "/vezbac/profil")
          }
          className="cursor-pointer"
        >
          <UserIcon className="h-4 w-4 mr-2" />
          Profil
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={handleSignOut}
          disabled={signingOut}
          className="cursor-pointer text-destructive focus:text-destructive"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4 mr-2" />
          )}
          Odjavi se
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
