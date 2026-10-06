const SIZES = { xs: 'h-7 w-7 text-[0.65rem]', sm: 'h-9 w-9 text-xs', md: 'h-11 w-11 text-sm', lg: 'h-16 w-16 text-xl', xl: 'h-24 w-24 text-3xl' };

/** Initials on a soft accent circle. */
export default function ProfileAvatar({ name = '', size = 'md', className = '' }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <span
      role="img"
      aria-label={name ? `${name}'s avatar` : 'Avatar'}
      className={`inline-flex shrink-0 select-none items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 ${SIZES[size]} ${className}`}
    >
      {initials || '?'}
    </span>
  );
}
