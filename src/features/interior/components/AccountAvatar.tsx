import { Avatar,AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { accountInitial,accountTone } from '../model/accountIdentity';
export function AccountAvatar({email,size=40,square=false,className}:{email?:string;size?:number;square?:boolean;className?:string}){
  return <Avatar aria-hidden="true" data-tone={accountTone(email)} className={cn('account-avatar',square&&'rounded-md',className)} style={{width:size,height:size}}>
    <AvatarFallback className={cn('account-avatar-fallback',square&&'rounded-md')} style={{fontSize:Math.round(size*0.42)}}>{accountInitial(email)}</AvatarFallback>
  </Avatar>;
}
