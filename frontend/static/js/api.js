const API_BASE = 'http://localhost:8080/api';

async function apiRequest(endpoint, options = {}) {
    const config = {
        headers: { 
            'Content-Type': 'application/json',
            'Authorization': getAuthHeader()
        },
        ...options
    };
    
    const response = await fetch(API_BASE + endpoint, config);
    
    // Проверяем, JSON ли возвращается
    const contentType = response.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Сервер вернул не JSON: ${text.substring(0, 100)}`);
    }
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || `HTTP ${response.status}`);
    }
    
    return response.json();
}

// Получение токена авторизации
function getAuthHeader() {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.token) {
        return `Bearer ${user.token}`;
    }
    return '';
}

async function getProducts(tag = null) {
    let url = '/products';
    if (tag) url += `?tag=${encodeURIComponent(tag)}`;
    return apiRequest(url);
}

async function getProduct(id) {
    return apiRequest(`/products/${id}`);
}

async function getTags() {
    return apiRequest('/tags');
}

async function createProduct(data) {
    return apiRequest('/products', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}

async function login(email, password) {
    return apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
    });
}

async function register(data) {
    return apiRequest('/auth/register', {
        method: 'POST',
        body: JSON.stringify(data)
    });
}