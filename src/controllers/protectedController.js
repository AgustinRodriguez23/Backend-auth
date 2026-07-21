
export const getProfile = (req, res) => {
  return res.status(200).json({
    success: true,
    message: 'Perfil obtenido correctamente',
    user: req.user, 
  });
};


export const getAdminData = (req, res) => {
  return res.status(200).json({
    success: true,
    message: `Bienvenido admin ${req.user.firstName}, acceso concedido a datos restringidos`,
  });
};
