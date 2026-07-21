import passport from '../config/passport.js';

const authenticateJWT = (req, res, next) => {
  passport.authenticate('jwt', { session: false }, (err, user, info) => {
    if (err) return next(err);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'No autenticado. Token ausente, inválido o expirado',
      });
    }

    req.user = user;
    next();
  })(req, res, next);
};

export default authenticateJWT;
