import QRCode from 'qrcode';
import { forwardRef, useEffect, useState } from 'react';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
import { LogoMark } from '../layout/Logo.jsx';
import { RegistrationStatusBadge } from '../ui/Badge.jsx';
import Spinner from '../ui/Spinner.jsx';
import { QR_PREFIX } from './QrCodeModal.jsx';

/** Draws the QR for a registration token. Returns the data URL (or null while drawing / on failure). */
export function useQrDataUrl(token, width = 360) {
  const [state, setState] = useState({ src: null, failed: false });
  useEffect(() => {
    setState({ src: null, failed: false });
    if (!token) return undefined;
    let cancelled = false;
    QRCode.toDataURL(`${QR_PREFIX}${token}`, { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f1438', light: '#ffffff' } })
      .then((src) => !cancelled && setState({ src, failed: false }))
      .catch(() => !cancelled && setState({ src: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [token, width]);
  return state;
}

/**
 * The digital event pass. The QR holds only a random token, never personal data.
 * `registration` comes from /registrations/mine; `user` supplies the printed name and college.
 */
const QRPass = forwardRef(function QRPass({ registration: r, user, qrSrc, qrFailed }, ref) {
  const hasQr = Boolean(r.qrToken);
  return (
    <div ref={ref} className="mx-auto w-full max-w-sm overflow-hidden rounded-[2rem] bg-white shadow-2xl shadow-indigo-900/20 ring-1 ring-slate-200">
      <div className="bg-midnight relative px-6 pb-9 pt-6 text-white">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest">
            <LogoMark className="h-7 w-7" />
            EventFlow
          </span>
          <span className="rounded-full bg-white/15 px-3 py-1 text-[0.65rem] font-bold uppercase tracking-widest backdrop-blur">Event pass</span>
        </div>
        <h2 className="mt-6 text-2xl font-extrabold leading-tight">{r.eventName}</h2>
        <p className="mt-1.5 text-sm text-indigo-100">
          {formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })} - {formatTimeRange(r.eventStartTime, r.eventEndTime)}
        </p>
        <p className="text-sm text-indigo-100">{r.eventVenue}</p>
      </div>

      {/* Ticket tear line */}
      <div className="relative -mt-4 flex items-center" aria-hidden="true">
        <span className="-ml-4 h-8 w-8 rounded-full bg-slate-100 shadow-inner" />
        <span className="mx-1 flex-1 border-t-2 border-dashed border-slate-200" />
        <span className="-mr-4 h-8 w-8 rounded-full bg-slate-100 shadow-inner" />
      </div>

      <div className="px-6 pb-6 pt-3">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div className="col-span-2">
            <dt className="text-xs text-slate-400">Participant</dt>
            <dd className="text-lg font-bold text-slate-900">{user.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Participant ID</dt>
            <dd className="font-mono font-bold text-slate-900">{r.participantCode}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-400">Status</dt>
            <dd className="mt-0.5"><RegistrationStatusBadge status={r.status} /></dd>
          </div>
          {user.college && (
            <div className="col-span-2">
              <dt className="text-xs text-slate-400">College</dt>
              <dd className="font-medium text-slate-800">{user.college}</dd>
            </div>
          )}
        </dl>

        <div className="mt-5 flex justify-center">
          <div className="flex h-56 w-56 items-center justify-center rounded-2xl border-2 border-indigo-100 bg-white p-2.5 shadow-inner">
            {!hasQr ? (
              <p className="px-4 text-center text-sm text-slate-500">Your QR code appears here once the organizer approves your registration.</p>
            ) : qrSrc ? (
              <img src={qrSrc} alt="Check-in QR code" className="h-full w-full" />
            ) : qrFailed ? (
              <p className="px-4 text-center text-sm text-red-600">Could not draw the QR code. Show your participant ID instead.</p>
            ) : (
              <Spinner className="h-8 w-8 text-indigo-600" />
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-400">Show this code at the entrance. It is personal to you, so do not share it.</p>
      </div>
    </div>
  );
});

export default QRPass;
