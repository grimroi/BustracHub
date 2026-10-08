// src/services/smsService.js

// NOTE: Sa production, ilagay ang API key sa .env file (VITE_SEMAPHORE_API_KEY)
// Para sa defense, gagamitin natin ang DEMO_MODE fallback para walang error.
const SEMAPHORE_API_KEY = import.meta.env.VITE_SEMAPHORE_API_KEY || 'DEMO_MODE';
const SEMAPHORE_SENDER_NAME = 'BustracHub';

export const sendResidentSMS = async (phoneNumber, residentName, messageBody) => {
  if (!phoneNumber) {
    console.warn('⚠️ No phone number provided for SMS dispatch.');
    return false;
  }

  // Format number to 639xxxxxxxxx (Required format ng Semaphore)
  const formattedNumber = phoneNumber.startsWith('09') ? '63' + phoneNumber.substring(1) : phoneNumber;
  const fullMessage = `[BARANGAY BUSTRAC] Dear ${residentName}, ${messageBody}`;

  // 🟢 DEMO / SIMULATION CHECK FOR CAPSTONE DEFENSE
  const isDemoKey = !SEMAPHORE_API_KEY || SEMAPHORE_API_KEY === 'DEMO_MODE' || SEMAPHORE_API_KEY.includes('your_api_key');

  if (isDemoKey) {
    console.log('═══════════════════════════════════════════════════════');
    console.log('📱 [DEMO MODE] SMS Gateway Simulation Output');
    console.log(`📱 To: +${formattedNumber} (${residentName})`);
    console.log(`💬 Message: "${fullMessage}"`);
    console.log('✅ Status: SIMULATED SUCCESS (HTTP 200 via Semaphore Gateway)');
    console.log('═══════════════════════════════════════════════════════');
    
    // Magre-return ng true para ma-mark as sent sa CouchDB at hindi mag-loop
    return true; 
  }

  // 🔵 REAL SEMAPHORE API CALL (Gagawin lang kung may totoong working API Key sa .env)
  try {
    const response = await fetch('https://api.semaphore.co/api/v4/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apikey: SEMAPHORE_API_KEY,
        number: formattedNumber,
        message: fullMessage,
        sendername: SEMAPHORE_SENDER_NAME
      })
    });
    
    const data = await response.json();
    if (data.status === 'Success' || data.messageid) {
      console.log('✅ Live SMS sent successfully via Semaphore:', data);
      return true;
    } else {
      console.error('❌ Semaphore API Error:', data);
      return false;
    }
  } catch (error) {
    console.error('❌ Failed to send Semaphore SMS:', error.message);
    return false;
  }
};