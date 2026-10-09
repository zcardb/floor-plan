import { useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Download, Loader2, X } from "lucide-react";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { notify } from "@/lib/notify";

/** 下载文件名：取地址最后一段，没有扩展名时补 .png。 */
const fileNameOf = (src: string, alt: string) => {
  const last = src.startsWith("blob:") ? "" : decodeURIComponent(new URL(src, location.href).pathname.split("/").pop() ?? "");
  return /\.(png|jpe?g|webp|gif)$/i.test(last) ? last : `${alt || "参考图"}.png`;
};

/**
 * 全屏图片预览：深色遮罩铺满屏幕，图片按屏幕等比缩放、无边框；
 * 右上角「下载」「关闭」。Esc / 点空白处也可关闭。
 */
export function ImagePreview({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  const [saving, setSaving] = useState(false);
  // 跨域图片不能直接用 <a download>，先取成 blob 再保存。
  const download = async () => {
    if (!src || saving) return;
    setSaving(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: fileNameOf(src, alt) });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      notify.error("图片下载失败，请重试", cause);
    } finally {
      setSaving(false);
    }
  };
  return <DialogPrimitive.Root open={!!src} onOpenChange={(open) => { if (!open) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="image-lightbox-overlay" />
      <DialogPrimitive.Content className="image-lightbox" aria-describedby={undefined} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <DialogPrimitive.Title className="sr-only">{alt}</DialogPrimitive.Title>
        {src && <img src={src} alt={alt} crossOrigin={src.startsWith("blob:") ? undefined : "anonymous"} />}
        <div className="image-lightbox-actions">
          <EditorTooltip label="下载" side="bottom">
            <button type="button" aria-label="下载图片" aria-busy={saving || undefined} disabled={saving} onClick={() => void download()}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            </button>
          </EditorTooltip>
          <EditorTooltip label="关闭" shortcut="Esc" side="bottom">
            <DialogPrimitive.Close asChild><button type="button" aria-label="关闭预览"><X size={15} /></button></DialogPrimitive.Close>
          </EditorTooltip>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
