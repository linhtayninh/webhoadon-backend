const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const { authenticate } = require('./auth');
// Lấy middleware isAdmin từ file admin.js
const { isAdmin } = require('./admin'); 

// 1. PUBLIC: Lấy danh sách quảng cáo đang hoạt động để hiển thị ở frontend
router.get('/active', async (req, res) => {
  try {
    const ads = await prisma.advertisement.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    });
    res.json(ads);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi lấy quảng cáo' });
  }
});

// 2. ADMIN: Lấy tất cả quảng cáo (cả tắt và bật)
router.get('/', authenticate, isAdmin, async (req, res) => {
  try {
    const ads = await prisma.advertisement.findMany({
      orderBy: { createdAt: 'desc' }
    });
    res.json(ads);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi lấy danh sách quảng cáo' });
  }
});

// 3. ADMIN: Thêm quảng cáo mới
router.post('/', authenticate, isAdmin, async (req, res) => {
  try {
    const { imageUrl, link, isActive } = req.body;
    if (!imageUrl) return res.status(400).json({ error: 'Thiếu đường dẫn ảnh' });
    
    const ad = await prisma.advertisement.create({
      data: {
        imageUrl,
        link,
        isActive: isActive !== undefined ? isActive : true
      }
    });
    res.status(201).json(ad);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi thêm quảng cáo' });
  }
});

// 4. ADMIN: Cập nhật quảng cáo
router.put('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    const { imageUrl, link, isActive } = req.body;
    const ad = await prisma.advertisement.update({
      where: { id: parseInt(req.params.id) },
      data: {
        imageUrl,
        link,
        isActive
      }
    });
    res.json(ad);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật quảng cáo' });
  }
});

// 5. ADMIN: Xóa quảng cáo
router.delete('/:id', authenticate, isAdmin, async (req, res) => {
  try {
    await prisma.advertisement.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ message: 'Xóa quảng cáo thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi xóa quảng cáo' });
  }
});

module.exports = router;
