import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, authApi } from '../../api';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import { Input } from '../ui/FormField.jsx';
import Icon from '../ui/Icon.jsx';
import { useCooldown, useSingleFlight } from '../../hooks/useCooldown.js';
import { EMAIL_COOLDOWN_SECONDS } from '../../utils/constants.js';
import { formatClock, formatWait } from '../../utils/format.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * "Check your email" for someone whose address is not verified yet. Used right after sign-up (the full
 * panel) and under the login form when an unverified account tries to log in (`compact`: a warning and the
 * resend button). It can send the link again or fix a mistyped address, and it never shows the link
 * itself: that only ever goes to the inbox.
 */
export default function VerificationPending({ email: initialEmail, password: initialPassword = '', emailSent, title, intro, compact = false }) {
  const [email, setEmail] = useState(initialEmail);
  const [notice, setNotice] = useState(emailSent === false ? { type: 'error', text: "We couldn't send the email right now. Please try again." } : null);
  const [busy, setBusy] = useState(null);
  const [changing, setChanging] = useState(false);
  const [form, setForm] = useState({ newEmail: '', password: initialPassword });
  const [errors, setErrors] = useState({});
  const guard = useSingleFlight(); // one click is one request, however fast the clicks come
  const cooldown = useCooldown();
  const box = useRef(null);

  // The email that was just sent counts: the next one can be asked for after the cooldown.
  useEffect(() => {
    if (emailSent) cooldown.start(EMAIL_COOLDOWN_SECONDS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Under the login form the notice appears below the fold on a small screen: bring it into view.
  useEffect(() => {
    if (compact) box.current?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
  }, [compact]);

  const fail = (err) => {
    // The server says how long to wait; the button counts it down so nobody has to guess.
    if (err instanceof ApiError && err.status === 429 && err.retryAfter) cooldown.start(err.retryAfter);
    setNotice({ type: 'error', text: err instanceof ApiError ? err.message : "We couldn't send the email right now. Please try again." });
  };

  const resend = () =>
    guard(async () => {
      setBusy('resend');
      setNotice(null);
      try {
        setNotice({ type: 'success', text: (await authApi.resendVerification({ email })).message });
        cooldown.start(EMAIL_COOLDOWN_SECONDS);
      } catch (err) {
        fail(err);
      } finally {
        setBusy(null);
      }
    });

  const change = (e) => {
    e.preventDefault();
    return guard(async () => {
      const found = {};
      if (!EMAIL_RE.test(form.newEmail.trim())) found.newEmail = 'Enter a valid email address';
      if (!form.password) found.password = 'Enter your password to confirm it is you';
      setErrors(found);
      if (Object.keys(found).length) return;
      setBusy('change');
      setNotice(null);
      try {
        const result = await authApi.changeEmail({ email, password: form.password, newEmail: form.newEmail.trim() });
        setEmail(form.newEmail.trim());
        setChanging(false);
        setNotice({ type: 'success', text: result.message });
        cooldown.start(EMAIL_COOLDOWN_SECONDS);
      } catch (err) {
        if (err instanceof ApiError && err.errors) setErrors(err.errors);
        fail(err);
      } finally {
        setBusy(null);
      }
    });
  };

  const changeForm = changing && (
    <form onSubmit={change} noValidate className="page-enter space-y-4 rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-sm text-slate-600">Typed the wrong address? Enter the right one and we will send the link there instead.</p>
      <Input label="New email address" type="email" autoComplete="email" value={form.newEmail} onChange={(e) => { setForm((f) => ({ ...f, newEmail: e.target.value })); setErrors((p) => ({ ...p, newEmail: undefined })); }} error={errors.newEmail} placeholder="you@college.edu" />
      <Input label="Your password" type="password" autoComplete="current-password" value={form.password} onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setErrors((p) => ({ ...p, password: undefined })); }} error={errors.password} hint="We ask so nobody else can change your address." />
      <Button type="submit" loading={busy === 'change'} disabled={busy !== null || cooldown.active}>{cooldown.active ? `Wait ${formatClock(cooldown.seconds)}` : 'Send link to this address'}</Button>
    </form>
  );

  const resendLabel = cooldown.active ? `Resend in ${formatClock(cooldown.seconds)}` : 'Resend Verification Email';

  if (compact) {
    return (
      <div ref={box} className="page-enter mt-5 space-y-3">
        <Alert type="warning">{title}</Alert>
        <p className="text-sm text-slate-600">We will send the link to <strong className="break-all">{email}</strong>.</p>
        {notice && <Alert type={notice.type}>{notice.text}</Alert>}
        {cooldown.active && <p className="text-sm font-medium text-slate-700" role="status">You can request another email in {formatWait(cooldown.seconds)}.</p>}
        <Button size="lg" className="w-full" loading={busy === 'resend'} disabled={busy !== null || cooldown.active} onClick={resend}>{resendLabel}</Button>
        <button type="button" className="text-sm font-medium text-indigo-600 hover:text-indigo-700" aria-expanded={changing} onClick={() => setChanging((v) => !v)}>Wrong email address? Change it</button>
        {changeForm}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3 rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-950">
        <Icon name="mail" className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <div>
          {title && <p className="font-semibold">{title}</p>}
          <p className={title ? 'mt-0.5' : ''}>{intro ?? <>We sent a verification link to <strong className="break-all">{email}</strong>. Open it to activate your account. The link works for 24 hours.</>}</p>
        </div>
      </div>

      <p className="text-sm text-slate-600">Nothing arrived? Check your spam folder. You can ask for a new link up to three times an hour, and the newest link is the only one that works.</p>

      {notice && <Alert type={notice.type}>{notice.text}</Alert>}
      {cooldown.active && <p className="text-sm font-medium text-slate-700" role="status">You can request another email in {formatWait(cooldown.seconds)}.</p>}

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button size="lg" className="flex-1" loading={busy === 'resend'} disabled={busy !== null || cooldown.active} onClick={resend}>
          {resendLabel}
        </Button>
        <Button size="lg" variant="secondary" className="flex-1" onClick={() => setChanging((v) => !v)} aria-expanded={changing}>Change Email</Button>
      </div>

      {changeForm}

      <p className="text-center text-sm text-slate-600">
        Already verified?{' '}
        <Link to="/login" className="font-semibold text-indigo-600 hover:text-indigo-700">Log in</Link>
      </p>
    </div>
  );
}
