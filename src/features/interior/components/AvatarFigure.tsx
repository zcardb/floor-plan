import type { ReactNode } from "react";
import type { AvatarLook, AvatarProp } from "../ai/assistantAvatars";

/**
 * 小助手头像插画：圆头大眼的小黑人（墨色 = 前景色），右手拿一个道具（currentColor = 头像色调）。
 * 坐标系 64×64；每个道具自带右手的位置。
 */
const PUPIL: Record<AvatarLook, [number, number]> = { right: [1.3, 0.6], left: [-1.3, 0.6], up: [0.5, -1.9], down: [0.6, 1.8] };

const PROPS: Record<AvatarProp, { hand: [number, number]; art: ReactNode }> = {
  flashlight: { hand: [40, 37], art: <>
    <polygon points="47,33 63,25 63,45 47,38" fill="currentColor" opacity=".85" />
    <rect className="avatar-ink" x="38" y="32.5" width="10" height="6" rx="1.6" />
  </> },
  box: { hand: [40, 44], art: <>
    <polygon points="39.5,35 53.5,32 56.5,46 42.5,49" fill="currentColor" />
    <path className="avatar-eye" d="M46.5 33.5 L49.5 47.5" opacity=".5" />
  </> },
  star: { hand: [42, 38], art: <polygon fill="currentColor" points="50,20 52.6,26.5 59.5,27 54.2,31.5 55.9,38.4 50,34.6 44.1,38.4 45.8,31.5 40.5,27 47.4,26.5" /> },
  ruler: { hand: [40, 43], art: <>
    <polygon points="38,40 58.5,28 62.5,35 42,47" fill="currentColor" />
    <path className="avatar-ink-line" strokeWidth="1.2" d="M43 37l1.6 2.8M47.5 34.4l1 1.7M52 31.7l1.6 2.8M56.5 29.1l1 1.7" />
  </> },
  brush: { hand: [41, 42], art: <>
    <path className="avatar-ink-line" strokeWidth="3" d="M41 46 L49 33" />
    <path fill="currentColor" d="M48 32 q-1 -8 6 -12 q5 -2 6 4 q1.5 7 -6 9.5 q-4.5 1.5 -6 -1.5Z" />
  </> },
  lamp: { hand: [46, 38], art: <>
    <polygon points="41,30 55,30 51.5,20 44.5,20" fill="currentColor" />
    <rect className="avatar-ink" x="47" y="29" width="2.4" height="15" />
    <ellipse className="avatar-ink" cx="48.2" cy="45" rx="5.5" ry="2" />
  </> },
  plant: { hand: [43, 45], art: <>
    <path fill="currentColor" opacity=".7" d="M45.5 38.5 C39 34 39 27 42.5 24 C46.5 28 47.5 33 45.5 38.5Z" />
    <path fill="currentColor" opacity=".7" d="M47 38.5 C53.5 34 53.5 27 50 24 C46 28 45 33 47 38.5Z" />
    <polygon points="39,38.5 53,38.5 50.5,49 41.5,49" fill="currentColor" />
  </> },
  sofa: { hand: [40, 44], art: <>
    <rect x="41" y="31" width="18" height="8" rx="2.5" fill="currentColor" opacity=".75" />
    <rect x="38" y="37" width="24" height="9" rx="3" fill="currentColor" />
    <path className="avatar-ink-line" d="M42 46v3M58 46v3" />
  </> },
  house: { hand: [41, 42], art: <>
    <polygon points="39,36 50,26 61,36 61,49 39,49" fill="currentColor" />
    <rect className="avatar-ink" x="46.5" y="41" width="4.4" height="8" rx="1" />
  </> },
  heart: { hand: [42, 41], art: <path fill="currentColor" d="M50 47C38 39 39.5 28 46 28.5c2 .2 3.4 1.6 4 3.4.6-1.8 2-3.2 4-3.4C60.5 28 62 39 50 47Z" /> },
  bulb: { hand: [50, 42], art: <>
    <path className="avatar-ink-line" d="M50 15v-3M41 19l-2-2M59 19l2-2" />
    <circle cx="50" cy="27" r="8" fill="currentColor" />
    <rect className="avatar-ink" x="46.6" y="33.5" width="6.8" height="5.5" rx="1.2" />
  </> },
  magnifier: { hand: [40, 41], art: <>
    <path className="avatar-ink-line" strokeWidth="3.2" d="M40 41 L46 33.5" />
    <circle cx="50.5" cy="28" r="7.5" fill="currentColor" fillOpacity=".22" stroke="currentColor" strokeWidth="3" />
  </> },
  pencil: { hand: [44, 40], art: <>
    <path fill="currentColor" d="M38.5 44.5 L54 26 L58.5 30 L43 48.5Z" />
    <path className="avatar-ink" d="M38.5 44.5 L43 48.5 L36 51Z" />
  </> },
  roller: { hand: [44, 43], art: <>
    <path className="avatar-ink-line" strokeWidth="2.2" d="M52 29v5H44v9" />
    <rect x="43" y="21" width="18" height="8" rx="3.5" fill="currentColor" />
  </> },
  sparkles: { hand: [40, 40], art: <>
    <path fill="currentColor" d="M50 19q1.1 9 10 11-8.9 1.1-10 10-1.1-8.9-10-10 8.9-2 10-11Z" />
    <path fill="currentColor" opacity=".7" d="M58 39q.6 3.4 4 4-3.4.6-4 4-.6-3.4-4-4 3.4-.6 4-4Z" />
  </> },
  cup: { hand: [41, 43], art: <>
    <path fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity=".6" d="M45 32q-2-3 0-6M50 32q-2-3 0-6" />
    <circle cx="56" cy="40.5" r="3.4" fill="none" stroke="currentColor" strokeWidth="2.2" />
    <path fill="currentColor" d="M40.5 35.5h15v8.5q0 5.5-5.5 5.5h-4q-5.5 0-5.5-5.5Z" />
  </> },
  balloon: { hand: [41, 39], art: <>
    <path className="avatar-ink-line" strokeWidth="1.2" d="M50 26.5q-2.5 6-8.5 12" />
    <ellipse cx="50.5" cy="16" rx="8.5" ry="10.5" fill="currentColor" />
  </> },
  book: { hand: [41, 43], art: <>
    <path fill="currentColor" d="M39 34q7-3.5 11 0 4-3.5 11 0v13q-7-3.5-11 0-4-3.5-11 0Z" />
    <path className="avatar-ink-line" strokeWidth="1.2" d="M50 34v13" />
  </> },
  chair: { hand: [43, 41], art: <>
    <rect x="53" y="25" width="3.4" height="16" rx="1.4" fill="currentColor" />
    <rect x="43" y="38" width="14" height="3.6" rx="1.4" fill="currentColor" />
    <path className="avatar-ink-line" d="M45 41.5v8M55 41.5v8" />
  </> },
  palette: { hand: [42, 43], art: <>
    <path fill="currentColor" d="M50 25c9.5 0 12.5 7.5 10.5 12.5-1.8 4.5-6 1.5-8 4.5-2 3.8-6 5.2-9.5 2-4.5-4-3.8-19 7-19Z" />
    <circle className="avatar-eye" cx="47" cy="31" r="1.8" />
    <circle className="avatar-eye" cx="53.5" cy="30.5" r="1.8" />
    <circle className="avatar-ink" cx="56.5" cy="35" r="1.8" />
    <circle className="avatar-ink" cx="52" cy="39" r="1.8" />
  </> },
};

export function AvatarFigure({ prop, look = "right" }: { prop: AvatarProp; look?: AvatarLook }) {
  const { hand, art } = PROPS[prop];
  const [dx, dy] = PUPIL[look];
  return <svg viewBox="0 0 64 64" className="avatar-figure" aria-hidden="true">
    <ellipse className="avatar-ink" cx="19" cy="52.5" rx="6" ry="3.6" />
    <ellipse className="avatar-ink" cx="32" cy="52.5" rx="6" ry="3.6" />
    <ellipse className="avatar-ink" cx="26" cy="41.5" rx="8.5" ry="7" />
    <circle className="avatar-ink" cx="13.5" cy="40.5" r="3.8" />
    <circle className="avatar-ink" cx="26" cy="23.5" r="14.5" />
    {[21.2, 30.8].map((x) => <g key={x}>
      <ellipse className="avatar-eye" cx={x} cy="22" rx="3.5" ry="5.2" />
      <ellipse className="avatar-ink" cx={x + dx} cy={22 + dy} rx="1.7" ry="2.7" />
    </g>)}
    {art}
    <circle className="avatar-ink" cx={hand[0]} cy={hand[1]} r="3.8" />
  </svg>;
}
