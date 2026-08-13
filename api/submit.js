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

  const terms = [
    { title: '1. Trip Details', body: 'Great Comfort Services will provide transportation to the destination specified at the time of booking. The pickup time, pickup location, and destination are confirmed upon reservation. Passengers are required to be ready at the specified pickup location no later than five (5) minutes before the scheduled pickup time. Great Comfort Services reserves the right to adjust routes to account for traffic, road conditions, or other unforeseen circumstances while making reasonable efforts to ensure on-time arrival. Any changes to the trip details must be communicated to Great Comfort Services as soon as possible and are subject to availability.' },
    { title: '2. Round-Trip Waiting Policy', body: 'For round-trip bookings, Great Comfort Services will wait a maximum of fifteen (15) minutes beyond the agreed-upon return pickup time at no additional charge. Waiting time exceeding fifteen (15) minutes will be charged at the prevailing hourly rate, prorated in fifteen-minute increments. If the passenger has not appeared within forty-five (45) minutes and has not contacted Great Comfort Services, the driver may be reassigned and a no-show fee equivalent to the original return trip fare will apply.' },
    { title: '3. Safety and Wheelchair Acknowledgment', body: 'The safety of all passengers is the highest priority of Great Comfort Services. All drivers are trained and certified in passenger assistance, defensive driving, and first-aid procedures. Wheelchair-accessible vehicles are equipped with securement systems that meet applicable safety standards. Passengers who use wheelchairs or other mobility devices must ensure that their device is in good working condition and safe for transport. Seatbelts and applicable restraints must be worn at all times during transit.' },
    { title: '4. Passenger Responsibilities', body: 'Passengers are responsible for their conduct during the trip. Behaviour that endangers the driver, other passengers, or third parties, or that damages the vehicle, will result in immediate termination of the trip without refund. Passengers are responsible for all personal belongings; Great Comfort Services is not liable for loss or damage to personal items. Eating, drinking (other than water), and smoking are prohibited in all vehicles. Children must be secured in an appropriate child safety seat provided by the passenger.' },
    { title: '5. Cancellations and Reservation Changes', body: 'Cancellations made at least twenty-four (24) hours before the scheduled pickup time will receive a full refund or credit. Cancellations made between two (2) and twenty-four (24) hours before will be subject to a cancellation fee of fifty percent (50%) of the trip fare. Cancellations made less than two (2) hours before the scheduled pickup time, or no-shows, will be charged the full trip fare. Reservation changes made at least twenty-four (24) hours in advance are accommodated at no additional charge, subject to availability.' },
  ];

  // Plain-text body
  const emailText = [
    'Great Comfort Services — Signed Transportation Agreement',
    '--------------------------------------------------------',
    '',
    'TRANSPORTATION TERMS & CONDITIONS',
    '----------------------------------',
    ...terms.flatMap(t => [t.title, t.body, '']),
    'The following passenger has read and agreed to the above Terms & Conditions:',
    '',
    `Passenger Name: ${name}`,
    `Date Signed:    ${date}`,
    `Agreed:         Yes`,
    '',
    'Safety is our highest priority.',
    'Great Comfort Services',
  ].join('\n');

  // HTML body
  const termsHtml = terms.map(t => `
    <div style="margin-bottom:16px;">
      <p style="font-weight:bold;color:#1a3a5c;margin:0 0 6px;">${escapeHtml(t.title)}</p>
      <p style="margin:0;color:#444;line-height:1.6;">${escapeHtml(t.body)}</p>
    </div>
  `).join('');

  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="font-family:Arial,sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px;">

  <div style="border-bottom:3px solid #1a3a5c;padding-bottom:12px;margin-bottom:20px;">
    <h2 style="color:#1a3a5c;margin:0;font-size:18px;">Great Comfort Services</h2>
    <p style="margin:4px 0 0;color:#666;font-size:13px;">Transportation Agreement — Signed Notification</p>
  </div>

  <!-- Terms & Conditions FIRST -->
  <div style="margin-bottom:24px;">
    <h3 style="color:#1a3a5c;margin:0 0 16px;font-size:15px;border-bottom:2px solid #1a3a5c;padding-bottom:8px;">Transportation Terms &amp; Conditions</h3>
    ${termsHtml}
  </div>

  <!-- Passenger details after -->
  <p style="margin-bottom:12px;">The following passenger has read and agreed to the above Terms &amp; Conditions:</p>

  <table style="border-collapse:collapse;width:100%;margin-bottom:24px;">
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
  <div style="border:1px solid #ccc;border-radius:4px;padding:8px;display:inline-block;background:#fff;margin-bottom:24px;">
    <img src="cid:signature@greatcomfort" alt="Electronic Signature" style="display:block;max-width:400px;max-height:150px;" />
  </div>

  <div style="margin-top:24px;padding-top:16px;border-top:1px solid #eee;color:#888;font-size:12px;">
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
