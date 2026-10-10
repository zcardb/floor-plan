import { useState } from "react";
import { Bot, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorTooltip } from "@/components/ui/editor-tooltip";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { notify } from "@/lib/notify";
import { CmsPageHeader } from "./CmsPageHeader";
import { AssistantAvatarView } from "./AssistantAvatarView";
import { AssistantDialog } from "./AssistantDialog";
import { modelName } from "../ai/models";
import { useAssistants, type Assistant } from "../cloud/useAssistants";

/** 管理端「小助手」：卡片列表 + 新建 / 编辑 / 删除。 */
export function AssistantManager() {
  const assistants = useAssistants();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Assistant | "new" | null>(null);
  const remove = async (a: Assistant) => {
    if (!await confirm({ title: `删除小助手「${a.name}」？`, description: "删除后无法恢复；正在使用它的 AI 输入框需要重新选择。", confirmText: "删除", tone: "destructive" })) return;
    try {
      await assistants.remove(a.id);
      notify.success("已删除小助手");
    } catch (cause) {
      notify.error("删除失败", cause);
    }
  };
  const { items, loading, error } = assistants;
  return <div className="assistant-manager">
    <CmsPageHeader title="小助手" description="把常用的设计偏好写成 Prompt，生成户型和布局时一键调用。" actions={<>
      <EditorTooltip label="刷新" disabled={loading}>
        <Button variant="outline" className="cms-icon-button" aria-label="刷新" disabled={loading} onClick={() => void assistants.load()}><RefreshCw className={loading ? "animate-spin" : ""} /></Button>
      </EditorTooltip>
      <Button onClick={() => setEditing("new")}><Plus />新建小助手</Button>
    </>} />
    {error ? <div className="cms-empty" role="alert"><p>小助手读取失败：{error}</p><Button variant="outline" onClick={() => void assistants.load()}>重试</Button></div>
      : loading && !items.length ? <ul className="assistant-grid" aria-busy="true">{[0, 1, 2].map((i) => <li key={i} className="assistant-card is-skeleton" />)}</ul>
      : !items.length ? <div className="cms-empty"><Bot size={36} /><p>还没有小助手，新建一个，把你的设计习惯交给 AI。</p><Button onClick={() => setEditing("new")}><Plus />新建小助手</Button></div>
      : <ul className="assistant-grid">
        {items.map((a) => <li key={a.id} className="assistant-card">
          <div className="assistant-card-head">
            <AssistantAvatarView avatar={a.avatar} size={44} />
            <div className="assistant-card-title"><b>{a.name}</b><small>{modelName(a.model)}</small></div>
            <div className="assistant-card-actions">
              <EditorTooltip label="编辑"><button type="button" aria-label={`编辑${a.name}`} onClick={() => setEditing(a)}><Pencil size={15} /></button></EditorTooltip>
              <EditorTooltip label="删除"><button type="button" className="is-danger" aria-label={`删除${a.name}`} onClick={() => void remove(a)}><Trash2 size={15} /></button></EditorTooltip>
            </div>
          </div>
          <p className="assistant-card-prompt">{a.prompt.trim() || "未填写 Prompt"}</p>
        </li>)}
      </ul>}
    <AssistantDialog
      open={editing !== null}
      initial={editing && editing !== "new" ? editing : undefined}
      onClose={() => setEditing(null)}
      onSave={async (input) => {
        if (editing && editing !== "new") { await assistants.update(editing.id, input); notify.success("已保存小助手"); }
        else { await assistants.create(input); notify.success("已创建小助手"); }
      }}
    />
  </div>;
}
