import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

/** 参考图放大预览：点缩略图打开，Esc / 点外部 / ✕ 关闭。 */
export function ImagePreview({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  return <Dialog open={!!src} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogContent className="image-preview-dialog">
      <DialogTitle className="sr-only">{alt}</DialogTitle>
      <DialogDescription className="sr-only">参考图大图预览</DialogDescription>
      {src && <img src={src} alt={alt} crossOrigin={src.startsWith("blob:") ? undefined : "anonymous"} />}
    </DialogContent>
  </Dialog>;
}
