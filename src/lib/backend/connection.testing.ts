/**
 * 测试用的假后端：记录列表函数（rpc）的调用，并返回用例指定的结果。
 * 用法：`vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'))`，
 * 再从本文件取 `rpcFake` 设置返回值、读取调用记录。
 */
export const rpcFake = {
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  result: null as unknown,
  error: null as null | { message: string },
  reset() { this.calls = []; this.result = null; this.error = null; },
};

export const backend = async () => ({
  rpc: async (fn: string, args: Record<string, unknown>) => {
    rpcFake.calls.push({ fn, args });
    return { data: rpcFake.result, error: rpcFake.error };
  },
});

export const requireUserId = async () => 'user-1';

/** 统一分页格式的一页：{ list, pagination, counts }。 */
export const pageOf = (list: unknown[], total = list.length, counts: Record<string, number> = {}) => ({ list, pagination: { page: 1, pageSize: 20, total }, counts });
