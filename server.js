// ==========================================
// Refus Manager — Server with Discord OAuth2
// ==========================================

const express = require('express');
const session = require('express-session');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');

let config;
try {
    config = require('./config');
} catch (e) {
    // Fallback pour Render ou autres hébergeurs cloud où config.js est ignoré
    config = {
        CLIENT_ID: process.env.CLIENT_ID || '',
        CLIENT_SECRET: process.env.CLIENT_SECRET || '',
        PORT: process.env.PORT || 3000,
        CALLBACK_URL: process.env.CALLBACK_URL || '',
        SESSION_SECRET: process.env.SESSION_SECRET || 'render-fallback-session-secret-key',
        ALLOWED_USER_IDS: process.env.ALLOWED_USER_IDS ? process.env.ALLOWED_USER_IDS.split(',') : []
    };
}

const app = express();

// ---- Parse JSON Bodies ----
app.use(express.json());

const WHITELIST_PATH = path.join(__dirname, 'whitelist.json');

// ---- Helper: Read/Write Whitelist File (In-Memory Cache & Non-Blocking Async IO) ----
let whitelistCache = null;

function getWhitelist() {
    if (whitelistCache !== null) {
        return whitelistCache;
    }
    try {
        if (!fs.existsSync(WHITELIST_PATH)) {
            const initial = Array.isArray(config.ALLOWED_USER_IDS)
                ? config.ALLOWED_USER_IDS.filter(id => id && id !== 'TON_ID_DISCORD_ICI').map(id => ({
                    id,
                    username: 'Config User',
                    addedAt: new Date().toISOString()
                  }))
                : [];
            fs.writeFileSync(WHITELIST_PATH, JSON.stringify(initial, null, 2));
            whitelistCache = initial;
            return initial;
        }
        const data = fs.readFileSync(WHITELIST_PATH, 'utf8');
        whitelistCache = JSON.parse(data);
        return whitelistCache;
    } catch (err) {
        console.error('Error reading whitelist:', err);
        return [];
    }
}

function saveWhitelist(list) {
    whitelistCache = list;
    fs.writeFile(WHITELIST_PATH, JSON.stringify(list, null, 2), 'utf8', (err) => {
        if (err) {
            console.error('Error writing whitelist:', err);
        }
    });
}

// ---- Session (in-memory, no DB) ----
app.use(session({
    secret: config.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        secure: false, // set true if using HTTPS
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    },
}));

// ---- Helper: HTTPS request (no external deps) ----
function fetchJSON(url, options = {}) {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const reqOptions = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: options.method || 'GET',
            headers: {
                'Accept': 'application/json',
                ...(options.headers || {}),
            },
        };

        const req = https.request(reqOptions, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 400) {
                        reject(new Error(`HTTP ${res.statusCode}: ${body}`));
                    } else {
                        resolve(JSON.parse(body));
                    }
                } catch (e) {
                    reject(new Error(`Parse error: ${body}`));
                }
            });
        });

        req.on('error', reject);

        if (options.body) {
            req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
            req.write(options.body);
        }

        req.end();
    });
}

// ---- Auth Middleware ----
function requireAuth(req, res, next) {
    if (req.session && req.session.user) {
        return next();
    }
    // For API requests, return 401
    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: 'Non authentifié' });
    }
    // For page requests, redirect to login
    return res.redirect('/login');
}

// ---- Routes ----

// Login page
app.get('/login', (req, res) => {
    // If already logged in, redirect to app
    if (req.session && req.session.user) {
        return res.redirect('/');
    }
    res.sendFile(path.join(__dirname, 'login.html'));
});

// Start Discord OAuth2 flow
app.get('/auth/discord', (req, res) => {
    // Generate state to prevent CSRF
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = state;

    const params = new URLSearchParams({
        client_id: config.CLIENT_ID,
        redirect_uri: config.CALLBACK_URL,
        response_type: 'code',
        scope: 'identify',
        state: state,
        prompt: 'none',
    });

    res.redirect(`https://discord.com/api/oauth2/authorize?${params}`);
});

// Discord OAuth2 callback
app.get('/auth/discord/callback', async (req, res) => {
    const { code, state } = req.query;

    // Verify state
    if (!state || state !== req.session.oauthState) {
        return res.redirect('/login?error=invalid_state');
    }
    delete req.session.oauthState;

    if (!code) {
        return res.redirect('/login?error=auth_failed');
    }

    try {
        // 1. Exchange code for access token
        const tokenData = await fetchJSON('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: config.CLIENT_ID,
                client_secret: config.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: config.CALLBACK_URL,
            }).toString(),
        });

        const accessToken = tokenData.access_token;

        // 2. Get user info
        const user = await fetchJSON('https://discord.com/api/v10/users/@me', {
            headers: { 'Authorization': `Bearer ${accessToken}` },
        });

        // 3. Check whitelist (from whitelist.json file)
        const whitelist = getWhitelist();
        let isAllowed = false;

        // If the whitelist is completely empty, the very first user who logs in is automatically whitelisted and becomes administrator.
        if (whitelist.length === 0) {
            whitelist.push({
                id: user.id,
                username: user.global_name || user.username,
                addedAt: new Date().toISOString()
            });
            saveWhitelist(whitelist);
            isAllowed = true;
            console.log(`👑 Premier utilisateur enregistré et configuré comme administrateur : ${user.username} (${user.id})`);
        } else {
            isAllowed = whitelist.some(item => item.id === user.id);
        }

        if (!isAllowed) {
            console.log(`Access denied for ${user.username} (${user.id}). Not in whitelist.json.`);
            return res.redirect('/login?error=no_role');
        }

        // 4. Store user in session
        const avatarUrl = user.avatar
            ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'png'}?size=128`
            : `https://cdn.discordapp.com/embed/avatars/${(BigInt(user.id) >> 22n) % 6n}.png`;

        req.session.user = {
            id: user.id,
            username: user.username,
            globalName: user.global_name || user.username,
            avatar: avatarUrl,
        };

        console.log(`✅ ${user.username} (${user.id}) logged in successfully`);
        return res.redirect('/');

    } catch (err) {
        console.error('OAuth2 error:', err.message);
        return res.redirect('/login?error=auth_failed');
    }
});

// API: Get current user
app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// API: Get whitelist members
app.get('/api/whitelist', requireAuth, (req, res) => {
    res.json(getWhitelist());
});

// API: Add user to whitelist
app.post('/api/whitelist', requireAuth, (req, res) => {
    const { discordId, username } = req.body;
    if (!discordId || !username) {
        return res.status(400).json({ error: 'ID Discord et nom requis' });
    }

    const whitelist = getWhitelist();
    if (whitelist.some(item => item.id === discordId)) {
        return res.status(400).json({ error: 'Cet utilisateur est déjà autorisé' });
    }

    whitelist.push({
        id: discordId,
        username: username,
        addedAt: new Date().toISOString()
    });
    saveWhitelist(whitelist);
    res.json({ success: true });
});

// API: Remove user from whitelist
app.delete('/api/whitelist/:id', requireAuth, (req, res) => {
    const { id } = req.params;
    
    // Prevent locking oneself out
    if (id === req.session.user.id) {
        return res.status(400).json({ error: 'Vous ne pouvez pas vous retirer vous-même de la liste' });
    }

    let whitelist = getWhitelist();
    const beforeLength = whitelist.length;
    whitelist = whitelist.filter(item => item.id !== id);

    if (whitelist.length === beforeLength) {
        return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    saveWhitelist(whitelist);
    res.json({ success: true });
});

// Logout
app.get('/logout', (req, res) => {
    req.session.destroy(() => {
        res.redirect('/login');
    });
});

// ---- Protected static files ----
app.use('/', requireAuth, express.static(path.join(__dirname, 'public')));

// ---- Fallback: redirect unknown routes to app ----
app.get('*', requireAuth, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ---- Start server ----
app.listen(config.PORT, () => {
    console.log('');
    console.log('  ╔══════════════════════════════════════════╗');
    console.log('  ║         🛡️  Void Manager Server          ║');
    console.log('  ╠══════════════════════════════════════════╣');
    console.log(`  ║  🌐  http://localhost:${config.PORT}               ║`);
    console.log('  ║  📋  Discord OAuth2 activé               ║');
    console.log(`  ║  🔐  ${config.ALLOWED_USER_IDS.length} utilisateur(s) autorisé(s)        ║`);
    console.log('  ╚══════════════════════════════════════════╝');
    console.log('');

    if (config.CLIENT_ID === 'TON_CLIENT_ID_ICI') {
        console.log('  ⚠️  ATTENTION: Configure tes identifiants Discord dans config.js !');
        console.log('');
    }
});
