import User from '../models/User.js';
import passport from '../config/passport.js';
import { generateToken, cookieOptions } from '../utils/generateToken.js';

export const register = async (req, res, next) => {
  try {
    const { firstName, lastName, email, password } = req.body;

    if (!firstName || !lastName || !email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Todos los campos son obligatorios',
      });
    }


    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un usuario registrado con ese email',
      });
    }

    
    const newUser = new User({ firstName, lastName, email, password });
    await newUser.save();

    return res.status(201).json({
      success: true,
      message: 'Usuario registrado correctamente',
      user: newUser,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Ya existe un usuario registrado con ese email',
      });
    }

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map((e) => e.message);
      return res.status(400).json({
        success: false,
        message: messages.join(', '),
      });
    }

    next(error);
  }
};

export const login = (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: info?.message || 'Credenciales inválidas',
      });
    }

    const token = generateToken(user);

    res.cookie('authToken', token, cookieOptions());

    req.session.userId = user._id.toString();
    req.session.role = user.role;
    req.session.email = user.email;

    return res.status(200).json({
      success: true,
      message: 'Login exitoso',
      token,
      user,
    });
  })(req, res, next);
};

export const githubCallback = (req, res) => {
  const token = generateToken(req.user);

  res.cookie('authToken', token, cookieOptions());

  req.session.userId = req.user._id.toString();
  req.session.role = req.user.role;
  req.session.email = req.user.email;

  return res.status(200).json({
    success: true,
    message: 'Login con GitHub exitoso',
    token,
    user: req.user,
  });
};

export const logout = (req, res, next) => {
  res.clearCookie('authToken', cookieOptions());

  if (!req.session) {
    return res.status(200).json({ success: true, message: 'Sesión cerrada correctamente' });
  }

  req.session.destroy((err) => {
    if (err) return next(err);

    res.clearCookie('sessionId');

    return res.status(200).json({
      success: true,
      message: 'Sesión cerrada correctamente',
    });
  });
};
