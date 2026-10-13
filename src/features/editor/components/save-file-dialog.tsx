import { useEffect, useState } from "react";
import { Hand, MoreHorizontal } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export interface PendingFile {
  blob: Blob;
  name: string;
}

/** 浏览器不能直接下载（微信内置浏览器）时的替代保存方式。 */
export function SaveFileDialog({ file, onClose }: { file: PendingFile | null; onClose: () => void }) {
  const image = !!file && file.blob.type.startsWith("image/");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!file || !image) return;
    const next = URL.createObjectURL(file.blob);
    setUrl(next);
    return () => {
      URL.revokeObjectURL(next);
      setUrl(null);
    };
  }, [file, image]);
  return (
    <Dialog open={!!file} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{image ? "长按图片保存到相册" : "请在浏览器中导出"}</DialogTitle>
          <DialogDescription>
            {image
              ? "当前浏览器不支持直接下载，长按下方图片，选择「保存图片」即可。"
              : `当前浏览器不支持下载「${file?.name ?? ""}」。点右上角 ··· 选择「在浏览器打开」，再重新导出。`}
          </DialogDescription>
        </DialogHeader>
        {image ? (
          url && (
            <figure className="flex flex-col items-center gap-2">
              <img src={url} alt={file?.name} className="max-h-[60dvh] w-full rounded-lg border border-border bg-muted object-contain" />
              <figcaption className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Hand className="h-3.5 w-3.5" />
                长按图片保存
              </figcaption>
            </figure>
          )
        ) : (
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
            <MoreHorizontal className="h-5 w-5 shrink-0 text-foreground" />
            右上角 ··· → 在浏览器打开 → 导出
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
