import { useState } from 'react';
import { assetUrl } from '../../api';
import { TYPE_ICONS } from '../../utils/constants.js';
import Icon from '../ui/Icon.jsx';

/**
 * Uploaded banner, or a flat placeholder (one soft tint plus the event-type icon) when there is none
 * or it fails to load. `children` is laid over the banner (badges, buttons).
 */
export default function EventBanner({ event, className = 'h-40', iconRight = false, children }) {
  const [failed, setFailed] = useState(false);
  const src = assetUrl(event.image);
  const showImage = src && !failed;

  return (
    <div className={`relative w-full overflow-hidden ${className}`}>
      {showImage ? (
        <img src={src} alt={`${event.name} banner`} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-indigo-50" role="img" aria-label={`${event.type} event`}>
          <Icon
            name={TYPE_ICONS[event.type] || 'calendar'}
            className={iconRight ? 'absolute right-[10%] top-[22%] h-20 w-20 text-indigo-200' : 'h-1/3 max-h-14 min-h-8 w-auto text-indigo-300'}
          />
        </div>
      )}
      {children}
    </div>
  );
}
