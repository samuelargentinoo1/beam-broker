# Administrativo — SaaS de Gestão de Locação com IA

**SaaS multi-imobiliária**: cada imobiliária cria sua conta, configura suas regras de negócio e opera com os três agentes de IA. ERP completo: contratos, cobrança, repasses, inadimplência e **atendimento por IA** para locatários e proprietários. Construído a partir do [benchmark do MSYS Imob](docs/benchmark.md).

## Módulos

| Módulo | O que faz |
|---|---|
| 📊 **Dashboard** | Contratos ativos, vacância, inadimplência %, repasses pendentes, resultado do mês, contratos a vencer |
| 🎯 **Leads (CRM)** | Pipeline de locação (novo → atendimento → visita → proposta → fechado), temperatura, origem, agendamento de visita |
| 🤝 **Propostas** | Proposta de locação com **análise de crédito automática** (score + comprometimento de renda); aprovada vira contrato em um clique, criando o cadastro do inquilino |
| 🔧 **Ocorrências** | Chamados de manutenção por imóvel/contrato com custo e responsável — custo do proprietário **abate do repasse**, do inquilino **soma na próxima fatura** |
| 🔑 **Chaves** | Controle de retirada/devolução com alerta de atraso |
| ⚖️ **Jurídico** | Aditivos (renovação de prazo, valor, garantia — reabrem o ciclo de assinatura), **rescisão antecipada com multa proporcional** (3 aluguéis pro rata, Lei 8.245/91) gerando fatura de rescisão |
| 🤝 **Acordos** | Parcelamento de dívida do inadimplente: valor atualizado (multa+juros), desconto opcional, parcelas com PIX/boleto próprios, faturas originais canceladas |
| 🛡️ **Seguros** | Seguros/garantias por contrato (incêndio, fiança) com alerta de vigência |
| 🕵️ **Auditoria** | Trilha das ações críticas (pagamentos, repasses, acordos, rescisões, propostas) |
| 🏠 **Imóveis** | Cadastro com status (disponível/alugado/em reforma), histórico de contratos e vistorias |
| 👥 **Pessoas** | Cadastro único — a pessoa vira proprietária ao ter imóvel e inquilina ao ter contrato; dados bancários/PIX para repasse |
| 📋 **Contratos** | Vínculo imóvel + inquilino, taxa adm por contrato, índice de reajuste (IGP-M/IPCA/IVAR), aplicação de reajuste com histórico, alerta de vencimento, encerramento |
| 💰 **Faturas** | Geração recorrente mensal (aluguel + condomínio + IPTU), baixa por PIX/boleto/cartão com **multa 2% + juros 1% a.m. pro rata** automáticos |
| 🏦 **Repasses** | Cálculo automático: valor pago − taxa de administração; receita da taxa lançada no financeiro |
| ⚠️ **Inadimplência** | Aging (1–15, 16–30, 31–60, 60+ dias), valor devido atualizado com encargos, **régua de cobrança por WhatsApp** (mensagem + PIX, registrada no histórico do atendimento) |
| 🤖 **Atendimento IA** | **Três agentes que operam o sistema pela conversa** (ver abaixo). Painel com seletor de agente, histórico persistido, webhook WhatsApp (uazapi) com roteamento automático |
| 📄 **Documentos (GED)** | Upload com vínculo a pessoa/imóvel/contrato, controle de validade com alerta de vencimento, download seguro |
| ✍️ **Assinatura digital** | Documento do contrato gerado com merge dos dados (imprimível/PDF), envio para assinatura (ZapSign) com selfie, status no contrato, webhook de conclusão |
| 🧾 **Fiscal** | Arquivo **DIMOB** por ano-calendário (registros R01/R02/T9), informe anual de rendimentos por proprietário (imprimível para o IR) |
| 🔐 **Autenticação** | Login com cookie HMAC httpOnly, middleware protegendo todas as rotas (webhooks externos ficam abertos com token próprio) |

## Stack

- **Next.js 16** (App Router, Server Actions, Middleware) + TypeScript + Tailwind CSS 4
- **Prisma 6** + **PostgreSQL (Neon)** — `DATABASE_URL` com pooler + `DIRECT_URL` sem pooler
- **Vercel** para hospedagem; documentos do GED no **Vercel Blob**
- **Claude API** (`@anthropic-ai/sdk`) no módulo de atendimento, com fallback local determinístico quando não há chave configurada

## Integrações (todas com modo demo)

Cada integração externa tem um adaptador que opera em **modo demo** sem credenciais — o fluxo do sistema é idêntico; configurar a env liga o provedor real:

| Integração | Provedor | Env | Webhook |
|---|---|---|---|
| Cobrança (boleto/PIX/cartão) | Asaas | `ASAAS_API_KEY` | `POST /api/webhooks/cobranca` — baixa automática, gera repasse |
| Atendimento WhatsApp | **uazapi** (principal) | `UAZAPI_URL` + token da instância por imobiliária (Configurações) | `POST /api/webhooks/uazapi` — IA responde pelo canal |
| Assinatura digital | ZapSign | `ZAPSIGN_API_TOKEN` | `POST /api/webhooks/assinatura` — marca contrato assinado |
| IA de atendimento | Claude API | `ANTHROPIC_API_KEY` | — |
| Voz da IA (fala) | MiniMax T2A | API Key por imobiliária (Configurações) · `MINIMAX_MODELO`, `MINIMAX_VOZ_PADRAO` | — |
| Transcrição do áudio do cliente | ElevenLabs | API Key por imobiliária (Configurações) | — |

Veja todas as variáveis em [.env.example](.env.example).

### Voz da IA

A chave da MiniMax é de cada imobiliária e fica em **Configurações**; as duas
variáveis abaixo são do produto inteiro e só existem para não precisar de deploy
quando a MiniMax lançar modelo novo ou quando alguém quiser fixar uma voz.

| Env | Padrão | Para que serve |
|---|---|---|
| `MINIMAX_MODELO` | `speech-2.8-hd` | Modelo de fala. O 2.8 tem nuance tonal melhor e suporta tags de interjeição — `(laughs)`, `(sighs)`, `(breath)` — que viram som de verdade. A família `speech-02-*` é legada e lia essas tags em voz alta. Use **HD**, não turbo: os áudios do atendimento são curtos, então a latência não é o gargalo. |
| `MINIMAX_VOZ_PADRAO` | *(vazio)* | Fixa um `voice_id`. Em branco, o sistema lista as vozes da conta (`get_voice`) e escolhe uma brasileira de registro conversacional. **Nunca invente um ID aqui**: um `voice_id` inexistente faz a MiniMax responder HTTP 200 sem áudio — falha silenciosa. Copie o valor da resposta do `get_voice`. |

## Rodando

```bash
npm install
# edite o .env com o DATABASE_URL/DIRECT_URL do seu Neon (o arquivo é criado
# do .env.example na primeira execução)
npm run dev             # http://localhost:3000
```

O `npm run dev` prepara tudo sozinho: cria o `.env` se não existir, gera o Prisma Client, aplica as **migrations versionadas** no banco local (`prisma migrate deploy`) e roda o seed de demonstração quando o banco está vazio (desative com `SEED_DEMO=0`). Para forçar manualmente: `npm run setup`.

O schema do banco é controlado por **migrations do Prisma** (`prisma/migrations/`), não mais por `db push`. Ao alterar `prisma/schema.prisma`, gere a migration com `npm run db:migrate` e faça commit dela. Em produção, o `build` roda `prisma migrate deploy` automaticamente. `npm run db:push` existe apenas para prototipagem local rápida — não use contra o banco de produção.

## Deploy na Vercel (com Neon)

1. Importe o repositório na Vercel (framework: Next.js — sem configuração extra).
2. Conecte a integração **Neon** (ou defina manualmente as envs):
   - `DATABASE_URL` — connection string **com pooler** (`...-pooler....neon.tech`) — usada pelo app em runtime.
   - `DIRECT_URL` — connection string **sem pooler** — **obrigatória**: o `prisma migrate deploy` do build aplica as migrations por ela (o pooler do Neon não suporta as sessões de migration). A integração da Vercel também expõe `DATABASE_URL_UNPOOLED`, que o preparo de dev usa como fallback.
3. Crie um **Vercel Blob store** e conecte ao projeto (`BLOB_READ_WRITE_TOKEN`) para o GED.
4. Defina `AUTH_SECRET`, `ADMIN_EMAIL`, `ADMIN_SENHA` e `ANTHROPIC_API_KEY` (IA real no atendimento).
5. Deploy — o build roda `prisma migrate deploy` (aplica as migrations pendentes no Neon via `DIRECT_URL`) e então `next build`. O seed de demonstração **não** roda em produção.

Webhooks para configurar nos provedores após o deploy: `https://SEU-APP.vercel.app/api/webhooks/uazapi` (uazapi — evento de mensagens da instância), `/api/webhooks/cobranca` (Asaas), e `/api/webhooks/assinatura` (ZapSign).

Para habilitar a IA real no atendimento, adicione `ANTHROPIC_API_KEY` ao `.env`. Sem a chave, o módulo funciona em modo demo com um motor de intenções local que consulta o mesmo contexto do banco.

## Os três agentes de IA

Toda informação colhida nas conversas **vira registro no sistema** — os agentes têm ferramentas (*tool use* da Claude API) que escrevem no banco, com trilha de auditoria:

| Agente | Fala com | Ferramentas que a IA executa |
|---|---|---|
| 📥 **IA de Captação** | Proprietário que quer alugar o imóvel dele | `cadastrar_proprietario`, `cadastrar_imovel` (o imóvel entra na carteira como disponível), `buscar_imoveis_disponiveis` |
| 🎯 **IA de Vendas de Locação** | Interessado em alugar | `registrar_lead` (CRM), `buscar_imoveis_disponiveis`, `agendar_visita`, `registrar_proposta` (com análise de crédito na hora) |
| 🏢 **IA de Administração** | Locatário e proprietário da carteira | contexto completo do cliente (faturas, repasses, contratos) + `abrir_ocorrencia` (chamado de manutenção) |

**Roteamento no WhatsApp:** número da carteira → Administração; número desconhecido → Vendas; desconhecido falando em "anunciar/colocar meu imóvel para alugar" → Captação. Sem `ANTHROPIC_API_KEY`, os agentes respondem em modo demo (a Administração mantém o motor local com dados reais).

**Memória de longo prazo:** cada conversa acumula um resumo do que a IA já sabe do contato (nome, preferências, valores discutidos, combinados) — quando o histórico cresce, as mensagens antigas são sumarizadas automaticamente e o resumo entra no contexto de todas as conversas futuras daquele contato.

**Ações proativas (as IAs falam primeiro):**
- Aluguel pago → o proprietário recebe na hora o aviso com o valor e o repasse agendado (já descontando manutenções).
- Repasse transferido → aviso com o valor e a chave PIX de destino.
- Leads parados há 3+ dias → follow-up automático da IA de vendas (personalizado com o imóvel de interesse), no máximo 1 por semana por lead.
- **Rotina diária** (`/api/cron/rotinas`, agendada no `vercel.json` às 8h BRT): gera as faturas do mês automaticamente, marca as vencidas como atrasadas, roda a régua de cobrança às segundas e dispara os follow-ups. Proteja com `CRON_SECRET`.

## Arquitetura do Atendimento IA

```
Cliente (WhatsApp*) ──► POST /api/atendimento ──► gerarResposta()
                                                      │
                                        montarContexto(pessoaId, perfil)
                                                      │  consulta Prisma:
                                                      │  contratos, faturas, repasses
                                                      ▼
                                          Claude API (claude-opus-4-8)
                                          system = regras + dados do sistema
                                                      │
                              Mensagem persistida (Conversa por pessoa+perfil)
```

\* No MVP o canal é simulado pelo painel; a integração WhatsApp Cloud API entra na próxima fase (webhook → mesma rota).

## Multi-tenant (SaaS)

- **Cadastro público** em `/cadastro`: a imobiliária cria a conta, escolhe o modelo de remuneração e já entra operando. Dados 100% isolados por imobiliária.
- **Regras financeiras por imobiliária** (padrão dos novos contratos, ajustável em Configurações e por contrato):
  - **Remuneração**: taxa de administração mensal (%) **ou** primeiro aluguel (a imobiliária fica com o 1º aluguel do contrato, sem taxa mensal);
  - **Multa e juros** de atraso configuráveis (padrão 2% + 1% a.m.);
  - **Seguro-fiança**: % do aluguel (padrão 11%) somado à fatura mensal do inquilino quando a garantia é seguro-fiança — repassado à seguradora, fora do repasse ao proprietário. As IAs de vendas informam o valor total ao cliente antes da proposta.
- **WhatsApp multi-número (uazapi)**: cada imobiliária cria sua instância na [uazapi](https://docs.uazapi.com), conecta o número por QR Code e cola o **token da instância** em Configurações — o webhook `/api/webhooks/uazapi` roteia cada mensagem para o tenant dono da instância (o envio usa o mesmo token). A env `UAZAPI_URL` aponta para o seu servidor uazapi.
- **Handoff humano → IA**: quando a captação/venda é feita por um atendente, o contexto é registrado (botão "🧠 Contexto p/ IA" no painel, campo no cadastro de contrato, ou automático na conversão de proposta) e entra na memória da conversa — a IA de administração assume o cliente sabendo tudo.

## Login (demo)

`admin@demo.com` / `admin123` (imobiliária demo do seed) — em produção use o cadastro público e defina `AUTH_SECRET`.

## Roadmap

Ver [docs/benchmark.md](docs/benchmark.md) — todas as fases do roadmap (1 a 4) estão implementadas:

- [x] Cobrança com gateway (boleto/PIX/cartão) + webhook de baixa automática
- [x] Integração WhatsApp (uazapi) no atendimento + régua de cobrança
- [x] Assinatura digital de contratos + geração do documento com merge de dados
- [x] GED (upload de documentos com validade e vínculos)
- [x] Fiscal: DIMOB e informe de rendimentos
- [x] Autenticação

Próximas evoluções sugeridas:

- [ ] Takeover humano no painel de atendimento (atendente assume a conversa da IA)
- [ ] NFS-e da taxa de administração em prefeituras integradas
- [ ] Vistorias com fotos pelo celular (upload direto no GED)
- [ ] Multiusuário com papéis (admin/financeiro/atendimento) e portal do proprietário
- [ ] Conciliação bancária (importação OFX)
