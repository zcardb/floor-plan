import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/backend/connection', () => import('@/lib/backend/connection.testing'));
import { pageOf, rpcFake } from '@/lib/backend/connection.testing';
import { projectPage } from '../api/project-pages';

beforeEach(() => rpcFake.reset());

describe('项目列表接口', () => {
  it('搜索词与是否带缩略图作为参数传入，列表行换成项目摘要', async () => {
    rpcFake.result = pageOf([{ id: 'p1', name: '我的家', updated_at: null, revision: 3, thumbnail: null }], 1, { mine: 1 });
    const projects = await projectPage({ page: 1, pageSize: 20 }, { query: '家', thumbnails: false });
    expect(rpcFake.calls[0]).toEqual({ fn: 'interior_project_page', args: { p_query: '家', p_thumbnails: false, p_page: 1, p_page_size: 20 } });
    expect(projects.list).toEqual([{ id: 'p1', name: '我的家', updatedAt: '', revision: 3, thumbnail: null, cloud: true }]);
    expect(projects.counts).toEqual({ mine: 1 });
  });
});
