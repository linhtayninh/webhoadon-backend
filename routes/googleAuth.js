const express = require('express');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const prisma = require('../prismaClient');

const router = express.Router();
// Hardcode Client ID để tránh lỗi cấu hình biến môi trường trên Render
const CLIENT_ID = '831813172331-kba74cu26krjd7f9kkheb0isreprkh9m.apps.googleusercontent.com';
const client = new OAuth2Client(CLIENT_ID);

router.post('/', async (req, res) => {
  const { credential } = req.body;
  if (!credential) {
    return res.status(400).json({ error: 'No credential provided' });
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name, picture: avatarUrl } = payload;

    // Check if user exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      // LẦN ĐẦU: Chưa có tài khoản -> Tạo mới với thông tin cơ bản
      user = await prisma.user.create({
        data: {
          email,
          googleId,
          avatarUrl,
          businessName: name, // Temporarily use their Google Name
          isProfileCompleted: false
        },
      });

      return res.json({ 
        status: 'profile_incomplete', 
        userId: user.id,
        message: 'Vui lòng cập nhật thêm thông tin để hoàn tất.' 
      });
    }

    if (!user.googleId) {
      // Link Google account to existing email
      user = await prisma.user.update({
        where: { email },
        data: {
          googleId,
          avatarUrl,
        },
      });
    }

    if (user && user.isProfileCompleted === false) {
      // Đã đăng nhập nhưng chưa hoàn thành profile
      return res.json({ status: 'profile_incomplete', userId: user.id });
    }

    // LẦN SAU: Đã có tài khoản + đã điền đủ thông tin -> Cho vào luôn
    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET || 'secretkey',
      { expiresIn: '7d' }
    );

    res.json({ status: 'success', message: 'Login successful', token, user });
  } catch (error) {
    console.error('Error in Google Auth:', error);
    res.status(401).json({ error: 'Lỗi chi tiết: ' + error.message });
  }
});

module.exports = router;
