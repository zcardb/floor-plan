import { useId, useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ArrowUp, Box, ChevronDown, FileArchive, FileText, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { AI_ATTACHMENT_LIMIT, AI_COUNT_OPTIONS } from "../ai/client";
import { ImagePreview } from "./ImagePreview";
import { AiEnginePicker } from "./AiEnginePicker";
import { ATTACHMENT_ACCEPT, imagesUploading, useReferenceImages, type AiImageDraft, type ImagesUpdate } from "../ai/referenceImages";
import { type AiEngine } from "../ai/models";
import { useAssistants } from "../cloud/useAssistants";

export interface AiComposerValue {
  description: string;
  images: AiImageDraft[];
  count: number;
  engine: AiEngine;
}

const TEXT_MAX_HEIGHT = 200;
/** 选择框 / 拖入给的是 FileList（图片与素材都收）；粘贴只取剪贴板里的图片。 */
const fromList = (list: FileList | null | undefined) => (list ? Array.from(list) : []);
const fromClipboard = (items: DataTransferItemList | null | undefined) =>
  (items ? Array.from(items).map((item) => (item.kind === "file" ? item.getAsFile() : null)) : [])
    .filter((file): file is File => !!file && file.type.startsWith("image/"));
const ARCHIVES = ["zip", "rar", "7z"], MODELS3D = ["obj", "stl", "fbx", "glb", "gltf", "3ds", "skp", "max", "rvt", "ifc"];
const FileIcon = ({ ext }: { ext?: string }) => {
  const Icon = ARCHIVES.includes(ext ?? "") ? FileArchive : MODELS3D.includes(ext ?? "") ? Box : FileText;
  return <Icon size={16} />;
};

/**
 * AI 入口共用的输入框（圆角卡片）：上方是附件（图片缩略图 / 素材格式角标，悬停显示 ✕），中间是描述，
 * 底部左侧 ＋ 添加附件，右侧「模型 / 小助手」选择（可隐藏）、「数量」下拉（1–4）与发送按钮。
 * 支持粘贴图片（Ctrl / ⌘ + V）和拖入图片或素材；Enter 发送，Shift + Enter 换行，输入法组字时不发送。
 */
export function AiComposer({ value, onDescription, onImages, onCount, onEngine, onSend, placeholder, label = "需求描述", hint, sendLabel = "生成方案", showEngine = true }: {
  value: AiComposerValue;
  onDescription: (text: string) => void;
  onImages: ImagesUpdate;
  onCount: (count: number) => void;
  onEngine: (engine: AiEngine) => void;
  onSend: () => void;
  placeholder: string;
  label?: string;
  hint?: string;
  sendLabel?: string;
  /** 图片生成等不需要对话模型的入口传 false，隐藏「模型 / 小助手」选择。 */
  showEngine?: boolean;
}) {
  const descriptionId = useId(), hintId = useId();
  const file = useRef<HTMLInputElement>(null), text = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false), [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const images = useReferenceImages(value.images, onImages);
  const uploading = imagesUploading(value.images);
  const full = value.images.length >= AI_ATTACHMENT_LIMIT;
  const assistants = useAssistants(showEngine);
  const assistant = value.engine.kind === "assistant" ? assistants.items.find((a) => a.id === value.engine.id) : undefined;
  const missingAssistant = showEngine && value.engine.kind === "assistant" && !assistants.loading && !assistant;
  const reason = missingAssistant ? "所选小助手已删除，请重新选择" : !value.description.trim() ? "请先描述需求" : uploading ? "附件上传中" : "";
  const send = () => { if (!reason) onSend(); };
  // 输入框随内容增高，超过上限后内部滚动。
  useLayoutEffect(() => {
    const node = text.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = Math.min(node.scrollHeight, TEXT_MAX_HEIGHT) + "px";
  }, [value.description]);
  const paste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const files = fromClipboard(e.clipboardData?.items);
    if (!files.length) return;
    e.preventDefault();
    images.add(files);
  };
  const drop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    const files = fromList(e.dataTransfer?.files);
    if (files.length) images.add(files);
  };
  return <div className="ai-composer-field">
    <div className="ai-composer-heading">
      <label htmlFor={descriptionId}>{label}</label>
      {hint && <p id={hintId}>{hint}</p>}
    </div>
    <div
    className={"ai-composer" + (dragging ? " is-dragging" : "")}
    onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDragging(true); } }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={drop}
  >
    {dragging && <div className="ai-composer-drop" aria-hidden="true"><ImagePlus size={15} />松开以添加图片或素材</div>}
    {value.images.length > 0 && <ul className="ai-composer-images" aria-label="附件">
      {value.images.map((image, i) => <li key={image.id} aria-busy={image.uploading || undefined} className={image.kind === "file" ? "is-file" : undefined}>
        {image.kind === "file"
          ? <div className="ai-composer-file" title={`${image.name ?? "素材"} · AI 会按需读取`}>
            <FileIcon ext={image.ext} />
            <span className="ai-composer-file-ext">{(image.ext || "file").toUpperCase()}</span>
            <span className="ai-composer-file-name">{image.name}</span>
          </div>
          : <button type="button" className="ai-composer-image-open" aria-label={`放大查看附件 ${i + 1}`} onClick={() => setPreview({ src: image.url ?? image.preview, alt: `附件 ${i + 1}` })}>
            <img src={image.preview} alt={`附件 ${i + 1}`} crossOrigin={image.preview.startsWith("blob:") ? undefined : "anonymous"} />
          </button>}
        {image.uploading && <span className="ai-composer-image-state"><Loader2 size={15} className="animate-spin" /></span>}
        <button type="button" className="ai-composer-image-remove" aria-label={`移除附件 ${image.name ?? i + 1}`} onClick={() => images.remove(image.id)}><X size={12} /></button>
      </li>)}
    </ul>}
    <textarea
      ref={text}
      id={descriptionId}
      aria-label={label}
      aria-describedby={hint ? hintId : undefined}
      maxLength={2000}
      rows={3}
      value={value.description}
      placeholder={placeholder}
      onChange={(e) => onDescription(e.target.value)}
      onPaste={paste}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); }
      }}
    />
    <div className="ai-composer-bar">
      <EditorTooltip label={full ? `最多 ${AI_ATTACHMENT_LIMIT} 个附件` : "添加图片或素材（DXF / PDF / ZIP / 3D 模型等，也可粘贴或拖入）"} side="top" disabled={full}>
        <button type="button" className="ai-composer-add" aria-label="添加图片或素材" disabled={full} onClick={() => file.current?.click()}><Plus size={15} /></button>
      </EditorTooltip>
      <input ref={file} type="file" accept={ATTACHMENT_ACCEPT} multiple hidden aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const files = fromList(e.target.files); e.target.value = ""; if (files.length) images.add(files); }} />
      <div className="ai-composer-settings">
      {showEngine && <AiEnginePicker engine={value.engine} assistants={assistants.items} onChange={onEngine} onCreate={assistants.create} />}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ai-composer-count" aria-label={`数量，当前 ${value.count}`}>{`数量 ${value.count}`}<ChevronDown size={12} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ai-count-menu">
          <DropdownMenuRadioGroup value={String(value.count)} onValueChange={(next) => onCount(Number(next))}>
            {AI_COUNT_OPTIONS.map((n) => <DropdownMenuRadioItem key={n} value={String(n)} aria-label={`数量 ${n}`}>{n}</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      </div>
      <EditorTooltip label={reason || sendLabel} shortcut={reason ? undefined : "Enter"} side="top" disabled={!!reason}>
        <button type="button" className="ai-composer-send" aria-label={sendLabel} disabled={!!reason} onClick={send}><ArrowUp size={15} /><span>{sendLabel}</span></button>
      </EditorTooltip>
    </div>
    <ImagePreview src={preview?.src ?? null} alt={preview?.alt ?? ""} onClose={() => setPreview(null)} />
    </div>
  </div>;
}
