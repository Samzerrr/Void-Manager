// ==========================================
// Database Module — MySQL Connection & CRUD
// ==========================================

const mysql = require('mysql2/promise');

let pool = null;

/**
 * Initialize the MySQL connection pool and create tables if needed.
 */
async function initDatabase(config) {
    pool = mysql.createPool({
        host: config.DB_HOST,
        user: config.DB_USER,
        password: config.DB_PASSWORD,
        database: config.DB_NAME,
        port: config.DB_PORT || 3306,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0,
        charset: 'utf8mb4',
    });

    // Test connection
    try {
        const conn = await pool.getConnection();
        console.log('  ✅ Connexion MySQL établie');
        conn.release();
    } catch (err) {
        console.error('  ❌ Erreur de connexion MySQL:', err.message);
        throw err;
    }

    // Create table if it doesn't exist
    await pool.execute(`
        CREATE TABLE IF NOT EXISTS refus (
            id INT AUTO_INCREMENT PRIMARY KEY,
            discord_id VARCHAR(20) NOT NULL,
            pseudo VARCHAR(100) NOT NULL,
            reason TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_discord_id (discord_id),
            INDEX idx_pseudo (pseudo),
            INDEX idx_created_at (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('  📋 Table "refus" prête');
}

/**
 * Get all refus entries, optionally filtered by search query.
 */
async function getAllRefus(query = '', sortOrder = 'newest') {
    const order = sortOrder === 'oldest' ? 'ASC' : 'DESC';

    if (query) {
        const search = `%${query}%`;
        const [rows] = await pool.execute(
            `SELECT id, discord_id, pseudo, reason, created_at, updated_at
             FROM refus
             WHERE discord_id LIKE ? OR pseudo LIKE ? OR reason LIKE ?
             ORDER BY created_at ${order}`,
            [search, search, search]
        );
        return rows;
    }

    const [rows] = await pool.execute(
        `SELECT id, discord_id, pseudo, reason, created_at, updated_at
         FROM refus
         ORDER BY created_at ${order}`
    );
    return rows;
}

/**
 * Get stats: total entries + entries created today.
 */
async function getStats() {
    const [totalRows] = await pool.execute('SELECT COUNT(*) as total FROM refus');
    const [todayRows] = await pool.execute(
        'SELECT COUNT(*) as today FROM refus WHERE DATE(created_at) = CURDATE()'
    );
    return {
        total: totalRows[0].total,
        today: todayRows[0].today,
    };
}

/**
 * Add a new refus entry.
 */
async function addRefus(discordId, pseudo, reason) {
    const [result] = await pool.execute(
        'INSERT INTO refus (discord_id, pseudo, reason) VALUES (?, ?, ?)',
        [discordId, pseudo, reason]
    );
    // Return the newly created entry
    const [rows] = await pool.execute('SELECT * FROM refus WHERE id = ?', [result.insertId]);
    return rows[0];
}

/**
 * Update an existing refus entry.
 */
async function updateRefus(id, discordId, pseudo, reason) {
    const [result] = await pool.execute(
        'UPDATE refus SET discord_id = ?, pseudo = ?, reason = ? WHERE id = ?',
        [discordId, pseudo, reason, id]
    );
    if (result.affectedRows === 0) {
        return null;
    }
    const [rows] = await pool.execute('SELECT * FROM refus WHERE id = ?', [id]);
    return rows[0];
}

/**
 * Delete a refus entry by ID.
 */
async function deleteRefus(id) {
    const [result] = await pool.execute('DELETE FROM refus WHERE id = ?', [id]);
    return result.affectedRows > 0;
}

/**
 * Import multiple refus entries at once.
 */
async function importRefus(entries) {
    let imported = 0;
    for (const entry of entries) {
        if (entry.discordId && entry.pseudo && entry.reason) {
            await pool.execute(
                'INSERT INTO refus (discord_id, pseudo, reason, created_at) VALUES (?, ?, ?, ?)',
                [
                    entry.discordId,
                    entry.pseudo,
                    entry.reason,
                    entry.createdAt ? new Date(entry.createdAt) : new Date(),
                ]
            );
            imported++;
        }
    }
    return imported;
}

/**
 * Export all refus entries.
 */
async function exportRefus() {
    const [rows] = await pool.execute(
        'SELECT discord_id as discordId, pseudo, reason, created_at as createdAt, updated_at as updatedAt FROM refus ORDER BY created_at DESC'
    );
    return rows;
}

module.exports = {
    initDatabase,
    getAllRefus,
    getStats,
    addRefus,
    updateRefus,
    deleteRefus,
    importRefus,
    exportRefus,
};
