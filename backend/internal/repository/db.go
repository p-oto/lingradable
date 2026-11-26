package repository

import (
    "database/sql"
    "fmt"
    "log"
    "os"
    
    "github.com/joho/godotenv"
    _ "github.com/lib/pq"
)

func init() {
    // Загружаем .env файл при старте
    if err := godotenv.Load(); err != nil {
        log.Println("Файл .env не найден, используются значения по умолчанию")
    }
}

type Database struct {
    DB *sql.DB
}

func NewDatabase() (*Database, error) {
    host := getEnv("DB_HOST", "localhost")
    port := getEnv("DB_PORT", "5432")
    user := getEnv("DB_USER", "postgres")
    password := getEnv("DB_PASSWORD", "postgres")
    dbname := getEnv("DB_NAME", "lingradable")
    
    connStr := fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
        host, port, user, password, dbname)
    
    db, err := sql.Open("postgres", connStr)
    if err != nil {
        return nil, fmt.Errorf("ошибка подключения к БД: %w", err)
    }
    
    if err = db.Ping(); err != nil {
        return nil, fmt.Errorf("ошибка проверки подключения: %w", err)
    }
    
    db.SetMaxOpenConns(25)
    db.SetMaxIdleConns(10)
    
    return &Database{DB: db}, nil
}

func getEnv(key, fallback string) string {
    if value, exists := os.LookupEnv(key); exists {
        return value
    }
    return fallback
}