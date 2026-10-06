import Spinner from './Spinner.jsx';

const VARIANTS = {
  primary: 'grad-brand text-white shadow-sm shadow-indigo-600/30 hover:brightness-110 hover:shadow-md hover:shadow-indigo-600/30 active:brightness-95 disabled:opacity-50 disabled:shadow-none',
  secondary: 'border border-slate-200 bg-white text-slate-700 shadow-sm hover:border-indigo-200 hover:bg-indigo-50/60 hover:text-indigo-700 disabled:text-slate-400 disabled:hover:bg-white disabled:hover:border-slate-200',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:bg-red-300',
  ghost: 'text-slate-600 hover:bg-slate-100 disabled:text-slate-300 disabled:hover:bg-transparent',
  dark: 'bg-slate-900 text-white shadow-sm hover:bg-slate-800 disabled:opacity-50',
  light: 'bg-white text-indigo-700 shadow-sm hover:bg-indigo-50 disabled:opacity-60',
  outlineLight: 'border border-white/30 bg-white/10 text-white backdrop-blur hover:bg-white/20 disabled:opacity-60',
};

const SIZES = {
  sm: 'px-3.5 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3.5 text-base',
};

/** Class string so <Link> and <button> can look identical. */
export const buttonClasses = (variant = 'primary', size = 'md', extra = '') =>
  `inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:active:scale-100 ${VARIANTS[variant]} ${SIZES[size]} ${extra}`;

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
