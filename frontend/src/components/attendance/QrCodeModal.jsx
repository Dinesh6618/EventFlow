import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Spinner from '../ui/Spinner.jsx';

// Must match QR_PREFIX in the backend. The code holds only a random token, no personal data.
export const QR_PREFIX = 'EF1:';

/** Shows a participant's check-in QR code. `registration` needs qrToken, participantCode, eventName. */
export default function QrCodeModal({ registration, onClose }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const token = registration?.qrToken;

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!token) return undefined;
    let cancelled = false;
    QRCode.toDataURL(`${QR_PREFIX}${token}`, { width: 320, margin: 2, errorCorrectionLevel: 'M' })
      .then((url) => !cancelled && setSrc(url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <Modal
      open={Boolean(registration)}
      onClose={onClose}
      title="Your check-in QR code"
      footer={<Button variant="secondary" onClick={onClose}>Close</Button>}
    >
      <div className="flex flex-col items-center text-center">
        <p className="font-medium text-slate-900">{registration?.eventName}</p>
        <div className="mt-4 flex h-64 w-64 items-center justify-center rounded-xl border border-slate-200 bg-white p-2">
          {src ? (
            <img src={src} alt="QR code for event check-in" className="h-full w-full" />
          ) : failed ? (
            <p className="px-4 text-sm text-red-600">Could not draw the QR code. Show your participant ID instead.</p>
          ) : (
            <Spinner className="h-8 w-8 text-indigo-600" />
          )}
        </div>
        <p className="mt-4 text-xs text-slate-500">Participant ID</p>
        <p className="font-mono text-sm font-semibold text-slate-900">{registration?.participantCode}</p>
        <p className="mt-3 max-w-xs text-xs text-slate-500">
          Show this code to a volunteer at the entrance. It is personal to you, so do not share a screenshot of it.
        </p>
      </div>
    </Modal>
  );
}
