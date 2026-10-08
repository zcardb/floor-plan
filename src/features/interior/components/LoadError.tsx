import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** 数据读取失败：说明原因并提供重试，避免把失败显示成“空”。 */
export function LoadError({ title, message, retrying = false, onRetry }: {
  title: string; message?: string; retrying?: boolean; onRetry: () => void;
}) {
  return <div className="cost-save-error" role="alert">
    <span><b>{title}</b>{message ? ' · ' + message : ''}</span>
    <Button type="button" variant="outline" loading={retrying} onClick={onRetry}>{!retrying && <RefreshCw />}重试</Button>
  </div>;
}
