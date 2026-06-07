import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";

import { cn } from "@/lib/utils";

/**
 * FullScreenSheet - full-screen overlay stranica (Wolt-stil), deljena izmedju
 * food picker-a (Nutrition.tsx, NutritionBuilder.tsx) i ostalih.
 *
 *   <FullScreenSheet open title onClose>
 *     <FullScreenSheetHeader/>   // fiksan vrh (search, filteri)
 *     <FullScreenSheetScroll/>   // lista - skroluje iznad tastature
 *     <FullScreenSheetFooter/>   // opcioni fiksni dno (dugmad)
 *   </FullScreenSheet>
 *
 * - fixed inset-0, bg-background (solid), pokriva ceo ekran (preko bottom nav-a)
 * - X gore-levo, naslov centriran, safe-area padding na vrhu
 * - slide-in zdesna 200ms (kao navigacija na novu stranicu)
 * - resize mode je "none": skrolabilni kontejner dobija padding-bottom = visina
 *   tastature da poslednje stavke ostanu iznad tastature (glatka tranzicija)
 */

const KeyboardHeightContext = React.createContext(0);

function useKeyboardHeight() {
  const [height, setHeight] = React.useState(0);
  React.useEffect(() => {
    const showPromise = Keyboard.addListener("keyboardWillShow", (info) => {
      setHeight(info.keyboardHeight);
    });
    const hidePromise = Keyboard.addListener("keyboardWillHide", () => {
      setHeight(0);
    });
    return () => {
      showPromise.then((h) => h.remove());
      hidePromise.then((h) => h.remove());
    };
  }, []);
  return height;
}

interface FullScreenSheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
}

const FullScreenSheet = ({ open, onClose, title, children }: FullScreenSheetProps) => {
  const keyboardHeight = useKeyboardHeight();
  if (!open) return null;
  return createPortal(
    // pointer-events-auto: kad je full screen otvoren UNUTAR Radix modala (npr
    // ExerciseSearchSheet u ExercisePickerSheet), Radix postavi body
    // pointer-events:none; ovde to ponistavamo da tapovi stizu do sadrzaja.
    // overflow-hidden: nikad horizontalni skrol celog ekrana.
    // paddingBottom = keyboardHeight: ceo stub (i scroll i footer) sedne iznad
    // tastature, pa footer sa vise dugmadi nikad ne zaseca tastatura.
    <div
      className="fixed inset-0 z-[100] bg-background flex flex-col overflow-hidden pointer-events-auto animate-in slide-in-from-right duration-200"
      style={{
        paddingBottom: keyboardHeight ? `${keyboardHeight}px` : undefined,
        transition: "padding-bottom 0.25s ease",
        overscrollBehavior: "none",
      }}
    >
      {/* Top zaglavlje */}
      <div
        className="shrink-0 px-4 pb-3 border-b border-hairline"
        style={{ paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 12px)" }}
      >
        <div className="relative flex items-center justify-center h-10">
          <button
            onClick={onClose}
            aria-label="Zatvori"
            className="absolute left-0 -ml-2 h-10 w-10 rounded-full flex items-center justify-center hover:bg-surface-2 active:scale-95 transition"
          >
            <X className="h-5 w-5" strokeWidth={2.25} />
          </button>
          <h2 className="font-display text-base font-bold">{title}</h2>
        </div>
      </div>

      <KeyboardHeightContext.Provider value={keyboardHeight}>
        {children}
      </KeyboardHeightContext.Provider>
    </div>,
    document.body,
  );
};
FullScreenSheet.displayName = "FullScreenSheet";

/** Fiksan deo ispod zaglavlja (search, filter pilule…). Ne skroluje. */
const FullScreenSheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("shrink-0 px-4 pt-4 pb-3 space-y-3", className)} {...props} />
);
FullScreenSheetHeader.displayName = "FullScreenSheetHeader";

/**
 * Skrolabilni kontejner. Vertikalni skrol; nikad horizontalni (overflow-x-hidden).
 * overscroll-contain sprecava rubber-band belo ispod. Podizanje iznad tastature
 * radi root (paddingBottom), pa je ovde donji razmak konstantan.
 */
const FullScreenSheetScroll = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, style, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain px-4 pb-6",
        className,
      )}
      style={style}
      {...props}
    />
  );
});
FullScreenSheetScroll.displayName = "FullScreenSheetScroll";

/**
 * Opcioni fiksni dno (dugmad). Podizanje iznad tastature radi root
 * (paddingBottom), pa ceo footer stoji iznad tastature.
 * Donji padding je keyboard-aware da se safe-area ne broji dvaput:
 * - tastatura gore (visina > 0): pb-2 (simetrija sa pt-2), bez env safe-area,
 *   jer root vec podize footer na vrh tastature.
 * - tastatura dole (visina == 0): pb-[max(env(safe-area-inset-bottom),16px)]
 *   zbog home indikatora.
 */
const FullScreenSheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => {
  const keyboardHeight = React.useContext(KeyboardHeightContext);
  return (
    <div
      className={cn(
        "shrink-0 px-4 pt-2 border-t border-hairline",
        keyboardHeight > 0 ? "pb-2" : "pb-[max(env(safe-area-inset-bottom),16px)]",
        className,
      )}
      {...props}
    />
  );
};
FullScreenSheetFooter.displayName = "FullScreenSheetFooter";

export {
  FullScreenSheet,
  FullScreenSheetHeader,
  FullScreenSheetScroll,
  FullScreenSheetFooter,
};
