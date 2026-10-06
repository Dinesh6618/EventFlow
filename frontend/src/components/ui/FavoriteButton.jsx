import { useState } from 'react';
import { eventsApi } from '../../api';
import { useToast } from '../../context/ToastContext.jsx';
import Icon from './Icon.jsx';

/** Heart toggle that saves an event. Optimistic: flips at once and flips back if the server refuses. */
export default function FavoriteButton({ eventId, initial = false, onChange, className = '' }) {
  const toast = useToast();
  const [on, setOn] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle(event) {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await eventsApi.favorite(eventId, next);
      onChange?.(next);
    } catch (err) {
      setOn(!next);
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={on}
      aria-label={on ? 'Remove from saved events' : 'Save this event'}
      className={`flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur transition-transform hover:scale-110 active:scale-95 ${on ? 'text-pink-500' : 'text-slate-500 hover:text-pink-500'} ${className}`}
    >
      <Icon name="heart" className={`h-[1.15rem] w-[1.15rem] ${on ? 'fill-current' : ''}`} />
    </button>
  );
}
