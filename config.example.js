// ==========================================
// Configuration Discord OAuth2 (Exemple)
// ==========================================
// Copie ce fichier et renomme-le en "config.js" puis remplis les valeurs.

module.exports = {
    // ---- Discord Application ----
    CLIENT_ID: 'TON_CLIENT_ID_ICI',
    CLIENT_SECRET: 'TON_CLIENT_SECRET_ICI',

    // ---- Liste blanche d'utilisateurs Discord autorisés ----
    // Facultatif car le premier utilisateur connecté est automatiquement ajouté à whitelist.json
    ALLOWED_USER_IDS: [
        'TON_ID_DISCORD_ICI',
    ],

    // ---- Serveur ----
    PORT: 3000,
    CALLBACK_URL: 'http://localhost:3000/auth/discord/callback',

    // ---- Session ----
    SESSION_SECRET: 'une-cle-secrete-aleatoire-ici',

    // ---- MySQL Database ----
    DB_HOST: 'mysql-voimanager.alwaysdata.net',
    DB_USER: 'voimanager',
    DB_PASSWORD: 'TON_MOT_DE_PASSE_MYSQL',
    DB_NAME: 'voimanager_refus',
    DB_PORT: 3306,
};
