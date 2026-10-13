import { useState } from "react";
import { UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DEFAULT_AI_COUNT } from "../hooks/use-room-ai";
import { DEFAULT_AI_ENGINE } from "../model/models";
import { AiComposer, type AiComposerValue } from "./ai-composer";
import { AiIcon } from "@/components/ai-icon/ai-icon";

/**
 * 侧栏「AI 模式」：上面是消息区，下面贴底是与 AI 布局 / AI 新建同一个 `AiComposer`。
 * 本轮只做布局：发送不调用生成逻辑，输入内容保留在输入框里；游客只显示登录提示。
 */
export function AiChatPanel({ loggedIn, login }: { loggedIn: boolean; login: () => void }) {
  const [value, setValue] = useState<AiComposerValue>({ description: "", images: [], count: DEFAULT_AI_COUNT, engine: DEFAULT_AI_ENGINE });
  if (!loggedIn)
    return (
      <div className="ai-chat-panel">
        <div className="ai-chat-empty">
          <AiIcon size={24} />
          <p>登录后可使用 AI 模式</p>
          <Button size="sm" className="ai-chat-login" onClick={login}>
            <UserRound />
            登录
          </Button>
        </div>
      </div>
    );
  return (
    <div className="ai-chat-panel">
      <div className="ai-chat-empty">
        <AiIcon size={24} />
        <p>描述你想要的布局，AI 帮你规划</p>
      </div>
      <div className="ai-chat-composer">
        <AiComposer
          value={value}
          onDescription={(description) => setValue((v) => ({ ...v, description }))}
          onImages={(fn) => setValue((v) => ({ ...v, images: fn(v.images) }))}
          onCount={(count) => setValue((v) => ({ ...v, count }))}
          onEngine={(engine) => setValue((v) => ({ ...v, engine }))}
          onSend={() => {}}
          placeholder="例如：客厅做成开放式，靠窗放一张书桌"
          label="对话"
          hint="对话功能即将接入"
          sendLabel="发送"
        />
      </div>
    </div>
  );
}
