async function loadCatalog() {
    const listEl = document.getElementById('products-list');
    if (!listEl) return;
    
    try {
        const products = await getProducts();
        listEl.innerHTML = '';
        
        if (products.length === 0) {
            listEl.innerHTML = '<p class="text-center">Каталог пуст.</p>';
            return;
        }
        
        products.forEach(p => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-4';
            
            const typeClass = p.type === 'distro' ? 'badge-distro' : 
                             p.type === 'de' ? 'badge-de' : 'badge-wm';
            const typeName = p.type === 'distro' ? 'Дистрибутив' : 
                            p.type === 'de' ? 'DE' : 'WM';
            
            col.innerHTML = `
                <div class="card product-card">
                    <div class="card-body">
                        <span class="product-type-badge ${typeClass}">${typeName}</span>
                        <h5 class="card-title">${p.name}</h5>
                        <p class="card-text">${p.description.substring(0, 150)}...</p>
                    </div>
                    <div class="card-footer">
                        <a href="product.html?id=${p.id}" class="btn btn-primary btn-sm w-100">Подробнее</a>
                    </div>
                </div>
            `;
            listEl.appendChild(col);
        });
    } catch (err) {
        listEl.innerHTML = `<div class="alert alert-danger">Ошибка загрузки: ${err.message}</div>`;
    }
}

async function loadTags() {
    const tagsEl = document.getElementById('tags-filter');
    if (!tagsEl) return;
    
    try {
        const tags = await getTags();
        tagsEl.innerHTML = '<button class="btn btn-outline-primary active" data-tag="">Все</button>';
        tags.forEach(t => {
            const btn = document.createElement('button');
            btn.className = 'btn btn-outline-primary';
            btn.dataset.tag = t.name;
            btn.textContent = t.name;
            btn.onclick = () => filterByTag(t.name);
            tagsEl.appendChild(btn);
        });
    } catch (err) {
        console.error('Ошибка загрузки тегов:', err);
    }
}

async function filterByTag(tag) {
    const listEl = document.getElementById('products-list');
    listEl.innerHTML = '<div class="spinner-border"></div>';
    
    try {
        const products = await getProducts(tag || null);
        // Повторный рендер (можно вынести в функцию)
        listEl.innerHTML = '';
        products.forEach(p => {
            const col = document.createElement('div');
            col.className = 'col-md-4 mb-4';
            col.innerHTML = `
                <div class="card product-card">
                    <div class="card-body">
                        <h5 class="card-title">${p.name}</h5>
                        <p class="card-text">${p.description.substring(0, 150)}...</p>
                    </div>
                    <div class="card-footer">
                        <a href="product.html?id=${p.id}" class="btn btn-primary btn-sm w-100">Подробнее</a>
                    </div>
                </div>
            `;
            listEl.appendChild(col);
        });
    } catch (err) {
        console.error(err);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadCatalog();
    loadTags();
});