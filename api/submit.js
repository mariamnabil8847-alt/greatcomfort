'use strict';

const nodemailer = require('nodemailer');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

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

  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const emailHtml = `
    <h2 style="color:#1a3a5c;">New Signed Transportation Terms &amp; Conditions</h2>
    <table style="border-collapse:collapse;font-size:14px;margin-bottom:16px;">
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;">Passenger Name</th>
        <td>${escapeHtml(passengerName.trim())}</td>
      </tr>
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;">Date</th>
        <td>${escapeHtml(signDate || '')}</td>
      </tr>
      <tr>
        <th align="left" style="padding:6px 20px 6px 0;color:#555;">Agreed to Terms</th>
        <td>Yes</td>
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
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        type:         'OAuth2',
        user:         process.env.GMAIL_USER,
        clientId:     process.env.GMAIL_CLIENT_ID,
        clientSecret: process.env.GMAIL_CLIENT_SECRET,
        refreshToken: process.env.GMAIL_REFRESH_TOKEN,
      },
    });

    await transporter.sendMail({
      from:    `"Great Comfort Services" <${process.env.GMAIL_USER}>`,
      to:      process.env.STAFF_EMAIL_RECIPIENT, // comma-separated list supported
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

    return res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('[submit] Email failed:', err.message);
    return res.status(500).json({ error: 'Failed to send email. Please try again.' });
  }
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
