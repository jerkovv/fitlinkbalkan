import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import {
  FullScreenSheet,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
} from "@/components/ui/full-screen-sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertTriangle, Loader2 } from "lucide-react";
import { porukaGreske } from "@/lib/errorMessage";
import { toast } from "sonner";

interface DeleteAccountSheetProps {
  open: boolean;
  onClose: () => void;
  userEmail: string;
  role: "trainer" | "athlete";
}

export const DeleteAccountSheet = ({ open, onClose, userEmail, role }: DeleteAccountSheetProps) => {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (open) setConfirmText("");
  }, [open]);

  const matches = confirmText.trim().toLowerCase() === userEmail.trim().toLowerCase();

  // Brisanje naloga rusi auth.users, a sve tabele kaskadno otpadaju za njim.
  // Fajlovi u storage-u NE otpadaju - storage.objects nema vezu ka auth.users,
  // pa bi progres fotografije ostale zauvek. Brisemo ih rucno, dok sesija jos
  // vazi (RLS dozvoljava brisanje samo svog foldera <uid>/...).
  const obrisiFotografije = async () => {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (!uid) return;
    const { data: fajlovi, error } = await supabase.storage
      .from("progress-photos")
      .list(uid, { limit: 1000 });
    if (error || !fajlovi?.length) return;
    await supabase.storage
      .from("progress-photos")
      .remove(fajlovi.map((f) => `${uid}/${f.name}`));
  };

  const handleDelete = async () => {
    if (!matches || deleting) return;
    setDeleting(true);
    try {
      // Namerno pre RPC-a i namerno bez prekidanja toka ako pukne - nalog se
      // brise u svakom slucaju, fajl bez naloga je manja steta od naloga koji
      // je korisnik trazio da nestane a nije.
      try {
        await obrisiFotografije();
      } catch (e) {
        console.warn("[Brisanje naloga] fotografije nisu obrisane:", e);
      }

      const { data, error } = await supabase.rpc("delete_my_account", {
        p_confirm: confirmText.trim(),
      });
      if (error) {
        toast.error(porukaGreske(error));
        return;
      }
      const res = data as any;
      if (res?.success) {
        onClose();
        await signOut();
        navigate("/auth", { replace: true });
        return;
      }
      if (res?.error === "confirm_mismatch") {
        toast.error("Mejl se ne poklapa");
        return;
      }
      if (res?.error === "not_authenticated") {
        toast.error("Nisi ulogovan");
        return;
      }
      if (res?.error === "user_not_found") {
        toast.error("Nalog nije pronađen");
        return;
      }
      toast.error("Greška pri brisanju naloga");
    } catch (e: any) {
      toast.error(porukaGreske(e));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <FullScreenSheet open={open} onClose={onClose} title="Brisanje naloga">
      <FullScreenSheetScroll className="pt-5 space-y-4">
        <p className="text-[13.5px] text-muted-foreground leading-relaxed">
          Ova radnja je trajna. Nalog i svi podaci biće odmah obrisani i ne mogu se vratiti.
        </p>

        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Šta se briše
          </div>
          <ul className="space-y-1.5 text-[13.5px] text-muted-foreground list-disc pl-5">
            <li>Profil i lični podaci</li>
            <li>Istorija treninga i lični rekordi</li>
            <li>Merenja tela i fotografije napretka</li>
            <li>Poruke sa trenerom</li>
            <li>Članarine i istorija plaćanja</li>
          </ul>
        </div>

        {role === "trainer" && (
          <div className="rounded-2xl bg-destructive-soft px-4 py-3.5 flex gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-destructive-soft-foreground" />
            <div className="space-y-1.5">
              <p className="text-[12.5px] font-medium text-destructive-soft-foreground leading-relaxed">
                Tvoji vežbači neće biti obrisani. Ostaće bez dodeljenog trenera.
              </p>
              <p className="text-[12.5px] font-medium text-destructive-soft-foreground leading-relaxed">
                Brisanje naloga NE otkazuje FitLink pretplatu. Otkaži je pre brisanja, inače će naplata da se nastavi.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="delete-confirm-email">Za potvrdu ukucaj svoju mejl adresu</Label>
          <Input
            id="delete-confirm-email"
            type="email"
            autoCapitalize="none"
            autoCorrect="off"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={userEmail}
            className="h-14 text-base rounded-2xl"
          />
        </div>
      </FullScreenSheetScroll>
      <FullScreenSheetFooter>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={onClose} disabled={deleting} className="w-full">
            Otkaži
          </Button>
          <Button
            onClick={handleDelete}
            disabled={!matches || deleting}
            className="w-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Obriši nalog trajno
          </Button>
        </div>
      </FullScreenSheetFooter>
    </FullScreenSheet>
  );
};

export default DeleteAccountSheet;
