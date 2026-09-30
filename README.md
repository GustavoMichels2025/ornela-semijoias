# Ornela Semijoias — Netlify + Neon

Catálogo migrado do Supabase para Neon PostgreSQL e Neon Storage.

## Backend
- `app_state` no Neon PostgreSQL guarda produtos, estoque, pedidos e configurações.
- `ornela-produtos` no Neon Storage recebe novas imagens.
- Netlify Functions protegem `DATABASE_URL` e credenciais do Storage; nenhuma senha fica no HTML.
- `seed-state.json` contém a cópia dos dados do backup antigo e inicializa o banco automaticamente se ele estiver vazio.

## Variáveis no Netlify
Copie os nomes de `.env.example` e preencha os valores no painel do Netlify. Nunca envie `.env` ao GitHub.

## Publicação
Conecte este repositório ao Netlify. O `netlify.toml` já roteia `/api/state`, `/api/order`, `/api/login` e `/api/upload-images`.
