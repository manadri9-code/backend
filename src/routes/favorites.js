const { Router } = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// ===============================================
// ||   AÑADIR UN PRODUCTO A FAVORITOS       ||
// ===============================================
// POST /api/favorites/:id
// Ruta protegida, requiere un token válido.
router.post('/:id', authMiddleware, async (req, res) => {
    try {
        // El ID del producto viene de los parámetros de la URL
        const producto_id = req.params.id;
        // El ID del usuario lo obtenemos del token gracias al middleware
        const usuario_id = req.user.id;

        // Insertamos la relación en la tabla Favoritos
        const newFavorite = await pool.query(
            'INSERT INTO Favoritos (usuario_id, producto_id) VALUES ($1, $2) RETURNING *',
            [usuario_id, producto_id]
        );
        
        res.status(201).json({ 
            message: 'Producto añadido a favoritos exitosamente', 
            favorito: newFavorite.rows[0] 
        });

    } catch (error) {
        // Manejo de errores específico. El código '23505' en PostgreSQL significa
        // que se violó una restricción de unicidad (unique constraint).
        // En nuestra tabla, definimos que la pareja (usuario_id, producto_id) debe ser única.
        if (error.code === '23505') {
            return res.status(400).json({ message: 'Este producto ya está en tus favoritos' });
        }
        
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

// Podríamos añadir también una ruta para OBTENER los favoritos de un usuario
// GET /api/favorites/
router.get('/', authMiddleware, async(req, res) => {
    try {
        const usuario_id = req.user.id;
        const userFavorites = await pool.query(
            `SELECT p.* FROM Productos p 
             JOIN Favoritos f ON p.id = f.producto_id 
             WHERE f.usuario_id = $1`,
            [usuario_id]
        );
        res.json(userFavorites.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});


module.exports = router;