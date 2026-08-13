'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const nodemailer = require('nodemailer');

const app = express();

app.use(cors({ origin: true }));
app.use(express.json({ limit: '5mb' }));
app.use(helmet({ contentSecurityPolicy: false }));

// ── POST /api/submit ──────────────────────────────────────────────────────────
app.post('/api/submit', async (req, res) => {
  const { passengerName, signDate, agreed, signatureDataUrl } = req.body || {};

  if (!passengerName || typeof passengerName !== 'string' || passengerName.trim() === '') {
    return res.status(400).json({ error: 'Passenger name is required.' });
  }
  if (!agreed) {
    return res.status(400).json({ error: 'Agreement checkbox must be checked.' });
  }
  if (!signatureDataUrl || !signatureDataUrl.startsWith('data:image/')) {
    return res.status(400).json({ error: 'A signature is required.' });
  }

  const recipientEmail = process.env.STAFF_EMAIL_RECIPIENT;
  if (!recipientEmail) {
    console.error('[submit] STAFF_EMAIL_RECIPIENT env var not set');
    return res.status(500).json({ error: 'Server configuration error: recipient email not set.' });
  }

  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const emailHtml = `
    <h2 style="color:#1a3a5c;">New Signed Transportation Terms &amp; Conditions</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;white-space:nowrap;">Passenger Name</th>
        <td style="padding:6px 0;">${escapeHtml(passengerName.trim())}</td>
      </tr>
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;">Date</th>
        <td style="padding:6px 0;">${escapeHtml(signDate || '')}</td>
      </tr>
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;">Agreed to Terms</th>
        <td style="padding:6px 0;">Yes</td>
      </tr>
    </table>
    <p style="font-weight:600;margin-bottom:8px;">Electronic Signature:</p>
    <img src="cid:signature@greatcomfort"
         alt="Customer Signature"
         style="border:1px solid #ccc;border-radius:4px;max-width:420px;display:block;" />
    <p style="margin-top:24px;color:#888;font-size:12px;font-style:italic;">
      Safety is our highest priority. — Great Comfort Services
    </p>
  `;

  const emailText = [
    'New Signed Transportation Terms & Conditions',
    '============================================',
    `Passenger Name: ${passengerName.trim()}`,
    `Date:           ${signDate || ''}`,
    `Agreed:         Yes`,
    '',
    'Safety is our highest priority. — Great Comfort Services',
  ].join('\n');

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from:    process.env.SMTP_FROM || process.env.SMTP_USER || recipientEmail,
      to:      recipientEmail,
      subject: `New Signed Transportation Terms – ${passengerName.trim()}`,
      text:    emailText,
      html:    emailHtml,
      attachments: [{
        filename: 'signature.png',
        content:  base64Data,
        encoding: 'base64',
        cid:      'signature@greatcomfort',
      }],
    });

    console.log(`[submit] Email sent for: ${passengerName.trim()}`);
    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[submit] Email send failed:', err.message);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
});

function createTransporter() {
  if (process.env.EMAIL_PROVIDER === 'sendgrid') {
    return nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: { user: 'apikey', pass: process.env.SENDGRID_API_KEY },
    });
  }
  return nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Export for Firebase Functions
try {
  const functions = require('firebase-functions');
  exports.api = functions.https.onRequest(app);
} catch (_) {
  // Running outside Firebase (local dev server)
}

// Export raw Express app for local server
exports.app = app;
