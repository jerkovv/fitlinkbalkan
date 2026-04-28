import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { PhoneShell } from "@/components/PhoneShell";
import { BottomNav } from "@/components/BottomNav";
import { Card } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Save, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Goal = "lose_weight" | "gain_muscle" | "endurance" | "mobility" | "general";
type Gender = "male" | "female" | "other";

const Profile = () => {
  const { user } = useAuth();
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [goal, setGoal] = useState<Goal>("general");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightKg, setWeightKg] = useState<string>("");
  const [birthYear, setBirthYear] = useState<string>("");
  const [gender, setGender] = useState<Gender | "">("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      const [pRes, aRes] = await Promise.all([
        supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
        supabase.from("athletes").select("*").eq("id", user.id).maybeSingle(),
      ]);
      const p: any = pRes.data ?? {};
      const a: any = aRes.data ?? {};
      setFullName(p.full_name ?? "");
      setPhone(p.phone ?? "");
      setGoal((a.goal as Goal) ?? "general");
      setHeightCm(a.height_cm != null ? String(a.height_cm) : "");
      setWeightKg(a.weight_kg != null ? String(a.weight_kg) : "");
      setBirthYear(a.birth_year != null ? String(a.birth_year) : "");
      setGender((a.gender as Gender) ?? "");
      setNotes(a.notes ?? "");
      setLoading(false);
    };
    load();
  }, [user]);

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error: pErr } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          phone: phone.trim() || null,
        })
        .eq("id", user.id);
      if (pErr) throw pErr;

      const heightNum = heightCm ? parseInt(heightCm, 10) : null;
      const weightNum = weightKg ? parseFloat(weightKg) : null;
      const yearNum = birthYear ? parseInt(birthYear, 10) : null;

      const { error: aErr } = await supabase
        .from("athletes")
        .update({
          goal,
          height_cm: heightNum,
          weight_kg: weightNum,
          birth_year: yearNum,
          gender: gender || null,
          notes: notes.trim() || null,
        } as any)
        .eq("id", user.id);
      if (aErr) throw aErr;

      toast.success("Profil sačuvan");
    } catch (e: any) {
      toast.error(e.message ?? "Greška pri čuvanju");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PhoneShell
        hasBottomNav
        eyebrow="Tvoj profil"
        title={
          <h1 className="font-display text-[28px] leading-[1.05] font-bold tracking-tightest">
            Profil
          </h1>
        }
        leftSlot={
          <button
            onClick={() => nav(-1)}
            aria-label="Nazad"
            className="h-10 w-10 rounded-full flex items-center justify-center bg-surface-2 text-foreground active:scale-95 transition"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        }
      >
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Osnovno
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="fullName">Ime i prezime</Label>
                <Input
                  id="fullName"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Marko Marković"
                />
              </div>

              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user?.email ?? ""} disabled />
                <p className="text-[11px] text-muted-foreground">
                  Email se ne može menjati.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Telefon</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+381 6X XXX XXXX"
                />
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Cilj treninga
              </div>

              <div className="space-y-1.5">
                <Label>Cilj</Label>
                <Select value={goal} onValueChange={(v) => setGoal(v as Goal)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lose_weight">Mršavljenje</SelectItem>
                    <SelectItem value="gain_muscle">Masa</SelectItem>
                    <SelectItem value="endurance">Izdržljivost</SelectItem>
                    <SelectItem value="mobility">Mobilnost</SelectItem>
                    <SelectItem value="general">Opšte stanje</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </Card>

            <Card className="p-5 space-y-4">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                O tebi
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="height">Visina (cm)</Label>
                  <Input
                    id="height"
                    type="number"
                    inputMode="numeric"
                    min={100}
                    max={250}
                    value={heightCm}
                    onChange={(e) => setHeightCm(e.target.value)}
                    placeholder="180"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="weight">Težina (kg)</Label>
                  <Input
                    id="weight"
                    type="number"
                    inputMode="decimal"
                    step="0.1"
                    min={30}
                    max={300}
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                    placeholder="80"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="birthYear">Godina rođenja</Label>
                  <Input
                    id="birthYear"
                    type="number"
                    inputMode="numeric"
                    min={1900}
                    max={new Date().getFullYear()}
                    value={birthYear}
                    onChange={(e) => setBirthYear(e.target.value)}
                    placeholder="1995"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Pol</Label>
                  <Select value={gender || undefined} onValueChange={(v) => setGender(v as Gender)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Izaberi" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Muški</SelectItem>
                      <SelectItem value="female">Ženski</SelectItem>
                      <SelectItem value="other">Drugo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="notes">Beleške za trenera</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Povrede, alergije, ograničenja..."
                  rows={4}
                />
              </div>
            </Card>

            <Button
              onClick={handleSave}
              disabled={saving}
              size="lg"
              className="w-full bg-gradient-brand text-white shadow-brand hover:opacity-95"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Sačuvaj izmene
            </Button>
          </>
        )}
      </PhoneShell>
      <BottomNav role="athlete" />
    </>
  );
};

export default Profile;
