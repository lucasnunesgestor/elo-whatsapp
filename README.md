# Elo WhatsApp

Painel para conectar instâncias de WhatsApp (UazAPI, Evolution API, Wuzapi ou
qualquer API compatível) em nome de clientes, por um link único e seguro. O
cliente escaneia o QR code e pronto — sem ver seu painel, sem receber print
de QR que expira, sem acesso à sua conta.

## Por que backend e não só um HTML

O token da instância nunca deve chegar ao navegador do cliente final: mesmo
codificado numa URL, um token ali é texto reversível, e chamar a API do
provedor direto do navegador depende de CORS estar liberado no servidor dele,
o que nem sempre é verdade. Aqui, quem fala com a API do provedor é sempre o
backend. O cliente final só troca mensagens com o seu servidor, e só recebe
de volta o QR code (imagem) e um status (conectado ou não).

## Stack

- **Express** (não Fastify): é uma ferramenta interna de baixo tráfego, usada
  por uma pessoa (você); a familiaridade e o ecossistema de middlewares do
  Express (rate limit, cookies, helmet) pesam mais aqui do que o ganho de
  performance do Fastify, que não faz diferença perceptível nesse volume.
- **`node:sqlite`** (nativo do Node, sem dependência externa): um único
  arquivo de banco, sem servidor separado pra manter e sem binário pra
  compilar — evita a dor de precisar de Visual Studio Build Tools (Windows)
  ou `build-essential` (Linux) só pra guardar cadastro de cliente. É
  experimental (o Node avisa isso no boot, pode ignorar), mas estável o
  bastante pro volume de escrita desse painel. Exige **Node 22.5 ou mais
  recente**.
- **fetch nativo do Node 18+**: sem dependência extra de HTTP client.
- **Vanilla JS no frontend**: duas telas simples, sem necessidade de build
  step ou framework.

## Rodando localmente

```bash
npm install
cp .env.example .env
# edite o .env e defina uma ADMIN_PASSWORD sua
npm run dev
```

O servidor sobe em `http://localhost:3000`. Acesse `http://localhost:3000/admin`
e entre com a senha do `.env`.

### Testando sem uma API de WhatsApp de verdade

Em outro terminal:

```bash
npm run mock
```

Isso sobe um servidor falso em `http://localhost:4001` que imita o formato
de resposta da UazAPI. No admin, cadastre um cliente com:

- Provedor: **UazAPI**
- URL do servidor: `http://localhost:4001`
- Token: qualquer texto (o mock não valida)

Clique em **Testar conexão** — deve mostrar "QR encontrado: sim". Salve, copie
o link gerado e abra numa aba anônima: você vai ver só a tela do cliente, com
o QR code (uma imagem de 1x1 placeholder) e o status "Aguardando leitura". O
mock finge que conectou depois da 3ª checagem de status (~9 segundos de
polling), e a tela muda sozinha para "WhatsApp conectado".

## Variáveis de ambiente (`.env`)

| Variável         | Obrigatória | Descrição                                                                 |
|------------------|-------------|-----------------------------------------------------------------------------|
| `PORT`           | não (padrão 3000) | Porta do servidor Express                                             |
| `NODE_ENV`       | não (padrão development) | `production` ativa o cookie de sessão com `Secure` (exige HTTPS) |
| `ADMIN_PASSWORD` | **sim**     | Senha única do painel admin. Sem ela, o login sempre falha.                 |

Não existe variável de banco: o SQLite vive em `data/app.db`, criado
automaticamente na primeira execução.

## Cadastrando um cliente de verdade

1. No admin, clique em **Novo cliente**.
2. Escolha o provedor. Os campos de endpoint, autenticação e mapeamento JSON
   são preenchidos com um preset — trate como ponto de partida, não como
   verdade absoluta, porque a documentação pública desses provedores muda
   entre versões de servidor.
3. Preencha URL do servidor, token, e nome da instância (obrigatório na
   Evolution API, que identifica a sessão pela URL).
4. Clique em **Testar conexão**. O painel de debug mostra a resposta bruta dos
   dois endpoints (conectar e status) e se encontrou o QR / o valor de status
   nos caminhos configurados. Ajuste os campos de "Mapeamento da resposta"
   até bater — isso não afeta nada até você salvar.
5. Clique em **Salvar e gerar link**. Copie o link e envie pro cliente.
6. Depois que o cliente conecta, o link se desativa sozinho (mostra "link
   desativado" pra quem tentar abrir de novo). Se precisar reconectar esse
   WhatsApp depois (trocou de aparelho, por exemplo), volte na lista e clique
   em **Reativar** — o mesmo link volta a mostrar QR code.

## Segurança

- O token da instância só existe no banco e nas chamadas que o backend faz
  pro provedor. Nunca aparece em nenhuma URL nem em nenhuma resposta enviada
  ao navegador do cliente final.
- O link público usa um slug aleatório de 8 bytes (`/c/<slug>`), não
  sequencial e sem relação com o nome ou id do cliente.
- Login do admin é uma sessão por cookie `httpOnly`, comparação de senha em
  tempo constante, e rate limit de 15 tentativas a cada 15 minutos por IP.
- As rotas públicas (`/c/:slug/qr` e `/c/:slug/status`) têm rate limit por IP
  pra segurar abuso caso um link vaze.
- Se a API do provedor falhar ou der timeout, o cliente final só vê "tentando
  novamente" — o erro técnico real fica só no campo de erro do cliente no
  admin (visível reabrindo a edição, e retornado bruto no teste de conexão).

## Deploy em produção

Este projeto é um processo Node.js único com um arquivo SQLite em disco —
ele precisa de **disco persistente** e de um **processo de longa duração**
(nada de serverless/functions efêmeras, que perderiam o banco a cada deploy
e não seguram bem os endpoints de polling).

### Opção recomendada: VPS (DigitalOcean, Hetzner, etc.)

```bash
git clone <seu-repositorio>
cd elo-whatsapp
npm install --omit=dev
cp .env.example .env
# edite .env: ADMIN_PASSWORD forte, NODE_ENV=production

# processo de longa duração com PM2
npm install -g pm2
pm2 start server/index.js --name elo-whatsapp
pm2 save
pm2 startup   # segue as instruções pra sobreviver a reboot
```

Coloque um reverse proxy (Nginx) na frente com HTTPS (Certbot/Let's Encrypt),
apontando pra `http://localhost:3000`. Com `NODE_ENV=production` o cookie de
sessão do admin exige HTTPS — sem o proxy com certificado, o login não vai
manter sessão.

Exemplo mínimo de bloco Nginx:

```nginx
server {
  listen 443 ssl;
  server_name seu-dominio.com;

  location / {
    proxy_pass http://localhost:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Faça backup do arquivo `data/app.db` periodicamente (é o único estado que
importa).

### Opção recomendada pra quem não usa terminal: EasyPanel

O projeto já vem com `Dockerfile`. No EasyPanel:

1. Crie um App novo, com origem "GitHub" apontando pra este repositório.
2. O EasyPanel detecta o `Dockerfile` sozinho e builda a imagem.
3. Em variáveis de ambiente, defina `ADMIN_PASSWORD` (obrigatória) e
   `NODE_ENV=production`.
4. Adicione um **volume persistente** montado em `/app/data` — sem isso o
   banco SQLite é apagado a cada novo deploy.
5. Configure o domínio na aba de domínio do app; o EasyPanel cuida do
   certificado HTTPS sozinho.

### Opção alternativa: Railway ou PaaS parecido

Funciona, mas exige um **volume persistente** montado em `data/` — sem isso,
o SQLite é apagado a cada novo deploy. Configure o volume antes do primeiro
deploy e aponte pra `/app/data` (ou o caminho equivalente da plataforma).
Defina `PORT`, `NODE_ENV=production` e `ADMIN_PASSWORD` nas variáveis de
ambiente do serviço.

### Não recomendado: Vercel ou serverless puro

Funções serverless não seguram processo nem disco entre invocações. O SQLite
seria apagado a cada cold start e o polling das telas de cliente não teria
onde persistir estado. Se precisar hospedar assim por algum motivo, troque
o SQLite por um banco externo (Postgres, Turso) antes — fora isso, a lógica
de rotas continua a mesma.

## Estrutura do projeto

```
elo-whatsapp/
  server/
    index.js          # bootstrap do Express
    db.js              # schema e conexão SQLite
    auth.js            # sessão do admin (cookie + senha única)
    providers.js        # presets de UazAPI / Evolution API / Wuzapi
    lib/
      httpClient.js     # chamadas HTTP ao provedor, sempre no servidor
      jsonPath.js         # leitura de campo por caminho tipo "instance.status"
      util.js              # resolução de {instance} no path, normalização de QR
      slug.js               # geração do slug aleatório do link público
    routes/
      admin.js           # login, CRUD de clientes, testar conexão
      public.js            # página do cliente, GET /c/:slug/qr e /status
  public/
    shared/tokens.css   # design tokens compartilhados (bg0–4, t1–3, grn/amb/red/blu)
    admin/                # painel admin (SPA vanilla JS)
    client/                # tela pública do cliente
  mock-provider/
    server.js           # API falsa pra testar o fluxo sem provedor real
  data/                  # banco SQLite (gitignored)
```
