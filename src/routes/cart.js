const { Router } = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// GET /api/cart/ (Obtener carrito)
// Ahora devuelve también la cantidad de cada item
router.get('/', authMiddleware, async (req, res) => {
    try {
        const usuario_id = req.user.id;
        const userCart = await pool.query(
            `SELECT p.*, c.cantidad, c.id AS cart_item_id 
             FROM Productos p 
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

// POST /api/cart/ (Añadir o actualizar item)
// Ya no usamos /:id. El ID va en el body.
router.post('/', authMiddleware, async (req, res) => {
    const { producto_id, cantidad } = req.body;
    const usuario_id = req.user.id;

    if (cantidad <= 0) {
        return res.status(400).json({ message: 'La cantidad debe ser al menos 1' });
    }

    try {
        // 1. Verificar el stock disponible
        const stockResult = await pool.query('SELECT stock FROM Productos WHERE id = $1', [producto_id]);
        if (stockResult.rows.length === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }
        const stock = stockResult.rows[0].stock;

        // 2. Validar que la cantidad deseada no supere el stock
        if (cantidad > stock) {
            return res.status(400).json({ message: `No se pueden agregar ${cantidad} items, solo quedan ${stock} disponibles` });
        }

        // 3. Insertar o Actualizar el item en el carrito
        // Gracias a la restricción UNIQUE que pusimos, podemos usar ON CONFLICT
        const newItem = await pool.query(
            `INSERT INTO CarritoCompra (usuario_id, producto_id, cantidad) 
             VALUES ($1, $2, $3)
             ON CONFLICT (usuario_id, producto_id) 
             DO UPDATE SET cantidad = $3
             RETURNING *`,
            [usuario_id, producto_id, cantidad]
        );

        res.status(201).json({
            message: 'Producto actualizado en el carrito',
            item: newItem.rows[0]
        });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

// DELETE /api/cart/:product_id (Eliminar item)
// Funciona igual que antes, ¡perfecto!
router.delete('/:product_id', authMiddleware, async (req, res) => {
    try {
        const { product_id } = req.params;
        const usuario_id = req.user.id;

        const result = await pool.query(
            'DELETE FROM CarritoCompra WHERE usuario_id = $1 AND producto_id = $2 RETURNING *',
            [usuario_id, product_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Este producto no estaba en tu carrito.' });
        }
        res.status(200).json({ message: 'Producto eliminado del carrito' });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

module.exports = router;