// src/services/certificateVerification.js
//
// Client half of the secure QR verification flow.
//
// The verification TOKEN is minted by the server (it must be — a device could
// not be trusted to generate its own verification secret), then stored on the
// certificate document so the printed QR and any reprint use the same secret.
//
// OFFLINE BEHAVIOUR
//   A certificate issued while the device is offline CANNOT obtain a token:
//   there is no server to mint it. The certificate is therefore issued WITHOUT
//   a verification QR, and the token is minted later, once the certificate has
//   replicated and the device is online again. The public page never treats a
//   certificate that the server has not seen as verified — an unsynchronised
//   record simply is not found, which is the honest answer.
//
//   `ensureVerificationToken()` therefore returns `null` (and reports why) when
//   the server cannot be reached. It never fabricates a token locally.

import { apiFetch } from '../utils/api';
import { isValidVerificationToken } from '../utils/verifyDocument';

/**
 * Ask the server to mint (or re-issue) the verification token for a
 * certificate.
 *
 * @param {string} certificateId
 * @param {string} [existingToken] the token the device already holds, so the
 *        server can confirm it is the one it issued and reuse it
 * @returns {Promise<{ok:boolean, token?:string, reused?:boolean, error?:string}>}
 */
export const requestVerificationToken = async (certificateId, existingToken = null) => {
  if (!certificateId) {
    return { ok: false, error: 'A certificate id is required.' };
  }

  try {
    const body = { certificateId };
    if (isValidVerificationToken(existingToken)) {
      body.verificationToken = existingToken;
    }

    const res = await apiFetch('certificates/verification-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      let message = `The server refused to issue a verification token (HTTP ${res.status}).`;
      try {
        const payload = await res.json();
        if (payload?.message) message = payload.message;
      } catch {
        /* keep the generic message */
      }
      return { ok: false, error: message, status: res.status };
    }

    const payload = await res.json();
    if (!payload?.success || !isValidVerificationToken(payload.token)) {
      return { ok: false, error: 'The server did not return a usable verification token.' };
    }

    return { ok: true, token: payload.token, reused: Boolean(payload.reused) };
  } catch (err) {
    return { ok: false, error: err?.message || 'The verification service could not be reached.' };
  }
};

/**
 * Ensure the certificate document carries a verification token.
 *
 * When the device is online the token is minted by the server and written
 * back onto the certificate document. When the device is offline nothing is
 * written and the caller is told the certificate is pending verification.
 *
 * @param {object} certificate the certificate document (must have `_id`)
 * @param {object} [options]
 * @param {object} [options.db] a PouchDB handle (defaults to the local db)
 * @returns {Promise<{status:'issued'|'pending'|'reused'|'failed', token?:string, error?:string}>}
 */
export const ensureVerificationToken = async (certificate, { db } = {}) => {
  const certificateId = certificate?._id;
  if (!certificateId) {
    return { status: 'failed', error: 'The certificate has no id.' };
  }

  const existing = isValidVerificationToken(certificate?.verificationToken)
    ? certificate.verificationToken
    : null;

  const result = await requestVerificationToken(certificateId, existing);

  if (!result.ok) {
    // Offline (or the certificate is not in an issued state): the certificate
    // stays without a verification QR and the public page will report it as
    // not found until the server has actually seen it.
    return { status: 'pending', error: result.error };
  }

  if (existing && result.token === existing) {
    return { status: 'reused', token: result.token };
  }

  // Persist the token on the certificate so the printed QR and any reprint
  // use the same secret. The write is best-effort: the token is also held in
  // memory by the caller.
  try {
    const target = db || (await import('./db')).localDb;
    const latest = await target.get(certificateId);
    if (latest.verificationToken !== result.token) {
      await target.put({ ...latest, verificationToken: result.token });
    }
  } catch (err) {
    console.warn('[certificate-verification] Could not store the token on the document:', err?.message || err);
  }

  return { status: 'issued', token: result.token };
};
