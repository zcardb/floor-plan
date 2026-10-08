import { toast } from "sonner";

/** 从任意抛出值中取可读的错误信息。 */
export function errorMessage(cause: unknown, fallback = "未知错误"): string {
  if (cause instanceof Error && cause.message) return cause.message;
  if (typeof cause === "string" && cause.trim()) return cause;
  if (cause && typeof cause === "object" && "message" in cause) {
    const message = (cause as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

/**
 * 全站统一提示：
 * - success：提交型操作成功
 * - fail：操作未执行（规则限制 / 输入无效），仅标题
 * - error：异常报错，标题 + Error Info 描述行
 * - info：中性说明
 */
export const notify = {
  success: (title: string, description?: string) =>
    toast.success(title, { description, duration: 2500 }),
  fail: (title: string) => toast.error(title, { duration: 4000 }),
  error: (title: string, cause?: unknown) =>
    toast.error(title, {
      description: cause === undefined ? undefined : errorMessage(cause, "请稍后重试"),
      duration: 6000,
    }),
  info: (title: string) => toast.info(title, { duration: 3000 }),
};
