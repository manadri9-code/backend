// Importamos la librería 'pg' y específicamente la clase Pool
const { Pool } = require('pg');

// Importamos dotenv para poder usar las variables de entorno
require('dotenv').config();

// Creamos una nueva instancia de Pool.
// El Pool es la forma recomendada de conectar con la base de datos en una aplicación real.
// Gestiona un "grupo" de conexiones para que no tengas que abrir y cerrar una
// conexión por cada consulta, lo cual es muy eficiente.
const pool = new Pool({
    // La librería 'pg' automáticamente buscará la variable de entorno DATABASE_URL
    // si no le pasamos los datos de conexión explícitamente.
    connectionString: process.env.DATABASE_URL,
    // Si tu base de datos en Render requiere SSL (casi todas lo hacen),
    // necesitas añadir esta configuración.
    ssl: {
        rejectUnauthorized: false
    }
});

// Creamos una función simple para probar la conexión
const testConnection = async () => {
    try {
        const client = await pool.connect();
        console.log('✅ Conexión exitosa a la base de datos');
        client.release(); // Devolvemos el cliente al pool
    } catch (error) {
        console.error('❌ Error al conectar con la base de datos:', error.message);
    }
};

// Exportamos el pool y la función de prueba para poder usarlos en otros archivos
module.exports = {
    pool,
    testConnection
};