import * as XLSX from 'xlsx';

export const exportToExcel = (data, fileName = 'Report.xlsx', sheetName = 'ReportData') => {
  if (!data || data.length === 0) {
    alert('No data available to export for the selected criteria.');
    return;
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const keys = Object.keys(data[0]);
  const detailsIndex = keys.indexOf('Details');

  const colWidths = keys.map((key) => {
    if (key === 'Details') {
      return { wch: 100 };
    }
    const maxLength = Math.max(
      key.length,
      ...data.map((row) => String(row[key] ?? '').length)
    );
    return { wch: Math.min(maxLength + 4, 60) };
  });
  worksheet['!cols'] = colWidths;

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  if (!worksheet['!rows']) worksheet['!rows'] = [];

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const cellAddress = XLSX.utils.encode_cell({ r: R, c: C });
      if (!worksheet[cellAddress]) continue;

      if (!worksheet[cellAddress].s) worksheet[cellAddress].s = {};
      worksheet[cellAddress].s.alignment = { wrapText: true };
    }

    if (R > 0 && detailsIndex !== -1) {
      const detailsCellAddress = XLSX.utils.encode_cell({ r: R, c: detailsIndex });
      if (worksheet[detailsCellAddress]) {
        const cellValue = String(worksheet[detailsCellAddress].v || '');
        if (cellValue.length > 60) {
          const estimatedHeight = Math.max(40, Math.ceil(cellValue.length / 80) * 20);
          worksheet['!rows'][R] = { hpt: estimatedHeight };
        } else {
          worksheet['!rows'][R] = { hpt: 25 };
        }
      }
    }
  }

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

  XLSX.writeFile(workbook, fileName);
};