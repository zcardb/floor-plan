import { Bot, ChevronDown } from "lucide-react";
import { FurniturePicker } from "./FurniturePicker";
import { AssistantAvatarView } from "./AssistantAvatarView";
import type { PickerItem } from "./pickerItems";
import { AI_MODELS, modelName, type AiEngine } from "../ai/models";
import type { Assistant } from "../cloud/useAssistants";

const ASSISTANT_GROUP = "我的小助手";
const MODEL_GROUP = "模型";
const keyOf = (engine: AiEngine) => `${engine.kind}:${engine.id}`;

/** 小助手在上、模型在下，按分组展示；复用家具选择器（可搜索、分组）。 */
function engineItems(assistants: Assistant[]): PickerItem[] {
  return [
    ...assistants.map((a) => ({
      id: keyOf({ kind: "assistant", id: a.id }),
      label: a.name,
      group: ASSISTANT_GROUP,
      hint: modelName(a.model),
      keywords: [modelName(a.model), "小助手"],
      visual: <AssistantAvatarView avatar={a.avatar} size={22} />,
    })),
    ...AI_MODELS.map((m) => ({
      id: keyOf({ kind: "model", id: m.id }),
      label: m.name,
      group: MODEL_GROUP,
      hint: m.vision ? "可读图" : undefined,
      keywords: [m.id, m.group],
    })),
  ];
}

/** AI 输入框底部的模型 / 小助手选择器（在「N 个方案」左侧）。 */
export function AiEnginePicker({ engine, assistants, onChange }: { engine: AiEngine; assistants: Assistant[]; onChange: (engine: AiEngine) => void }) {
  const assistant = engine.kind === "assistant" ? assistants.find((a) => a.id === engine.id) : undefined;
  const label = engine.kind === "model" ? modelName(engine.id) : assistant?.name ?? "小助手已删除";
  return <FurniturePicker
    items={engineItems(assistants)}
    label="选择模型或小助手"
    placeholder="搜索模型或小助手…"
    align="end"
    selectedId={keyOf(engine)}
    onPick={(item) => {
      const [kind, ...rest] = item.id.split(":");
      onChange({ kind: kind as AiEngine["kind"], id: rest.join(":") });
    }}
    footer={assistants.length ? undefined : <><Bot size={13} />还没有小助手，可在左侧「小助手」中新建</>}
  >
    <button type="button" className="ai-composer-count ai-engine-trigger" aria-label={`当前：${label}，点击切换模型或小助手`}>
      {assistant && <AssistantAvatarView avatar={assistant.avatar} size={18} />}
      <span>{label}</span>
      <ChevronDown size={12} />
    </button>
  </FurniturePicker>;
}
