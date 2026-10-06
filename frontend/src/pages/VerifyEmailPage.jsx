import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ApiError, authApi } from '../api';
import AuthShell from '../components/layout/AuthShell.jsx';
import Alert from '../components/ui/Alert.jsx';
import Button, { buttonClasses } from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import { PageLoader } from '../components/ui/Spinner.jsx';
import { useCooldown, useSingleFlight } from '../hooks/useCooldown.js';
import { EMAIL_COOLDOWN_SECONDS } from '../utils/constants.js';
import { formatClock, formatWait } from '../utils/format.js';

const FAILURES = {
  TOKEN_INVALID: 'This verification link is invalid.',
  TOKEN_EXPIRED: 'This verification link has expired.',
  TOKEN_USED: 'This verification link has already been used.',
};

/** Where the "Verify Email" button in the email lands. The link is checked once, here. */
export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [state, setState] = useState({ status: 'loading' }); // loading | ok | failed
  const [notice, setNotice] = useState(null);
  const [sending, setSending] = useState(false);
  // The link works once, and React runs effects twice in development, so only ask the server once.
  const asked = useRef(false);
  const guard = useSingleFlight(); // one click is one request
  const cooldown = useCooldown();

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    if (!token) {
      setState({ status: 'failed', code: 'TOKEN_INVALID' });
      return;
    }
    authApi
      .verifyEmail({ token })
      .then(() => setState({ status: 'ok' }))
      .catch((err) => setState({ status: 'failed', code: err instanceof ApiError ? err.code : null, message: err.message }));
  }, [token]);

  const resend = () =>
    guard(async () => {
      setSending(true);
      setNotice(null);
      try {
        setNotice({ type: 'success', text: (await authApi.resendVerification({ token })).message });
        cooldown.start(EMAIL_COOLDOWN_SECONDS);
      } catch (err) {
        if (err instanceof ApiError && err.status === 429 && err.retryAfter) cooldown.start(err.retryAfter);
        setNotice({ type: 'error', text: err instanceof ApiError ? err.message : "We couldn't send the email right now. Please try again." });
      } finally {
        setSending(false);
      }
    });

  if (state.status === 'loading') return <AuthShell title="Verifying your email" subtitle="One moment..."><PageLoader /></AuthShell>;

  if (state.status === 'ok') {
    return (
      <AuthShell title="Email verified" subtitle="Your account is ready.">
        <div className="space-y-5">
          <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0" />
            <p><span className="font-semibold">Email verified successfully.</span> You can now log in.</p>
          </div>
          <Link to="/login" className={buttonClasses('primary', 'lg', 'w-full')}>Log in</Link>
        </div>
      </AuthShell>
    );
  }

  const expired = state.code === 'TOKEN_EXPIRED';
  const used = state.code === 'TOKEN_USED';
  return (
    <AuthShell title={expired ? 'This link has expired' : used ? 'Link already used' : 'This link is not valid'} subtitle="Verification links work once and last 24 hours.">
      <div className="space-y-5">
        <Alert type="error">{FAILURES[state.code] ?? state.message ?? FAILURES.TOKEN_INVALID}</Alert>
        {notice && <Alert type={notice.type}>{notice.text}</Alert>}
        {used && <p className="text-sm text-slate-600">If you have already verified your email, you can log in. If not, ask for a new link below.</p>}
        {expired && <p className="text-sm text-slate-600">Ask for a new link and we will send it to the email address you registered with.</p>}
        {cooldown.active && <p className="text-sm font-medium text-slate-700" role="status">You can request another email in {formatWait(cooldown.seconds)}.</p>}
        {token && (
          <Button size="lg" className="w-full" loading={sending} disabled={cooldown.active} onClick={resend}>
            {cooldown.active ? `Resend in ${formatClock(cooldown.seconds)}` : 'Resend Verification Email'}
          </Button>
        )}
        <Link to="/login" className={buttonClasses(used ? 'primary' : 'secondary', 'lg', 'w-full')}>Log in</Link>
      </div>
    </AuthShell>
  );
}
