import { useState, type ReactNode } from "react";
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
 * 全屏预览：深色遮罩铺满屏幕，内容居中、四周留白，图片按屏幕等比缩放且不撑满；
 * 右上角「下载」（仅图片）与「关闭」。Esc / 点空白处也可关闭。
 */
export function MediaPreview({ open, label, src, children, onClose }: {
  open: boolean;
  label: string;
  /** 图片地址；给了才显示「下载」。 */
  src?: string | null;
  /** 非图片内容（如方案平面图），与 src 二选一。 */
  children?: ReactNode;
  onClose: () => void;
}) {
  const [saving, setSaving] = useState(false);
  // 跨域图片不能直接用 <a download>，先取成 blob 再保存。
  const download = async () => {
    if (!src || saving) return;
    setSaving(true);
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const url = URL.createObjectURL(await response.blob());
      const link = Object.assign(document.createElement("a"), { href: url, download: fileNameOf(src, label) });
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
  return <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="image-lightbox-overlay" />
      <DialogPrimitive.Content className="image-lightbox" aria-describedby={undefined} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <DialogPrimitive.Title className="sr-only">{label}</DialogPrimitive.Title>
        {children ?? (src && <img src={src} alt={label} crossOrigin={src.startsWith("blob:") ? undefined : "anonymous"} />)}
        <div className="image-lightbox-actions">
          {src && <EditorTooltip label="下载" side="bottom">
            <button type="button" aria-label="下载图片" aria-busy={saving || undefined} disabled={saving} onClick={() => void download()}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
            </button>
          </EditorTooltip>}
          <EditorTooltip label="关闭" shortcut="Esc" side="bottom">
            <DialogPrimitive.Close asChild><button type="button" aria-label="关闭预览"><X size={15} /></button></DialogPrimitive.Close>
          </EditorTooltip>
        </div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}

/** 图片预览：参考图等位图用这个。 */
export function ImagePreview({ src, alt, onClose }: { src: string | null; alt: string; onClose: () => void }) {
  return <MediaPreview open={!!src} label={alt} src={src} onClose={onClose} />;
}
