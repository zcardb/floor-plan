import { avatarOf } from "../ai/assistantAvatars";
import { AvatarFigure } from "./AvatarFigure";

/** 小助手头像：素材图或小人插画 + 色调底；尺寸由 size 控制。 */
export function AssistantAvatarView({ avatar, size = 24 }: { avatar: string; size?: number }) {
  const a = avatarOf(avatar);
  return <span className="assistant-avatar" data-tone={a.tone} style={{ width: size, height: size }} aria-hidden="true">
    {a.src ? <img src={a.src} alt="" /> : a.prop && <AvatarFigure prop={a.prop} look={a.look} />}
  </span>;
}
