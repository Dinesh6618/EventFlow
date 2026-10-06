import { Link } from 'react-router-dom';
import { buttonClasses } from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

/**
 * The way into the Help Center. "Get help" with no event goes to the picker; with an event it opens that
 * event's help screen directly. `inline` is a compact button for cards and headers.
 */
export default function GetHelpButton({ eventId, label, inline = false, className = '' }) {
  const to = eventId ? `/events/${eventId}/help` : '/help';
  if (inline) {
    return (
      <Link to={to} className={buttonClasses('secondary', 'md', className)}>
        <Icon name="shield" className="h-4 w-4 text-indigo-600" />
        {label ?? 'Need Help?'}
      </Link>
    );
  }
  return (
    <Link to={to} className={buttonClasses('primary', 'lg', className)}>
      <Icon name="shield" className="h-5 w-5" />
      {label ?? 'Get help'}
    </Link>
  );
}
