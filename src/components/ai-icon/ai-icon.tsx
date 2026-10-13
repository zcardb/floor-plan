import type { SVGProps } from 'react';

/**
 * 全项目唯一的 AI 标识：一大一小两颗实心四角星，颜色跟随 currentColor。
 * 不再使用 lucide 的 Sparkles（三颗描边星，15px 下发糊、显得乱）。
 * 尺寸用法与 lucide 图标一致：`<AiIcon size={15} />`。颜色统一为主色（`.ai-icon`），文字颜色不受影响。
 */
export function AiIcon({ size = 16, className, ...rest }: SVGProps<SVGSVGElement> & { size?: number }) {
  return <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" focusable="false"
    className={className ? `ai-icon ${className}` : 'ai-icon'} {...rest}>
    <path stroke="currentColor" strokeWidth={1} strokeLinejoin="round"
      d="M10 5.5C10.75 10.94 12.56 12.75 18 13.5C12.56 14.25 10.75 16.06 10 21.5C9.25 16.06 7.44 14.25 2 13.5C7.44 12.75 9.25 10.94 10 5.5Z" />
    <path stroke="currentColor" strokeWidth={0.8} strokeLinejoin="round"
      d="M18.5 2C18.89 4.33 19.67 5.11 22 5.5C19.67 5.89 18.89 6.67 18.5 9C18.11 6.67 17.33 5.89 15 5.5C17.33 5.11 18.11 4.33 18.5 2Z" />
  </svg>;
}
