import { describe, expect, it } from 'vitest';
import { inspectImport } from '../architecture-rules.mjs';

describe('目录分层规则', () => {
  it('跨 Feature 只能经公开入口', () => {
    expect(inspectImport('features/editor/components/workbench.tsx', '@/features/projects')).toBeNull();
    expect(inspectImport('features/editor/components/workbench.tsx', '@/features/projects/index')).toBeNull();
    expect(inspectImport('features/editor/components/workbench.tsx', '@/features/projects/hooks/use-projects')).toBe('feature-public-entry');
    expect(inspectImport('app/pages/studio-page.tsx', '@/features/editor/components/workbench')).toBe('feature-public-entry');
  });

  it('Feature 内部用相对路径，不绕回自己的公开入口', () => {
    expect(inspectImport('features/editor/components/workbench.tsx', '../hooks/use-design')).toBeNull();
    expect(inspectImport('features/editor/components/workbench.tsx', '@/features/editor/hooks/use-design')).toBeNull();
    expect(inspectImport('features/editor/components/workbench.tsx', '@/features/editor')).toBe('feature-self-entry');
    expect(inspectImport('features/editor/index.ts', './components/workbench')).toBeNull();
  });

  it('共享层不依赖 Feature 与应用层', () => {
    expect(inspectImport('components/cms/cms-page-header.tsx', '@/features/projects')).toBe('feature-owned-business');
    expect(inspectImport('lib/floor-plan/geometry.ts', '../../features/editor/model/wall-move')).toBe('feature-owned-business');
    expect(inspectImport('hooks/use-paged-list.ts', '@/app/routes')).toBe('app-owned-routing');
    expect(inspectImport('features/projects/hooks/use-projects.ts', '@/app/routes')).toBe('app-owned-routing');
    expect(inspectImport('app/hooks/use-studio-route.ts', '../routes')).toBeNull();
  });

  it('three 与 Supabase 各有唯一的持有模块', () => {
    expect(inspectImport('features/scene-3d/model/lighting.ts', 'three')).toBeNull();
    expect(inspectImport('features/editor/components/plan-canvas.tsx', 'three/examples/jsm/controls/OrbitControls.js')).toBe('three-owner');
    expect(inspectImport('lib/backend/connection.ts', '@/integrations/supabase/client')).toBeNull();
    expect(inspectImport('features/projects/hooks/use-projects.ts', '@/integrations/supabase/client')).toBe('backend-owner');
    expect(inspectImport('features/projects/hooks/use-projects.ts', '@/lib/backend/supabase')).toBeNull();
    expect(inspectImport('features/editor/components/workbench.tsx', '@/lib/backend/supabase')).toBe('session-client-owner');
    expect(inspectImport('features/editor/components/workbench.tsx', '@/lib/backend')).toBeNull();
  });
});
