// Carrega o .env (DATABASE_URL etc.) para os testes que tocam o banco.
import { existsSync } from "node:fs";
if (existsSync(".env")) process.loadEnvFile(".env");
