import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-indigo-300',
  secondary: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 disabled:text-slate-400 disabled:hover:bg-white',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent',
  dark: 'bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50',
  light: 'bg-white text-indigo-700 hover:bg-indigo-50 disabled:opacity-60',
  outlineLight: 'border border-white/40 text-white hover:bg-white/10 disabled:opacity-60',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

/** Class string so <Link> and <button> can look identical. */
export const buttonClasses = (variant = 'primary', size = 'md', extra = '') =>
  `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  type = 'button',
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
      {...props}
    >
      {loading && <Spinner className="h-4 w-4" />}
      {children}
    </button>
  );
}
