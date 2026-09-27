import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

// Utility helper function para sa data validations na ginagamit sa BUSTRAC HUB
export const validateResidentData = (data, existingResidents = []) => {
  const errors = {};

  // RBI Regex: XX-XX-XX-XXX-XXXXXXXX (e.g. 05-17-23-005-00000001)
  const rbiRegex = /^\d{2}-\d{2}-\d{2}-\d{3}-\d{8}$/;
  if (!data.rbiNo || !rbiRegex.test(data.rbiNo)) {
    errors.rbiNo = 'Invalid RBI format (Format required: XX-XX-XX-XXX-XXXXXXXX)';
  }

  // PH Contact Number: 11 digits starting with 09
  const contactRegex = /^09\d{9}$/;
  if (!data.contactNo || !contactRegex.test(data.contactNo)) {
    errors.contactNo = 'Contact number must be a valid 11-digit PH mobile number starting with 09';
  }

  // Check Duplicate Resident (First Name + Last Name + Birthdate match)
  const isDuplicate = existingResidents.some(
    (res) =>
      res.firstName?.toLowerCase().trim() === data.firstName?.toLowerCase().trim() &&
      res.lastName?.toLowerCase().trim() === data.lastName?.toLowerCase().trim() &&
      res.birthdate === data.birthdate
  );

  if (isDuplicate) {
    errors.duplicate = 'Duplicate resident record detected in the system';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
};

// Dummy Resident Form Component para sa Test Suite Integration
const DummyResidentForm = ({ currentUserRole, existingResidents, onSubmit }) => {
  const [formData, setFormData] = React.useState({
    rbiNo: '',
    firstName: '',
    lastName: '',
    birthdate: '',
    contactNo: ''
  });
  const [formErrors, setFormErrors] = React.useState({});

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const validation = validateResidentData(formData, existingResidents);
    if (!validation.isValid) {
      setFormErrors(validation.errors);
      return;
    }
    setFormErrors({});
    onSubmit(formData);
  };

  return (
    <div>
      <h2>Resident Registration</h2>
      <form onSubmit={handleSubmit}>
        <input name="rbiNo" placeholder="RBI Number" value={formData.rbiNo} onChange={handleChange} />
        {formErrors.rbiNo && <span role="alert">{formErrors.rbiNo}</span>}

        <input name="firstName" placeholder="First Name" value={formData.firstName} onChange={handleChange} />
        <input name="lastName" placeholder="Last Name" value={formData.lastName} onChange={handleChange} />
        <input type="date" name="birthdate" value={formData.birthdate} onChange={handleChange} />

        <input name="contactNo" placeholder="Contact Number" value={formData.contactNo} onChange={handleChange} />
        {formErrors.contactNo && <span role="alert">{formErrors.contactNo}</span>}

        {formErrors.duplicate && <div role="alert">{formErrors.duplicate}</div>}

        <button type="submit">Save Resident</button>
      </form>

      {/* Role-Based Guarded Action */}
      {currentUserRole === 'admin' ? (
        <button id="admin-delete-btn">Delete Resident Record</button>
      ) : (
        <div id="staff-restricted-notice">Staff View: Delete Action Restricted</div>
      )}
    </div>
  );
};

describe('ResidentForm & Role-Based Access Control (RBAC) Tests', () => {
  const existingResidentsList = [
    {
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      birthdate: '1990-01-01',
      rbiNo: '05-17-23-005-00000001'
    }
  ];

  test('should validate RBI Number format correctly', () => {
    const invalidRbiData = {
      rbiNo: '123-invalid-rbi',
      contactNo: '09171234567',
      firstName: 'Pedro',
      lastName: 'Penduko',
      birthdate: '1995-05-05'
    };
    const validation = validateResidentData(invalidRbiData, []);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.rbiNo).toContain('Invalid RBI format');
  });

  test('should validate Philippine Contact Number correctly', () => {
    const invalidContactData = {
      rbiNo: '05-17-23-005-00000002',
      contactNo: '08123456789', // Hindi nag-uumpisa sa 09
      firstName: 'Pedro',
      lastName: 'Penduko',
      birthdate: '1995-05-05'
    };
    const validation = validateResidentData(invalidContactData, []);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.contactNo).toContain('valid 11-digit PH mobile number');
  });

  test('should detect duplicate resident entry', () => {
    const duplicateData = {
      rbiNo: '05-17-23-005-00000099',
      contactNo: '09170000000',
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      birthdate: '1990-01-01'
    };
    const validation = validateResidentData(duplicateData, existingResidentsList);
    expect(validation.isValid).toBe(false);
    expect(validation.errors.duplicate).toContain('Duplicate resident record detected');
  });

  test('should display validation errors on screen during form submission', async () => {
    const mockSubmit = jest.fn();
    render(
      <DummyResidentForm
        currentUserRole="staff"
        existingResidents={existingResidentsList}
        onSubmit={mockSubmit}
      />
    );

    const rbiInput = screen.getByPlaceholderText('RBI Number');
    const contactInput = screen.getByPlaceholderText('Contact Number');
    const submitBtn = screen.getByText('Save Resident');

    fireEvent.change(rbiInput, { target: { value: '00-00-invalid' } });
    fireEvent.change(contactInput, { target: { value: '02123456' } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText(/Invalid RBI format/i)).toBeInTheDocument();
    expect(await screen.findByText(/valid 11-digit PH mobile number/i)).toBeInTheDocument();
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  test('should enforce RBAC: Admin sees delete option, Staff is restricted', () => {
    const { rerender } = render(
      <DummyResidentForm
        currentUserRole="staff"
        existingResidents={[]}
        onSubmit={jest.fn()}
      />
    );

    // Verify Staff restrictions
    expect(screen.queryByText('Delete Resident Record')).not.toBeInTheDocument();
    expect(screen.getByText('Staff View: Delete Action Restricted')).toBeInTheDocument();

    // Re-render as Admin
    rerender(
      <DummyResidentForm
        currentUserRole="admin"
        existingResidents={[]}
        onSubmit={jest.fn()}
      />
    );

    // Verify Admin permissions
    expect(screen.getByText('Delete Resident Record')).toBeInTheDocument();
    expect(screen.queryByText('Staff View: Delete Action Restricted')).not.toBeInTheDocument();
  });
});