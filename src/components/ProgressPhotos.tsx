import { useEffect, useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { Card, SectionTitle } from "@/components/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Camera, Loader2, Plus, Trash2, Eye, EyeOff, X, GitCompare,
} from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

type PhotoRow = {
  id: string;
  storage_path: string;
  taken_on: string;
  shared_with_trainer: boolean;
  notes: string | null;
};

type PhotoView = PhotoRow & { url: string };

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("sr-Latn-RS", { day: "numeric", month: "short", year: "numeric" });

const SIGN_TTL = 60 * 60; // 1h

interface Props {
  athleteId: string;
  /** Ako je true, prikazujemo upload + toggle deli + delete. */
  canManage: boolean;
  /** U trener pogledu prikazujemo samo deljene. */
  sharedOnly?: boolean;
}

export const ProgressPhotos = ({ athleteId, canManage, sharedOnly = false }: Props) => {
  const [loading, setLoading] = useState(true);
  const [photos, setPhotos] = useState<PhotoView[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [compare, setCompare] = useState<PhotoView[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let q = supabase
      .from("progress_photos")
      .select("id, storage_path, taken_on, shared_with_trainer, notes")
      .eq("athlete_id", athleteId)
      .order("taken_on", { ascending: false });
    if (sharedOnly) q = q.eq("shared_with_trainer", true);
    const { data, error } = await q;
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as PhotoRow[];
    if (rows.length === 0) {
      setPhotos([]);
      setLoading(false);
      return;
    }
    const paths = rows.map((r) => r.storage_path);
    const { data: signed } = await supabase.storage
      .from("progress-photos")
      .createSignedUrls(paths, SIGN_TTL);
    const urlMap = new Map<string, string>(
      (signed ?? []).map((s: any) => [s.path, s.signedUrl ?? s.signedURL ?? ""])
    );
    setPhotos(rows.map((r) => ({ ...r, url: urlMap.get(r.storage_path) ?? "" })));
    setLoading(false);
  }, [athleteId, sharedOnly]);

  useEffect(() => { load(); }, [load]);

  const onPickFile = () => fileRef.current?.click();

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Fajl mora biti slika");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Slika je veća od 10MB");
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
      const id = crypto.randomUUID();
      const path = `${athleteId}/${id}.${ext}`;

      const { error: upErr } = await supabase.storage
        .from("progress-photos")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (upErr) throw upErr;

      const { error: insErr } = await supabase.from("progress_photos").insert({
        athlete_id: athleteId,
        storage_path: path,
        taken_on: new Date().toISOString().slice(0, 10),
        shared_with_trainer: false,
      });
      if (insErr) {
        // rollback storage
        await supabase.storage.from("progress-photos").remove([path]);
        throw insErr;
      }

      toast.success("Fotka dodata");
      await load();
    } catch (err: any) {
      toast.error(err.message ?? "Greška pri uploadu");
    } finally {
      setUploading(false);
    }
  };

  const toggleShare = async (p: PhotoView) => {
    const next = !p.shared_with_trainer;
    setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, shared_with_trainer: next } : x)));
    const { error } = await supabase
      .from("progress_photos")
      .update({ shared_with_trainer: next })
      .eq("id", p.id);
    if (error) {
      toast.error(error.message);
      setPhotos((prev) => prev.map((x) => (x.id === p.id ? { ...x, shared_with_trainer: !next } : x)));
    } else {
      toast.success(next ? "Podeljeno sa trenerom" : "Skriveno od trenera");
    }
  };

  const deletePhoto = async (p: PhotoView) => {
    if (!confirm("Obrisati fotku?")) return;
    const { error: delErr } = await supabase.from("progress_photos").delete().eq("id", p.id);
    if (delErr) {
      toast.error(delErr.message);
      return;
    }
    await supabase.storage.from("progress-photos").remove([p.storage_path]);
    setPhotos((prev) => prev.filter((x) => x.id !== p.id));
    toast.success("Fotka obrisana");
  };

  const toggleCompare = (p: PhotoView) => {
    setCompare((prev) => {
      if (prev.find((x) => x.id === p.id)) return prev.filter((x) => x.id !== p.id);
      if (prev.length >= 2) return [prev[1], p];
      return [...prev, p];
    });
  };

  const openCompare = () => {
    if (compare.length !== 2) {
      toast.error("Izaberi tačno 2 fotke za poređenje");
      return;
    }
    setCompareOpen(true);
  };

  return (
    <section>
      <div className="flex items-center justify-between mb-2">
        <SectionTitle>{sharedOnly ? "Progress fotke" : "Moje fotke"}</SectionTitle>
        {canManage && (
          <button
            onClick={onPickFile}
            disabled={uploading}
            className="h-9 w-9 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-brand active:scale-95 transition disabled:opacity-50"
            aria-label="Dodaj fotku"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" strokeWidth={2.5} />}
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={onFileChange}
      />

      {loading ? (
        <Card className="p-8 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : photos.length === 0 ? (
        <Card className="p-6 text-center space-y-2">
          <Camera className="h-6 w-6 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">
            {sharedOnly
              ? "Vežbač još nije podelio nijednu fotku."
              : "Još nema fotki. Slikaj prvu da pratiš napredak."}
          </p>
        </Card>
      ) : (
        <>
          {canManage && photos.length >= 2 && (
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="text-[12px] text-muted-foreground">
                {compare.length === 0
                  ? "Tapni 2 fotke za poređenje"
                  : `${compare.length}/2 izabrano`}
              </div>
              {compare.length === 2 && (
                <button
                  onClick={openCompare}
                  className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary hover:underline"
                >
                  <GitCompare className="h-3.5 w-3.5" /> Uporedi
                </button>
              )}
            </div>
          )}

          <div className="grid grid-cols-3 gap-2">
            {photos.map((p, idx) => {
              const isSel = !!compare.find((x) => x.id === p.id);
              return (
                <div key={p.id} className="relative group">
                  <button
                    onClick={() => (canManage && photos.length >= 2 ? toggleCompare(p) : setPreviewIdx(idx))}
                    className={cn(
                      "block w-full aspect-square rounded-2xl overflow-hidden bg-muted relative transition",
                      isSel && "ring-2 ring-primary ring-offset-2 ring-offset-background"
                    )}
                  >
                    {p.url ? (
                      <img
                        src={p.url}
                        alt={`Fotka ${fmtDate(p.taken_on)}`}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                        <Camera className="h-5 w-5" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-black/70 to-transparent text-white text-[10px] font-semibold tnum">
                      {fmtDate(p.taken_on)}
                    </div>
                    {canManage && p.shared_with_trainer && (
                      <div className="absolute top-1.5 left-1.5 h-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center gap-0.5">
                        <Eye className="h-2.5 w-2.5" /> Trener
                      </div>
                    )}
                    {isSel && (
                      <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                        <div className="h-7 w-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-[12px]">
                          {compare.findIndex((x) => x.id === p.id) + 1}
                        </div>
                      </div>
                    )}
                  </button>

                  {canManage && (
                    <div className="absolute top-1.5 right-1.5 flex flex-col gap-1 opacity-0 group-hover:opacity-100 group-active:opacity-100 transition">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleShare(p); }}
                        className="h-6 w-6 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-foreground shadow-soft active:scale-90"
                        aria-label={p.shared_with_trainer ? "Sakrij od trenera" : "Podeli sa trenerom"}
                      >
                        {p.shared_with_trainer ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deletePhoto(p); }}
                        className="h-6 w-6 rounded-full bg-background/90 backdrop-blur flex items-center justify-center text-destructive shadow-soft active:scale-90"
                        aria-label="Obriši"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Preview lightbox */}
      <Dialog open={previewIdx !== null} onOpenChange={(o) => !o && setPreviewIdx(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden">
          {previewIdx !== null && photos[previewIdx] && (
            <div className="relative">
              <img
                src={photos[previewIdx].url}
                alt="Preview"
                className="w-full h-auto object-contain max-h-[70vh] bg-muted"
              />
              <div className="p-4 space-y-1">
                <div className="font-semibold text-[14px]">{fmtDate(photos[previewIdx].taken_on)}</div>
                {photos[previewIdx].notes && (
                  <div className="text-[12.5px] text-muted-foreground">{photos[previewIdx].notes}</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Compare modal */}
      <Dialog open={compareOpen} onOpenChange={setCompareOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Poređenje napretka</DialogTitle>
          </DialogHeader>
          {compare.length === 2 && (
            <div className="grid grid-cols-2 gap-3">
              {compare.map((p, i) => (
                <div key={p.id} className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {i === 0 ? "Pre" : "Posle"}
                  </div>
                  <div className="aspect-square rounded-2xl overflow-hidden bg-muted">
                    <img src={p.url} alt={fmtDate(p.taken_on)} className="w-full h-full object-cover" />
                  </div>
                  <div className="text-[12px] font-semibold tnum">{fmtDate(p.taken_on)}</div>
                </div>
              ))}
            </div>
          )}
          <Button variant="outline" onClick={() => { setCompare([]); setCompareOpen(false); }}>
            <X className="h-4 w-4 mr-2" /> Resetuj izbor
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
};
