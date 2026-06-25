// ==========================================
// Refus Manager - Application Logic
// Uses MySQL API for data persistence
// ==========================================

(function () {
    'use strict';

    // ---- Constants ----
    const SORT_KEY = 'refusManager_sortOrder';

    // ---- DOM Elements ----
    const dom = {
        searchInput: document.getElementById('searchInput'),
        clearSearch: document.getElementById('clearSearch'),
        searchResultsInfo: document.getElementById('searchResultsInfo'),
        toggleFormBtn: document.getElementById('toggleFormBtn'),
        formContainer: document.getElementById('formContainer'),
        refusalForm: document.getElementById('refusalForm'),
        discordId: document.getElementById('discordId'),
        pseudo: document.getElementById('pseudo'),
        reason: document.getElementById('reason'),
        submitBtn: document.getElementById('submitBtn'),
        entriesList: document.getElementById('entriesList'),
        emptyState: document.getElementById('emptyState'),
        totalEntries: document.getElementById('totalEntries'),
        todayEntries: document.getElementById('todayEntries'),
        sortBtn: document.getElementById('sortBtn'),
        exportBtn: document.getElementById('exportBtn'),
        importBtn: document.getElementById('importBtn'),
        importFile: document.getElementById('importFile'),
        deleteModal: document.getElementById('deleteModal'),
        modalCancel: document.getElementById('modalCancel'),
        modalConfirm: document.getElementById('modalConfirm'),
        toastContainer: document.getElementById('toastContainer'),
        userAvatar: document.getElementById('userAvatar'),
        userName: document.getElementById('userName'),
        userTag: document.getElementById('userTag'),
        toggleWhitelistBtn: document.getElementById('toggleWhitelistBtn'),
        whitelistContainer: document.getElementById('whitelistContainer'),
        whitelistForm: document.getElementById('whitelistForm'),
        whitelistDiscordId: document.getElementById('whitelistDiscordId'),
        whitelistUsername: document.getElementById('whitelistUsername'),
        whitelistList: document.getElementById('whitelistList'),
    };

    // ---- State ----
    let entries = [];
    let sortOrder = 'newest'; // 'newest' or 'oldest'
    let editingId = null;
    let deletingId = null;
    let searchDebounce = null;

    // ---- API Helpers ----
    async function apiGet(url) {
        const res = await fetch(url);
        if (!res.ok) {
            if (res.status === 401) {
                window.location.href = '/login';
                return;
            }
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Erreur ${res.status}`);
        }
        return res.json();
    }

    async function apiPost(url, body) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Erreur ${res.status}`);
        }
        return res.json();
    }

    async function apiPut(url, body) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Erreur ${res.status}`);
        }
        return res.json();
    }

    async function apiDelete(url) {
        const res = await fetch(url, { method: 'DELETE' });
        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Erreur ${res.status}`);
        }
        return res.json();
    }

    // ---- Load Entries from API ----
    async function loadEntries(query = '') {
        try {
            const params = new URLSearchParams();
            if (query) params.set('q', query);
            params.set('sort', sortOrder);
            entries = await apiGet(`/api/refus?${params}`);
            renderEntries(query);
            updateStats();
        } catch (err) {
            console.error('Error loading entries:', err);
            showToast('Erreur de chargement des données', 'error');
        }
    }

    // ---- Update Stats from API ----
    async function updateStats() {
        try {
            const stats = await apiGet('/api/refus/stats');
            dom.totalEntries.textContent = stats.total;
            dom.todayEntries.textContent = stats.today;

            // Animate number change
            [dom.totalEntries, dom.todayEntries].forEach(el => {
                el.style.transform = 'scale(1.3)';
                el.style.transition = 'transform 0.3s ease';
                setTimeout(() => { el.style.transform = 'scale(1)'; }, 300);
            });
        } catch (err) {
            console.error('Error loading stats:', err);
        }
    }

    function loadSortOrder() {
        sortOrder = localStorage.getItem(SORT_KEY) || 'newest';
    }

    function saveSortOrder() {
        localStorage.setItem(SORT_KEY, sortOrder);
    }

    // ---- Toast Notifications ----
    function showToast(message, type = 'success') {
        const icons = {
            success: '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
            error: '<svg viewBox="0 0 24 24" fill="none"><path d="M6 18L18 6M6 6l12 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/></svg>',
            info: '<svg viewBox="0 0 24 24" fill="none"><path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`;
        dom.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3000);
    }

    // ---- Format Date (Memoized) ----
    const dateFormattingCache = new Map();
    function formatDate(dateStr) {
        if (dateFormattingCache.has(dateStr)) {
            return dateFormattingCache.get(dateStr);
        }

        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now - date;
        const diffMin = Math.floor(diffMs / 60000);
        const diffHr = Math.floor(diffMs / 3600000);
        const diffDay = Math.floor(diffMs / 86400000);

        let result;
        if (diffMin < 1) {
            result = "À l'instant";
        } else if (diffMin < 60) {
            result = `Il y a ${diffMin} min`;
        } else if (diffHr < 24) {
            result = `Il y a ${diffHr}h`;
        } else if (diffDay < 7) {
            result = `Il y a ${diffDay}j`;
        } else {
            result = date.toLocaleDateString('fr-FR', {
                day: 'numeric',
                month: 'short',
                year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
                hour: '2-digit',
                minute: '2-digit',
            });
            // Only cache permanent dates (older than 7 days) to prevent stale relative dates
            dateFormattingCache.set(dateStr, result);
        }

        return result;
    }

    // ---- Escape HTML ----
    function escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    // ---- Highlight Search (Regex Cached) ----
    function highlightText(text, regex) {
        const escaped = escapeHtml(text);
        if (!regex) return escaped;
        return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    // ---- Render Entries ----
    function renderEntries(query = '') {
        const q = query.trim().toLowerCase();

        // Entries are already filtered and sorted by the API
        const filtered = entries;

        // Precompile regex once per render instead of compiling it inside the loop
        let highlightRegex = null;
        if (q) {
            const queryEscaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            highlightRegex = new RegExp(`(${queryEscaped})`, 'gi');
        }

        // Update search results info
        if (q) {
            dom.searchResultsInfo.textContent = `${filtered.length} résultat${filtered.length !== 1 ? 's' : ''} trouvé${filtered.length !== 1 ? 's' : ''} pour "${query.trim()}"`;
        } else {
            dom.searchResultsInfo.textContent = '';
        }

        // Render
        if (filtered.length === 0) {
            dom.entriesList.innerHTML = '';
            dom.emptyState.classList.add('visible');
            if (q) {
                dom.emptyState.querySelector('h3').textContent = 'Aucun résultat';
                dom.emptyState.querySelector('p').textContent = `Aucun refus ne correspond à "${query.trim()}"`;
            } else {
                dom.emptyState.querySelector('h3').textContent = 'Aucun refus enregistré';
                dom.emptyState.querySelector('p').textContent = 'Commencez par ajouter un refus en cliquant sur le bouton ci-dessus.';
            }
            return;
        }

        dom.emptyState.classList.remove('visible');

        dom.entriesList.innerHTML = filtered.map((entry, i) => `
            <div class="entry-card" style="animation-delay: ${i * 0.03}s" data-id="${entry.id}">
                <div class="entry-card-header">
                    <div class="entry-info">
                        <div class="entry-pseudo">
                            ${highlightText(entry.pseudo, highlightRegex)}
                        </div>
                        <div class="entry-id">
                            <span>${highlightText(entry.discordId, highlightRegex)}</span>
                            <button class="copy-id-btn" data-copy="${escapeHtml(entry.discordId)}" title="Copier l'ID">
                                <svg viewBox="0 0 24 24" fill="none"><rect x="9" y="9" width="13" height="13" rx="2" stroke="currentColor" stroke-width="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
                            </button>
                        </div>
                    </div>
                    <div class="entry-actions">
                        <button class="entry-edit-btn" data-id="${entry.id}" title="Modifier">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                        <button class="entry-delete-btn" data-id="${entry.id}" title="Supprimer">
                            <svg viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                    </div>
                </div>
                <div class="entry-reason">${highlightText(entry.reason, highlightRegex)}</div>
                <div class="entry-date">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                    ${formatDate(entry.createdAt)}
                </div>
            </div>
        `).join('');
    }

    // ---- Toggle Form ----
    function toggleForm(forceOpen) {
        const isOpen = dom.formContainer.classList.contains('open');
        const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;

        if (shouldOpen) {
            dom.formContainer.classList.add('open');
            dom.toggleFormBtn.classList.add('active');
            dom.toggleFormBtn.querySelector('span').textContent = 'Fermer le formulaire';
            setTimeout(() => dom.discordId.focus(), 300);
        } else {
            dom.formContainer.classList.remove('open');
            dom.toggleFormBtn.classList.remove('active');
            dom.toggleFormBtn.querySelector('span').textContent = 'Ajouter un refus';
            resetForm();
        }
    }

    // ---- Reset Form ----
    function resetForm() {
        dom.refusalForm.reset();
        editingId = null;
        dom.submitBtn.querySelector('span').textContent = 'Enregistrer le refus';
    }

    // ---- Add / Edit Entry ----
    async function handleSubmit(e) {
        e.preventDefault();

        const discordId = dom.discordId.value.trim();
        const pseudo = dom.pseudo.value.trim();
        const reason = dom.reason.value.trim();

        if (!discordId || !pseudo || !reason) {
            showToast('Veuillez remplir tous les champs.', 'error');
            return;
        }

        try {
            if (editingId) {
                // Edit existing via API
                await apiPut(`/api/refus/${editingId}`, { discordId, pseudo, reason });
                showToast('Refus modifié avec succès !', 'success');
            } else {
                // Add new via API
                await apiPost('/api/refus', { discordId, pseudo, reason });
                showToast('Refus enregistré avec succès !', 'success');
            }

            // Reload entries from server
            await loadEntries(dom.searchInput.value);
            toggleForm(false);
        } catch (err) {
            showToast(err.message || 'Erreur lors de l\'enregistrement', 'error');
        }
    }

    // ---- Edit Entry ----
    function startEdit(id) {
        const entry = entries.find(e => e.id == id);
        if (!entry) return;

        editingId = id;
        dom.discordId.value = entry.discordId;
        dom.pseudo.value = entry.pseudo;
        dom.reason.value = entry.reason;
        dom.submitBtn.querySelector('span').textContent = 'Modifier le refus';

        toggleForm(true);

        // Scroll to form
        dom.toggleFormBtn.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    // ---- Delete Entry ----
    function confirmDelete(id) {
        deletingId = id;
        dom.deleteModal.classList.add('active');
    }

    async function executeDelete() {
        if (!deletingId) return;
        try {
            await apiDelete(`/api/refus/${deletingId}`);
            dom.deleteModal.classList.remove('active');
            deletingId = null;
            showToast('Refus supprimé.', 'info');
            await loadEntries(dom.searchInput.value);
        } catch (err) {
            showToast(err.message || 'Erreur lors de la suppression', 'error');
            dom.deleteModal.classList.remove('active');
            deletingId = null;
        }
    }

    function cancelDelete() {
        dom.deleteModal.classList.remove('active');
        deletingId = null;
    }

    // ---- Copy ID ----
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            showToast('ID copié dans le presse-papier !', 'info');
        }).catch(() => {
            // Fallback
            const textarea = document.createElement('textarea');
            textarea.value = text;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            showToast('ID copié dans le presse-papier !', 'info');
        });
    }

    // ---- Sort ----
    function toggleSort() {
        sortOrder = sortOrder === 'newest' ? 'oldest' : 'newest';
        saveSortOrder();
        dom.sortBtn.querySelector('span').textContent = sortOrder === 'newest' ? 'Récents' : 'Anciens';
        loadEntries(dom.searchInput.value);
    }

    // ---- Export ----
    async function exportData() {
        try {
            const data = await apiGet('/api/refus/export');
            if (data.length === 0) {
                showToast('Aucune donnée à exporter.', 'error');
                return;
            }

            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `refus_export_${new Date().toISOString().split('T')[0]}.json`;
            a.click();
            URL.revokeObjectURL(url);
            showToast(`${data.length} refus exporté${data.length > 1 ? 's' : ''} !`, 'success');
        } catch (err) {
            showToast('Erreur lors de l\'exportation', 'error');
        }
    }

    // ---- Import ----
    function importData(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async function (evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                if (!Array.isArray(imported)) throw new Error('Format invalide');

                // Validate shape
                const valid = imported.every(item =>
                    item.discordId && item.pseudo && item.reason
                );

                if (!valid) throw new Error('Données incomplètes');

                // Send to API for import
                const result = await apiPost('/api/refus/import', { entries: imported });
                showToast(`${result.imported} refus importé${result.imported > 1 ? 's' : ''} !`, 'success');

                // Reload entries
                await loadEntries(dom.searchInput.value);
            } catch (err) {
                showToast('Erreur lors de l\'importation : ' + (err.message || 'fichier invalide.'), 'error');
            }
        };
        reader.readAsText(file);
        // Reset input so same file can be re-imported
        dom.importFile.value = '';
    }

    // ---- Search ----
    function handleSearch() {
        clearTimeout(searchDebounce);
        const q = dom.searchInput.value;

        dom.clearSearch.classList.toggle('visible', q.length > 0);

        searchDebounce = setTimeout(() => {
            loadEntries(q);
        }, 300); // Debounce for API calls
    }

    function clearSearch() {
        dom.searchInput.value = '';
        dom.clearSearch.classList.remove('visible');
        loadEntries();
    }

    // ---- Event Delegation for Entry Actions ----
    function handleEntryClick(e) {
        const editBtn = e.target.closest('.entry-edit-btn');
        if (editBtn) {
            startEdit(editBtn.dataset.id);
            return;
        }

        const deleteBtn = e.target.closest('.entry-delete-btn');
        if (deleteBtn) {
            confirmDelete(deleteBtn.dataset.id);
            return;
        }

        const copyBtn = e.target.closest('.copy-id-btn');
        if (copyBtn) {
            copyToClipboard(copyBtn.dataset.copy);
            return;
        }
    }

    // ---- Keyboard Shortcuts ----
    function handleKeydown(e) {
        // Ctrl/Cmd + K = focus search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            dom.searchInput.focus();
        }

        // Escape = close modal / form
        if (e.key === 'Escape') {
            if (dom.deleteModal.classList.contains('active')) {
                cancelDelete();
            } else if (dom.formContainer.classList.contains('open')) {
                toggleForm(false);
            } else if (document.activeElement === dom.searchInput) {
                clearSearch();
                dom.searchInput.blur();
            }
        }
    }

    // ---- Load User Info ----
    function loadUserInfo() {
        fetch('/api/me')
            .then(res => {
                if (!res.ok) throw new Error('Not authenticated');
                return res.json();
            })
            .then(user => {
                if (dom.userAvatar) dom.userAvatar.src = user.avatar;
                if (dom.userName) dom.userName.textContent = user.globalName || user.username;
                if (dom.userTag) dom.userTag.textContent = `@${user.username}`;
            })
            .catch(() => {
                // If not authenticated, redirect to login
                window.location.href = '/login';
            });
    }

    // ---- Whitelist Management ----
    let whitelist = [];

    function loadWhitelist() {
        fetch('/api/whitelist')
            .then(res => {
                if (!res.ok) throw new Error('Failed to load whitelist');
                return res.json();
            })
            .then(data => {
                whitelist = data;
                renderWhitelist();
            })
            .catch(err => {
                console.error(err);
                showToast('Erreur de chargement de la liste blanche', 'error');
            });
    }

    function renderWhitelist() {
        if (!dom.whitelistList) return;
        
        if (whitelist.length === 0) {
            dom.whitelistList.innerHTML = '<div style="color: var(--text-muted); font-size: 0.85rem; padding: 0.5rem 0;">Aucun membre autorisé.</div>';
            return;
        }

        dom.whitelistList.innerHTML = whitelist.map(item => `
            <div class="whitelist-item">
                <div class="whitelist-item-info">
                    <span class="whitelist-item-name">${escapeHtml(item.username)}</span>
                    <span class="whitelist-item-id">${escapeHtml(item.id)}</span>
                </div>
                <button class="whitelist-remove-btn" data-id="${item.id}" title="Retirer l'autorisation">
                    <svg viewBox="0 0 24 24" fill="none"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
            </div>
        `).join('');
    }

    function toggleWhitelist(forceOpen) {
        if (!dom.whitelistContainer) return;
        const isOpen = dom.whitelistContainer.classList.contains('open');
        const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;

        if (shouldOpen) {
            dom.whitelistContainer.classList.add('open');
            dom.toggleWhitelistBtn.classList.add('active');
            dom.toggleWhitelistBtn.querySelector('span').textContent = 'Fermer la liste blanche';
            loadWhitelist();
        } else {
            dom.whitelistContainer.classList.remove('open');
            dom.toggleWhitelistBtn.classList.remove('active');
            dom.toggleWhitelistBtn.querySelector('span').textContent = 'Gérer les accès';
            dom.whitelistForm.reset();
        }
    }

    function handleWhitelistSubmit(e) {
        e.preventDefault();
        const discordId = dom.whitelistDiscordId.value.trim();
        const username = dom.whitelistUsername.value.trim();

        if (!discordId || !username) return;

        fetch('/api/whitelist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ discordId, username })
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'Erreur lors de l\'ajout'); });
            }
            return res.json();
        })
        .then(() => {
            showToast('Utilisateur ajouté avec succès !', 'success');
            dom.whitelistForm.reset();
            loadWhitelist();
        })
        .catch(err => {
            showToast(err.message, 'error');
        });
    }

    function handleWhitelistClick(e) {
        const removeBtn = e.target.closest('.whitelist-remove-btn');
        if (!removeBtn) return;
        
        const id = removeBtn.dataset.id;
        
        fetch(`/api/whitelist/${id}`, {
            method: 'DELETE'
        })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => { throw new Error(data.error || 'Erreur lors de la suppression'); });
            }
            return res.json();
        })
        .then(() => {
            showToast('Autorisation retirée.', 'info');
            loadWhitelist();
        })
        .catch(err => {
            showToast(err.message, 'error');
        });
    }

    async function init() {
        loadSortOrder();
        loadUserInfo();

        dom.sortBtn.querySelector('span').textContent = sortOrder === 'newest' ? 'Récents' : 'Anciens';

        // Load entries from MySQL API
        await loadEntries();

        // Event listeners
        dom.toggleFormBtn.addEventListener('click', () => toggleForm());
        dom.refusalForm.addEventListener('submit', handleSubmit);
        if (dom.toggleWhitelistBtn) {
            dom.toggleWhitelistBtn.addEventListener('click', () => toggleWhitelist());
        }
        if (dom.whitelistForm) {
            dom.whitelistForm.addEventListener('submit', handleWhitelistSubmit);
        }
        if (dom.whitelistList) {
            dom.whitelistList.addEventListener('click', handleWhitelistClick);
        }
        dom.searchInput.addEventListener('input', handleSearch);
        dom.clearSearch.addEventListener('click', clearSearch);
        dom.entriesList.addEventListener('click', handleEntryClick);
        dom.sortBtn.addEventListener('click', toggleSort);
        dom.exportBtn.addEventListener('click', exportData);
        dom.importBtn.addEventListener('click', () => dom.importFile.click());
        dom.importFile.addEventListener('change', importData);
        dom.modalCancel.addEventListener('click', cancelDelete);
        dom.modalConfirm.addEventListener('click', executeDelete);
        dom.deleteModal.addEventListener('click', (e) => {
            if (e.target === dom.deleteModal) cancelDelete();
        });
        document.addEventListener('keydown', handleKeydown);
    }

    // Start app
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
