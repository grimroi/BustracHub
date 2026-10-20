// src/components/Resident/__tests__/ResidentBlotter.test.jsx
// Renders the REAL incident form and drives it with dummy data to confirm the
// validation and the parent-callback contract (success vs blocked result).

import { createElement } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

jest.mock('sweetalert2', () => ({
  __esModule: true,
  default: { fire: jest.fn().mockResolvedValue({ isConfirmed: true }) },
}));

import Swal from 'sweetalert2';
import ResidentBlotter from '../ResidentBlotter';

const renderForm = (submitBlotter) => {
  render(
    createElement(ResidentBlotter, {
      myBlotters: [],
      loggedInUser: { fullName: 'Reyes, Juan' },
      submitBlotter,
      handleOpenEdit: () => {},
    })
  );
};

const fill = ({ subject, details, incidentDate, location, respondent } = {}) => {
  if (subject !== undefined) fireEvent.change(screen.getByLabelText(/Incident Subject/i), { target: { value: subject } });
  if (details !== undefined) fireEvent.change(screen.getByLabelText(/Incident Details/i), { target: { value: details } });
  if (incidentDate !== undefined) fireEvent.change(screen.getByLabelText(/Incident Date/i), { target: { value: incidentDate } });
  if (location !== undefined) fireEvent.change(screen.getByLabelText(/Location/i), { target: { value: location } });
  if (respondent !== undefined) fireEvent.change(screen.getByLabelText(/Respondent/i), { target: { value: respondent } });
};

const clickSubmit = () => fireEvent.click(screen.getByRole('button', { name: /Submit Incident Report/i }));

// Drives the form's onSubmit handler directly, bypassing jsdom's native
// `required` constraint validation so the JS validator is what gets exercised.
const submitForm = () => fireEvent.submit(screen.getByLabelText(/Incident Subject/i).closest('form'));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('ResidentBlotter form validation (rendered)', () => {
  test('empty required fields block submission', () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    submitForm();

    expect(submitBlotter).not.toHaveBeenCalled();
    expect(Swal.fire).toHaveBeenCalled(); // error toast from the JS validator
  });

  test('whitespace-only subject blocks submission', () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    fill({ subject: '   ', details: 'Valid details here.', incidentDate: '2026-10-01' });
    submitForm();

    expect(submitBlotter).not.toHaveBeenCalled();
  });

  test('whitespace-only details block submission', () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    fill({ subject: 'Noise Complaint', details: '      ', incidentDate: '2026-10-01' });
    submitForm();

    expect(submitBlotter).not.toHaveBeenCalled();
  });

  test('very short / random-gibberish details (hjkjg) are rejected', () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    fill({ subject: 'Noise Complaint', details: 'hjkjg', incidentDate: '2026-10-01' });
    submitForm();

    expect(submitBlotter).not.toHaveBeenCalled();
  });

  test('a valid report calls submitBlotter with trimmed, defaulted values', async () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    fill({
      subject: '  Noise Complaint  ',
      details: 'Malakas ang videoke hanggang madaling araw.',
      incidentDate: '2026-10-01',
    });
    clickSubmit();

    await waitFor(() => expect(submitBlotter).toHaveBeenCalledTimes(1));
    expect(submitBlotter).toHaveBeenCalledWith({
      subject: 'Noise Complaint',
      details: 'Malakas ang videoke hanggang madaling araw.',
      incidentDate: '2026-10-01',
      location: 'Unknown Location',
      respondent: 'Under Investigation',
      attachments: [],
    });
  });
});

describe('ResidentBlotter result handling (rendered)', () => {
  test('success === false keeps the form open (e.g. warned/blocked upstream)', async () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: false, reason: 'anti_spam' });
    renderForm(submitBlotter);

    fill({ subject: 'Noise Complaint', details: 'Malakas ang videoke hanggang madaling araw.', incidentDate: '2026-10-01' });
    clickSubmit();

    await waitFor(() => expect(submitBlotter).toHaveBeenCalledTimes(1));
    // Form is still mounted and retains the typed values.
    expect(screen.getByRole('button', { name: /Submit Incident Report/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/Incident Subject/i)).toHaveValue('Noise Complaint');
  });

  test('success === true resets and closes the form', async () => {
    const submitBlotter = jest.fn().mockResolvedValue({ success: true });
    renderForm(submitBlotter);

    fill({ subject: 'Noise Complaint', details: 'Malakas ang videoke hanggang madaling araw.', incidentDate: '2026-10-01' });
    clickSubmit();

    await waitFor(() => expect(submitBlotter).toHaveBeenCalledTimes(1));
    // Form collapses → header reverts to the "File New Incident Report" label.
    await screen.findByText('File New Incident Report');
    expect(screen.queryByRole('button', { name: /Submit Incident Report/i })).not.toBeInTheDocument();
  });
});
