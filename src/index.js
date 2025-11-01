// 1. Importaciones
const express = require('express');
const cors = require('cors');
const { testConnection } = require('./db');
const authRoutes = require('./routes/auth'); // <-- Importa el archivo de rutas
const productRoutes = require('./routes/products');
const favoriteRoutes = require('./routes/favorites');
const cartRoutes = require('./routes/cart');
const reviewRoutes = require('./routes/reviews'); 
const orderRoutes = require('./routes/orders');
// 2. Creación de la app
const app = express();
const PORT = 3000;

// 3. Middlewares
// Este middleware es ESENCIAL para que Express entienda el JSON que le envía el cliente
app.use(cors());
app.use(express.json());

// 4. Probar la conexión a la BD
testConnection();

// 5. Rutas
app.get('/', (req, res) => {
    res.json({ message: "¡Mi API de e-commerce funciona!" });
});

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes); // <-- Usa el router importado
app.use('/api/favorites', favoriteRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/orders', orderRoutes);
// 6. Iniciar el servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});