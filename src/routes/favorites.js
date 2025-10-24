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

router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const producto_id = req.params.id;
        const usuario_id = req.user.id;

        // Intentamos eliminar la fila
        const result = await pool.query(
            'DELETE FROM Favoritos WHERE usuario_id = $1 AND producto_id = $2 RETURNING *',
            [usuario_id, producto_id]
        );

        // Si result.rows.length es 0, significa que no se borró nada
        // (probablemente porque no existía en primer lugar)
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Este producto no estaba en tus favoritos.' });
        }

        res.status(200).json({ 
            message: 'Producto eliminado de favoritos exitosamente'
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

module.exports = router;