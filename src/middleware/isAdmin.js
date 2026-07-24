module.exports = function isAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'No token' });

  const role = req.user.role;
  if (role !== 'admin' && role !== 'system_admin') {
    return res.status(403).json({ error: 'Access denied: admin only' });
  }
  next();
};