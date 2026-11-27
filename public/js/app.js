import { api } from './api.js';

const $ = (id) => document.getElementById(id);
const state = { user: null, providers: [], timeSlots: [] };

// ---------- helpers ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pkr = (n) => 'PKR ' + Number(n).toLocaleString('en-PK');
const todayISO = () => new Date().toLocaleDateString('en-CA');

let toastTimer;
function toast(msg, type = 'ok') {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'toast ' + type;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4000);
}
const fail = (e) => { if (e.status === 401) openAuth(); toast(e.message, 'error'); };

function debounce(fn, ms = 250) {
    let t;
    return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---------- auth ----------
const dlg = $('authDialog');
function openAuth(tab = 'login') {
    showTab(tab);
    if (!dlg.open) dlg.showModal();
}
function showTab(tab) {
    const login = tab === 'login';
    $('loginForm').hidden = !login;
    $('registerForm').hidden = login;
    $('tabLogin').classList.toggle('active', login);
    $('tabRegister').classList.toggle('active', !login);
    $('loginError').hidden = $('registerError').hidden = true;
}
$('tabLogin').onclick = () => showTab('login');
$('tabRegister').onclick = () => showTab('register');
$('loginBtn').onclick = () => openAuth('login');
$('loginPromptBtn').onclick = () => openAuth('login');
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

function formError(id, msg) { const el = $(id); el.textContent = msg; el.hidden = false; }

$('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const { user } = await api.login({ email: $('loginEmail').value, password: $('loginPassword').value });
        await afterAuth(user);
        e.target.reset();
    } catch (err) { formError('loginError', err.message); }
});

$('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const { user } = await api.register({
            name: $('regName').value, email: $('regEmail').value,
            phone: $('regPhone').value, password: $('regPassword').value,
        });
        await afterAuth(user);
        e.target.reset();
    } catch (err) { formError('registerError', err.message); }
});

async function afterAuth(user) {
    state.user = user;
    dlg.close();
    toast(`Welcome, ${user.name.split(' ')[0]}!`);
    await refreshAll();
}

$('logoutBtn').onclick = async () => {
    await api.logout().catch(() => {});
    state.user = null;
    toast('Logged out.');
    await refreshAll();
    location.hash = '#home';
};

function renderAuthUI() {
    const u = state.user;
    $('loginBtn').hidden = !!u;
    $('logoutBtn').hidden = !u;
    $('navUser').hidden = !u;
    if (u) $('navUser').textContent = `${u.name.split(' ')[0]} · ${u.role}`;
    $('navAdmin').hidden = $('admin').hidden = u?.role !== 'admin';
    // Only customers can create bookings
    const canBook = !u || u.role === 'customer';
    $('navBook').hidden = !canBook;
    $('loginPrompt').hidden = !!u;
    $('bookingForm').hidden = !!u && !canBook;
    $('navBookings').hidden = !u;
    $('my-bookings').hidden = !u;
}

// ---------- providers ----------
function renderProviders(list) {
    const grid = $('providerGrid');
    if (!list.length) {
        grid.innerHTML = '<p class="empty-message">No providers found. Try another search.</p>';
        return;
    }
    const canBook = !state.user || state.user.role === 'customer';
    grid.innerHTML = list.map((p) => `
        <div class="provider-card">
            <div class="provider-avatar">${esc(p.icon)}</div>
            <span class="verified">Verified Profile</span>
            <h3>${esc(p.name)}</h3>
            <p>${esc(p.service)}</p>
            <p>📍 ${esc(p.area)}</p>
            <p>⭐ ${p.ratingCount ? p.rating.toFixed(1) : 'New'} / 5 ${p.ratingCount ? `(${p.ratingCount} reviews)` : ''}</p>
            <p>Experience: ${p.experience} year${p.experience === 1 ? '' : 's'}</p>
            <div class="provider-price">${pkr(p.fee)}<small> / visit</small></div>
            ${canBook ? `<button class="primary-button" data-book-provider="${p.id}" type="button">Book Provider</button>` : ''}
        </div>`).join('');
}

async function loadProviders() {
    try {
        const { providers } = await api.providers($('serviceFilter').value, $('searchInput').value.trim());
        state.providers = providers;
        renderProviders(providers);
    } catch (e) { fail(e); }
}

async function loadStats() {
    try {
        const { providers } = await api.providers();
        $('statProviders').textContent = providers.length;
    } catch { /* non-critical */ }
}

$('searchInput').addEventListener('input', debounce(loadProviders));
$('serviceFilter').addEventListener('change', loadProviders);

// ---------- booking form ----------
const bService = $('bookingService');
const bProvider = $('bookingProvider');
const bDate = $('bookingDate');
const bTime = $('bookingTime');

async function fillProviderSelect(service, selectedId = '') {
    bProvider.innerHTML = '<option value="">Choose a provider</option>';
    if (!service) return;
    const { providers } = await api.providers(service);
    for (const p of providers) {
        const o = document.createElement('option');
        o.value = p.id;
        o.textContent = `${p.name} – ${pkr(p.fee)} (${p.ratingCount ? p.rating.toFixed(1) + '★' : 'new'})`;
        o.dataset.fee = p.fee;
        bProvider.appendChild(o);
    }
    bProvider.value = String(selectedId);
    updateFee();
    await loadSlots();
}

function updateFee() {
    const opt = bProvider.selectedOptions[0];
    $('feeText').textContent = opt?.dataset.fee ? pkr(opt.dataset.fee) : 'shown after you choose a provider';
}

async function loadSlots() {
    const previous = bTime.value;
    bTime.innerHTML = '<option value="">Choose time</option>';
    let unavailable = [];
    if (bProvider.value && bDate.value) {
        try { unavailable = (await api.slots(bProvider.value, bDate.value)).unavailable; }
        catch (e) { toast(e.message, 'error'); }
    }
    for (const slot of state.timeSlots) {
        const o = document.createElement('option');
        o.value = slot;
        const taken = unavailable.includes(slot);
        o.textContent = taken ? `${slot} (unavailable)` : slot;
        o.disabled = taken;
        bTime.appendChild(o);
    }
    if (previous && !unavailable.includes(previous)) bTime.value = previous;
}

bService.addEventListener('change', () => fillProviderSelect(bService.value).catch(fail));
bProvider.addEventListener('change', () => { updateFee(); loadSlots(); });
bDate.addEventListener('change', loadSlots);

function goToBooking(service, providerId = '') {
    bService.value = service;
    fillProviderSelect(service, providerId).catch(fail);
    $('booking').scrollIntoView({ behavior: 'smooth' });
}

document.addEventListener('click', (e) => {
    const svc = e.target.closest('[data-book-service]');
    if (svc) return goToBooking(svc.dataset.bookService);
    const prov = e.target.closest('[data-book-provider]');
    if (prov) {
        const p = state.providers.find((x) => x.id === Number(prov.dataset.bookProvider));
        if (p) goToBooking(p.service, p.id);
    }
});

$('bookingForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.user) return openAuth();
    if (!e.target.checkValidity()) return e.target.reportValidity();
    try {
        const { booking } = await api.createBooking({
            providerId: Number(bProvider.value), date: bDate.value, time: bTime.value,
            address: $('customerAddress').value, problem: $('problemDescription').value,
        });
        const msg = $('bookingMessage');
        msg.hidden = false;
        msg.innerHTML = `
            <h3>✓ Booking Submitted!</h3>
            <p><strong>Booking ID:</strong> ${esc(booking.id)}</p>
            <p><strong>Provider:</strong> ${esc(booking.provider.name)} (${esc(booking.service)})</p>
            <p><strong>When:</strong> ${esc(booking.date)} at ${esc(booking.time)}</p>
            <p><strong>Visit fee:</strong> ${pkr(booking.fee)}</p>
            <p>Your request is pending until the provider confirms it.</p>`;
        e.target.reset();
        bProvider.innerHTML = '<option value="">Choose a provider</option>';
        await loadSlots();
        updateFee();
        await loadBookings();
        $('my-bookings').scrollIntoView({ behavior: 'smooth' });
    } catch (err) { fail(err); loadSlots(); }
});

// ---------- bookings dashboard ----------
const ACTIONS = {
    customer: { Pending: [['Cancelled', 'Cancel Booking', 'cancel']], Confirmed: [['Cancelled', 'Cancel Booking', 'cancel']] },
    provider: {
        Pending: [['Confirmed', 'Accept', 'accept'], ['Rejected', 'Decline', 'cancel']],
        Confirmed: [['Completed', 'Mark Completed', 'accept']],
    },
    admin: {
        Pending: [['Confirmed', 'Confirm', 'accept'], ['Cancelled', 'Cancel', 'cancel']],
        Confirmed: [['Completed', 'Mark Completed', 'accept'], ['Cancelled', 'Cancel', 'cancel']],
    },
};

const DASH = {
    customer: ['CUSTOMER DASHBOARD', 'My Bookings', 'View and manage your bookings.'],
    provider: ['PROVIDER DASHBOARD', 'Job Requests', 'Accept, decline and complete jobs assigned to you.'],
    admin: ['ADMIN DASHBOARD', 'All Bookings', 'Every booking on the platform.'],
};

function bookingCard(b) {
    const role = state.user.role;
    const actions = (ACTIONS[role][b.status] ?? []).map(([status, label, cls]) =>
        `<button class="${cls}-button" data-status="${status}" data-id="${esc(b.id)}" type="button">${label}</button>`).join('');

    let review = '';
    if (role === 'customer' && b.status === 'Completed') {
        review = b.review
            ? `<p class="review-done">You rated this job ${'★'.repeat(b.review.rating)}${'☆'.repeat(5 - b.review.rating)}</p>`
            : `<div class="review-box" data-review-for="${esc(b.id)}">
                   <label>Rate this job:
                       <select class="review-rating">${[5, 4, 3, 2, 1].map((n) => `<option value="${n}">${n} ★</option>`).join('')}</select>
                   </label>
                   <input class="review-comment" maxlength="500" placeholder="Optional comment">
                   <button class="accept-button" data-review type="button">Submit rating</button>
               </div>`;
    }

    return `
        <div class="booking-item">
            <div class="booking-head">
                <h3>${esc(b.service)}</h3>
                <span class="booking-status status-${b.status.toLowerCase()}">${esc(b.status)}</span>
            </div>
            <p><strong>Booking ID:</strong> ${esc(b.id)}</p>
            ${role !== 'customer' ? `<p><strong>Customer:</strong> ${esc(b.customer.name)} · ${esc(b.customer.phone)}</p>` : ''}
            ${role !== 'provider' ? `<p><strong>Provider:</strong> ${esc(b.provider.name)}</p>` : ''}
            <p><strong>When:</strong> ${esc(b.date)} at ${esc(b.time)}</p>
            <p><strong>Address:</strong> ${esc(b.address)}</p>
            <p><strong>Problem:</strong> ${esc(b.problem)}</p>
            <p><strong>Visit fee:</strong> ${pkr(b.fee)}</p>
            ${review}
            ${actions ? `<div class="booking-actions">${actions}</div>` : ''}
        </div>`;
}

async function loadBookings() {
    if (!state.user) return;
    const [tag, title, sub] = DASH[state.user.role];
    $('dashTag').textContent = tag; $('dashTitle').textContent = title; $('dashSub').textContent = sub;
    try {
        const { bookings } = await api.bookings();
        $('bookingsList').innerHTML = bookings.length
            ? bookings.map(bookingCard).join('')
            : `<p class="empty-message">${state.user.role === 'customer' ? 'No bookings yet. Book your first service!' : 'No bookings yet.'}</p>`;
    } catch (e) { fail(e); }
}

$('bookingsList').addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    try {
        if (btn.dataset.status) {
            if (btn.dataset.status === 'Cancelled' && !confirm('Are you sure you want to cancel this booking?')) return;
            await api.setStatus(btn.dataset.id, btn.dataset.status);
            toast(`Booking marked ${btn.dataset.status.toLowerCase()}.`);
        } else if ('review' in btn.dataset) {
            const box = btn.closest('[data-review-for]');
            await api.review(box.dataset.reviewFor, Number(box.querySelector('.review-rating').value), box.querySelector('.review-comment').value);
            toast('Thanks for your feedback!');
        } else return;
        await Promise.all([loadBookings(), loadProviders(), state.user.role === 'admin' ? loadAdmin() : null]);
    } catch (err) { fail(err); }
});

// ---------- admin ----------
async function loadAdmin() {
    if (state.user?.role !== 'admin') return;
    try {
        const [stats, { providers }] = await Promise.all([api.adminStats(), api.adminProviders()]);
        const tiles = [
            ['Customers', stats.customers], ['Active providers', stats.providers], ['Total bookings', stats.bookings],
            ['Pending', stats.pending], ['Completed', stats.completed], ['Visit fees (completed)', pkr(stats.revenue)],
        ];
        $('adminStats').innerHTML = tiles.map(([l, v]) => `<div class="stat-tile"><strong>${esc(v)}</strong><span>${esc(l)}</span></div>`).join('');
        $('adminProviders').innerHTML = providers.map((p) => `
            <tr>
                <td>${esc(p.name)}</td><td>${esc(p.service)}</td><td>${esc(p.area)}</td>
                <td>${p.ratingCount ? p.rating.toFixed(1) : '–'}</td><td>${p.fee}</td>
                <td><span class="booking-status ${p.active ? 'status-confirmed' : 'status-cancelled'}">${p.active ? 'Active' : 'Hidden'}</span></td>
                <td><button class="${p.active ? 'cancel' : 'accept'}-button" data-toggle-provider="${p.id}" data-active="${p.active}" type="button">${p.active ? 'Hide' : 'Show'}</button></td>
            </tr>`).join('');
    } catch (e) { fail(e); }
}

$('adminProviders').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-toggle-provider]');
    if (!btn) return;
    try {
        await api.updateProvider(btn.dataset.toggleProvider, { active: btn.dataset.active !== 'true' });
        await Promise.all([loadAdmin(), loadProviders(), loadStats()]);
    } catch (err) { fail(err); }
});

$('providerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!e.target.checkValidity()) return e.target.reportValidity();
    try {
        await api.addProvider({
            name: $('pName').value, service: $('pService').value, email: $('pEmail').value,
            phone: $('pPhone').value, area: $('pArea').value, password: $('pPassword').value,
            experience: Number($('pExperience').value), fee: Number($('pFee').value),
        });
        e.target.reset();
        toast('Provider added.');
        await Promise.all([loadAdmin(), loadProviders(), loadStats()]);
    } catch (err) { fail(err); }
});

// ---------- init ----------
async function refreshAll() {
    renderAuthUI();
    await Promise.all([loadProviders(), loadStats(), loadBookings(), loadAdmin()]);
}

async function init() {
    bDate.min = todayISO();
    try {
        const [{ user }, { timeSlots }] = await Promise.all([api.me(), api.services()]);
        state.user = user;
        state.timeSlots = timeSlots;
    } catch (e) { toast('Could not reach the server.', 'error'); }
    await loadSlots();
    await refreshAll();
}
init();
