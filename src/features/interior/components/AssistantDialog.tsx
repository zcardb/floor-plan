import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, ChevronDown } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { errorMessage } from "@/lib/notify";
import { AssistantAvatarView } from "./AssistantAvatarView";
import { FurniturePicker } from "./FurniturePicker";
import type { PickerItem } from "./pickerItems";
import { ASSISTANT_AVATARS, DEFAULT_ASSISTANT_AVATAR, avatarOf } from "../ai/assistantAvatars";
import { AI_MODELS, DEFAULT_AI_MODEL, modelName, modelOf } from "../ai/models";
import { ASSISTANT_LIMITS, type Assistant, type AssistantInput } from "../cloud/useAssistants";

/** 模型平铺成一列（不分组），靠搜索定位；厂商名仍可搜到。 */
const MODEL_ITEMS: PickerItem[] = AI_MODELS.map((m) => ({
  id: m.id,
  label: m.name,
  group: "模型",
  keywords: [m.id, m.group],
}));

/** 新建 / 编辑小助手：头像、名称、模型、Prompt（Markdown 编辑 + 预览）。 */
export function AssistantDialog({ open, initial, onClose, onSave }: {
  open: boolean;
  initial?: Assistant;
  onClose: () => void;
  onSave: (input: AssistantInput) => Promise<void>;
}) {
  return <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
    <DialogContent className="assistant-dialog">
      <DialogHeader>
        <DialogTitle>{initial ? "编辑小助手" : "新建小助手"}</DialogTitle>
        <DialogDescription>小助手会出现在「AI 布局」和「AI 创建户型」的模型选择里，生成时使用它的模型和 Prompt。</DialogDescription>
      </DialogHeader>
      {open && <AssistantForm key={initial?.id ?? "new"} initial={initial} onClose={onClose} onSave={onSave} />}
    </DialogContent>
  </Dialog>;
}

function AssistantForm({ initial, onClose, onSave }: { initial?: Assistant; onClose: () => void; onSave: (input: AssistantInput) => Promise<void> }) {
  // 旧版图标头像的 key 会映射到对应的新插画，编辑时也能正确选中。
  const [avatar, setAvatar] = useState(initial ? avatarOf(initial.avatar).key : DEFAULT_ASSISTANT_AVATAR);
  const [name, setName] = useState(initial?.name ?? "");
  const [model, setModel] = useState(modelOf(initial?.model) ? initial!.model : DEFAULT_AI_MODEL);
  const [prompt, setPrompt] = useState(initial?.prompt ?? "");
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const reason = !name.trim() ? "请填写名称" : "";
  const submit = async () => {
    if (reason || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ name, avatar, model, prompt });
      onClose();
    } catch (cause) {
      setError(errorMessage(cause, "保存失败，请重试"));
    } finally {
      setSaving(false);
    }
  };
  return <form className="assistant-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
    <fieldset className="assistant-avatars">
      <legend>头像</legend>
      <div role="radiogroup" aria-label="选择头像">
        {ASSISTANT_AVATARS.map((a, index) => <button key={a.key} type="button" role="radio" aria-checked={avatar === a.key} aria-label={`头像 ${index + 1}`}
          className={"assistant-avatar-option" + (avatar === a.key ? " is-selected" : "")} onClick={() => setAvatar(a.key)}>
          <AssistantAvatarView avatar={a.key} size={40} />
          {avatar === a.key && <span className="assistant-avatar-check"><Check size={10} /></span>}
        </button>)}
      </div>
    </fieldset>
    <div className="assistant-form-row">
      <div className="cms-field"><Label htmlFor="assistant-name">名称</Label><Input id="assistant-name" maxLength={ASSISTANT_LIMITS.name} placeholder="例如：北欧风布局师" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div className="cms-field"><Label htmlFor="assistant-model">模型</Label>
        <FurniturePicker items={MODEL_ITEMS} grouped={false} label="选择模型" placeholder="搜索模型…" selectedId={model} onPick={(item) => setModel(item.id)}>
          <button type="button" id="assistant-model" className="picker-select-trigger" aria-label={`模型：${modelName(model)}，点击切换`}>
            <span>{modelName(model)}</span><ChevronDown size={16} />
          </button>
        </FurniturePicker>
      </div>
    </div>
    <div className="cms-field">
      <Label htmlFor="assistant-prompt">Prompt</Label>
      <Tabs defaultValue="edit" className="assistant-prompt">
        <TabsList className="assistant-prompt-tabs"><TabsTrigger value="edit">编辑</TabsTrigger><TabsTrigger value="preview">预览</TabsTrigger></TabsList>
        <TabsContent value="edit">
          <Textarea id="assistant-prompt" maxLength={ASSISTANT_LIMITS.prompt} rows={10} value={prompt} onChange={(e) => setPrompt(e.target.value)}
            placeholder={"支持 Markdown，例如：\n## 风格\n- 偏好北欧原木风\n- 客厅留出 1.2 m 以上的通道"} />
          <small className="assistant-prompt-count">{prompt.length} / {ASSISTANT_LIMITS.prompt}</small>
        </TabsContent>
        <TabsContent value="preview">
          <div className="assistant-markdown">
            {prompt.trim() ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{prompt}</ReactMarkdown> : <p className="assistant-markdown-empty">还没有内容</p>}
          </div>
        </TabsContent>
      </Tabs>
    </div>
    {error && <p className="ai-size-hint is-error" role="alert">{error}</p>}
    <DialogFooter>
      <Button type="button" variant="outline" disabled={saving} onClick={onClose}>取消</Button>
      <Button type="submit" loading={saving} disabled={!!reason} title={reason || undefined}>{initial ? "保存" : "创建"}</Button>
    </DialogFooter>
  </form>;
}
