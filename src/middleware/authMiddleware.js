const jwt = require('jsonwebtoken');
require('dotenv').config();

// El middleware es una función que tiene 3 parámetros: req, res, y next.
module.exports = function(req, res, next) {
    // 1. Obtener el token del header de la petición
    const token = req.header('x-auth-token');

    // 2. Comprobar si no hay token
    if (!token) {
        return res.status(401).json({ message: 'No hay token, permiso denegado' });
    }

    // 3. Verificar el token si existe
    try {
        // jwt.verify() decodifica el token. Si es válido, nos devuelve el "payload"
        // que nosotros mismos creamos al hacer login (recuerdas? { user: { id: ... } }).
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. Añadir el usuario del payload a la petición (req)
        // Esto es muy útil, porque ahora todas las rutas que usen este middleware
        // tendrán acceso al ID del usuario en req.user.
        req.user = decoded.user;
        
        // 5. Llamar a next() para que la ejecución continúe hacia la ruta protegida.
        next();

    } catch (error) {
        res.status(401).json({ message: 'El token no es válido' });
    }
};