// src/utils/blotterSubmitGuard.js
// Blotter submission guard: anti-spam window + reliable duplicate detection +
// the resident-facing SweetAlert orchestration. Extracted from ResidentUI so
// the full decision flow (including the Magpatuloy / Kanselahin buttons) can be
// exercised by tests. The SweetAlert implementation is injectable, and the
// clock is injectable, so both are deterministic under test.
//
// Behaviour preserved from the original inline implementation:
//   1. anti-spam runs FIRST and short-circuits the duplicate guard
//   2. a reliable duplicate of the resident's OWN active case is blocked
//   3. otherwise any related record yields a neutral, non-blocking confirmation
//   4. messages never include another person's case number/name/details

import Swal from 'sweetalert2';
import { isDuplicateSubmission, matchActiveBlotterCases } from './blotterMatch';

export const ANTI_SPAM_WINDOW_MS = 2 * 60 * 60 * 1000; // 2 hours

// Minimum-length criteria for the incident form. These are transparent length
// rules (not wording/keyword rules) so legitimate reports are never rejected
// for their phrasing. `details` must be a meaningful narrative.
export const BLOTTER_LIMITS = {
  SUBJECT_MIN: 3,
  DETAILS_MIN: 10,
  DETAILS_MAX: 500,
};

// Returns the most recent blotter the SAME resident filed within the anti-spam
// window, or undefined. `createdAt` is compared as an ISO string.
export const findRecentOwnBlotter = (blotterList, residentId, now = Date.now()) => {
  if (!residentId) return undefined;
  const cutoff = new Date(now - ANTI_SPAM_WINDOW_MS).toISOString();
  return (Array.isArray(blotterList) ? blotterList : []).find(
    (doc) => doc && doc.residentId === residentId && doc.createdAt > cutoff
  );
};

// Pure classification of a submission: 'block' (reliable duplicate),
// 'confirm' (possible related record — warn, don't block) or 'proceed'.
export const evaluateBlotterSubmission = (blotterList, resident, submission) => {
  if (isDuplicateSubmission(blotterList, { id: resident?.id }, submission)) {
    return { action: 'block', reason: 'duplicate_submission' };
  }

  const { confirmed, ambiguous } = matchActiveBlotterCases(blotterList, {
    id: resident?.id,
    name: resident?.name,
  });

  if (confirmed.length > 0 || ambiguous.length > 0) {
    return { action: 'confirm', reason: 'possible_related_record' };
  }

  return { action: 'proceed', reason: 'ok' };
};

// Validates the incident form fields. Returns { valid, reason, message }.
export const validateBlotterForm = ({ subject, details } = {}) => {
  const cleanSubject = String(subject || '').trim();
  const cleanDetails = String(details || '').trim();

  if (!cleanSubject) {
    return { valid: false, reason: 'subject_required', message: 'Please enter an incident subject.' };
  }
  if (cleanSubject.length < BLOTTER_LIMITS.SUBJECT_MIN) {
    return {
      valid: false,
      reason: 'subject_too_short',
      message: `Please use at least ${BLOTTER_LIMITS.SUBJECT_MIN} characters for the incident subject.`,
    };
  }
  if (!cleanDetails) {
    return { valid: false, reason: 'details_required', message: 'Please describe the incident.' };
  }
  if (cleanDetails.length < BLOTTER_LIMITS.DETAILS_MIN) {
    return {
      valid: false,
      reason: 'details_too_short',
      message: `Please describe the incident in at least ${BLOTTER_LIMITS.DETAILS_MIN} characters.`,
    };
  }
  if (cleanDetails.length > BLOTTER_LIMITS.DETAILS_MAX) {
    return {
      valid: false,
      reason: 'details_too_long',
      message: `Please keep the incident details within ${BLOTTER_LIMITS.DETAILS_MAX} characters.`,
    };
  }

  return { valid: true, reason: 'ok', message: '' };
};

// Runs the anti-spam check and the duplicate guard, showing the appropriate
// SweetAlert. Returns { proceed, reason }. `swal` and `now` are injectable.
export const enforceBlotterSubmission = async ({
  blotterList,
  resident,
  submission,
  now = Date.now(),
  swal = Swal,
} = {}) => {
  // 1. Anti-spam — runs BEFORE the duplicate guard and short-circuits it.
  if (findRecentOwnBlotter(blotterList, resident?.id, now)) {
    await swal.fire(
      'Wait a moment',
      ' A blotter report was recently filed. Please wait 2 hours before submitting another, or visit the Barangay Hall directly.',
      'warning'
    );
    return { proceed: false, reason: 'anti_spam' };
  }

  const { action, reason } = evaluateBlotterSubmission(blotterList, resident, submission);

  // 2. Reliable duplicate — block.
  if (action === 'block') {
    await swal.fire(
      'Duplicate Report',
      'May aktibo ka nang kaso para sa parehong insidente. Hindi na ito naisumite muli upang maiwasan ang doble. Kung ibang insidente ito, baguhin ang paksa o petsa at subukan muli.',
      'warning'
    );
    return { proceed: false, reason };
  }

  // 3. Possible related record — neutral, non-blocking warning.
  if (action === 'confirm') {
    const result = await swal.fire({
      title: 'Posibleng Kaugnay na Record',
      text: 'May na-detect kaming posibleng kaugnay na blotter record. Kung ito ay isang bagong insidente, maaari kang magpatuloy. I-coordinate ang mga paulit-ulit na reklamo sa Barangay Hall.',
      icon: 'info',
      showCancelButton: true,
      confirmButtonText: 'Magpatuloy',
      cancelButtonText: 'Kanselahin',
    });
    if (!result?.isConfirmed) {
      return { proceed: false, reason: 'user_cancelled_related_warning' };
    }
    return { proceed: true, reason };
  }

  return { proceed: true, reason: 'ok' };
};
