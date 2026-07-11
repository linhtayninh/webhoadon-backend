const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { authenticate } = require('./auth');

// Thêm giao dịch
router.post('/', authenticate, async (req, res) => {
  try {
    const { amount, description, date } = req.body;
    const transaction = await prisma.transaction.create({
      data: {
        userId: req.user.id,
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : new Date()
      }
    });
    res.status(201).json(transaction);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi thêm giao dịch' });
  }
});

// Lấy danh sách giao dịch
router.get('/', authenticate, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      orderBy: { date: 'desc' }
    });
    res.json(transactions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi lấy giao dịch' });
  }
});

// Xóa giao dịch
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    
    // Kiểm tra xem giao dịch có thuộc về user hiện tại không
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!transaction || transaction.userId !== req.user.id) {
      return res.status(404).json({ error: 'Không tìm thấy giao dịch hoặc không có quyền xóa' });
    }

    await prisma.transaction.delete({
      where: { id: parseInt(id) }
    });
    
    res.json({ message: 'Đã xóa giao dịch thành công' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi xóa giao dịch' });
  }
});

// Sửa giao dịch
router.put('/:id', authenticate, async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, date } = req.body;
    
    // Kiểm tra xem giao dịch có thuộc về user hiện tại không
    const transaction = await prisma.transaction.findUnique({
      where: { id: parseInt(id) }
    });
    
    if (!transaction || transaction.userId !== req.user.id) {
      return res.status(404).json({ error: 'Không tìm thấy giao dịch hoặc không có quyền sửa' });
    }

    const updated = await prisma.transaction.update({
      where: { id: parseInt(id) },
      data: {
        amount: parseFloat(amount),
        description,
        date: date ? new Date(date) : undefined
      }
    });
    
    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi sửa giao dịch' });
  }
});

// Lấy danh sách các diễn giải (description) đã dùng để gợi ý
router.get('/descriptions', authenticate, async (req, res) => {
  try {
    const transactions = await prisma.transaction.findMany({
      where: { userId: req.user.id },
      distinct: ['description'],
      select: { description: true },
      orderBy: { id: 'desc' } // Lấy những mô tả gần đây nhất
    });
    
    // Lọc ra danh sách string
    const descriptions = transactions
      .map(tx => tx.description)
      .filter(desc => desc && desc.trim().length > 0);
      
    res.json(descriptions);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi lấy gợi ý diễn giải' });
  }
});

// Thống kê doanh thu cho Dashboard
router.get('/dashboard', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    // Lấy doanh thu năm nay
    const currentYear = new Date().getFullYear();
    const startDate = new Date(`${currentYear}-01-01`);
    
    const transactions = await prisma.transaction.findMany({
      where: {
        userId,
        date: { gte: startDate }
      }
    });
    
    const totalRevenue = transactions.reduce((sum, tx) => sum + tx.amount, 0);
    const threshold = 1000000000; // 1 tỷ (luật mới)
    const percentage = Math.min((totalRevenue / threshold) * 100, 100);
    
    res.json({
      totalRevenue,
      threshold,
      percentage,
      isTaxable: totalRevenue >= threshold
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi khi lấy thống kê' });
  }
});

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const { GoogleGenAI } = require('@google/genai');

// Cấu hình AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

router.post('/scan-invoice', authenticate, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Vui lòng tải lên ảnh hóa đơn' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY' });

    // Tạo request cho Gemini AI
    const prompt = `Bạn là một trợ lý ảo kế toán chuyên bóc tách dữ liệu từ hóa đơn bán lẻ hoặc hóa đơn chuyển khoản.
Hãy trích xuất thông tin từ ảnh hóa đơn này và trả về ĐÚNG MỘT JSON OBJECT với cấu trúc sau (không có ký tự markdown, không có chữ thừa):
{
  "amount": (số nguyên, là tổng số tiền của hóa đơn, lọc bỏ chữ VNĐ hay dấu phẩy/chấm),
  "description": (chuỗi mô tả ngắn gọn nội dung mua bán hoặc chuyển khoản),
  "date": "YYYY-MM-DD" (nếu có ngày trên hóa đơn, format chuẩn. Nếu không có thì để rỗng)
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: req.file.mimetype,
                data: req.file.buffer.toString('base64')
              }
            }
          ]
        }
      ],
      config: {
        responseMimeType: 'application/json',
      }
    });

    const aiText = response.text;
    const aiData = JSON.parse(aiText);
    
    res.json(aiData);
  } catch (error) {
    console.error('AI Scan Error:', error);
    res.status(500).json({ error: 'Lỗi khi quét hóa đơn' });
  }
});

module.exports = router;
