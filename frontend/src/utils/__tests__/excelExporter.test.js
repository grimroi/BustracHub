import { exportToExcel } from '../excelExporter';
import * as XLSX from 'xlsx';

// Mocking xlsx library
jest.mock('xlsx', () => ({
  utils: {
    json_to_sheet: jest.fn(() => ({})),
    book_new: jest.fn(() => ({ SheetNames: [], Sheets: {} })),
    book_append_sheet: jest.fn(),
  },
  writeFile: jest.fn(),
}));

describe('excelExporter Utility Function', () => {
  let alertSpy;

  beforeEach(() => {
    alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    jest.clearAllMocks();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  test('dapat magpakita ng alert at HINDI mag-call ng XLSX kapag null ang data', () => {
    exportToExcel(null, 'TestReport.xlsx', 'TestSheet');
    expect(alertSpy).toHaveBeenCalledWith('Walang data na pwedeng i-export para sa piniling criteria.');
    expect(XLSX.utils.json_to_sheet).not.toHaveBeenCalled();
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  test('dapat magpakita ng alert at HINDI mag-call ng XLSX kapag undefined ang data', () => {
    exportToExcel(undefined, 'TestReport.xlsx', 'TestSheet');
    expect(alertSpy).toHaveBeenCalledWith('Walang data na pwedeng i-export para sa piniling criteria.');
    expect(XLSX.utils.json_to_sheet).not.toHaveBeenCalled();
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  test('dapat magpakita ng alert at HINDI mag-call ng XLSX kapag empty array [] ang data', () => {
    exportToExcel([], 'TestReport.xlsx', 'TestSheet');
    expect(alertSpy).toHaveBeenCalledWith('Walang data na pwedeng i-export para sa piniling criteria.');
    expect(XLSX.utils.json_to_sheet).not.toHaveBeenCalled();
    expect(XLSX.writeFile).not.toHaveBeenCalled();
  });

  test('dapat mag-call ng XLSX.writeFile nang tama kapag may valid data array', () => {
    const mockData = [
      { 'Resident ID': 'RES-001', Name: 'Juan Dela Cruz' },
      { 'Resident ID': 'RES-002', Name: 'Maria Santos' }
    ];

    exportToExcel(mockData, 'Residents_Report.xlsx', 'Residents');

    expect(alertSpy).not.toHaveBeenCalled();
    expect(XLSX.utils.json_to_sheet).toHaveBeenCalledWith(mockData);
    expect(XLSX.utils.book_new).toHaveBeenCalled();
    expect(XLSX.utils.book_append_sheet).toHaveBeenCalled();
    expect(XLSX.writeFile).toHaveBeenCalledWith(expect.anything(), 'Residents_Report.xlsx');
  });
});