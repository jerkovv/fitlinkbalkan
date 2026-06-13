import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Crveno (bg-destructive) dugme za brisanje/destruktivne akcije. */
  destructive?: boolean;
}

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmContext = React.createContext<ConfirmFn | null>(null);

/** Promise-based potvrda: const confirm = useConfirm(); if (!(await confirm({...}))) return; */
export const useConfirm = (): ConfirmFn => {
  const ctx = React.useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm mora biti unutar <ConfirmProvider>");
  return ctx;
};

export const ConfirmProvider = ({ children }: { children: React.ReactNode }) => {
  const [opts, setOpts] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((v: boolean) => void) | null>(null);

  const confirm = React.useCallback<ConfirmFn>((o) => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // Zatvori i razresi promise. Prvi poziv pobedjuje (resolver se nulira), pa
  // naknadni onOpenChange(false) iz Radix-a posle klika ne pregazi rezultat.
  const settle = React.useCallback((value: boolean) => {
    resolverRef.current?.(value);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  const open = opts !== null;
  const destructive = opts?.destructive ?? false;
  const confirmLabel = opts?.confirmLabel ?? (destructive ? "Obriši" : "Potvrdi");
  const cancelLabel = opts?.cancelLabel ?? "Otkaži";

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(o) => { if (!o) settle(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{opts?.title ?? ""}</AlertDialogTitle>
            {opts?.description && (
              <AlertDialogDescription>{opts.description}</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>{cancelLabel}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={cn(
                destructive
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-gradient-brand text-white shadow-brand",
              )}
            >
              {confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
};
