// server/services/emailService.js
const nodemailer = require('nodemailer');

// 1. Lumikha ng Transporter gamit ang explicit Gmail SMTP settings
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true, // SSL
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// 2. I-verify ang SMTP Connection kapag nag-start ang service
transporter.verify((error, success) => {
  if (error) {
    console.error('❌ [GMAIL SMTP ERROR] Connection failed:', error.message);
  } else {
  }
});

/**
 * Nagpapadala ng Summons / Blotter Notification via Email
 */
async function sendBlotterNotification(toEmail, respondentName, caseNumber, scheduleDate) {
  if (!toEmail || !toEmail.includes('@')) {
    console.warn(`⚠️ [EMAIL SKIPPED] Walang valid email para sa Case: ${caseNumber}`);
    return null;
  }

  const mailOptions = {
    from: `"Barangay Bustrac Hub" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: `Barangay Notice / Summons Notification [Case: ${caseNumber}]`,
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #333; max-width: 600px; border: 1px solid #e5e7eb; border-radius: 8px;">
        <h2 style="color: #1e3a8a; margin-top: 0;">Barangay Bustrac Official Notice</h2>
        <p>Magandang araw, <strong>${respondentName}</strong>,</p>
        <p>Ipinagbibigay-alam na mayroong naitalang usapin/blotter patungkol sa inyo sa ating Barangay Hall.</p>
        <div style="background-color: #f3f4f6; padding: 15px; border-left: 4px solid #2563eb; margin: 15px 0; border-radius: 4px;">
          <p style="margin: 5px 0;"><strong>Case Reference:</strong> ${caseNumber}</p>
          <p style="margin: 5px 0;"><strong>Petsa ng Paghaharap (Hearing/Appearance):</strong> ${scheduleDate || 'Aasahan sa Barangay Hall'}</p>
        </div>
        <p>Inaasahan ang inyong pagdalo at pakikipag-ugnayan sa Tanggapan ng Barangay para sa paglilinaw at maayos na settlement.</p>
        <br/>
        <p style="margin-bottom: 0;">Maraming Salamat,<br/><strong>Barangay Bustrac Office</strong></p>
      </div>
    `
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(` [EMAIL SUCCESS] Sent to ${toEmail} | Message ID: ${info.messageId}`);
    return info;
  } catch (error) {
    console.error(` [EMAIL ERROR] Failed to send email to ${toEmail}:`, error.message);
    throw error;
  }
}

module.exports = { sendBlotterNotification };