const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const { authenticate } = require('./auth');

// Middleware kiểm tra quyền ADMIN
const isAdmin = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user || user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Truy cập bị từ chối. Chỉ dành cho Admin.' });
    }
    next();
  } catch (error) {
    res.status(500).json({ error: 'Lỗi xác thực quyền' });
  }
};

// Sử dụng cả authenticate và isAdmin cho tất cả các route trong file này
router.use(authenticate, isAdmin);

// 1. Lấy danh sách tất cả User kèm thống kê
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        role: true,
        businessName: true,
        createdAt: true,
        _count: {
          select: { transactions: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi lấy danh sách user' });
  }
});

// 2. Lấy thông tin chi tiết 1 User
router.get('/users/:id', async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: parseInt(req.params.id) },
      include: { transactions: { orderBy: { date: 'desc' } } }
    });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy user' });
    delete user.password;
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi lấy thông tin user' });
  }
});

// 3. Thêm User mới
router.post('/users', async (req, res) => {
  try {
    const { email, password, role, businessName } = req.body;
    
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(400).json({ error: 'Email đã tồn tại' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        role: role || 'USER',
        businessName
      }
    });
    
    res.status(201).json({ message: 'Tạo tài khoản thành công', user: { id: newUser.id, email: newUser.email } });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi tạo user' });
  }
});

// 4. Sửa User (đổi quyền, đổi mật khẩu)
router.put('/users/:id', async (req, res) => {
  try {
    const { role, password, businessName } = req.body;
    const updateData = {};
    if (role) updateData.role = role;
    if (businessName !== undefined) updateData.businessName = businessName;
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    
    const updated = await prisma.user.update({
      where: { id: parseInt(req.params.id) },
      data: updateData
    });
    
    res.json({ message: 'Cập nhật thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi cập nhật user' });
  }
});

// 5. Xóa User
router.delete('/users/:id', async (req, res) => {
  try {
    const userId = parseInt(req.params.id);
    // Xóa các giao dịch của user trước
    await prisma.transaction.deleteMany({ where: { userId } });
    // Xóa user
    await prisma.user.delete({ where: { id: userId } });
    res.json({ message: 'Xóa user thành công' });
  } catch (error) {
    res.status(500).json({ error: 'Lỗi xóa user' });
  }
});

// 6. Sao lưu (Backup) toàn bộ Database (Trả về file JSON)
router.get('/backup', async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    const transactions = await prisma.transaction.findMany();
    const ads = await prisma.advertisement.findMany();
    
    const backupData = {
      timestamp: new Date().toISOString(),
      users,
      transactions,
      ads
    };
    
    // Gửi dưới dạng file download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=backup_${new Date().getTime()}.json`);
    res.send(JSON.stringify(backupData, null, 2));
  } catch (error) {
    res.status(500).json({ error: 'Lỗi sao lưu dữ liệu' });
  }
});

module.exports = { router, isAdmin };
