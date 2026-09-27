import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ResidentCombobox from '../ResidentCombobox';

const mockResidents = [
  { id: 'RES-0001', name: 'Juan Dela Cruz', purok: 'Purok 1' },
  { id: 'RES-0002', name: 'Maria Santos', purok: 'Purok 2' },
  { id: 'RES-0003', name: 'Pedro Penduko', purok: 'Purok 1' },
];

describe('ResidentCombobox Component', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    test('dapat magpakita ng default placeholder kung walang placeholder prop', () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');
      expect(input).toHaveAttribute('placeholder', 'Search by name, resident ID, or purok...');
    });

    test('dapat mag-render kahit null/undefined ang residents list', () => {
      expect(() => {
        render(<ResidentCombobox residents={null} onChange={mockOnChange} />);
      }).not.toThrow();
    });
  });

  describe('Search & Filter Functionality', () => {
    test('dapat mag-filter ng results base sa typed query (case-insensitive)', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        await userEvent.type(input, 'maria');
      });

      expect(screen.getByText('Maria Santos')).toBeInTheDocument();
      expect(screen.queryByText('Juan Dela Cruz')).not.toBeInTheDocument();
    });

    test('dapat mag-search base sa Resident ID', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        await userEvent.type(input, 'RES-0003');
      });

      expect(screen.getByText('Pedro Penduko')).toBeInTheDocument();
    });

    test('dapat magpakita ng "No matching resident found." kapag walang match', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        await userEvent.type(input, 'zzzznonexistent');
      });

      expect(screen.getByText(/No matching resident found/i)).toBeInTheDocument();
    });
  });

  describe('Selection Behavior', () => {
    test('dapat i-call ang onChange callback kapag pumili ng resident', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        await userEvent.type(input, 'Juan');
      });

      const option = screen.getByText('Juan Dela Cruz');
      fireEvent.click(option);

      expect(mockOnChange).toHaveBeenCalledWith(mockResidents[0]);
    });

    test('dapat ipakita ang selected resident name kapag may value prop', () => {
      render(<ResidentCombobox residents={mockResidents} value="RES-0002" onChange={mockOnChange} />);
      expect(screen.getByText('Maria Santos')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Clear selected resident/i })).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    test('dapat isara ang dropdown gamit ang Escape key', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        await userEvent.type(input, 'Juan');
      });

      expect(screen.getByRole('listbox')).toBeInTheDocument();

      fireEvent.keyDown(input, { key: 'Escape' });

      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility (a11y)', () => {
    test('dapat may tamang ARIA attributes ang combobox', () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      expect(input).toHaveAttribute('aria-autocomplete', 'list');
      expect(input).toHaveAttribute('aria-expanded');
    });

    test('dapat may role="listbox" ang dropdown container at role="option" ang bawat item', async () => {
      render(<ResidentCombobox residents={mockResidents} onChange={mockOnChange} />);
      const input = screen.getByRole('combobox');

      await act(async () => {
        fireEvent.focus(input);
      });

      const listbox = screen.getByRole('listbox');
      expect(listbox).toBeInTheDocument();

      const options = screen.getAllByRole('option');
      expect(options.length).toBeGreaterThan(0);
    });
  });
});