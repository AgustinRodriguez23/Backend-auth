
export const getSession = (req, res) => {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({
      success: false,
      message: 'No hay una sesión activa',
    });
  }

  return res.status(200).json({
    success: true,
    session: {
      id: req.sessionID,
      userId: req.session.userId,
      email: req.session.email,
      role: req.session.role,
      cookie: {
        expires: req.session.cookie.expires,
        maxAge: req.session.cookie.maxAge,
      },
    },
  });
};
