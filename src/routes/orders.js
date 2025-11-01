const { Router } = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');

const router = Router();

// ===============================================
// ||    OBTENER MIS ÓRDENES (CON SIMULACIÓN)   ||
// ===============================================
// GET /api/orders/my-orders
router.get('/my-orders', authMiddleware, async (req, res) => {
    const usuario_id = req.user.id;
    const client = await pool.connect();

    try {
        // --- INICIA LA SIMULACIÓN DE CRON JOB ---
        // 1. Simula la "Entrega"
        await client.query(
            `UPDATE Ordenes SET 
                estado = 'Entregado', 
                fecha_recibido = (fecha_orden + interval '1 day') 
             WHERE estado = 'Procesando' 
               AND (NOW() - fecha_orden > interval '1 day') 
               AND usuario_id = $1`,
            [usuario_id]
        );

        // 2. Simula la "Cancelación" (si tuvieras un estado "en proceso")
        // (Tu petición indica que la cancelación es instantánea, así que esto no es necesario)

        // 3. Simula la "Devolución"
        await client.query(
            `UPDATE Ordenes SET 
                estado = 'Devuelto' 
             WHERE estado = 'Devolución en proceso' 
               AND (NOW() - fecha_accion > interval '1 day') 
               AND usuario_id = $1`,
            [usuario_id]
        );
        // --- FIN DE LA SIMULACIÓN ---

        // Ahora, simplemente seleccionamos todas las órdenes actualizadas
        const allOrders = await client.query(
            'SELECT * FROM Ordenes WHERE usuario_id = $1 ORDER BY fecha_orden DESC',
            [usuario_id]
        );

        res.json(allOrders.rows);

    } catch (error) {
        console.error("Error en /my-orders:", error.message);
        res.status(500).send('Error en el servidor');
    } finally {
        client.release();
    }
});

// ===============================================
// ||      CANCELAR UNA ORDEN (Y RESTOCKEAR)    ||
// ===============================================
// PUT /api/orders/:id/cancel
router.put('/:id/cancel', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const usuario_id = req.user.id;
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Inicia transacción

        // 1. Verificar que la orden es cancelable
        const orderResult = await client.query(
            'SELECT * FROM Ordenes WHERE id = $1 AND usuario_id = $2',
            [id, usuario_id]
        );
        if (orderResult.rows.length === 0) {
            return res.status(404).json({ message: 'Orden no encontrada' });
        }
        if (orderResult.rows[0].estado !== 'Procesando') {
            return res.status(400).json({ message: 'Esta orden ya no puede ser cancelada' });
        }

        // 2. Actualizar el estado de la orden
        await client.query(
            "UPDATE Ordenes SET estado = 'Cancelada', fecha_accion = NOW() WHERE id = $1",
            [id]
        );

        // 3. Obtener los detalles para re-stockear
        const detailsResult = await client.query(
            'SELECT producto_id, cantidad FROM OrdenDetalles WHERE orden_id = $1',
            [id]
        );

        // 4. Devolver los productos al stock (Restock)
        for (const item of detailsResult.rows) {
            await client.query(
                'UPDATE Productos SET stock = stock + $1 WHERE id = $2',
                [item.cantidad, item.producto_id]
            );
        }

        await client.query('COMMIT'); // Confirma la transacción
        res.status(200).json({ message: 'Orden cancelada y productos devueltos al stock' });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error al cancelar orden:", error.message);
        res.status(500).send('Error en el servidor');
    } finally {
        client.release();
    }
});

// ===============================================
// ||       INICIAR UNA DEVOLUCIÓN           ||
// ===============================================
// PUT /api/orders/:id/return
router.put('/:id/return', authMiddleware, async (req, res) => {
    const { id } = req.params;
    const usuario_id = req.user.id;

    try {
        const result = await pool.query(
            `UPDATE Ordenes SET 
                estado = 'Devolución en proceso', 
                fecha_accion = NOW() 
             WHERE id = $1 AND usuario_id = $2 AND estado = 'Entregado'`,
            [id, usuario_id]
        );

        if (result.rowCount === 0) {
            return res.status(400).json({ message: 'No se puede iniciar la devolución para esta orden' });
        }
        res.status(200).json({ message: 'Proceso de devolución iniciado' });
    } catch (error) {
        console.error("Error al iniciar devolución:", error.message);
        res.status(500).send('Error en el servidor');
    }
});

// ===============================================
// ||         CREAR UNA NUEVA ORDEN           ||
// ===============================================
// POST /api/orders
router.post('/', authMiddleware, async (req, res) => {
    const usuario_id = req.user.id;
    // const { paymentMethodId } = req.body; // Aquí recibiríamos el token de pago real

    // Iniciar una transacción
    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // Inicia la transacción

        // 1. Obtener el carrito del usuario
        const cartResult = await client.query(
            'SELECT producto_id, cantidad FROM CarritoCompra WHERE usuario_id = $1',
            [usuario_id]
        );
        const cartItems = cartResult.rows;

        if (cartItems.length === 0) {
            return res.status(400).json({ message: 'Tu carrito está vacío' });
        }

        // 2. Verificar stock y calcular el total
        let total_orden = 0;
        for (const item of cartItems) {
            // "FOR UPDATE" bloquea la fila del producto para que nadie más lo compre
            const productResult = await client.query(
                'SELECT nombre, precio, stock FROM Productos WHERE id = $1 FOR UPDATE',
                [item.producto_id]
            );
            const product = productResult.rows[0];

            if (item.cantidad > product.stock) {
                // Si no hay stock, deshacer todo
                await client.query('ROLLBACK');
                return res.status(400).json({
                    message: `Stock insuficiente para ${product.nombre}. Solo quedan ${product.stock} unidades.`
                });
            }
            total_orden += parseFloat(product.precio) * item.cantidad;
        }

        // 3. Crear la Orden
        const orderResult = await client.query(
            `INSERT INTO Ordenes (usuario_id, total_orden, estado, direccion_envio)
             VALUES ($1, $2, 'Procesando', 'Dirección de prueba')
             RETURNING id, fecha_orden`,
            [usuario_id, total_orden.toFixed(2)]
        );
        const newOrder = orderResult.rows[0];

        // 4. Mover items del carrito a OrdenDetalles y Actualizar Stock
        let orderDetails = [];
        for (const item of cartItems) {
            const product = (await client.query('SELECT precio FROM Productos WHERE id = $1', [item.producto_id])).rows[0];

            // Insertar en OrdenDetalles
            const detailResult = await client.query(
                `INSERT INTO OrdenDetalles (orden_id, producto_id, cantidad, precio_unitario)
                 VALUES ($1, $2, $3, $4) RETURNING *`,
                [newOrder.id, item.producto_id, item.cantidad, product.precio]
            );
            orderDetails.push(detailResult.rows[0]);

            // Disminuir stock
            await client.query(
                'UPDATE Productos SET stock = stock - $1 WHERE id = $2',
                [item.cantidad, item.producto_id]
            );
        }

        // 5. Vaciar el carrito del usuario
        await client.query('DELETE FROM CarritoCompra WHERE usuario_id = $1', [usuario_id]);

        const userEmail = (await client.query('SELECT correo_electronico FROM Usuarios WHERE id = $1', [usuario_id])).rows[0].correo_electronico;

        // Enviar la respuesta al frontend INMEDIATAMENTE
        res.status(201).json({
            message: 'Compra finalizada con éxito',
            order: newOrder,
            details: orderDetails // Devolvemos los detalles con nombres/imágenes
        });

        // --- 4. ENVIAR CORREO (Después de responder al usuario) ---
        await client.query('COMMIT'); // Commit final

        // Esta función se ejecuta "en segundo plano"
        await sendOrderConfirmationEmail(userEmail, newOrder, orderDetails);
        res.status(201).json({
            message: 'Compra finalizada con éxito',
            order: newOrder,
            details: orderDetails
        });

    } catch (error) {
        // Si algo falló, deshacer todo
        await client.query('ROLLBACK');
        console.error("Error al procesar la orden:", error.message);
        res.status(500).send('Error en el servidor al procesar la orden');
    } finally {
        // Siempre liberar el cliente
        client.release();
    }
});
// --- 5. NUEVA FUNCIÓN HELPER: CONSTRUIR Y ENVIAR EL CORREO ---
const sendOrderConfirmationEmail = async (userEmail, order, details) => {
    const itemsHtml = details.map(item => `
        <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px;">
                <img src="${item.imagen_url || ''}" alt="${item.nombre}" width="60" style="vertical-align: middle; margin-right: 10px;">
                ${item.nombre}
            </td>
            <td style="padding: 10px; text-align: center;">${item.cantidad}</td>
            <td style="padding: 10px; text-align: right;">$${item.precio_unitario}</td>
            <td style="padding: 10px; text-align: right;">$${(item.precio_unitario * item.cantidad).toFixed(2)}</td>
        </tr>
    `).join('');

    const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; border: 1px solid #eee; padding: 20px;">
            <h1 style="text-align: center;">Nota de Compra</h1>
            <p>¡Gracias por tu compra!</p>
            <p><strong>Orden ID:</strong> ${order.id}</p>
            <p><strong>Fecha:</strong> ${new Date(order.fecha_orden).toLocaleDateString('es-MX')}</p>

            <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                <thead style="background-color: #f9f9f9;">
                    <tr>
                        <th style="padding: 10px; text-align: left;">Producto</th>
                        <th style="padding: 10px; text-align: center;">Cantidad</th>
                        <th style="padding: 10px; text-align: right;">P. Unitario</th>
                        <th style="padding: 10px; text-align: right;">Total</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
            </table>

            <h2 style="text-align: right; margin-top: 20px;">TOTAL: $${order.total_orden}</h2>
        </div>
    `;

    const msg = {
        to: userEmail,
        from: process.env.SENDER_EMAIL,
        subject: `Confirmación de tu orden #${order.id}`,
        html: emailHtml,
    };

    try {
        await sgMail.send(msg);
        console.log(`Correo de orden #${order.id} enviado a ${userEmail}`);
    } catch (error) {
        console.error('Error al enviar correo de confirmación:', error.message);
    }
};
module.exports = router;