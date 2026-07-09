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
        businessType,
        isProfileCompleted: true
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
    if (!user) return res.status(400).json({ error: 'Email không tồn tại' });
    
    // Kiểm tra nếu tài khoản được đăng ký bằng Google (password là null)
    if (!user.password) {
      return res.status(400).json({ error: 'Tài khoản này được đăng ký bằng Google. Vui lòng sử dụng nút Đăng nhập bằng Google.' });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) return res.status(401).json({ error: 'Sai mật khẩu' });
    
    const token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '365d' });
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
    const { userId, taxCode, businessName, address, businessLocation, businessType, password } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Thiếu userId' });
    }

    const updateData = {
      taxCode,
      businessName,
      address,
      businessLocation,
      businessType,
      isProfileCompleted: true
    };

    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const user = await prisma.user.update({
      where: { id: parseInt(userId) },
      data: updateData
    });

    // Tạo JWT token sau khi cập nhật thành công
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '365d' }
    );

    res.json({ message: 'Cập nhật thông tin thành công', token, user });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server khi cập nhật thông tin' });
  }
});

// Cập nhật cài đặt tài khoản (Đổi thông tin + Đổi mật khẩu)
router.put('/settings', authenticate, async (req, res) => {
  try {
    const { taxCode, businessName, address, businessLocation, businessType, oldPassword, newPassword } = req.body;
    const userId = req.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return res.status(404).json({ error: 'Không tìm thấy người dùng' });

    const updateData = {
      taxCode,
      businessName,
      address,
      businessLocation,
      businessType
    };

    // Nếu người dùng muốn đổi mật khẩu
    if (newPassword) {
      if (user.password) {
        if (!oldPassword) {
          return res.status(400).json({ error: 'Vui lòng nhập mật khẩu cũ để đổi mật khẩu mới' });
        }
        const isValid = await bcrypt.compare(oldPassword, user.password);
        if (!isValid) return res.status(401).json({ error: 'Mật khẩu cũ không chính xác' });
      }
      // Nếu chưa có password (tạo mới) hoặc oldPassword đã đúng, thì mã hoá password mới
      updateData.password = await bcrypt.hash(newPassword, 10);
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    res.json({ message: 'Cập nhật thành công', user: { ...updatedUser, password: undefined } });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server khi cập nhật cài đặt' });
  }
});

// Quên mật khẩu (Xác thực bằng Email và Mã số thuế)
router.post('/reset-password-mst', async (req, res) => {
  try {
    const { email, taxCode, newPassword } = req.body;
    
    if (!email || !taxCode || !newPassword) {
      return res.status(400).json({ error: 'Vui lòng điền đầy đủ Email, Mã số thuế và Mật khẩu mới' });
    }

    // Tìm user theo email
    const user = await prisma.user.findUnique({ where: { email } });
    
    // So sánh mã số thuế
    if (!user || !user.taxCode || user.taxCode !== taxCode) {
      return res.status(401).json({ error: 'Email hoặc Mã số thuế không chính xác!' });
    }

    // Mã hóa mật khẩu mới
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Cập nhật vào DB
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Đặt lại mật khẩu thành công! Vui lòng đăng nhập lại.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Lỗi server khi đặt lại mật khẩu' });
  }
});

module.exports = router;
module.exports.authenticate = authenticate;
