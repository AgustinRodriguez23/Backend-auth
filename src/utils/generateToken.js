import jwt from 'jsonwebtoken';


export const generateToken = (user) => {
  const payload = {
    userId: user._id,
    role: user.role,
  };

  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });
};


export const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'Lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 60 * 60 * 1000, // 1 hora, en sincronía con JWT_EXPIRES_IN
});
