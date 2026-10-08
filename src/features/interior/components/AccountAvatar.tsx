import { UserRound } from 'lucide-react';
import { Avatar,AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { accountInitial,accountTone } from '../model/accountIdentity';
export function AccountAvatar({email,size=40,className}:{email?:string;size?:number;className?:string}){
  const initial=accountInitial(email),tone=accountTone(email);
  return <Avatar aria-hidden="true" data-tone={email?tone:'guest'} className={cn('account-avatar',className)} style={{width:size,height:size}}>
    <AvatarFallback className="account-avatar-fallback" style={{fontSize:Math.round(size*0.42)}}>{email?initial:<UserRound size={Math.round(size*0.5)}/>}</AvatarFallback>
  </Avatar>;
}
