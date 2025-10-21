// 1. Importaciones (añadimos @sendgrid/mail)
const { Router } = require('express');
const { body, validationResult } = require('express-validator');
const { pool } = require('../db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const authMiddleware = require('../middleware/authMiddleware');
const sgMail = require('@sendgrid/mail'); // <-- NUEVO: Importar SendGrid

// Configurar la API Key de SendGrid
sgMail.setApiKey(process.env.SENDGRID_API_KEY); // <-- NUEVO

const router = Router();

// ===============================================
// ||         ENDPOINT DE REGISTRO (MODIFICADO) ||
// ===============================================
router.post(
    '/register',
    // ... (las validaciones no cambian) ...
    [
        body('nombre', 'El nombre es obligatorio').not().isEmpty().trim(),
        body('apellido', 'El apellido es obligatorio').not().isEmpty().trim(),
        body('correo_electronico', 'El correo electrónico no es válido').isEmail().normalizeEmail(),
        body('password', 'La contraseña debe tener al menos 8 caracteres, una mayúscula, una minúscula y un número')
            .isStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 0 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        try {
            const { nombre, apellido, correo_electronico, password } = req.body;

            const userExists = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);

            if (userExists.rows.length > 0) {
                return res.status(400).json({ message: 'El correo electrónico ya está registrado' });
            }

            // --- INICIAN CAMBIOS ---

            // 1. Generar código y expiración
            const codigo_verificacion = Math.floor(100000 + Math.random() * 900000).toString(); // Código de 6 dígitos
            const expiracion_codigo = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos de expiración

            // 2. Hashear la contraseña
            const salt = await bcrypt.genSalt(10);
            const password_hash = await bcrypt.hash(password, salt);

            // 3. Insertar usuario con el código (fíjate que email_verificado sigue en FALSE)
            await pool.query(
                'INSERT INTO usuarios (nombre, apellido, correo_electronico, password_hash, codigo_verificacion, expiracion_codigo) VALUES ($1, $2, $3, $4, $5, $6)',
                [nombre, apellido, correo_electronico, password_hash, codigo_verificacion, expiracion_codigo]
            );

            // 4. Preparar el correo electrónico
            const msg = {
                to: correo_electronico,
                from: process.env.SENDER_EMAIL, // Tu correo verificado en SendGrid
                subject: 'Código de Verificación - Tienda de Vinilos',
                html: `
                    <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px;">
                        <h2>¡Gracias por registrarte!</h2>
                        <p>Tu código de verificación es:</p>
                        <h1 style="font-size: 48px; letter-spacing: 10px; margin: 20px;">
                            ${codigo_verificacion}
                        </h1>
                        <p>Este código expirará en 10 minutos.</p>
                    </div>
                `,
            };

            // 5. Enviar el correo
            await sgMail.send(msg);

            // 6. Enviar respuesta al frontend
            res.status(201).json({
                message: 'Registro exitoso. Te hemos enviado un código de verificación a tu correo.'
            });

            // --- TERMINAN CAMBIOS ---

        } catch (error) {
            console.error("Error en /register:", error.message);
            res.status(500).send('Error en el servidor');
        }
    }
);

// ===============================================
// ||    NUEVO ENDPOINT: VERIFICAR CORREO     ||
// ===============================================
router.post(
    '/verify-email',
    [
        body('correo_electronico', 'El correo es requerido').isEmail().normalizeEmail(),
        body('codigo_verificacion', 'El código debe tener 6 dígitos').isLength({ min: 6, max: 6 })
    ],
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { correo_electronico, codigo_verificacion } = req.body;

        try {
            // 1. Buscar al usuario
            const result = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);
            const user = result.rows[0];

            if (!user) {
                return res.status(404).json({ message: 'Usuario no encontrado' });
            }

            // 2. Validar el código y la expiración
            if (user.email_verificado) {
                return res.status(400).json({ message: 'Este correo ya ha sido verificado' });
            }
            if (user.codigo_verificacion !== codigo_verificacion) {
                return res.status(400).json({ message: 'Código de verificación incorrecto' });
            }
            if (new Date() > new Date(user.expiracion_codigo)) {
                return res.status(400).json({ message: 'El código ha expirado. Solicita uno nuevo.' });
            }

            // 3. Si todo es correcto, actualizar al usuario
            await pool.query(
                'UPDATE usuarios SET email_verificado = TRUE, codigo_verificacion = NULL, expiracion_codigo = NULL WHERE id = $1',
                [user.id]
            );

            res.status(200).json({ message: 'Correo verificado exitosamente. Ya puedes iniciar sesión.' });

        } catch (error) {
            console.error("Error en /verify-email:", error.message);
            res.status(500).send('Error en el servidor');
        }
    }
);


// ===============================================
// ||           ENDPOINT DE LOGIN             ||
// ===============================================
router.post(
    '/login',
    // ... (validaciones de login) ...
    async (req, res) => {
        // ... (lógica de validación) ...
        const { correo_electronico, password } = req.body;

        try {
            const result = await pool.query('SELECT * FROM usuarios WHERE correo_electronico = $1', [correo_electronico]);
            const user = result.rows[0];

            if (!user) {
                return res.status(400).json({ message: 'Credenciales inválidas' });
            }

            // --- NUEVO CHECK DE VERIFICACIÓN ---
            if (!user.email_verificado) {
                return res.status(403).json({ message: 'Tu cuenta no ha sido verificada. Por favor, revisa tu correo.' });
            }
            // --- FIN DEL CHECK ---

            const isMatch = await bcrypt.compare(password, user.password_hash);

            if (!isMatch) {
                return res.status(400).json({ message: 'Credenciales inválidas' });
            }

            const payload = { user: { id: user.id } };

            jwt.sign(
                payload,
                process.env.JWT_SECRET,
                { expiresIn: '1h' },
                (err, token) => {
                    if (err) throw err;
                    res.json({ token });
                }
            );

        } catch (error) {
            console.error(error.message);
            res.status(500).send('Error en el servidor');
        }
    }
);


// ... (El resto de tus rutas, como /me) ...
router.get('/me', authMiddleware, async (req, res) => {
    // ... (sin cambios) ...
});

module.exports = router;