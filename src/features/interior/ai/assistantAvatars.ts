/**
 * 小助手头像：按 key 存库。默认是一套「小黑人 + 道具」插画（见 AvatarFigure），
 * 换成素材图时把条目改成 { key, src, tone } 即可，数据库不用改。
 * tone 对应 index.css 里的 .assistant-avatar[data-tone]，道具颜色跟随它。
 */
export type AvatarProp =
  | "flashlight" | "box" | "star" | "ruler" | "brush" | "lamp" | "plant" | "sofa" | "house" | "heart"
  | "bulb" | "magnifier" | "pencil" | "roller" | "sparkles" | "cup" | "balloon" | "book" | "chair" | "palette";

export type AvatarLook = "left" | "right" | "up" | "down";

export interface AssistantAvatar {
  key: string;
  prop?: AvatarProp;
  look?: AvatarLook;
  src?: string;
  tone: 1 | 2 | 3 | 4 | 5 | 6;
}

const figure = (prop: AvatarProp, tone: AssistantAvatar["tone"], look: AvatarLook = "right"): AssistantAvatar => ({ key: prop, prop, look, tone });

export const ASSISTANT_AVATARS: AssistantAvatar[] = [
  figure("flashlight", 1),
  figure("box", 2, "down"),
  figure("star", 5, "up"),
  figure("ruler", 3),
  figure("brush", 4, "up"),
  figure("lamp", 3, "up"),
  figure("plant", 2, "down"),
  figure("sofa", 1, "down"),
  figure("house", 5),
  figure("heart", 5, "down"),
  figure("bulb", 3, "up"),
  figure("magnifier", 4),
  figure("pencil", 1),
  figure("roller", 2, "up"),
  figure("sparkles", 3, "up"),
  figure("cup", 4, "down"),
  figure("balloon", 5, "up"),
  figure("book", 2, "down"),
  figure("chair", 1),
  figure("palette", 4, "down"),
];

/** 早期图标头像的 key → 新插画，已保存的小助手不会掉回默认头像。 */
const LEGACY: Record<string, AvatarProp> = {
  bot: "flashlight", sofa: "sofa", home: "house", ruler: "ruler", palette: "palette", leaf: "plant",
  lamp: "lamp", compass: "magnifier", brush: "brush", gem: "star", sun: "bulb", sparkles: "sparkles",
};

export const DEFAULT_ASSISTANT_AVATAR = ASSISTANT_AVATARS[0].key;

export const avatarOf = (key: string) =>
  ASSISTANT_AVATARS.find((a) => a.key === (LEGACY[key] ?? key)) ?? ASSISTANT_AVATARS[0];
