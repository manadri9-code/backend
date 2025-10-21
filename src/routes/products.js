const { Router } = require('express');
const { pool } = require('../db');

const router = Router();

// ===============================================
// ||      OBTENER TODOS LOS PRODUCTOS        ||
// ===============================================
// GET /api/products/
// Ruta pública
router.get('/', async (req, res) => {
    try {
        // Hacemos una consulta para obtener todos los productos y su calificación promedio.
        // LEFT JOIN se usa para incluir productos que quizás aún no tengan calificaciones.
        // COALESCE(AVG(c.puntuacion), 0) calcula el promedio o devuelve 0 si no hay calificaciones.
        // ROUND(..., 1) redondea el promedio a 1 decimal.
        const result = await pool.query(`
            SELECT 
                p.id, 
                p.nombre, 
                p.descripcion, 
                p.precio, 
                p.imagen_url,
                ROUND(COALESCE(AVG(c.puntuacion), 0), 1) as calificacion_promedio
            FROM 
                Productos p
            LEFT JOIN 
                Calificaciones c ON p.id = c.producto_id
            GROUP BY 
                p.id
            ORDER BY
                p.id;
        `);

        res.json(result.rows);

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

// ===============================================
// ||     OBTENER UN PRODUCTO POR SU ID       ||
// ===============================================
// GET /api/products/:id
// Ruta pública
// :id es un "parámetro de ruta". Express capturará el valor y lo pondrá en req.params.id
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params; // Extraemos el ID de la URL

        // Consulta para el producto específico
        const productResult = await pool.query(`
            SELECT 
                p.*,
                ROUND(COALESCE(AVG(c.puntuacion), 0), 1) as calificacion_promedio
            FROM 
                Productos p
            LEFT JOIN 
                Calificaciones c ON p.id = c.producto_id
            WHERE 
                p.id = $1
            GROUP BY 
                p.id;
        `, [id]);

        // Si no encontramos un producto con ese ID, devolvemos un error 404
        if (productResult.rows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        // Adicionalmente, podríamos obtener todas las calificaciones/comentarios para ese producto
        const reviewsResult = await pool.query(
            'SELECT c.puntuacion, c.comentario, u.nombre FROM Calificaciones c JOIN Usuarios u ON c.usuario_id = u.id WHERE c.producto_id = $1',
            [id]
        );

        // Combinamos la información y la enviamos
        const productData = {
            ...productResult.rows[0],
            resenas: reviewsResult.rows
        };

        res.json(productData);

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});


module.exports = router;