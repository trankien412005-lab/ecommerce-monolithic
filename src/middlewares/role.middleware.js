export function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        message: "Bạn cần đăng nhập",
      });
    }

    if (!allowedRoles.includes(req.user.role.rolename)) {
      return res.status(403).json({
        message: "Bạn không có quyền thực hiện chức năng này",
      });
    }

    return next();
  };
}
