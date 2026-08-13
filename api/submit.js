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

  const name     = passengerName.trim();
  const date     = signDate || new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const base64Data = signatureDataUrl.replace(/^data:image\/\w+;base64,/, '');

  // Plain-text body first (spam filters reward having a good text version)
  const emailText = [
    'Great Comfort Services — Signed Transportation Agreement',
    '--------------------------------------------------------',
    '',
    `Passenger Name: ${name}`,
    `Date Signed:    ${date}`,
    `Agreed to Terms & Conditions: Yes`,
    '',
    'This is an automated notification from the Great Comfort Services',
    'Transportation Terms & Conditions signing system.',
    '',
    'Safety is our highest priority.',
    'Great Comfort Services',
  ].join('\n');

  // Clean, simple HTML — avoids spam trigger words and complex layouts
  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px;">

  <div style="border-bottom:3px solid #1a3a5c;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="color:#1a3a5c;margin:0;font-size:18px;">Great Comfort Services</h2>
    <p style="margin:4px 0 0;color:#666;font-size:13px;">Transportation Agreement — Signed Notification</p>
  </div>

  <p style="margin-bottom:16px;">A customer has signed the Transportation Terms &amp; Conditions.</p>

  <table style="border-collapse:collapse;width:100%;margin-bottom:20px;">
    <tr style="background:#f4f6f8;">
      <td style="padding:10px 14px;font-weight:bold;width:160px;border:1px solid #dde4ed;">Passenger Name</td>
      <td style="padding:10px 14px;border:1px solid #dde4ed;">${escapeHtml(name)}</td>
    </tr>
    <tr>
      <td style="padding:10px 14px;font-weight:bold;border:1px solid #dde4ed;">Date Signed</td>
      <td style="padding:10px 14px;border:1px solid #dde4ed;">${escapeHtml(date)}</td>
    </tr>
    <tr style="background:#f4f6f8;">
      <td style="padding:10px 14px;font-weight:bold;border:1px solid #dde4ed;">Agreed to Terms</td>
      <td style="padding:10px 14px;border:1px solid #dde4ed;">Yes</td>
    </tr>
  </table>

  <p style="font-weight:bold;margin-bottom:8px;">Electronic Signature:</p>
  <div style="border:1px solid #ccc;border-radius:4px;padding:8px;display:inline-block;background:#fff;">
    <img src="cid:signature@greatcomfort" alt="Electronic Signature" style="display:block;max-width:400px;max-height:150px;" />
  </div>

  <div style="margin-top:30px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:12px;">
    <p style="margin:0;">This is an automated notification from Great Comfort Services.</p>
    <p style="margin:4px 0 0;font-style:italic;">Safety is our highest priority.</p>
  </div>

</body>
</html>`;

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
      from:        `"Great Comfort Services" <${process.env.GMAIL_USER}>`,
      to:          process.env.STAFF_EMAIL_RECIPIENT,
      replyTo:     process.env.GMAIL_USER,
      subject:     `Signed Agreement – ${name} – ${date}`,
      text:        emailText,
      html:        emailHtml,
      attachments: [{
        filename:    'signature.png',
        content:     base64Data,
        encoding:    'base64',
        cid:         'signature@greatcomfort',
      }],
      headers: {
        'X-Mailer':        'Great Comfort Services',
        'X-Auto-Response-Suppress': 'All',
      },
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
