import * as XLSX from 'xlsx';

/**
 * Helper function para mag-export ng JSON Array papuntang Excel (.xlsx) file
 * @param {Array} data - Ang array ng objects na kumakatawan sa rows
 * @param {String} fileName - Pangalan ng ilalabas na file
 * @param {String} sheetName - Pangalan ng WorkSheet tab
 */
export const exportToExcel = (data, fileName = 'Report.xlsx', sheetName = 'ReportData') => {
  if (!data || data.length === 0) {
    alert('Walang data na pwedeng i-export para sa piniling criteria.');
    return;
  }

  // 1. Lumikha ng bagong Workbook at Worksheet
  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();

  // 2. I-append ang worksheet sa workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  // 3. I-download ang Excel file sa browser
  XLSX.writeFile(workbook, fileName);
};