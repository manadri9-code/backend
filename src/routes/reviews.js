const { Router } = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/authMiddleware');
const { body, validationResult } = require('express-validator');

const router = Router();

// ===============================================
// ||         AÑADIR UNA NUEVA RESEÑA         ||
// ===============================================
// POST /api/reviews
router.post(
    '/',
    authMiddleware, // Protegido
    [ // Validaciones
        body('producto_id', 'Se requiere un ID de producto').isInt(),
        body('puntuacion', 'La puntuacion debe ser entre 1 y 5').isInt({ min: 1, max: 5 }),
        body('comentario', 'El comentario no puede estar vacío').not().isEmpty().trim()
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { producto_id, puntuacion, comentario } = req.body;
        const usuario_id = req.user.id;

        try {
            const newReview = await pool.query(
                'INSERT INTO Calificaciones (usuario_id, producto_id, puntuacion, comentario) VALUES ($1, $2, $3, $4) RETURNING *',
                [usuario_id, producto_id, puntuacion, comentario]
            );
            res.status(201).json(newReview.rows[0]);
        } catch (error) {
            if (error.code === '23505') { // Error de 'unique_violation'
                return res.status(400).json({ message: 'Ya has calificado este producto' });
            }
            console.error(error.message);
            res.status(500).send('Error en el servidor');
        }
    }
);

// ===============================================
// ||        ELIMINAR TU PROPIA RESEÑA        ||
// ===============================================
// DELETE /api/reviews/:review_id
router.delete('/:review_id', authMiddleware, async (req, res) => {
    const { review_id } = req.params;
    const usuario_id = req.user.id;

    try {
        // Solo borra si el ID de la reseña Y el ID del usuario coinciden
        const result = await pool.query(
            'DELETE FROM Calificaciones WHERE id = $1 AND usuario_id = $2 RETURNING *',
            [review_id, usuario_id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Reseña no encontrada o no tienes permiso para eliminarla' });
        }
        res.status(200).json({ message: 'Reseña eliminada correctamente' });
    } catch (error) {
        console.error(error.message);
        res.status(500).send('Error en el servidor');
    }
});

module.exports = router;