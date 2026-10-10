import type { ReactNode } from 'react';

/**
 * 硬装新建表单的编辑模式：传入 initial 即回填并保留 key；priceOnly 时只能改单价（内置材料）。
 * 新建与查看弹窗共用同一份表单，字段始终一致。
 */
export type MaterialFormEdit<T> = {
  initial?: T;
  priceOnly?: boolean;
  submitLabel?: string;
  priceLabel?: string;
  priceHint?: ReactNode;
  /** 表单项之后、操作按钮之前的附加内容（例如地面的采购规格）。 */
  extra?: ReactNode;
};

export const priceDraft = (price: number | null | undefined) => (price == null ? '' : String(price));
export const parsePriceDraft = (draft: string) => (draft.trim() === '' ? null : Number(draft));
