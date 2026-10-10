/**
 * 品牌标志「筑间」：一座陶土色小屋，屋身里是吉祥物的一双大眼（向上看，好奇地打量空间），
 * 右侧烟囱是一支绿色滚筒刷，呼应「装修」。透明底，颜色全部来自主题 token（见 index.css .brand-logo）。
 * 与 public/favicon.svg 是同一图形，改动时两边一起改。
 */
export function Logo({ size = 24, className = "" }: { size?: number; className?: string }) {
  return <svg viewBox="0 0 64 64" width={size} height={size} className={("brand-logo " + className).trim()} aria-hidden="true">
    <rect className="brand-logo-roller" x="41" y="6" width="9" height="16" rx="3" />
    <path className="brand-logo-house" d="M32 9 L56 29 V55 H8 V29 Z" />
    <ellipse className="brand-logo-eye" cx="24.5" cy="40" rx="5.2" ry="7.2" />
    <ellipse className="brand-logo-eye" cx="39.5" cy="40" rx="5.2" ry="7.2" />
    <ellipse className="brand-logo-pupil" cx="25.3" cy="37.2" rx="2.4" ry="3.4" />
    <ellipse className="brand-logo-pupil" cx="40.3" cy="37.2" rx="2.4" ry="3.4" />
  </svg>;
}
