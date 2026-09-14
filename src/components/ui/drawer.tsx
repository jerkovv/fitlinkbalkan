import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Drawer as DrawerPrimitive } from "vaul";
import { Keyboard } from "@capacitor/keyboard";

import { cn } from "@/lib/utils";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";

// Racunar (fitlink.rs/dashboard): fioka koja se prevlaci prstom nema smisla uz mis,
// a zalepljena za dno monitora izgleda kao greska - postaje obican prozor na sredini
// (Radix Dialog). Trigger/Close/Title/Description iz vaul-a su isti Radix delovi pa
// rade u obe grane; Root/Portal/Overlay/Content traze vaul kontekst i biraju granu.
const Drawer = ({
  shouldScaleBackground = true,
  // Vaul po defaultu "reposicionira" sheet uz visual viewport kad iskoči
  // tastatura, pa se sheet skupi na visinu tastature i odseče sadržaj. Mi to
  // gasimo i sami podižemo sadržaj iznad tastature (DrawerContent paddingBottom).
  repositionInputs = false,
  ...props
}: React.ComponentProps<typeof DrawerPrimitive.Root>) => {
  const desktop = useDesktopWeb();
  if (desktop) {
    return (
      <DialogPrimitive.Root
        open={props.open}
        onOpenChange={props.onOpenChange}
        defaultOpen={props.defaultOpen}
        modal={props.modal}
      >
        {props.children}
      </DialogPrimitive.Root>
    );
  }
  return (
    <DrawerPrimitive.Root
      shouldScaleBackground={shouldScaleBackground}
      repositionInputs={repositionInputs}
      {...props}
    />
  );
};
Drawer.displayName = "Drawer";

const DrawerTrigger = DrawerPrimitive.Trigger;

const DrawerPortal = (props: React.ComponentProps<typeof DrawerPrimitive.Portal>) => {
  const desktop = useDesktopWeb();
  return desktop ? <DialogPrimitive.Portal {...props} /> : <DrawerPrimitive.Portal {...props} />;
};

const DrawerClose = DrawerPrimitive.Close;

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Overlay>
>(({ className, ...props }, ref) => {
  const desktop = useDesktopWeb();
  return desktop ? (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0",
        className,
      )}
      {...props}
    />
  ) : (
    <DrawerPrimitive.Overlay ref={ref} className={cn("fixed inset-0 z-50 bg-black/80", className)} {...props} />
  );
});
DrawerOverlay.displayName = DrawerPrimitive.Overlay.displayName;

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Content> & {
    /**
     * Klase za zatamnjenje ispod. Postoji samo zbog z-indeksa: overlay se
     * renderuje ovde unutra, pa se spolja ne moze dohvatiti, a drawer koji se
     * otvara iznad full-screen sloja (z-100) mora da podigne oba.
     */
    overlayClassName?: string;
  }
>(({ className, children, style, overlayClassName, ...props }, ref) => {
  const desktop = useDesktopWeb();
  // Kad iskoči tastatura, podigni ceo sadržaj sheeta iznad nje (paddingBottom =
  // visina tastature). Sheet zadrži svoju visinu (max-h), a unutrašnji
  // DrawerBody (flex-1 overflow-y-auto) skroluje do svih polja i dugmeta.
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

  if (desktop) {
    // Omotac centrira flex-om (ne transform-om, da ga zoom animacija ne pomeri).
    // overlayClassName nosi samo z-indeks, pa ga dobija i omotac - inace bi prozor
    // otvoren iznad full-screen sloja (z-100) ostao ispod svoje pozadine.
    return (
      <DrawerPortal>
        <DrawerOverlay className={overlayClassName} />
        <div
          className={cn(
            "fixed inset-0 z-50 flex items-center justify-center p-6 pointer-events-none",
            overlayClassName,
          )}
        >
          <DialogPrimitive.Content
            ref={ref}
            className={cn(
              "relative pointer-events-auto flex w-full max-w-md max-h-[min(820px,calc(100dvh-48px))] flex-col overflow-hidden rounded-2xl border bg-background pt-2 shadow-2xl duration-200 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
              className,
            )}
            style={style}
            {...props}
          >
            {children}
          </DialogPrimitive.Content>
        </div>
      </DrawerPortal>
    );
  }

  return (
    <DrawerPortal>
      <DrawerOverlay className={overlayClassName} />
      <DrawerPrimitive.Content
        ref={ref}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 mt-24 flex max-h-[90dvh] flex-col rounded-t-[10px] border bg-background",
          className,
        )}
        style={{
          paddingBottom: keyboardHeight ? `${keyboardHeight}px` : undefined,
          transition: "padding-bottom 0.25s ease",
          ...style,
        }}
        {...props}
      >
        <div className="mx-auto mt-4 h-2 w-[100px] shrink-0 rounded-full bg-muted" />
        {children}
      </DrawerPrimitive.Content>
    </DrawerPortal>
  );
});
DrawerContent.displayName = "DrawerContent";

/** Skrolabilni deo sheeta (polja forme). Skrati se kad tastatura smanji prostor. */
const DrawerBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 min-h-0 overflow-y-auto overscroll-contain", className)} {...props} />
);
DrawerBody.displayName = "DrawerBody";

const DrawerHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("grid gap-1.5 p-4 text-center sm:text-left", className)} {...props} />
);
DrawerHeader.displayName = "DrawerHeader";

const DrawerFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("mt-auto flex shrink-0 flex-col gap-2 p-4", className)} {...props} />
);
DrawerFooter.displayName = "DrawerFooter";

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DrawerTitle.displayName = DrawerPrimitive.Title.displayName;

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DrawerPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DrawerPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DrawerDescription.displayName = DrawerPrimitive.Description.displayName;

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerBody,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
};
