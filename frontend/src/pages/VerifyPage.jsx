import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { certificatesApi } from '../api';
import Logo from '../components/layout/Logo.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Spinner from '../components/ui/Spinner.jsx';

const STYLE = {
  VALID: { ring: 'border-emerald-200 bg-emerald-50', badge: 'bg-emerald-600 text-white', title: 'text-emerald-900', icon: 'check' },
  REVOKED: { ring: 'border-red-200 bg-red-50', badge: 'bg-red-600 text-white', title: 'text-red-900', icon: 'alert' },
  NOT_FOUND: { ring: 'border-slate-200 bg-white', badge: 'bg-slate-600 text-white', title: 'text-slate-900', icon: 'alert' },
};
const date = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function Row({ label, children }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2.5 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 break-words font-medium text-slate-900">{children}</dd>
    </div>
  );
}

/** Public page: no sign-in needed. Shows only what proves a certificate is genuine. */
export default function VerifyPage() {
  const { code: urlCode } = useParams();
  const navigate = useNavigate();
  const [input, setInput] = useState(urlCode ?? '');
  const [result, setResult] = useState(null);
  const [state, setState] = useState(urlCode ? 'loading' : 'idle'); // idle | loading | done | error

  useEffect(() => {
    if (!urlCode) {
      setState('idle');
      setResult(null);
      return undefined;
    }
    setInput(urlCode);
    setState('loading');
    const controller = new AbortController();
    certificatesApi
      .verify(urlCode, controller.signal)
      .then((r) => {
        setResult(r);
        setState('done');
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (err.status === 404) {
          setResult({ status: 'NOT_FOUND', valid: false });
          setState('done');
        } else {
          setResult({ message: err.message });
          setState('error');
        }
      });
    return () => controller.abort();
  }, [urlCode]);

  const submit = (e) => {
    e.preventDefault();
    if (input.trim()) navigate(`/verify/${encodeURIComponent(input.trim().toUpperCase())}`);
  };

  const style = result && STYLE[result.status];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3 sm:px-6">
          <Link to="/" aria-label="EventFlow home"><Logo /></Link>
          <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">Sign in</Link>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Verify a certificate</h1>
        <p className="mt-1 text-sm text-slate-500">Enter the certificate ID printed on it, or scan its QR code.</p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 sm:flex-row" role="search">
          <label htmlFor="cert-code" className="sr-only">Certificate ID</label>
          <input id="cert-code" value={input} onChange={(e) => setInput(e.target.value)} placeholder="EVF-2026-001245" autoComplete="off" spellCheck={false}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 font-mono text-sm uppercase shadow-sm placeholder:normal-case focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30" />
          <Button type="submit" disabled={!input.trim()}>Verify</Button>
        </form>

        <div aria-live="polite" className="mt-8">
          {state === 'loading' && <div className="flex items-center gap-3 text-slate-500"><Spinner className="h-5 w-5 text-indigo-600" />Checking...</div>}
          {state === 'error' && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{result.message}</p>}
          {state === 'done' && (
            <section className={`rounded-xl border p-6 ${style.ring}`} aria-label="Verification result">
              <div className="flex items-center gap-3">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-bold tracking-wide ${style.badge}`}>
                  <Icon name={style.icon} className="h-4 w-4" />
                  {result.status === 'NOT_FOUND' ? 'NOT FOUND' : result.status}
                </span>
              </div>
              {result.status === 'NOT_FOUND' ? (
                <p className="mt-4 text-sm text-slate-700">No certificate matches that ID. Check for typos; the format is EVF-YYYY-NNNNNN.</p>
              ) : (
                <>
                  <p className={`mt-4 text-sm ${style.title}`}>
                    {result.valid ? 'This certificate is genuine.' : 'This certificate was revoked by the organizer and is no longer valid.'}
                  </p>
                  <dl className="mt-4 divide-y divide-black/5">
                    <Row label="Certificate ID"><span className="font-mono">{result.certificate.code}</span></Row>
                    <Row label="Status">{result.status}</Row>
                    <Row label="Participant">{result.certificate.participantName}</Row>
                    <Row label="Event">{result.certificate.eventName}</Row>
                    <Row label="Certificate type">{result.certificate.typeLabel}</Row>
                    <Row label="Issued">{date(result.certificate.issuedAt)}</Row>
                    <Row label="Issued by">{result.certificate.organizer}</Row>
                  </dl>
                </>
              )}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
