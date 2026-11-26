package main

import (
	"database/sql"
	"fmt"
	"log"

	_ "github.com/lib/pq"
	"golang.org/x/crypto/bcrypt"
)

func main() {
	// Пароль, который вы хотите использовать
	password := "password"

	// Генерируем хэш
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		log.Fatal(err)
	}

	fmt.Printf("Хэш для пароля '%s':\n%s\n", password, string(hash))

	// Подключение к БД
	connStr := "host=localhost port=5432 user=postgres password=root dbname=lingradable sslmode=disable"
	db, err := sql.Open("postgres", connStr)
	if err != nil {
		log.Fatal("Ошибка подключения к БД:", err)
	}
	defer db.Close()

	// Проверяем подключение
	if err = db.Ping(); err != nil {
		log.Fatal("Ошибка проверки подключения:", err)
	}

	// Обновляем все пароли в БД
	query := "UPDATE users SET password_hash = $1"
	result, err := db.Exec(query, string(hash))
	if err != nil {
		log.Fatal("Ошибка обновления:", err)
	}

	rowsAffected, _ := result.RowsAffected()
	fmt.Printf("\n✅ Обновлено пользователей: %d\n", rowsAffected)
	fmt.Printf("Теперь все пользователи могут войти с паролем: %s\n", password)
}
