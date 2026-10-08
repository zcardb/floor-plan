import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { SOFTWARE_TARGETS } from '../model/softwareTargets';

/**
 * Third-party software entries that are not available yet. They stay hoverable (no `disabled`,
 * which would remove pointer events) and reveal a "Coming soon" badge on hover / focus.
 */
export function SoftwareSoonItems() {
  return <>
    {SOFTWARE_TARGETS.map(target => (
      <DropdownMenuItem key={target.id} aria-disabled="true" className="soon-item" onSelect={event => event.preventDefault()}>
        <span>{target.name}</span>
        <span className="soon-badge">Coming soon</span>
      </DropdownMenuItem>
    ))}
  </>;
}
