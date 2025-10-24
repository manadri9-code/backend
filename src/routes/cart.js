const { Router } = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// ===============================================
// ||     OBTENER TODOS LOS ITEMS DEL CARRITO     ||
// ===============================================
// GET /api/cart/
router.get('/', authMiddleware, async(req, res) => {
    try {
        const usuario_id = req.user.id;
        // Obtenemos los productos completos que están en el carrito
        const userCart = await pool.query(
            `SELECT p.* FROM Productos p 
             JOIN CarritoCompra c ON p.id = c.producto_id 
             WHERE c.usuario_id = $1`,
            [usuario_id]
        );
        res.json(userCart.rows);
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

// ===============================================
// ||      AÑADIR UN PRODUCTO AL CARRITO        ||
// ===============================================
// POST /api/cart/:id
router.post('/:id', authMiddleware, async (req, res) => {
    try {
        const producto_id = req.params.id;
        const usuario_id = req.user.id;

        // Verificamos si ya está en el carrito para evitar duplicados
        // (Esta es la lógica de "toggle", un producto solo puede estar una vez)
        const itemExists = await pool.query(
            'SELECT * FROM CarritoCompra WHERE usuario_id = $1 AND producto_id = $2',
            [usuario_id, producto_id]
        );

        if (itemExists.rows.length > 0) {
            return res.status(400).json({ message: 'Este producto ya está en tu carrito' });
        }

        // Añadimos el producto con cantidad 1 (por defecto)
        const newItem = await pool.query(
            'INSERT INTO CarritoCompra (usuario_id, producto_id, cantidad) VALUES ($1, $2, 1) RETURNING *',
            [usuario_id, producto_id]
        );

        res.status(201).json({ 
            message: 'Producto agregado al carrito correctamente', 
            item: newItem.rows[0] 
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

// ===============================================
// ||     ELIMINAR UN PRODUCTO DEL CARRITO      ||
// ===============================================
// DELETE /api/cart/:id
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const producto_id = req.params.id;
        const usuario_id = req.user.id;

        const result = await pool.query(
            'DELETE FROM CarritoCompra WHERE usuario_id = $1 AND producto_id = $2 RETURNING *',
            [usuario_id, producto_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Este producto no estaba en tu carrito.' });
        }

        res.status(200).json({ 
            message: 'Producto eliminado del carrito'
        });

    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

module.exports = router;