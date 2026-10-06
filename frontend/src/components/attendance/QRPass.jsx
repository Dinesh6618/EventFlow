import QRCode from 'qrcode';
import { forwardRef, useEffect, useState } from 'react';
import { formatEventDates, formatTimeRange } from '../../utils/format.js';
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
    QRCode.toDataURL(`${QR_PREFIX}${token}`, { width, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0f172a', light: '#ffffff' } })
      .then((src) => !cancelled && setState({ src, failed: false }))
      .catch(() => !cancelled && setState({ src: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [token, width]);
  return state;
}

/**
 * The digital event pass: a flat white card with an indigo header strip. The QR holds only a random
 * token, never personal data. `registration` comes from /registrations/mine; `user` supplies the printed
 * name. (The downloadable PNG is drawn separately in utils/passImage.js.)
 */
const QRPass = forwardRef(function QRPass({ registration: r, user, qrSrc, qrFailed }, ref) {
  const hasQr = Boolean(r.qrToken);
  return (
    <div ref={ref} className="surface mx-auto w-full max-w-sm overflow-hidden">
      <div className="flex items-center justify-between bg-indigo-600 px-5 py-3 text-white">
        <span className="text-base font-semibold">EventFlow</span>
        <span className="text-sm text-indigo-100">Event pass</span>
      </div>

      <div className="p-5">
        <h2 className="text-lg font-semibold leading-snug text-slate-900">{r.eventName}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })} - {formatTimeRange(r.eventStartTime, r.eventEndTime)}
        </p>
        <p className="text-sm text-slate-500">{r.eventVenue}</p>

        <div className="mt-5 flex justify-center">
          <div className="flex h-52 w-52 items-center justify-center rounded-lg border border-slate-200 bg-white p-2">
            {!hasQr ? (
              <p className="px-4 text-center text-sm text-slate-500">Your QR code appears here once the organizer approves your registration.</p>
            ) : qrSrc ? (
              <img src={qrSrc} alt="Check-in QR code" className="h-full w-full" />
            ) : qrFailed ? (
              <p className="px-4 text-center text-sm text-red-600">Could not draw the QR code. Show your registration ID instead.</p>
            ) : (
              <Spinner className="h-8 w-8 text-indigo-600" />
            )}
          </div>
        </div>
        <p className="mt-3 text-center text-xs text-slate-500">Show this code at the entrance. It is personal to you, so do not share it.</p>

        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 text-sm">
          <div className="col-span-2">
            <dt className="text-slate-500">Participant</dt>
            <dd className="font-semibold text-slate-900">{user.name}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Registration ID</dt>
            <dd className="font-mono font-medium text-slate-900">{r.participantCode}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Status</dt>
            <dd className="mt-0.5"><RegistrationStatusBadge status={r.status} /></dd>
          </div>
        </dl>
      </div>
    </div>
  );
});

export default QRPass;
