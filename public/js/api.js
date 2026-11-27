// Thin wrapper around fetch for the FIXLY JSON API.
async function request(method, url, body) {
    const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch { /* empty body */ }
    if (!res.ok) {
        const err = new Error(data.error || 'Request failed.');
        err.status = res.status;
        throw err;
    }
    return data;
}

export const api = {
    me:            () => request('GET', '/api/auth/me'),
    login:         (b) => request('POST', '/api/auth/login', b),
    register:      (b) => request('POST', '/api/auth/register', b),
    logout:        () => request('POST', '/api/auth/logout', {}),
    services:      () => request('GET', '/api/services'),
    providers:     (service, q) => {
        const p = new URLSearchParams();
        if (service && service !== 'All') p.set('service', service);
        if (q) p.set('q', q);
        return request('GET', '/api/providers?' + p);
    },
    slots:         (id, date) => request('GET', `/api/providers/${id}/slots?date=${date}`),
    bookings:      () => request('GET', '/api/bookings'),
    createBooking: (b) => request('POST', '/api/bookings', b),
    setStatus:     (id, status) => request('PATCH', `/api/bookings/${id}/status`, { status }),
    review:        (id, rating, comment) => request('POST', `/api/bookings/${id}/review`, { rating, comment }),
    adminStats:    () => request('GET', '/api/admin/stats'),
    adminProviders:() => request('GET', '/api/admin/providers'),
    addProvider:   (b) => request('POST', '/api/admin/providers', b),
    updateProvider:(id, b) => request('PATCH', `/api/admin/providers/${id}`, b),
};
