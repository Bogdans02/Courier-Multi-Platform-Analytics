import { platforms } from '../utils/platformEntries.js';

export default function PlatformBadge({ platform }) {
  return <span className={`platform-badge platform-${platform}`}>
    {platforms.find(({ value }) => value === platform)?.label ?? platform}
  </span>;
}
