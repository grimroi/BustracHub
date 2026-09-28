require('dotenv').config();
const { sendBlotterNotification } = require('./services/emailService');

async function test() {
  console.log("Testing email sending using env user:", process.env.EMAIL_USER);
  try {
    const result = await sendBlotterNotification(
      'markgiancortero@gmail.com', 
      'Juan Dela Cruz', 
      'BLT-2026-00125', 
      'October 15, 2026 - 10:00 AM'
    );
    console.log("✅ Email sent successfully! Message ID:", result.messageId);
  } catch (err) {
    console.error("❌ Email test failed:", err);
  }
}

test();