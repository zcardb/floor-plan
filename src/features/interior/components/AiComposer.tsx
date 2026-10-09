import { useLayoutEffect, useRef, useState, type ClipboardEvent, type DragEvent } from "react";
import { ArrowUp, ChevronDown, ImagePlus, Loader2, Plus, X } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { AI_COUNT_OPTIONS, AI_IMAGE_LIMIT } from "../ai/client";
import { ImagePreview } from "./ImagePreview";
import { AiEnginePicker } from "./AiEnginePicker";
import { imagesUploading, useReferenceImages, type AiImageDraft, type ImagesUpdate } from "../ai/referenceImages";
import { modelOf, type AiEngine } from "../ai/models";
import { useAssistants } from "../cloud/useAssistants";

export interface AiComposerValue {
  description: string;
  images: AiImageDraft[];
  count: number;
  engine: AiEngine;
}

const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const TEXT_MAX_HEIGHT = 200;
/** 只取图片文件：选择框 / 拖入给的是 FileList，粘贴给的是剪贴板条目。 */
const onlyImages = (files: (File | null)[]) => files.filter((file): file is File => !!file && file.type.startsWith("image/"));
const fromList = (list: FileList | null | undefined) => onlyImages(list ? Array.from(list) : []);
const fromClipboard = (items: DataTransferItemList | null | undefined) =>
  onlyImages(items ? Array.from(items).map((item) => (item.kind === "file" ? item.getAsFile() : null)) : []);

/**
 * 两处 AI 入口共用的输入框（圆角卡片）：上方是参考图缩略图（悬停显示 ✕），中间是描述，
 * 底部左侧 ＋ 添加参考图，右侧「模型 / 小助手」选择、「数量」下拉（1–4）与发送按钮。
 * 支持粘贴（Ctrl / ⌘ + V）和拖入图片；Enter 发送，Shift + Enter 换行，输入法组字时不发送。
 */
export function AiComposer({ value, onDescription, onImages, onCount, onEngine, onSend, placeholder, sendLabel = "生成", blocked }: {
  value: AiComposerValue;
  onDescription: (text: string) => void;
  onImages: ImagesUpdate;
  onCount: (count: number) => void;
  onEngine: (engine: AiEngine) => void;
  onSend: () => void;
  placeholder: string;
  sendLabel?: string;
  /** 发送前还缺什么（例如长宽无效）；有值时禁用发送并作为提示。 */
  blocked?: string;
}) {
  const file = useRef<HTMLInputElement>(null), text = useRef<HTMLTextAreaElement>(null);
  const [dragging, setDragging] = useState(false), [preview, setPreview] = useState<{ src: string; alt: string } | null>(null);
  const images = useReferenceImages(value.images, onImages);
  const uploading = imagesUploading(value.images);
  const full = value.images.length >= AI_IMAGE_LIMIT;
  const assistants = useAssistants();
  const assistant = value.engine.kind === "assistant" ? assistants.items.find((a) => a.id === value.engine.id) : undefined;
  const missingAssistant = value.engine.kind === "assistant" && !assistants.loading && !assistant;
  const model = modelOf(value.engine.kind === "model" ? value.engine.id : assistant?.model);
  const blind = value.images.length > 0 && !!model && !model.vision;
  const reason = blocked || (missingAssistant ? "所选小助手已删除，请重新选择" : !value.description.trim() ? "请先描述需求" : uploading ? "参考图上传中" : "");
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
  return <div
    className={"ai-composer" + (dragging ? " is-dragging" : "")}
    onDragOver={(e) => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDragging(true); } }}
    onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
    onDrop={drop}
  >
    {dragging && <div className="ai-composer-drop" aria-hidden="true"><ImagePlus size={15} />松开以添加参考图</div>}
    {value.images.length > 0 && <ul className="ai-composer-images" aria-label="参考图">
      {value.images.map((image, i) => <li key={image.id} aria-busy={image.uploading || undefined}>
        <button type="button" className="ai-composer-image-open" aria-label={`放大查看参考图 ${i + 1}`} onClick={() => setPreview({ src: image.url ?? image.preview, alt: `参考图 ${i + 1}` })}>
          <img src={image.preview} alt={`参考图 ${i + 1}`} crossOrigin={image.preview.startsWith("blob:") ? undefined : "anonymous"} />
        </button>
        {image.uploading && <span className="ai-composer-image-state"><Loader2 size={15} className="animate-spin" /></span>}
        <button type="button" className="ai-composer-image-remove" aria-label={`移除参考图 ${i + 1}`} onClick={() => images.remove(image.id)}><X size={12} /></button>
      </li>)}
    </ul>}
    <textarea
      ref={text}
      aria-label="需求描述"
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
      <EditorTooltip label={full ? `最多 ${AI_IMAGE_LIMIT} 张参考图` : "添加参考图（也可粘贴或拖入）"} side="top" disabled={full}>
        <button type="button" className="ai-composer-add" aria-label="添加参考图" disabled={full} onClick={() => file.current?.click()}><Plus size={15} /></button>
      </EditorTooltip>
      <input ref={file} type="file" accept={IMAGE_ACCEPT} multiple hidden aria-hidden="true" tabIndex={-1}
        onChange={(e) => { const files = fromList(e.target.files); e.target.value = ""; if (files.length) images.add(files); }} />
      <span className="ai-composer-spacer" />
      <AiEnginePicker engine={value.engine} assistants={assistants.items} onChange={onEngine} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ai-composer-count" aria-label={`方案数量，当前 ${value.count} 个`}>{value.count} 个方案<ChevronDown size={12} /></button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="ai-count-menu">
          <DropdownMenuRadioGroup value={String(value.count)} onValueChange={(next) => onCount(Number(next))}>
            {AI_COUNT_OPTIONS.map((n) => <DropdownMenuRadioItem key={n} value={String(n)}>{n} 个方案</DropdownMenuRadioItem>)}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditorTooltip label={reason || sendLabel} shortcut={reason ? undefined : "Enter"} side="top" disabled={!!reason}>
        <button type="button" className="ai-composer-send" aria-label={sendLabel} disabled={!!reason} onClick={send}><ArrowUp size={15} /></button>
      </EditorTooltip>
    </div>
    {blind && <p className="ai-composer-notice" role="status">{model!.name} 不读取参考图，生成时只参考文字描述；需要参考图请换成可读图的模型。</p>}
    <ImagePreview src={preview?.src ?? null} alt={preview?.alt ?? ""} onClose={() => setPreview(null)} />
  </div>;
}
