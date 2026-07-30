import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { roleHome } from "@/lib/roles";
import { UnsupportedAccount } from "@/components/UnsupportedAccount";
import type { AppRole } from "@/lib/database.types";

interface Props {
  children: JSX.Element;
  requireRole?: AppRole;
}

export const ProtectedRoute = ({ children, requireRole }: Props) => {
  const { user, role, initializing, roleLoading } = useAuth();
  const location = useLocation();

  // Dok se sesija ili uloga jos ucitavaju, ne znamo dovoljno da odlucimo -
  // ne redirect, ne UnsupportedAccount, samo cekaj. Ovo je razlika izmedju
  // "role se jos ucitava" i "role ne postoji" koja je ranije nedostajala:
  // fetchRole je asinhron pa je role kratko null i posle validnog auth
  // eventa (refresh tokena i sl), a stari kod je to citao kao "nema ulogu"
  // i odjavljivao korisnika usred normalnog rada.
  if (initializing || roleLoading) {
    return (
      <div className="h-[100dvh] flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Učitavanje…</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  // Ucitavanje je zavrseno (initializing i roleLoading oboje false) i role
  // je i dalje null -> nalog stvarno nema ulogu. Ne odjavljuj automatski,
  // UnsupportedAccount vec ima dugme za rucnu odjavu.
  if (!role) {
    return <UnsupportedAccount />;
  }

  if (requireRole && role && role !== requireRole) {
    // Pogresna uloga -> preusmeri na NJEN dom. Uloga bez doma u aplikaciji (admin/nepoznato,
    // roleHome=null) ili dom koji je bas ova ruta (navigacija ne bi promenila nista) ->
    // neutralan ekran sa odjavom umesto redirecta. Loop guard: bez ovoga admin veslja
    // /vezbac -> mismatch -> /vezbac -> ... u beskonacnoj petlji.
    const target = roleHome(role);
    if (!target || location.pathname === target || location.pathname.startsWith(target + "/")) {
      return <UnsupportedAccount />;
    }
    return <Navigate to={target} replace />;
  }

  return children;
};
