import { formatEventDates, formatTimeRange } from './format.js';

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function wrap(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let cursor = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, cursor);
      line = word;
      cursor += lineHeight;
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, cursor);
  return cursor + lineHeight;
}

/** Draw the event pass as a PNG the student can keep on their phone. Needs the QR data URL. */
export async function passToPng({ registration: r, user, qrSrc }) {
  const W = 720;
  const H = 1120;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const font = 'Inter, system-ui, sans-serif';

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(0, 0, W, H);

  // Card
  ctx.save();
  roundRect(ctx, 40, 40, W - 80, H - 80, 24);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Header: one flat accent colour, same as the on-screen pass.
  ctx.fillStyle = '#4f46e5';
  ctx.fillRect(40, 40, W - 80, 320);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 26px ${font}`;
  ctx.fillText('EventFlow', 84, 100);
  ctx.font = `600 18px ${font}`;
  ctx.fillStyle = '#c7d2fe';
  ctx.fillText('Event pass', W - 84 - ctx.measureText('Event pass').width, 100);

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 40px ${font}`;
  const afterTitle = wrap(ctx, r.eventName, 84, 172, W - 168, 48);
  ctx.font = `500 20px ${font}`;
  ctx.fillStyle = '#e0e7ff';
  ctx.fillText(`${formatEventDates({ date: r.eventDate, endDate: r.eventEndDate })}  -  ${formatTimeRange(r.eventStartTime, r.eventEndTime)}`, 84, Math.min(afterTitle + 6, 310));
  ctx.fillText(r.eventVenue, 84, Math.min(afterTitle + 38, 340));

  // Details
  let y = 430;
  const field = (label, value, mono = false) => {
    ctx.fillStyle = '#64748b';
    ctx.font = `500 18px ${font}`;
    ctx.fillText(label, 84, y);
    ctx.fillStyle = '#0f172a';
    ctx.font = mono ? `700 26px "Courier New", monospace` : `600 28px ${font}`;
    ctx.fillText(value, 84, y + 36);
    y += 84;
  };
  field('Participant', user.name);
  field('Participant ID', r.participantCode, true);
  field('Status', r.status.charAt(0).toUpperCase() + r.status.slice(1));

  // QR
  if (qrSrc) {
    const qr = await loadImage(qrSrc);
    const size = 300;
    const x = (W - size) / 2;
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, x - 14, y - 6, size + 28, size + 28, 12);
    ctx.fill();
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.drawImage(qr, x, y + 8, size, size);
  }
  ctx.fillStyle = '#64748b';
  ctx.font = `500 17px ${font}`;
  const note = 'Show this code at the entrance. Do not share it.';
  ctx.fillText(note, (W - ctx.measureText(note).width) / 2, H - 80);
  ctx.restore();

  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export async function downloadPassPng(args) {
  const blob = await passToPng(args);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `event-pass-${args.registration.participantCode}.png`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
