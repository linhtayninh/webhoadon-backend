const express = require('express');
const router = express.Router();
const prisma = require('../prismaClient');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware xác thực token
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

// Đăng ký
router.post('/register', async (req, res) => {
  try {
    const { email, password, taxCode, businessName, address, businessLocation, businessType } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) return res.status(400).json({ error: 'Email đã tồn tại' });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        taxCode,
        businessName,
        address,
        businessLocation,
        businessType
      }
    });
    res.status(201).json({ message: 'Đăng ký thành công', userId: user.id });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Đăng nhập
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Sai mật khẩu' });
    
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ message: 'Đăng nhập thành công', token, user: { id: user.id, email: user.email, name: user.businessName } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server' });
  }
});

router.get('/me', authenticate, async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (user) delete user.password;
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Lỗi server' });
  }
});

// Cập nhật thông tin profile (cho Google Login lần đầu)
router.post('/update-profile', async (req, res) => {
  try {
    const { userId, taxCode, businessName, address, businessLocation, businessType } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' });
    }

    const user = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: {
        taxCode,
        businessName,
        address,
        businessLocation,
        businessType,
        isProfileCompleted: true
      }
    });

    // Tạo JWT token sau khi cập nhật thành công
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '7d' }
    );

    res.json({ message: 'Cập nhật thông tin thành công', token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server khi cập nhật thông tin' });
  }
});

module.exports = router;
module.exports.authenticate = authenticate;
