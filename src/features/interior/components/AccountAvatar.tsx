import { Avatar,AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { accountInitial,accountTone } from '../model/accountIdentity';
export function AccountAvatar({email,size=40,className}:{email?:string;size?:number;className?:string}){
  return <Avatar aria-hidden="true" data-tone={accountTone(email)} className={cn('account-avatar',className)} style={{width:size,height:size}}>
    <AvatarFallback className="account-avatar-fallback" style={{fontSize:Math.round(size*0.42)}}>{accountInitial(email)}</AvatarFallback>
  </Avatar>;
}
