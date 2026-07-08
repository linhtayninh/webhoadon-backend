const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { authenticate } = require('./auth');
const { generateS1aReport } = require('../services/excelService');
const fs = require('fs');

router.get('/export-s1a', authenticate, async (req, res) => {
  try {
    const { month, year } = req.query;
    if (!month || !year) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tháng và năm (month, year)' });
    }

    const userId = req.user.id;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    // Lấy giao dịch trong tháng
    const startDate = new Date(`${year}-${month.padStart(2, '0')}-01`);
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + 1);

    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: {
          gte: startDate,
          lt: endDate
        }
      },
      orderBy: { date: 'asc' }
    });

    const filePath = await generateS1aReport(user, transactions, month, year);
    
    res.download(filePath, `S1a_${user.taxCode}_${month}_${year}.xlsx`, (err) => {
      if (err) {
        console.error('Lỗi khi tải file', err);
        res.status(500).send('Lỗi tải file');
      }
      // Tùy chọn: Xóa file sau khi tải xong để dọn dẹp
      // fs.unlinkSync(filePath); 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi kết xuất báo cáo' });
  }
});

module.exports = router;
