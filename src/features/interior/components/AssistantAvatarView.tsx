import { avatarOf } from "../ai/assistantAvatars";

/** 小助手头像：素材图或图标 + 色调底；尺寸由 size 控制。 */
export function AssistantAvatarView({ avatar, size = 24 }: { avatar: string; size?: number }) {
  const a = avatarOf(avatar);
  const Icon = a.icon;
  return <span className="assistant-avatar" data-tone={a.tone} style={{ width: size, height: size }} aria-hidden="true">
    {a.src ? <img src={a.src} alt="" /> : Icon && <Icon size={Math.round(size * 0.55)} />}
  </span>;
}
