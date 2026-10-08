import {it,expect} from 'vitest';
import {AVATAR_TONES,accountSeed,accountTone,accountInitial} from './accountIdentity';
it('同一邮箱恒定同色，取值落在色板范围内',()=>{expect(accountTone('18793850224@163.com')).toBe(accountTone('18793850224@163.com'));expect(accountSeed('a@b.com')).toBe(accountSeed('a@b.com'));for(const email of ['18793850224@163.com','alice@x.com','zoe@y.cn','',undefined as never,]){const tone=accountTone(email);expect(tone).toBeGreaterThanOrEqual(0);expect(tone).toBeLessThan(AVATAR_TONES);}});
it('不同邮箱多数落在不同色位',()=>{const tones=new Set(['a@x.com','b@x.com','c@x.com','d@x.com','e@x.com'].map(accountTone));expect(tones.size).toBeGreaterThan(1);});
it('首字母优先字母，其次数字，最后回退问号',()=>{expect(accountInitial('alice@x.com')).toBe('A');expect(accountInitial('18793850224@163.com')).toBe('1');expect(accountInitial('')).toBe('?');expect(accountInitial(undefined)).toBe('?');});
