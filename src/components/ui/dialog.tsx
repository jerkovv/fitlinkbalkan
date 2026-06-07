import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Keyboard } from "@capacitor/keyboard";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const isHeaderEl = (c: React.ReactNode): c is React.ReactElement =>
  React.isValidElement(c) && c.type === DialogHeader;
const isFooterEl = (c: React.ReactNode): c is React.ReactElement =>
  React.isValidElement(c) && c.type === DialogFooter;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, style, ...props }, ref) => {
  // Jedinstveno premium keyboard ponasanje za sve modale, centralno:
  //
  // 1) Pozicioniranje: kad je tastatura zatvorena modal je centriran
  //    (items-center). Kad je otvorena, poravna se na DNO (items-end) i sedne
  //    tacno iznad tastature (paddingBottom = keyboardHeight + 10px). Kratak
  //    modal tako padne na tastaturu umesto da lebdi u sredini.
  //
  // 2) Clamp vrha + cap visine: wrapper ima paddingTop = safe-area pa vrh
  //    modala nikad ne pregazi status bar; inline maxHeight = tacno raspolozivi
  //    prostor (100dvh - safe-area - gap - keyboardHeight), pa visok modal
  //    ostane prikovan vrhom ispod statusa.
  //
  // 3) Tri slota unutar DialogContent (bez diranja ekrana): DialogHeader se
  //    prikuje na vrh, DialogFooter na dno (uvek vidljiv), a sve izmedju ide u
  //    skrolabilni kontejner (flex-1, overflow-y-auto). DialogFooter se hvata i
  //    kad je unutar <form> (rebuild forme da footer ostane u njoj radi submita).
  const [keyboardHeight, setKeyboardHeight] = React.useState(0);
  React.useEffect(() => {
    const showPromise = Keyboard.addListener("keyboardWillShow", (info) => {
      setKeyboardHeight(info.keyboardHeight);
    });
    const hidePromise = Keyboard.addListener("keyboardWillHide", () => {
      setKeyboardHeight(0);
    });
    return () => {
      showPromise.then((h) => h.remove());
      hidePromise.then((h) => h.remove());
    };
  }, []);

  // gap iznad tastature kad je otvorena, inace normalna donja margina
  const gapBottom = keyboardHeight > 0 ? keyboardHeight + 10 : 16;

  // Podela dece na slotove: header (prikovan), footer (prikovan), ostalo (skrol)
  const childArray = React.Children.toArray(children);
  const header = childArray.find(isHeaderEl) ?? null;
  const nonHeader = childArray.filter((c) => !isHeaderEl(c));

  const directFooter = nonHeader.find(isFooterEl) ?? null;
  let scrollChildren: React.ReactNode[] = nonHeader.filter((c) => !isFooterEl(c));
  let rebuiltForm: React.ReactNode = null;

  if (!directFooter) {
    // footer je verovatno unutar <form>: nadji wrapper koji ga sadrzi i
    // rekonstruisi ga tako da scroll deo i footer ostanu UNUTAR forme
    const owner = nonHeader.find(
      (c) =>
        React.isValidElement(c) &&
        React.Children.toArray((c.props as { children?: React.ReactNode }).children).some(isFooterEl),
    ) as React.ReactElement | undefined;

    if (owner) {
      const ownerChildren = React.Children.toArray(
        (owner.props as { children?: React.ReactNode }).children,
      );
      const ownerFooter = ownerChildren.find(isFooterEl);
      const ownerRest = ownerChildren.filter((c) => !isFooterEl(c));
      const ownerClassName = (owner.props as { className?: string }).className;
      rebuiltForm = React.cloneElement(
        owner,
        { className: "flex flex-1 min-h-0 flex-col" },
        <div className={cn(ownerClassName, "flex-1 min-h-0 overflow-y-auto overscroll-contain")}>
          {ownerRest}
        </div>,
        isFooterEl(ownerFooter)
          ? React.cloneElement(ownerFooter, {
              className: cn("shrink-0", (ownerFooter.props as { className?: string }).className),
            })
          : ownerFooter,
      );
      scrollChildren = nonHeader.filter((c) => c !== owner);
    }
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <div
        className={cn(
          "fixed inset-0 z-50 flex justify-center",
          keyboardHeight > 0 ? "items-end" : "items-center",
        )}
        style={{
          paddingTop: "calc(max(env(safe-area-inset-top), 20px) + 8px)",
          paddingBottom: `${gapBottom}px`,
          transition: "padding 0.25s ease",
        }}
      >
        <DialogPrimitive.Content
          ref={ref}
          className={cn(
            "relative z-50 flex flex-col w-[calc(100%-2rem)] max-w-lg gap-4 border bg-background p-6 shadow-lg rounded-2xl overflow-hidden overscroll-contain duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            className,
          )}
          // Inline maxHeight uvek pobedjuje (cak i ako modal preko className zada
          // svoj max-h), pa modal nikad ne predje raspolozivi prostor.
          style={{
            maxHeight: `calc(100dvh - max(env(safe-area-inset-top), 20px) - 8px - ${gapBottom}px)`,
            transition: "max-height 0.25s ease",
            ...style,
          }}
          {...props}
        >
          {header
            ? React.cloneElement(header, {
                className: cn("shrink-0", (header.props as { className?: string }).className),
              })
            : null}

          {rebuiltForm ? (
            <>
              {scrollChildren.length > 0 ? <div className="shrink-0">{scrollChildren}</div> : null}
              {rebuiltForm}
            </>
          ) : (
            <>
              <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">{scrollChildren}</div>
              {directFooter
                ? React.cloneElement(directFooter, {
                    className: cn("shrink-0", (directFooter.props as { className?: string }).className),
                  })
                : null}
            </>
          )}

          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </div>
    </DialogPortal>
  );
});
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
