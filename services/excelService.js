const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');

async function generateS1aReport(userInfo, transactions, month, year) {
  const templatePath = path.join(__dirname, '../templates/mau_s1a_empty.xlsx');
  
  // Tạo file mẫu trống nếu chưa có để test
  if (!fs.existsSync(templatePath)) {
    const tempWb = new ExcelJS.Workbook();
    const tempWs = tempWb.addWorksheet('S1a');
    await tempWb.xlsx.writeFile(templatePath);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);
  const worksheet = workbook.getWorksheet(1);

  // Điền thông tin người dùng
  worksheet.getCell('A1').value = `HỘ, CÁ NHÂN KINH DOANH: ${(userInfo.businessName || '').toUpperCase()}`;
  worksheet.getCell('A2').value = `Địa chỉ: ${userInfo.address || ''}`;
  worksheet.getCell('A3').value = `Mã số thuế: ${userInfo.taxCode || ''}`;
  worksheet.getCell('B7').value = `Địa điểm kinh doanh: ${userInfo.businessLocation || ''}`;
  worksheet.getCell('B8').value = `Kỳ kê khai: Tháng ${month} Năm ${year}`;

  // Đổ dữ liệu
  let startRow = 12;
  let currentRow = startRow;

  transactions.forEach((tx, index) => {
    if (index > 0) {
      worksheet.spliceRows(currentRow, 0, []); // Chèn thêm dòng mới để đẩy dòng Tổng cộng xuống
    }

    worksheet.getCell(`B${currentRow}`).value = tx.date.toLocaleDateString('vi-VN');
    worksheet.getCell(`C${currentRow}`).value = tx.description;
    
    const amountCell = worksheet.getCell(`D${currentRow}`);
    amountCell.value = tx.amount;
    amountCell.numFmt = '#,##0';
    
    // Copy style từ dòng 12 (dòng chuẩn của template)
    ['B', 'C', 'D'].forEach(col => {
      worksheet.getCell(`${col}${currentRow}`).border = worksheet.getCell(`${col}12`).border;
      worksheet.getCell(`${col}${currentRow}`).font = worksheet.getCell(`${col}12`).font;
    });

    currentRow++;
  });

  // Cập nhật lại công thức tổng cộng
  let totalRow = 19;
  if (transactions.length > 0) {
    totalRow = 19 + transactions.length - 1;
  }
  
  const totalCell = worksheet.getCell(`D${totalRow}`);
  totalCell.value = { formula: `SUM(D${startRow}:D${currentRow - 1 || startRow})` };
  totalCell.numFmt = '#,##0';

  const exportPath = path.join(__dirname, `../exports/S1a_${userInfo.taxCode}_${month}_${year}.xlsx`);
  if (!fs.existsSync(path.join(__dirname, '../exports'))) {
    fs.mkdirSync(path.join(__dirname, '../exports'));
  }
  
  await workbook.xlsx.writeFile(exportPath);
  return exportPath;
}

module.exports = { generateS1aReport };
