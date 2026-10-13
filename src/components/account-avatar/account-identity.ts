export const AVATAR_TONES = 6;
export function accountSeed(email = ''): number {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) >>> 0;
  return h;
}
export function accountTone(email?: string): number {
  return accountSeed(email ?? '') % AVATAR_TONES;
}
export function accountInitial(email?: string): string {
  const value = email ?? '';
  const local = value.split('@')[0];
  const match =
    local.match(/[a-z]/i) ?? local.match(/[0-9]/) ?? value.match(/[a-z0-9]/i);
  return match ? match[0].toUpperCase() : '?';
}
/** Accounts have no nickname field; the display name is the email local part. */
export function accountName(email?: string): string {
  return (email ?? '').split('@')[0] || '我的账号';
}
