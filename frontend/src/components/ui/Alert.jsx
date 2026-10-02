import Icon from './Icon.jsx';

const STYLES = {
  error: 'border-red-200 bg-red-50 text-red-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  info: 'border-indigo-200 bg-indigo-50 text-indigo-800',
};

export default function Alert({ type = 'error', children, action, className = '' }) {
  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${STYLES[type]} ${className}`}
    >
      <Icon name={type === 'success' ? 'check' : 'alert'} className="mt-0.5 h-5 w-5 shrink-0" />
      <div className="flex-1">{children}</div>
      {action}
    </div>
  );
}
