# Passo a passo — colocar o sistema no ar

Ordem recomendada: Parte 1 coloca o sistema funcionando (modo demo nas integrações);
as partes seguintes ligam cada provedor real. Tempo total da Parte 1: ~30 minutos.

---

## Parte 1 — Sistema no ar (Vercel + Neon)

1. **GitHub**: faça o merge do branch `claude/benchmark-erp-imobiliario-lwxo49` para o `main`
   (ou aponte o deploy da Vercel direto para o branch).
2. **Vercel** ([vercel.com](https://vercel.com)) → **Add New → Project** → importe o repositório
   `administrativo`. Framework: Next.js (detectado sozinho). **Não faça o deploy ainda.**
3. **Neon**: no projeto da Vercel → aba **Storage** → **Create Database → Neon (Postgres)** →
   conecte. Isso cria as envs `DATABASE_URL` (com pooler) e `DATABASE_URL_UNPOOLED`
   automaticamente — o build usa as duas sozinho.
   - *Se preferir usar um projeto Neon já existente*: copie do painel do Neon a connection
     string **pooled** para `DATABASE_URL` e a **direta** para `DIRECT_URL`.
4. **Blob (documentos do GED)**: ainda em **Storage** → **Create → Blob** → conecte ao projeto.
   Isso cria a env `BLOB_READ_WRITE_TOKEN`.
5. **Envs obrigatórias** (Settings → Environment Variables):

   | Env | Valor | Para quê |
   |---|---|---|
   | `AUTH_SECRET` | string longa aleatória (ex.: `openssl rand -hex 32`) | assina os cookies de login |
   | `CRON_SECRET` | outra string aleatória | protege a rotina diária |
   | `APP_URL` | `https://SEU-APP.vercel.app` | links em documentos |

6. **Deploy.** O build sincroniza o schema no Neon e cria os dados de demonstração
   (imobiliária demo + carteira de exemplo).
7. **Acesse** `https://SEU-APP.vercel.app` → entre com `admin@demo.com` / `admin123`,
   ou crie a conta real da sua imobiliária em `/cadastro`.
8. Em **Configurações**, revise: modelo de remuneração (taxa % ou primeiro aluguel),
   multa/juros, % do seguro-fiança, CNPJ e município (usados na DIMOB).

> **Quando for para produção de verdade** (sem dados fictícios): adicione `SEED_DEMO=0`,
> apague os dados demo (Neon → branch → Reset) e faça um redeploy. Com `SEED_DEMO=0`
> o sistema nunca recria/reseta o banco sozinho.

---

## Parte 2 — IA real (Claude API)

Sem isso os agentes respondem em modo demo (não operam cadastros).

1. Crie a conta em [console.anthropic.com](https://console.anthropic.com).
2. **Billing** → adicione créditos e **defina um limite de gasto mensal**
   (os agentes consomem por conversa — comece com um limite baixo, ex.: US$ 20).
3. **API Keys** → crie uma chave.
4. Na Vercel: env `ANTHROPIC_API_KEY` = a chave → **Redeploy**.
5. Teste no painel **Atendimento IA**: simule uma conversa de captação — a IA deve
   coletar os dados e cadastrar proprietário + imóvel de verdade.

---

## Parte 3 — WhatsApp real (uazapi)

1. Contrate/acesse seu servidor **uazapi** — você recebe uma URL do tipo
   `https://SEUSUBDOMINIO.uazapi.com` e um admin token.
2. Crie uma **instância** para a imobiliária → copie o **token da instância**.
3. **Conecte o número**: gere o QR Code da instância e leia com o WhatsApp do
   número da imobiliária (Aparelhos conectados).
4. **Webhook da instância**: configure a URL
   `https://SEU-APP.vercel.app/api/webhooks/uazapi`
   com o evento de **mensagens** habilitado (messages).
5. Na Vercel: env `UAZAPI_URL` = `https://SEUSUBDOMINIO.uazapi.com` → **Redeploy**.
6. No sistema: **Configurações → WhatsApp** → cole o **token da instância** → salvar.
7. **Verifique a conexão sem sair do sistema**: ainda em **Configurações**, na seção
   **🔌 Testar conexão do WhatsApp**, clique em **Verificar conexão** (mostra se a
   instância está conectada e o número) e use **Enviar teste** para disparar uma
   mensagem para um número — tudo roda pelo servidor, então funciona mesmo que o
   seu navegador/rede não abra a uazapi.
8. **Teste de ponta a ponta**:
   - mande um WhatsApp de um número desconhecido para o número conectado →
     a IA de vendas deve responder;
   - escreva "quero anunciar meu imóvel para alugar" de outro número → IA de captação;
   - mande do telefone de um inquilino cadastrado → IA de administração
     (com os dados reais dele).
9. **Mais imobiliárias** = mais instâncias: cada uma cria a sua na uazapi, aponta o
   webhook para a mesma URL e cola o próprio token nas suas Configurações — o sistema
   roteia pelo token.

> Se alguma mensagem não for respondida, veja o log na Vercel (Deployments → Functions →
> `/api/webhooks/uazapi`) e me mande o JSON recebido — ajusto o parser.

---

## Parte 4 — Cobrança real (Asaas) — opcional, dá para ativar depois

1. Crie a conta PJ no [asaas.com](https://www.asaas.com) (para testar sem dinheiro real,
   use o **sandbox**: [sandbox.asaas.com](https://sandbox.asaas.com)).
2. Menu **Integrações → API** → gere a **API Key**.
3. Na Vercel:
   - `ASAAS_API_KEY` = a chave;
   - sandbox: `ASAAS_BASE_URL` = `https://api-sandbox.asaas.com/v3`
     (produção: não precisa, já é o padrão).
4. **Webhook** no painel do Asaas (Integrações → Webhooks):
   - URL: `https://SEU-APP.vercel.app/api/webhooks/cobranca`
   - Eventos: **cobrança recebida/confirmada** (PAYMENT_RECEIVED, PAYMENT_CONFIRMED)
   - Token de autenticação: crie um e coloque o mesmo valor na env
     `WEBHOOK_COBRANCA_TOKEN` da Vercel.
5. Redeploy. A partir daí: gerar faturas emite boleto/PIX reais, e o pagamento dá
   baixa sozinho (gera repasse + avisa o proprietário no WhatsApp).

---

## Parte 5 — Assinatura digital (ZapSign) — opcional

1. Conta em [zapsign.com.br](https://zapsign.com.br) → **API** → copie o token.
2. Na Vercel: `ZAPSIGN_API_TOKEN` = o token → redeploy.
3. Webhook no painel da ZapSign: `https://SEU-APP.vercel.app/api/webhooks/assinatura`
   (evento de documento assinado).
4. No contrato → "✍️ Enviar para assinatura": cria o documento na ZapSign com
   assinatura por selfie; quando todos assinam, o contrato marca **Assinado** sozinho.

---

## Parte 6 — Rotina diária (já configurada)

O `vercel.json` agenda `/api/cron/rotinas` todo dia às 8h (Brasília): gera as faturas
do mês, marca atrasadas, roda a régua de cobrança às segundas e dispara follow-up de
leads frios. Só precisa da env `CRON_SECRET` (Parte 1). Para rodar manualmente:

```bash
curl -H "Authorization: Bearer SEU_CRON_SECRET" https://SEU-APP.vercel.app/api/cron/rotinas
```

---

## Checklist final

- [ ] Login funciona e o dashboard abre
- [ ] Configurações revisadas (remuneração, multa/juros, seguro-fiança, CNPJ/município)
- [ ] IA real ativa (`ANTHROPIC_API_KEY`) — teste no painel de Atendimento
- [ ] WhatsApp: mensagem de teste respondida pela IA no número real
- [ ] Cobrança: fatura de teste no sandbox do Asaas com baixa automática
- [ ] `SEED_DEMO=0` + banco limpo antes de dados reais
- [ ] Antes do primeiro cliente: contrato revisado por advogado e DIMOB validada
      no programa da Receita com o contador
