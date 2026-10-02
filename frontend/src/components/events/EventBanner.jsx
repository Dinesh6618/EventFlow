import { useState } from 'react';
import { assetUrl } from '../../api';
import { TYPE_GRADIENTS, TYPE_ICONS } from '../../utils/constants.js';
import Icon from '../ui/Icon.jsx';

/**
 * Uploaded banner, or a generated one (type colour, soft shapes and icon) when there is none or it
 * fails to load. `children` is laid over the banner (badges, buttons).
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
        <div
          className={`relative flex h-full w-full items-center justify-center bg-gradient-to-br ${TYPE_GRADIENTS[event.type] || 'from-slate-500 to-slate-700'}`}
          role="img"
          aria-label={`${event.type} event`}
        >
          <span className="absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15" aria-hidden="true" />
          <span className="absolute -bottom-16 left-6 h-44 w-44 rounded-full bg-black/10" aria-hidden="true" />
          <span className="absolute bottom-4 right-[22%] h-10 w-10 rotate-12 rounded-xl bg-white/15" aria-hidden="true" />
          <Icon
            name={TYPE_ICONS[event.type] || 'calendar'}
            className={iconRight ? 'absolute right-[10%] top-[22%] h-24 w-24 text-white/25' : 'relative h-1/3 max-h-16 min-h-8 w-auto text-white/90 drop-shadow'}
          />
        </div>
      )}
      {children}
    </div>
  );
}
