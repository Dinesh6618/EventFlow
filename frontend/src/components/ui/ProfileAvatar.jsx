const PALETTE = [
  'from-violet-500 to-indigo-600',
  'from-blue-500 to-indigo-600',
  'from-fuchsia-500 to-pink-600',
  'from-emerald-500 to-teal-600',
  'from-amber-500 to-orange-600',
  'from-sky-500 to-blue-600',
];

const SIZES = { xs: 'h-7 w-7 text-[0.65rem]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' };

/** Initials on a gradient chosen from the name, so the same person always gets the same colour. */
export default function ProfileAvatar({ name = '', size = 'md', className = '' }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
  const hash = [...name].reduce((sum, ch) => sum + ch.charCodeAt(0), 0);

  return (
    <span
      role="img"
      aria-label={name ? `${name}'s avatar` : 'Avatar'}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-gradient-to-br font-bold text-white ring-2 ring-white ${PALETTE[hash % PALETTE.length]} ${SIZES[size]} ${className}`}
    >
      {initials || '?'}
    </span>
  );
}
