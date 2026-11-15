# 🏛️ GovCore · Suite de Gestão Departamental para FiveM RP

> **Plataforma centralizada de comando, auditoria operacional, recursos humanos e disciplina interna para corporações de Roleplay.**

![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)
![NodeJS](https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white)
![Discord.js](https://img.shields.io/badge/Discord.js-v14-5865F2?style=for-the-badge&logo=discord&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-316192?style=for-the-badge&logo=postgresql&logoColor=white)

---

## 📌 Sobre o Projeto

O **GovCore** foi desenvolvido de raiz para resolver a fragmentação de gestão entre múltiplos servidores de departamentos num servidor de FiveM RP. Em vez de depender de múltiplos bots genéricos ou folhas de cálculo dispersas, o GovCore atua como uma infraestrutura unificada governada pela Direção e operada pelas respetivas Chefias.

O sistema suporta nativamente 7 entidades oficiais com identidades visuais e terminologias próprias:
- 👮 **PSP** — Polícia de Segurança Pública
- 💂 **GNR** — Guarda Nacional Republicana
- 🧑‍🚒 **RSB** — Regimento de Sapadores Bombeiros
- 🧑‍⚕️ **SEM** — Serviço de Emergência Médica
- 🧑‍⚖️ **STJ** — Supremo Tribunal de Justiça
- 🧑‍🎓 **MP** — Ministério Público
- 🧑‍💻 **ANEPC** — Autoridade Nacional de Emergência e Proteção Civil

---

## 🚀 Módulos & Funcionalidades

### 🏛️ 1. Centro de Controlo & Gestão Central (Direção)
- Homologação e supervisão de novos servidores de departamento num clique.
- Atribuição automática de insígnia, cor oficial e cargo de chefia máxima.
- Auditoria global permanente e sistema de suspensão preventiva.

### ⏱️ 2. Sistema de Picagem de Ponto (Duty Station)
- Picagem de turnos em tempo real com estados: **Em Serviço**, **Em Pausa** e **Fora de Serviço**.
- **Meta Semanal Personalizada:** Cada Chefe define a sua meta de horas semanais (ex: 15h, 20h).
- **Cartão de Produtividade:** Barra de progresso visual (`[████████░░] 80%`) com cálculo de tempo líquido cumprido.
- Roster ativo de efetivo e painel de auditoria semanal com ferramenta de fecho forçado para turnos esquecidos.

### 📢 3. Despachos & Comunicados Oficiais
- Emissão de ordens de serviço com timbre institucional, autor e carimbo digital.
- Pré-visualização antes da transmissão com escolha de canal por envio.
- Notificação de cargos específicos com **bloqueio inviolável de `@everyone`**.

### 🎫 4. Central de Tickets Departamental
- **Balcão Geral (Cidadãos):** Recolha de Nome RP, Cartão de Cidadão/Passaporte e resumo do assunto.
- **Assuntos Internos (Membros):** Linha confidencial exclusiva para assuntos do efetivo.
- Gestão de intervenientes no canal, botão de assumir e encerramento com barra visual regressiva de 5 segundos.
- **Arquivo Automático:** Geração de ficheiro `.txt` com toda a transcrição de mensagens e anexos enviado para o canal de logs.

### 🛡️ 5. Moderação do Discord
- Painel central com seleção de membros e aplicação rápida de **Warn**, **Timeout**, **Kick**, **Ban** e **Unban por ID**.
- **Auto-Mute:** Silenciamento automático de 24 horas ao atingir 3 avisos ativos.
- Ficha de infrações com resumo estatístico consolidado.

### ⚖️ 6. Punições Internas & Processos Disciplinares (RP)
- Registo oficial de Advertências Verbais/Escritas, Suspensões, Despromoções e Expulsões com citação de regulamento/artigo.
- Afixação automática em canal de Boletim Disciplinar.
- **Mecanismo de Revogação:** Permite a superiores anular sanções ativas após provimento de recurso ou cumprimento de pena.

### ↩️ 7. Auditoria Global & Sistema de Desfazer (Undo)
- Registo permanente de todas as operações administrativas com histórico de estado (antes e depois).
- Reversão instantânea via botão com **Regra de Ouro**: retenção de 30 dias para departamentos e permanente para a Direção.

---

## 🛠️ Tecnologias Utilizadas

- **Runtime:** Node.js (v20+)
- **Linguagem:** TypeScript
- **Biblioteca Discord:** Discord.js v14
- **ORM:** Prisma v7
- **Base de Dados:** PostgreSQL

---

## ⚙️ Instalação & Configuração

### 1. Clonar o repositório e instalar dependências
```bash
git clone https://github.com/teu-utilizador/govcore-bot.git
cd govcore-bot
npm install