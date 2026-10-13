import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'));
import { pageOf, rpcFake } from '@/lib/backend/connection.testing';
import { assistantPage } from '../api/assistants';

beforeEach(() => rpcFake.reset());

describe('小助手列表接口', () => {
  it('列表行换成页面用的对象', async () => {
    rpcFake.result = pageOf([{ id: 'a1', name: '极简', avatar: 'bot', model: 'm', prompt: 'p', updated_at: '2026-10-12' }]);
    expect((await assistantPage({ page: 1, pageSize: 20 })).list).toEqual([{ id: 'a1', name: '极简', avatar: 'bot', model: 'm', prompt: 'p', updatedAt: '2026-10-12' }]);
  });
});
