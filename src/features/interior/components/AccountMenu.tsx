import { Loader2, LogOut, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { AccountAvatar } from './AccountAvatar';
import { accountName } from '../model/accountIdentity';

/** Right end of the toolbar: circular avatar only; the menu shows account info and logout. Guests get a login button. */
export function AccountMenu({ email, loggedIn, loggingOut, onLogin, onLogout }: {
  email?: string; loggedIn: boolean; loggingOut?: boolean; onLogin: () => void; onLogout: () => void;
}) {
  if (!loggedIn) return <Button size="sm" className="toolbar-login" onClick={onLogin}><UserRound />登录</Button>;
  const name = accountName(email);
  return <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" className="account-trigger" aria-label={'我的账号：' + name}>
        <AccountAvatar email={email} size={30} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="account-menu">
      <DropdownMenuLabel className="account-menu-head">
        <AccountAvatar email={email} size={36} />
        <span><b>{name}</b><small className="account-menu-email">{email}</small></span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem disabled={loggingOut} onSelect={onLogout}>{loggingOut ? <Loader2 className="animate-spin" /> : <LogOut />}退出登录</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
