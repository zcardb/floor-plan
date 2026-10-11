import { useState, type ReactNode } from 'react';
import { PanelLeftClose, PanelLeftOpen, LogOut, Loader2, type LucideIcon } from 'lucide-react';
import { Logo } from './Logo';
import { AccountAvatar } from './AccountAvatar';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { EditorTooltip } from '@/components/ui/editor-tooltip';

/**
 * 管理端外壳：左侧侧栏 + 右侧内容面板。所有管理页面都挂在这里，
 * 页面内容一律铺满 `.cms-main`（统一内边距），不要逐页再写 max-width。
 */
export function CmsLayout({ collapsed, sidebar, children, after }: { collapsed: boolean; sidebar: ReactNode; children: ReactNode; after?: ReactNode }) {
  return <div className={'account-cms' + (collapsed ? ' is-collapsed' : '')}>
    <aside className="cms-sidebar">{sidebar}</aside>
    <main className="cms-main"><div className="cms-page">{children}</div></main>
    {after}
  </div>;
}

export type CmsModule = { id: string; name: string; icon: LucideIcon };

/** 侧栏：品牌行（含收起开关）→ 模块导航 → 底部账号菜单。 */
export function CmsSidebar({ collapsed, onToggle, modules, active, onSelect, email, loggingOut, onLogout }: {
  collapsed: boolean; onToggle: () => void; modules: CmsModule[]; active: string; onSelect: (id: string) => void;
  email: string; loggingOut: boolean; onLogout: () => void;
}) {
  const [accountOpen, setAccountOpen] = useState(false);
  const at = email.indexOf('@'), nameHead = at < 0 ? email : email.slice(0, at), nameTail = at < 0 ? '' : email.slice(at);
  const toggleLabel = collapsed ? '展开侧栏' : '收起侧栏';
  return <>
    <div className="cms-brand">
      <Logo size={32} /><b>筑间</b>
      <EditorTooltip label={toggleLabel} side="right">
        <button type="button" className="cms-collapse" aria-label={toggleLabel} aria-expanded={!collapsed} onClick={onToggle}>{collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button>
      </EditorTooltip>
    </div>
    <nav aria-label="管理模块">{modules.map(m => <EditorTooltip key={m.id} label={m.name} side="right">
      <button className={active === m.id ? 'active' : ''} aria-label={m.name} onClick={() => onSelect(m.id)}><m.icon size={19} /><span>{m.name}</span></button>
    </EditorTooltip>)}</nav>
    <div className="cms-account">
      <Popover open={accountOpen} onOpenChange={setAccountOpen}>
        <EditorTooltip label="账号" side="right">
          <PopoverTrigger asChild>
            <button type="button" className="cms-account-trigger" aria-label={`账号菜单：${email}`}><AccountAvatar email={email} size={28} /><span className="cms-account-name"><b>{nameHead}</b><span>{nameTail}</span></span></button>
          </PopoverTrigger>
        </EditorTooltip>
        {/* 宽度与侧栏一致（见 .account-popover）；collisionPadding 让它在展开、收起两种侧栏下都贴着左侧 8px 对齐。 */}
        <PopoverContent className="account-popover" side="top" align="start" sideOffset={8} collisionPadding={8}>
          <div className="account-popover-head"><AccountAvatar email={email} size={40} /><b>{email}</b><small>已登录 · 云端同步</small></div>
          <EditorTooltip label="退出登录" side="right" disabled={loggingOut}>
            <button type="button" className="account-popover-logout" disabled={loggingOut} aria-busy={loggingOut} onClick={() => { setAccountOpen(false); onLogout(); }}>{loggingOut ? <Loader2 className="animate-spin" size={15} /> : <LogOut size={15} />}退出登录</button>
          </EditorTooltip>
        </PopoverContent>
      </Popover>
    </div>
  </>;
}
