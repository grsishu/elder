import twilio from 'twilio';
import { config } from '../config.js';
import { logServerError } from '../errors.js';

let twilioClient = null;
let lastTwilioError = null;

if (config.twilio.accountSid && config.twilio.authToken) {
  try {
    twilioClient = twilio(config.twilio.accountSid, config.twilio.authToken);
  } catch (err) {
    console.error('[Twilio] Initialization error:', err.message);
  }
}

export function getTwilioStatus() {
  const isConfigured = Boolean(
    config.twilio.accountSid &&
    config.twilio.authToken &&
    config.twilio.verifyServiceSid
  );
  return {
    configured: isConfigured,
    demoMode: config.demoMode,
    accountSidMasked: config.twilio.accountSid ? config.twilio.accountSid.substring(0, 6) + '...' : null,
    verifySidMasked: config.twilio.verifyServiceSid ? config.twilio.verifyServiceSid.substring(0, 6) + '...' : null,
    phoneNumber: config.twilio.phoneNumber || null,
    lastError: lastTwilioError,
  };
}

/**
 * Sends OTP via Twilio Verify or generates Demo code.
 * @param {string} phone E.164 formatted phone number
 * @param {'sms'|'call'} channel
 * @returns {Promise<{ success: boolean, demoCode?: string, message?: string, providerError?: string }>}
 */
export async function sendOtp(phone, channel = 'sms') {
  if (config.demoMode || !twilioClient || !config.twilio.verifyServiceSid) {
    // Demo Mode: Generate 6-digit code deterministically or randomly
    const demoCode = Math.floor(100000 + Math.random() * 900000).toString();
    return {
      success: true,
      demoMode: true,
      demoCode,
      message: `DEMO MODE: no SMS is sent. Your code is ${demoCode}`,
    };
  }

  try {
    const twilioChannel = channel === 'call' ? 'call' : 'sms';
    const verification = await twilioClient.verify.v2
      .services(config.twilio.verifyServiceSid)
      .verifications.create({ to: phone, channel: twilioChannel });

    lastTwilioError = null;
    return {
      success: true,
      demoMode: false,
      status: verification.status,
    };
  } catch (err) {
    const errorMsg = err.message || 'Unknown Twilio error';
    lastTwilioError = {
      message: errorMsg,
      code: err.code,
      status: err.status,
      timestamp: new Date().toISOString(),
    };

    logServerError({
      message: `Twilio Verify error (${phone}, ${channel}): ${errorMsg}`,
      route: '/api/auth/request-otp',
      statusCode: 502,
    });

    // Check for trial unverified number (Twilio error 21608 / 60200)
    if (err.code === 21608 || errorMsg.includes('unverified') || errorMsg.includes('Trial')) {
      return {
        success: false,
        demoMode: false,
        providerError: errorMsg,
        userMessage: 'This number is not verified in Twilio yet. Ask the admin to add it, or use Demo mode.',
        canFallbackToDemo: true,
      };
    }

    return {
      success: false,
      demoMode: false,
      providerError: errorMsg,
      userMessage: `SMS delivery failed: ${errorMsg}`,
    };
  }
}

/**
 * Checks OTP code via Twilio Verify
 */
export async function checkTwilioOtp(phone, code) {
  if (!twilioClient || !config.twilio.verifyServiceSid) {
    return { success: false, error: 'Twilio Verify is not configured' };
  }

  try {
    const verificationCheck = await twilioClient.verify.v2
      .services(config.twilio.verifyServiceSid)
      .verificationChecks.create({ to: phone, code });

    if (verificationCheck.status === 'approved') {
      return { success: true };
    }
    return { success: false, error: 'Invalid verification code' };
  } catch (err) {
    lastTwilioError = {
      message: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    };
    return { success: false, error: err.message };
  }
}

/**
 * Initiates an outbound Twilio voice call for emergency SOS escalation
 */
export async function makeEmergencyVoiceCall({ to, elderName, eventId, callbackUrl }) {
  if (!twilioClient || !config.twilio.phoneNumber) {
    return {
      success: false,
      error: 'Twilio Voice is not configured or TWILIO_PHONE_NUMBER is missing.',
      simulated: true,
    };
  }

  try {
    const call = await twilioClient.calls.create({
      to,
      from: config.twilio.phoneNumber,
      url: `${callbackUrl}/api/twilio/voice/${eventId}`,
      statusCallback: `${callbackUrl}/api/twilio/status/${eventId}`,
      statusCallbackEvent: ['completed', 'failed', 'busy', 'no-answer'],
    });

    return {
      success: true,
      callSid: call.sid,
      status: call.status,
    };
  } catch (err) {
    lastTwilioError = {
      message: err.message,
      code: err.code,
      timestamp: new Date().toISOString(),
    };
    logServerError({
      message: `Twilio Voice Call error to ${to}: ${err.message}`,
      route: '/api/twilio/call',
      statusCode: 502,
    });
    return {
      success: false,
      error: err.message,
      code: err.code,
    };
  }
}

/**
 * Sends an emergency SMS via Twilio
 */
export async function sendEmergencySms({ to, message }) {
  if (!twilioClient || !config.twilio.phoneNumber) {
    return {
      success: false,
      error: 'Twilio SMS not configured.',
      simulated: true,
    };
  }

  try {
    const msg = await twilioClient.messages.create({
      to,
      from: config.twilio.phoneNumber,
      body: message,
    });
    return { success: true, sid: msg.sid };
  } catch (err) {
    return { success: false, error: err.message };
  }
}
