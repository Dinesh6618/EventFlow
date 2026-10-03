import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { TYPE_LABELS } from '../models/certificateModel.js';

const SLATE = '#0f172a';
const MUTED = '#64748b';

// Each certificate type has its own colours: main (frame, accents), light (inner frame, patterns), tint (page).
const THEMES = {
  participant: { main: '#4338ca', light: '#a5b4fc', tint: '#eef2ff' },
  winner: { main: '#a16207', light: '#facc15', tint: '#fffbeb' },
  runner_up: { main: '#475569', light: '#cbd5e1', tint: '#f1f5f9' },
  finalist: { main: '#0f766e', light: '#5eead4', tint: '#f0fdfa' },
  volunteer: { main: '#047857', light: '#6ee7b7', tint: '#ecfdf5' },
  organizer: { main: '#6d28d9', light: '#c4b5fd', tint: '#f5f3ff' },
  speaker: { main: '#be185d', light: '#f9a8d4', tint: '#fdf2f8' },
  judge: { main: '#1e3a8a', light: '#93c5fd', tint: '#eff6ff' },
};

const HEADLINES = {
  participant: ['Certificate of Participation', 'has successfully participated in'],
  winner: ['Certificate of Achievement', 'has won first place at'],
  runner_up: ['Certificate of Achievement', 'was the runner-up at'],
  finalist: ['Certificate of Merit', 'was a finalist at'],
  volunteer: ['Certificate of Appreciation', 'volunteered with dedication at'],
  organizer: ['Certificate of Appreciation', 'organized'],
  speaker: ['Certificate of Appreciation', 'spoke at'],
  judge: ['Certificate of Appreciation', 'served as a judge at'],
};

// What the centre seal shows. Anything not listed gets a star.
const SEAL_TEXT = { winner: '1st', runner_up: '2nd' };

const fmt = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
// "Friday, 14 November 2026": the day of the week matters on a certificate.
const fmtDay = (iso) => {
  const day = new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' });
  return `${day}, ${fmt(iso)}`;
};
const heldLine = (c) => (c.eventEndDate !== c.eventDate ? `Held from ${fmtDay(c.eventDate)} to ${fmtDay(c.eventEndDate)}` : `Held on ${fmtDay(c.eventDate)}`);

/** Public URL a verifier lands on when they scan the QR code. */
export const verificationUrl = (code) => `${config.publicAppUrl}/verify/${code}`;

/* ------------------------------------------------------- unique pattern */

/** Small deterministic random generator, seeded from the certificate ID. */
function seeded(text) {
  let h = 2166136261;
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
}

/** Overlapping rosette curves. The petal counts and phases come from the seed, so every ID draws differently. */
function rosette(doc, cx, cy, radius, rnd, color, { layers = 4, width = 0.45, opacity = 1 } = {}) {
  doc.save();
  doc.opacity(opacity);
  for (let layer = 0; layer < layers; layer += 1) {
    const petals = 4 + Math.floor(rnd() * 9);
    const phase = rnd() * Math.PI * 2;
    const wave = 0.1 + rnd() * 0.18;
    const r = radius * (1 - layer * 0.14);
    for (let i = 0; i <= 360; i += 1) {
      const angle = (i / 360) * Math.PI * 2;
      const rad = r * (1 - wave + wave * Math.cos(petals * angle + phase));
      const x = cx + rad * Math.cos(angle);
      const y = cy + rad * Math.sin(angle);
      if (i === 0) doc.moveTo(x, y);
      else doc.lineTo(x, y);
    }
    doc.closePath().lineWidth(width).stroke(color);
  }
  doc.restore();
}

function star(doc, cx, cy, outer, color) {
  const inner = outer * 0.42;
  for (let i = 0; i < 10; i += 1) {
    const rad = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    const x = cx + rad * Math.cos(angle);
    const y = cy + rad * Math.sin(angle);
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  }
  doc.closePath().fill(color);
}

/** Round seal with a ring, a scalloped edge and the type's mark in the middle. */
function seal(doc, cx, cy, theme, type) {
  doc.circle(cx, cy, 33).fill(theme.main);
  for (let i = 0; i < 24; i += 1) {
    const angle = (i / 24) * Math.PI * 2;
    doc.circle(cx + 33 * Math.cos(angle), cy + 33 * Math.sin(angle), 3.4).fill(theme.main);
  }
  doc.circle(cx, cy, 26).lineWidth(1.2).stroke(theme.light);
  doc.circle(cx, cy, 22.5).lineWidth(0.5).stroke('#ffffff');
  if (SEAL_TEXT[type]) doc.fillColor('#ffffff').font('Times-Bold').fontSize(19).text(SEAL_TEXT[type], cx - 25, cy - 10, { width: 50, align: 'center', lineBreak: false });
  else star(doc, cx, cy, 15, '#ffffff');
}

/**
 * Render one certificate to a PDF Buffer. `c` has the rows from certificateModel.findForPdf; a preview
 * passes `sample: true`, which marks it SAMPLE and leaves out the verification QR code.
 */
export async function renderCertificate(c) {
  const theme = THEMES[c.type] ?? THEMES.participant;
  const rnd = seeded(c.code);
  const qr = c.sample ? null : await QRCode.toBuffer(verificationUrl(c.code), { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `${TYPE_LABELS[c.type]} certificate - ${c.recipientName}`, Author: 'EventFlow' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const H = doc.page.height;
  const [headline, verb] = HEADLINES[c.type];

  // Page, then a white panel inside the frame.
  doc.rect(0, 0, W, H).fill(theme.tint);
  doc.rect(26, 26, W - 52, H - 52).fill('#ffffff');

  // Watermark rosette behind the text, and a smaller one in each corner. All unique to this ID.
  rosette(doc, W / 2, H / 2 + 6, 245, rnd, theme.light, { layers: 5, width: 0.5, opacity: 0.35 });
  [[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]].forEach(([x, y]) => rosette(doc, x, y, 30, rnd, theme.main, { layers: 3, width: 0.5, opacity: 0.7 }));

  // Frame: heavy outer line, fine inner line, accent bars top and bottom.
  doc.rect(20, 20, W - 40, H - 40).lineWidth(3).stroke(theme.main);
  doc.rect(32, 32, W - 64, H - 64).lineWidth(0.75).stroke(theme.light);
  doc.rect(W / 2 - 90, 17, 180, 6).fill(theme.main);
  doc.rect(W / 2 - 90, H - 23, 180, 6).fill(theme.main);

  // The institution that conducted the event is the letterhead.
  const letterhead = (c.college || 'EventFlow').toUpperCase();
  doc.fillColor(theme.main).font('Helvetica-Bold').fontSize(c.college ? 14 : 12).text(letterhead, 60, 56, { align: 'center', width: W - 120, characterSpacing: 2.5, lineBreak: false, ellipsis: true });
  doc.fillColor(SLATE).font('Times-Bold').fontSize(36).text(headline, 0, 80, { align: 'center' });

  // Type chip under the headline.
  const label = TYPE_LABELS[c.type].toUpperCase();
  const chipW = doc.font('Helvetica-Bold').fontSize(10).widthOfString(label, { characterSpacing: 2 }) + 34;
  doc.roundedRect((W - chipW) / 2, 128, chipW, 22, 11).fill(theme.main);
  doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(10).text(label, (W - chipW) / 2, 134, { width: chipW, align: 'center', characterSpacing: 2 });

  doc.fillColor(MUTED).font('Helvetica').fontSize(13).text('This is to certify that', 0, 170, { align: 'center' });
  doc.fillColor(SLATE).font('Times-BoldItalic').fontSize(40).text(c.recipientName, 60, 194, { align: 'center', width: W - 120, lineBreak: false, ellipsis: true });
  doc.moveTo(W / 2 - 170, 246).lineTo(W / 2 + 170, 246).lineWidth(1).stroke(theme.light);

  doc.fillColor(MUTED).font('Helvetica').fontSize(13).text(verb, 0, 262, { align: 'center' });
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(24).text(c.eventName, 70, 285, { align: 'center', width: W - 140 });
  const conducted = [c.eventType, c.college && `conducted by ${c.college}`].filter(Boolean).join(' ');
  if (conducted) doc.fillColor(theme.main).font('Helvetica-Bold').fontSize(12).text(conducted, 70, doc.y + 6, { align: 'center', width: W - 140 });
  doc.fillColor(SLATE).font('Helvetica').fontSize(12).text(heldLine(c), 70, doc.y + 6, { align: 'center', width: W - 140 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(11).text(`Venue: ${c.venue}`, 70, doc.y + 3, { align: 'center', width: W - 140 });

  // Footer: signature (left), seal and ID (middle), QR (right).
  const footerY = H - 150;
  doc.moveTo(115, footerY + 40).lineTo(305, footerY + 40).lineWidth(0.75).stroke('#94a3b8');
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(12).text(c.organizerName, 115, footerY + 46, { width: 200 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Event Organizer', 115, footerY + 62, { width: 200 });
  doc.text(c.organizerContact, 115, footerY + 76, { width: 220 });

  seal(doc, W / 2, footerY - 8, theme, c.type);
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`Issued ${fmt(c.issuedAt.toISOString().slice(0, 10))}`, 0, footerY + 36, { align: 'center' });
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(11).text(`Certificate ID: ${c.code}`, 0, footerY + 51, { align: 'center' });
  if (c.sample) {
    doc.fillColor(MUTED).font('Helvetica-Oblique').fontSize(9).text('Sample for preview. Not a valid certificate.', 0, footerY + 70, { align: 'center' });
  } else {
    doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Verify at', 0, footerY + 69, { align: 'center' });
    doc.fillColor(theme.main).font('Helvetica').fontSize(9).text(verificationUrl(c.code), 0, footerY + 80, { align: 'center', link: verificationUrl(c.code) });
  }

  if (qr) {
    doc.image(qr, W - 190, footerY - 5, { width: 80 });
    doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Scan to verify', W - 200, footerY + 78, { width: 100, align: 'center' });
  }

  if (c.sample) {
    doc.save();
    doc.rotate(-24, { origin: [W / 2, H / 2] });
    doc.opacity(0.1).fillColor(theme.main).font('Helvetica-Bold').fontSize(120).text('SAMPLE', 0, H / 2 - 70, { align: 'center', width: W, lineBreak: false });
    doc.restore();
  }

  doc.end();
  return done;
}
