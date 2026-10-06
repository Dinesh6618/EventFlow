import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { homePathFor } from '../../utils/constants.js';
import { buttonClasses } from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import Logo from './Logo.jsx';

const LINKS = [
  { href: '/#home', label: 'Home' },
  { to: '/events', label: 'Events' },
  { to: '/register?role=participant&next=/volunteer', label: 'Volunteer' },
  { href: '/#features', label: 'Features' },
  { href: '/#about', label: 'About' },
  { href: '/#contact', label: 'Contact' },
];

/** Top navigation of the public site. On phones the links fold into a menu. */
export default function PublicNavbar({ dark = false }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const link = `text-sm font-semibold transition-colors ${dark ? 'text-slate-200 hover:text-white' : 'text-slate-600 hover:text-indigo-700'}`;

  const items = LINKS.map((item) =>
    item.to ? (
      <Link key={item.label} to={item.to} className={link} onClick={() => setOpen(false)}>{item.label}</Link>
    ) : (
      <a key={item.label} href={item.href} className={link} onClick={() => setOpen(false)}>{item.label}</a>
    ),
  );

  return (
    <header className={`sticky top-0 z-40 border-b backdrop-blur-xl ${dark ? 'border-white/10 bg-slate-950/60' : 'border-slate-200/70 bg-white/80'}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
        <Link to="/" aria-label="EventFlow home"><Logo light={dark} /></Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">{items}</nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <Link to={homePathFor(user.role)} className={buttonClasses('primary', 'md')}>Go to dashboard</Link>
          ) : (
            <>
              <Link to="/login" className={`px-2 text-sm font-semibold ${dark ? 'text-white hover:text-indigo-200' : 'text-slate-700 hover:text-indigo-700'}`}>Login</Link>
              <Link to="/choose-role" className={buttonClasses('primary', 'md')}>Get Started</Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          className={`rounded-lg p-2 md:hidden ${dark ? 'text-white hover:bg-white/10' : 'text-slate-700 hover:bg-slate-100'}`}
        >
          <Icon name={open ? 'x' : 'menu'} className="h-6 w-6" />
        </button>
      </div>

      {open && (
        <div className={`anim-pop border-t px-4 pb-5 pt-3 md:hidden ${dark ? 'border-white/10 bg-slate-950/95' : 'border-slate-200 bg-white'}`}>
          <nav aria-label="Mobile" className="flex flex-col gap-4 py-2">{items}</nav>
          <div className="mt-3 flex gap-3">
            {user ? (
              <Link to={homePathFor(user.role)} className={buttonClasses('primary', 'md', 'w-full')}>Go to dashboard</Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses(dark ? 'outlineLight' : 'secondary', 'md', 'flex-1')}>Login</Link>
                <Link to="/choose-role" className={buttonClasses('primary', 'md', 'flex-1')}>Get Started</Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
