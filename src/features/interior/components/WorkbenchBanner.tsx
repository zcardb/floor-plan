import type { ReactNode } from 'react';

/**
 * 工作台顶部提示条（游客改模版、内置模板只读预览共用）：放在工作台栅格之外，不打乱 .workbench 布局。
 * 左侧文案、右侧操作两端对齐。children 为操作按钮，主按钮用 className="workbench-banner-action"，次按钮用 "workbench-banner-dismiss"。
 */
export function WorkbenchBanner({ description, label, children }: {
  description: string; label: string; children?: ReactNode;
}) {
  return <div className="workbench-banner" role="status" aria-label={label}>
    <span className="workbench-banner-copy">
      <span>{description}</span>
    </span>
    {children && <span className="workbench-banner-actions">{children}</span>}
  </div>;
}
