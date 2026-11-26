// Обработка формы входа
const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        
        try {
            const result = await login(formData.get('email'), formData.get('password'));
            localStorage.setItem('user', JSON.stringify(result));
            alert('Вход выполнен успешно!');
            window.location.href = 'index.html';
        } catch (err) {
            alert('Ошибка: ' + err.message);
        }
    });
}

// Обработка формы регистрации
const registerForm = document.getElementById('register-form');
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(registerForm);
        
        if (formData.get('password') !== formData.get('password_confirm')) {
            alert('Пароли не совпадают!');
            return;
        }
        
        try {
            const result = await register({
                login: formData.get('name'),
                email: formData.get('email'),
                password: formData.get('password')
            });
            alert('Регистрация успешна! Теперь войдите.');
            window.location.href = 'login.html';
        } catch (err) {
            alert('Ошибка: ' + err.message);
        }
    });
}