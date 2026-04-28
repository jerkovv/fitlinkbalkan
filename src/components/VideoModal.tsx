import { toEmbedUrl } from "@/lib/videoEmbed";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface Props {
  url: string;
  title?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const VideoModal = ({ url, title, open, onOpenChange }: Props) => {
  const embed = toEmbedUrl(url);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5">
          <DialogTitle className="text-[16px]">{title ?? "Demonstracija vežbe"}</DialogTitle>
        </DialogHeader>
        <div className="w-full aspect-video bg-foreground">
          {embed ? (
            embed.type === "video" ? (
              <video
                src={embed.src}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            ) : (
              <iframe
                src={embed.src}
                title={title ?? "video"}
                className="w-full h-full"
                allow="autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            )
          ) : (
            <div className="w-full h-full flex items-center justify-center text-background/70 text-sm">
              Video nije moguće prikazati.{" "}
              <a href={url} target="_blank" rel="noreferrer" className="ml-1 underline">
                Otvori link
              </a>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
