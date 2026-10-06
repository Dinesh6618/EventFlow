import jsQR from 'jsqr';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, attendanceApi } from '../../api';
import Alert from '../ui/Alert.jsx';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';
import { QR_PREFIX } from './QrCodeModal.jsx';

const ACTIONS = [
  ['check_in', 'Check in'],
  ['check_out', 'Check out'],
];
const SAME_CODE_COOLDOWN_MS = 4000;
const clock = (iso) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

/**
 * Camera QR scanner with a manual-entry fallback.
 * Every scan is validated by the server; this component only reads codes and reports the outcome.
 */
export default function Scanner({ eventId, sessions = [], onRecorded }) {
  const [action, setAction] = useState('check_in');
  const [camera, setCamera] = useState({ state: 'idle', message: '' }); // idle | starting | on | error
  const [outcome, setOutcome] = useState(null); // { ok, text, detail }
  const [history, setHistory] = useState([]);
  const [manual, setManual] = useState('');
  const [busy, setBusy] = useState(false);

  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const frameRef = useRef(0);
  const actionRef = useRef(action);
  const [sessionId, setSessionId] = useState('');
  const sessionRef = useRef('');
  sessionRef.current = sessionId;
  const busyRef = useRef(false);
  const lastRef = useRef({ code: '', at: 0 });
  actionRef.current = action;

  const submit = useCallback(
    async (code) => {
      if (busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      const sessionOnly = Boolean(sessionRef.current);
      const verb = sessionOnly ? 'Checked in to session' : actionRef.current === 'check_in' ? 'Checked in' : 'Checked out';
      try {
        const result = await attendanceApi.scan(eventId, code, sessionOnly ? 'check_in' : actionRef.current, sessionRef.current || undefined);
        const { participant } = result;
        setOutcome({
          ok: true,
          text: 'Attendance marked successfully.',
          who: `${verb}: ${participant.name}`,
          detail: [result.session, participant.participantCode, participant.department].filter(Boolean).join(' - '),
        });
        setHistory((h) => [{ ok: true, text: `${verb} ${participant.name}`, at: result.at }, ...h].slice(0, 8));
        onRecorded?.();
      } catch (err) {
        const text = err instanceof ApiError ? err.message : 'Could not reach the server';
        setOutcome({ ok: false, text });
        setHistory((h) => [{ ok: false, text, at: new Date().toISOString() }, ...h].slice(0, 8));
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [eventId, onRecorded],
  );

  const stopCamera = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCamera({ state: 'idle', message: '' });
  }, []);

  const startCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCamera({ state: 'error', message: 'Camera access needs HTTPS (or localhost). Use manual entry below.' });
      return;
    }
    setCamera({ state: 'starting', message: '' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      streamRef.current = stream;
      const video = videoRef.current;
      video.srcObject = stream;
      await video.play();
      setCamera({ state: 'on', message: '' });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let last = 0;
      const tick = (time) => {
        frameRef.current = requestAnimationFrame(tick);
        if (time - last < 120 || busyRef.current || video.readyState < 2 || !video.videoWidth) return; // ~8 fps
        last = time;
        const scale = Math.min(1, 640 / video.videoWidth);
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const found = jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
        if (!found?.data) return;

        const now = Date.now();
        if (found.data === lastRef.current.code && now - lastRef.current.at < SAME_CODE_COOLDOWN_MS) return;
        lastRef.current = { code: found.data, at: now };
        if (!found.data.startsWith(QR_PREFIX)) {
          setOutcome({ ok: false, text: 'This is not an EventFlow QR code' });
          return;
        }
        submit(found.data);
      };
      frameRef.current = requestAnimationFrame(tick);
    } catch (err) {
      const denied = err.name === 'NotAllowedError' || err.name === 'SecurityError';
      setCamera({
        state: 'error',
        message: denied ? 'Camera permission was denied. Allow it in the browser, or use manual entry.' : 'No usable camera was found. Use manual entry below.',
      });
    }
  }, [submit]);

  useEffect(() => stopCamera, [stopCamera]);

  const submitManual = (e) => {
    e.preventDefault();
    if (!manual.trim()) return;
    submit(manual.trim());
    setManual('');
  };

  return (
    <div className="space-y-5">
      <div role="group" aria-label="Scan mode" className="inline-flex rounded-lg border border-slate-200 bg-white p-1">
        {ACTIONS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={action === value}
            onClick={() => setAction(value)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${action === value ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {sessions.length > 0 && (
        <div className="max-w-sm">
          <label htmlFor="scan-session" className="mb-1.5 block text-sm font-medium text-slate-700">Scanning for</label>
          <select
            id="scan-session"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="">Event entrance (check in / out)</option>
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>{s.title} ({s.startTime}-{s.endTime})</option>
            ))}
          </select>
          {sessionId && <p className="mt-1.5 text-xs text-slate-500">Session scans record entry to this session and also check the person in to the event.</p>}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
        <div className="relative aspect-4/3 w-full max-w-xl sm:aspect-video">
          {/* Always rendered (never display:none) so the browser keeps decoding frames. */}
          <video ref={videoRef} muted playsInline className="h-full w-full object-cover" />
          {camera.state === 'on' && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="h-2/3 w-2/3 max-w-xs rounded-lg border-2 border-indigo-400" />
            </div>
          )}
          {camera.state !== 'on' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
              <Icon name="qr" className="h-10 w-10 text-slate-400" />
              <p className="max-w-xs text-sm text-slate-500">{camera.message || "Press Scan QR, then point the camera at a participant's QR code."}</p>
              <Button size="lg" onClick={startCamera} loading={camera.state === 'starting'}>
                <Icon name="qr" className="h-5 w-5" />
                Scan QR
              </Button>
            </div>
          )}
        </div>
      </div>

      {camera.state === 'on' && (
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={stopCamera}>Stop scanning</Button>
        </div>
      )}

      <div aria-live="polite">
        {outcome && (
          <Alert type={outcome.ok ? 'success' : 'error'}>
            <p className="font-medium">{outcome.text}</p>
            {outcome.who && <p className="mt-0.5">{outcome.who}</p>}
            {outcome.detail && <p className="mt-0.5 text-xs opacity-80">{outcome.detail}</p>}
          </Alert>
        )}
      </div>

      <form onSubmit={submitManual} className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="manual-code" className="sr-only">QR code value</label>
        <input
          id="manual-code"
          value={manual}
          onChange={(e) => setManual(e.target.value)}
          placeholder="Paste or type a code if the camera is unavailable"
          autoComplete="off"
          className="block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
        />
        <Button type="submit" variant="secondary" loading={busy} disabled={!manual.trim()}>
          {action === 'check_in' ? 'Check in' : 'Check out'}
        </Button>
      </form>

      {history.length > 0 && (
        <section aria-label="This session">
          <h3 className="mb-2 text-sm font-medium text-slate-500">This session</h3>
          <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {history.map((item, i) => (
              <li key={`${item.at}-${i}`} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className={item.ok ? 'text-slate-700' : 'text-red-600'}>{item.text}</span>
                <span className="shrink-0 text-xs text-slate-400">{clock(item.at)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
