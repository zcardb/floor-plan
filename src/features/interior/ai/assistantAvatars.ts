import { Bot, Brush, Compass, Gem, Home, Lamp, Leaf, Palette, Ruler, Sofa, Sparkles, Sun, type LucideIcon } from "lucide-react";

/**
 * 小助手头像：按 key 存库。素材包到位后，把条目换成 { key, src } 即可，数据库不用改。
 * tone 对应 index.css 里的 .assistant-avatar[data-tone]。
 */
export interface AssistantAvatar {
  key: string;
  icon?: LucideIcon;
  src?: string;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
}

export const ASSISTANT_AVATARS: AssistantAvatar[] = [
  { key: "bot", icon: Bot, tone: 1 },
  { key: "sofa", icon: Sofa, tone: 2 },
  { key: "home", icon: Home, tone: 3 },
  { key: "ruler", icon: Ruler, tone: 4 },
  { key: "palette", icon: Palette, tone: 5 },
  { key: "leaf", icon: Leaf, tone: 6 },
  { key: "lamp", icon: Lamp, tone: 2 },
  { key: "compass", icon: Compass, tone: 1 },
  { key: "brush", icon: Brush, tone: 4 },
  { key: "gem", icon: Gem, tone: 5 },
  { key: "sun", icon: Sun, tone: 3 },
  { key: "sparkles", icon: Sparkles, tone: 6 },
];

export const DEFAULT_ASSISTANT_AVATAR = ASSISTANT_AVATARS[0].key;

export const avatarOf = (key: string) => ASSISTANT_AVATARS.find((a) => a.key === key) ?? ASSISTANT_AVATARS[0];
