# Benchmark — ERP de Administração de Imóveis

**Referência principal:** [MSYS Imob](https://www.msysimob.com.br) · **Data:** Julho/2026

Este documento mapeia o MSYS Imob como benchmark funcional para o desenvolvimento do nosso ERP de administração de locação, compara com os principais players do mercado brasileiro e define o nosso diferencial competitivo: o **módulo de Atendimento com IA**.

---

## 1. Visão geral do benchmark (MSYS Imob)

| Item | Descrição |
|---|---|
| **Posicionamento** | Sistema 100% online para imobiliárias: captação → CRM → esteira digital de locação → administração de contratos |
| **Público-alvo** | Imobiliárias e administradoras de locação de pequeno e médio porte |
| **Módulos principais** | CRM (funil de vendas/locação), ADM (financeiro com plano de contas, DRE, comissões), Esteira Digital de locação |
| **Apps mobile** | MSYS Vistorias, MSYS Captação, MSYS Serviços (Android e iOS) |
| **Modelo** | SaaS por assinatura (preço sob consulta, venda consultiva) |

O MSYS cobre **toda a operação pós-captação**: o imóvel entra na carteira e o sistema cuida do contrato, da cobrança, do repasse e das obrigações fiscais.

---

## 2. Mapa funcional detalhado

Cada subitem abaixo é um requisito funcional que o nosso sistema precisa cobrir para estar em paridade com o benchmark.

### 2.1 📋 Gestão de contratos

| Funcionalidade | O que precisa fazer |
|---|---|
| Cadastro de contratos de locação | Vincular imóvel + proprietário(s) + inquilino(s) + fiador/garantia, com datas, valores e condições |
| Geração de contratos | Templates com variáveis (merge de dados do cadastro) gerando PDF/DOCX |
| Aditivos | Alterações contratuais versionadas, mantendo histórico do contrato original |
| Renovações | Alerta de vencimento + fluxo de renovação (novo período, novo valor) |
| Reajustes automáticos | Aplicação automática por índice (IGP-M, IPCA, IVAR) na data de aniversário, com atualização das cobranças futuras |
| Controle de vencimentos | Dashboard/alertas de contratos a vencer, seguros a renovar, garantias expirando |
| Assinatura digital | Fluxo de assinatura eletrônica com validade jurídica (ver 2.7) |

### 2.2 💰 Financeiro

| Funcionalidade | O que precisa fazer |
|---|---|
| Emissão de boletos | Boleto registrado via API bancária (ex.: banco emissor ou gateway como Asaas/Iugu/Gerencianet) |
| PIX | QR Code dinâmico na cobrança, com baixa automática via webhook |
| Cartão | Pagamento de aluguel por cartão de crédito (com repasse da taxa configurável) |
| Controle de recebimentos | Baixa automática (webhook/retorno bancário) e manual; multa e juros calculados automaticamente |
| Inadimplência | Régua de cobrança automática (e-mail, WhatsApp, SMS), relatório de atrasados, negativação/protesto (fase 2) |
| Cobranças automáticas | Geração recorrente mensal das faturas do contrato (aluguel + encargos: condomínio, IPTU, seguro, água/luz quando administrados) |
| Taxa de administração | Cálculo automático (% sobre aluguel ou sobre o total, configurável por contrato), incluindo 1º aluguel/taxa de intermediação |
| Repasse a proprietários | Cálculo automático (recebido − taxa adm − despesas do imóvel − IR retido) com transferência/relatório de repasse, garantido ou pós-recebimento |
| Comissões | Comissão de corretores/captadores por contrato fechado |
| Fluxo de caixa | Entradas/saídas com previsto × realizado |
| Receitas e despesas | Plano de contas, DRE, lançamentos por centro de custo/imóvel |
| Conciliação bancária | Importação OFX / API bancária e conciliação com lançamentos |

### 2.3 🏠 Gestão dos imóveis

| Funcionalidade | O que precisa fazer |
|---|---|
| Cadastro de imóveis | Ficha completa: endereço, tipologia, matrícula, IPTU, condomínio, medidores, fotos |
| Cadastro de proprietários | Pessoa física/jurídica, dados bancários para repasse, % de propriedade (multipropriedade) |
| Cadastro de inquilinos | Dados cadastrais, documentos, garantias, histórico |
| Histórico do imóvel | Timeline: contratos anteriores, manutenções, vistorias, reajustes |
| Vagos × alugados | Status do imóvel (disponível, alugado, em reforma, inativo) com tempo de vacância |
| Carteira de locação | Visão consolidada: nº de contratos ativos, valor total administrado, ticket médio, churn |

### 2.4 📄 Documentação (GED)

- Armazenamento em nuvem de contratos, laudos, vistorias (com fotos), documentos de clientes.
- Documentos vinculados às entidades (imóvel, contrato, pessoa) com controle de validade (ex.: seguro incêndio vencendo).
- Vistoria de entrada/saída com app mobile (fotos + checklist), gerando laudo comparativo — no MSYS é o app **MSYS Vistorias**.

### 2.5 🧾 Obrigações fiscais

- **DIMOB**: geração automática do arquivo anual (obrigatório para administradoras) a partir dos contratos e valores recebidos.
- **IR do proprietário**: cálculo do carnê-leão/IR retido sobre aluguel de PF → PJ e informe anual de rendimentos.
- **NFS-e**: emissão de nota da taxa de administração em prefeituras integradas.
- Relatórios fiscais de apoio ao contador.

### 2.6 📊 Relatórios e dashboard

- Financeiros (recebimentos, repasses, DRE, fluxo de caixa).
- Inadimplência (aging: 15/30/60/90 dias).
- Repasses por proprietário e por período.
- Dashboard da administradora: contratos ativos, vacância, inadimplência %, receita de taxa adm, crescimento da carteira.

### 2.7 📱 Assinatura digital

- Assinatura pelo celular (link por WhatsApp/e-mail, sem necessidade de app).
- Validade jurídica (ICP-Brasil ou assinatura eletrônica avançada — MP 2.200-2 / Lei 14.063).
- **Reconhecimento facial** para validação do signatário + trilha de auditoria (IP, geolocalização, timestamp).
- Opções de build vs. buy: integrar Clicksign, ZapSign, D4Sign ou Autentique via API (recomendado para o MVP).

---

## 3. Panorama competitivo

| Player | Foco | IA | Observação |
|---|---|---|---|
| **MSYS Imob** | Ciclo completo captação → locação → adm | Não divulgada | Benchmark principal; forte em esteira digital + apps de vistoria |
| **Superlógica** | Financeiro/cobrança de locação e condomínios | Parcial | Líder em cobrança; integração com Arbo |
| **Kenlo (Imoview)** | Vendas + locação + sites | **LYA** (assistente IA) | Suíte ampla, referência em locação pesada |
| **Jetimob** | CRM + gestão de locação | Parcial | Referência para imobiliárias de locação |
| **Imobzi** | Gestão completa com automações | Parcial | Forte em automação e app próprio |
| **Vista CRM / Loft** | CRM de vendas e locação | Parcial | Referência de mercado em CRM |

**Leitura do mercado:** todos cobrem bem contrato + cobrança + repasse. A IA aparece como assistente do corretor (Kenlo LYA, Imobisoft Tessy), mas **nenhum player entrega atendimento por IA ao locatário e ao proprietário integrado aos dados operacionais do sistema** — essa é a lacuna que vamos ocupar.

---

## 4. Nosso diferencial: Atendimento com IA 🤖

O módulo que nos separa do benchmark:

### 4.1 Painel de conversas
- Inbox unificado de conversas (WhatsApp como canal principal).
- **Botão de troca de contexto locatário ⇄ proprietário**: o atendente/IA alterna a visão conforme o perfil de quem está falando.
- Visão do atendente humano com takeover: a IA atende, o humano assume quando necessário (handoff).

### 4.2 IA de atendimento
- A IA responde dúvidas e executa ações consultando **os dados reais do sistema**:
  - **Locatário:** 2ª via de boleto/PIX, status de pagamento, valor do próximo aluguel, data de reajuste, abertura de chamado de manutenção, agendamento de vistoria.
  - **Proprietário:** valor e data do próximo repasse, extrato de repasses, situação do inquilino (em dia/inadimplente), status de vacância do imóvel, documentos (informe de rendimentos).
- Escalonamento automático para humano em casos sensíveis (negociação de dívida, rescisão, reclamação grave).

### 4.3 Banco de dados de conversas
- Histórico completo de conversas por pessoa (locatário e proprietário), vinculado ao cadastro no sistema.
- Cada conversa referencia as entidades envolvidas (contrato, imóvel, fatura) — permitindo auditoria e contexto para a IA em atendimentos futuros.
- Base para métricas: tempo de resposta, taxa de resolução pela IA, temas mais frequentes.

### 4.4 Arquitetura sugerida do módulo

```
WhatsApp (Cloud API) ──► Gateway de mensagens ──► Orquestrador da IA (Claude API + tools)
                                                       │
                              ┌────────────────────────┼──────────────────────┐
                              ▼                        ▼                      ▼
                      Tools de consulta         Tools de ação          Handoff humano
                   (faturas, repasses,       (2ª via, chamado,       (painel de conversas)
                    contratos, imóveis)       agendamento)
                              │
                              ▼
                   Banco de dados do ERP  ◄──►  Tabela de conversas/mensagens
```

- A IA usa *tool use* para consultar o banco do ERP — nunca inventa valores.
- Identificação do interlocutor pelo telefone → match com cadastro → define o contexto (locatário/proprietário) automaticamente, com o botão do painel permitindo troca manual.

---

## 5. Modelo de dados — entidades centrais

```
Pessoa (PF/PJ) ──┬── Proprietário ──── Imóvel ──── Contrato ──── Fatura ──── Pagamento
                 └── Inquilino ────────────────────────┘             │
                                                                     └── Repasse
Contrato ── Aditivo / Renovação / Reajuste
Imóvel ── Vistoria ── Fotos/Laudo
Pessoa ── Documento (GED)
Pessoa ── Conversa ── Mensagem (módulo IA)
Financeiro: PlanoDeContas ── Lançamento ── ContaBancária (conciliação)
```

---

## 6. Roadmap sugerido (MVP → paridade → diferencial)

| Fase | Escopo | Resultado |
|---|---|---|
| **1 — Núcleo operacional** | Cadastros (imóvel, proprietário, inquilino), contratos com reajuste automático, geração de faturas, boleto/PIX via gateway, taxa adm + repasse | Sistema já administra uma carteira real |
| **2 — Financeiro completo** | Régua de inadimplência, fluxo de caixa, conciliação, comissões, relatórios e dashboard | Paridade financeira com o benchmark |
| **3 — Documentos e fiscal** | GED, vistorias, assinatura digital (integração), DIMOB, informe de rendimentos, NFS-e | Paridade total com o MSYS |
| **4 — Atendimento IA** ⭐ | Painel de conversas, WhatsApp, IA com tools sobre os dados do ERP, histórico de conversas | **Diferencial competitivo** — pode ser antecipada em versão básica (consultas de boleto/repasse) já na Fase 2 |

> **Recomendação:** antecipar uma versão mínima do Atendimento IA (2ª via de boleto e consulta de repasse via WhatsApp) para a Fase 2 — é barata de construir sobre o núcleo e já é o argumento de venda que nenhum concorrente tem.

---

## Fontes

- [MSYS Imob — site oficial](https://www.msysimob.com.br/)
- [MSYS Imob — apps para imobiliária](https://www.msysimob.com.br/msys-imob-web/frontend/apps-imobiliaria)
- [MSYS Imob — Google Play](https://play.google.com/store/apps/details?id=com.msysimob)
- [Avaliações MSYS Imob — B2B Stack](https://www.b2bstack.com.br/product/msys-imob/avaliacoes)
- [Comparativo de plataformas de gestão de locação 2026 — Pilota](https://blog.pilotaimoveis.com.br/post/plataforma-gestao-de-locacao-imobiliaria-brasil-melhor)
- [Comparativo Superlógica × Kenlo × Imobzi — Pilota](https://blog.pilotaimoveis.com.br/post/plataforma-gestao-alugueis-imobiliarios-brasil-comparacao-superlogica-kenlo-imobzi)
- [Melhor sistema para imobiliária 2026 — Imobisoft](https://imobisoft.com.br/blog/melhor-sistema-para-imobiliaria)
- [6 melhores sistemas imobiliários — Jetimob](https://www.jetimob.com/blog/sistema-imobiliario/)
