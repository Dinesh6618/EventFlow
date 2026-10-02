import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { TYPE_LABELS } from '../models/certificateModel.js';

const INDIGO = '#4338ca';
const SLATE = '#0f172a';
const MUTED = '#64748b';

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

const fmt = (iso) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const dateLine = (c) => (c.eventEndDate !== c.eventDate ? `${fmt(c.eventDate)} - ${fmt(c.eventEndDate)}` : fmt(c.eventDate));

/** Public URL a verifier lands on when they scan the QR code. */
export const verificationUrl = (code) => `${config.publicAppUrl}/verify/${code}`;

/** Render one certificate (rows from certificateModel.findForPdf) to a PDF Buffer. */
export async function renderCertificate(c) {
  const qr = await QRCode.toBuffer(verificationUrl(c.code), { width: 220, margin: 1, errorCorrectionLevel: 'M' });
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 0, info: { Title: `${TYPE_LABELS[c.type]} certificate - ${c.recipientName}`, Author: 'EventFlow' } });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  const W = doc.page.width;
  const H = doc.page.height;
  const [headline, verb] = HEADLINES[c.type];

  // Frame
  doc.rect(20, 20, W - 40, H - 40).lineWidth(3).stroke(INDIGO);
  doc.rect(30, 30, W - 60, H - 60).lineWidth(0.75).stroke('#a5b4fc');

  doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(12).text('EVENTFLOW', 0, 62, { align: 'center', characterSpacing: 4 });
  doc.fillColor(SLATE).font('Times-Bold').fontSize(36).text(headline, 0, 92, { align: 'center' });
  if (c.type !== 'participant') doc.fillColor(INDIGO).font('Helvetica-Bold').fontSize(14).text(TYPE_LABELS[c.type].toUpperCase(), 0, 138, { align: 'center', characterSpacing: 3 });

  doc.fillColor(MUTED).font('Helvetica').fontSize(13).text('This is to certify that', 0, 175, { align: 'center' });
  doc.fillColor(SLATE).font('Times-BoldItalic').fontSize(40).text(c.recipientName, 60, 200, { align: 'center', width: W - 120, lineBreak: false, ellipsis: true });
  doc.moveTo(W / 2 - 170, 252).lineTo(W / 2 + 170, 252).lineWidth(0.75).stroke('#cbd5e1');

  doc.fillColor(MUTED).font('Helvetica').fontSize(13).text(verb, 0, 268, { align: 'center' });
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(24).text(c.eventName, 70, 292, { align: 'center', width: W - 140 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(12).text(`${dateLine(c)}  |  ${c.venue}`, 70, doc.y + 8, { align: 'center', width: W - 140 });

  // Footer: issuer (left), seal text (middle), QR (right)
  const footerY = H - 150;
  doc.moveTo(70, footerY + 40).lineTo(260, footerY + 40).lineWidth(0.75).stroke('#94a3b8');
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(12).text(c.organizerName, 70, footerY + 46, { width: 200 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text('Event Organizer', 70, footerY + 62, { width: 200 });
  doc.text(c.organizerContact, 70, footerY + 76, { width: 220 });

  doc.fillColor(MUTED).font('Helvetica').fontSize(10).text(`Issued ${fmt(c.issuedAt.toISOString().slice(0, 10))}`, 0, footerY + 30, { align: 'center' });
  doc.fillColor(SLATE).font('Helvetica-Bold').fontSize(11).text(`Certificate ID: ${c.code}`, 0, footerY + 46, { align: 'center' });
  doc.fillColor(MUTED).font('Helvetica').fontSize(9).text('Verify at', 0, footerY + 64, { align: 'center' });
  doc.fillColor(INDIGO).font('Helvetica').fontSize(9).text(verificationUrl(c.code), 0, footerY + 76, { align: 'center', link: verificationUrl(c.code) });

  doc.image(qr, W - 150, footerY - 5, { width: 80 });
  doc.fillColor(MUTED).font('Helvetica').fontSize(8).text('Scan to verify', W - 160, footerY + 78, { width: 100, align: 'center' });

  doc.end();
  return done;
}
