import { useState } from 'react';
import { assetUrl } from '../../api';
import { TYPE_GRADIENTS } from '../../utils/constants.js';
import Icon from '../ui/Icon.jsx';

/** Uploaded banner, or a colored placeholder when there is none (or it fails to load). */
export default function EventBanner({ event, className = 'h-40' }) {
  const [failed, setFailed] = useState(false);
  const src = assetUrl(event.image);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt={`${event.name} banner`}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`w-full object-cover ${className}`}
      />
    );
  }

  return (
    <div
      className={`flex w-full items-center justify-center bg-gradient-to-br text-white/80 ${
        TYPE_GRADIENTS[event.type] || 'from-slate-500 to-slate-700'
      } ${className}`}
      role="img"
      aria-label={`${event.type} event`}
    >
      <Icon name="calendar" className="h-10 w-10" />
    </div>
  );
}
