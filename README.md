<h1 align="center">⭐ sr. vagas – bot de divulgação de oportunidades</h1>

<p align="center">
  <img src="assets/sr-vagas.png" alt="mascote do sr. vagas programando" width="350">
</p>

<p align="center">
  bot do telegram para busca e divulgação automática de oportunidades de emprego e estágio.
</p>

## 🎯 contexto

o **sr. vagas** é um bot desenvolvido para o telegram, criado para facilitar o acesso a oportunidades de emprego, estágio e programas de desenvolvimento profissional.

a proposta do projeto é automatizar a coleta de vagas disponíveis em diferentes plataformas, processar as informações encontradas e encaminhar as oportunidades diretamente para os usuários por meio do telegram.

atualmente, o bot utiliza as seguintes fontes de oportunidades:

- 💼 gupy
- 🏢 sólides
- 🔎 querovagas

o projeto foi desenvolvido com foco na automação da busca por vagas, permitindo centralizar oportunidades em um único canal de comunicação e facilitar o acompanhamento de novas publicações.

## 💫 tecnologias utilizadas

o projeto foi desenvolvido utilizando as seguintes tecnologias e ferramentas:

- node.js
- javascript
- telegram bot api
- web scraping
- cloudflare workers
- cloudflare kv
- wrangler
- git e github

## 💜 arquitetura do projeto

a estrutura do projeto está organizada da seguinte forma:

```plaintext
srvagas_bot/
│
├─ .wrangler/                 # configurações locais do wrangler
├─ node_modules/              # dependências do projeto
│
├─ assets/                    # imagens e recursos visuais
│   └─ sr-vagas.png           # mascote do projeto
│
├─ src/                       # código-fonte principal
│   │
│   ├─ config/                # configurações do bot
│   │   └─ telegram.js        # integração com o telegram
│   │
│   ├─ scrapers/              # módulos de coleta de oportunidades
│   │   ├─ catho.js
│   │   ├─ guppy.js
│   │   ├─ querovagas.js
│   │   └─ solides.js
│   │
│   ├─ index.js               # inicialização e execução do bot
│   └─ util.js                # funções auxiliares
│
├─ .env                       # variáveis de ambiente
├─ enviadas.json              # histórico de vagas enviadas
├─ .gitignore
├─ LICENSE
├─ package.json
├─ package-lock.json
├─ README.md
└─ wrangler.toml              # configurações do cloudflare workers
```

## ☁️ infraestrutura e funcionamento

o **cloudflare workers** funciona como o servidor do sr. vagas. ele hospeda o código e executa o bot na nuvem, sem a necessidade de manter um computador ligado para que a aplicação continue funcionando.

a arquitetura do projeto é organizada em cinco etapas:

1. **telegram:** recebe as mensagens dos usuários e encaminha as solicitações para o worker por meio de um webhook.
2. **cloudflare workers:** recebe as mensagens, executa o `index.js` e coordena as operações do bot.
3. **scrapers:** consultam as plataformas de recrutamento e seleção, como gupy, sólides e querovagas, para coletar as oportunidades disponíveis.
4. **cloudflare kv:** armazena as configurações e o histórico individual de cada usuário.
5. **telegram:** recebe os resultados processados e realiza o envio das oportunidades aos usuários.

### 🔄 fluxo de comunicação

```plaintext
          telegram
              │
              ▼
           webhook
              │
              ▼
      cloudflare workers
              │
              ▼
           index.js
              │
       ┌──────┴───────┐
       ▼              ▼
    scrapers      cloudflare kv
       │              │
       ▼              │
  plataformas         │
   de vagas           │
       │              │
       └──────┬───────┘
              ▼
       processamento
         das vagas
              │
              ▼
           telegram
              │
              ▼
       envio das vagas
         aos usuários
```

o código fica hospedado na infraestrutura da cloudflare. sempre que uma alteração é realizada, basta executar o comando `npx wrangler deploy` para publicar a nova versão do projeto.

assim, o cloudflare funciona como a infraestrutura responsável por manter o sr. vagas disponível na internet.

## 🤖 painel de controle do telegram

o bot possui um painel de controle interativo diretamente no telegram, permitindo configurar as preferências de recebimento sem precisar alterar manualmente o código.

entre as opções disponíveis estão:

- ⏰ **horário de envio:** define o horário em que as oportunidades serão encaminhadas.
- 🌎 **fuso horário:** permite ajustar o horário utilizado pelo agendamento.
- 📊 **quantidade por fonte:** configura o limite de oportunidades enviadas por plataforma.
- 🏠 **modalidade remota:** permite filtrar oportunidades exclusivamente remotas.
- ✅ **incluir termos:** define palavras-chave que devem estar presentes nas oportunidades.
- ❌ **excluir termos:** define palavras-chave que devem ser ignoradas.
- ⏸️ **pausar agendamento:** permite interromper temporariamente os envios automáticos.
- 🧹 **limpar histórico:** permite gerenciar o histórico de oportunidades enviadas.

as configurações podem ser ajustadas diretamente pelos botões disponibilizados na conversa com o bot.

## 🔎 filtros de busca

o projeto conta com um sistema de filtragem para tornar a divulgação das oportunidades mais alinhada às preferências configuradas pelos usuários.

os filtros permitem:

- selecionar oportunidades por palavras-chave.
- ignorar vagas que contenham determinados termos.
- priorizar oportunidades remotas.
- limitar a quantidade de vagas recebidas por fonte.

dessa forma, o bot consegue reduzir oportunidades que não correspondem aos critérios de busca configurados.

## 📂 armazenamento de dados

o projeto utiliza o **cloudflare kv** para armazenar informações relacionadas aos usuários.

entre os dados armazenados estão:

- configurações individuais de cada usuário.
- preferências de busca.
- histórico de oportunidades enviadas.

esse armazenamento permite manter as configurações e o histórico de cada usuário de forma independente, mesmo com a execução do bot na infraestrutura em nuvem.

## 🚀 como executar e publicar o projeto

### pré-requisitos

antes de executar o projeto, é necessário possuir:

- node.js instalado.
- npm instalado.
- conta na cloudflare.
- bot criado através do botfather do telegram.
- token de acesso para integração com o telegram.
- wrangler configurado para acessar a cloudflare.
- recursos necessários do cloudflare kv configurados.

### instalação

1. clone o repositório:

```bash
git clone https://github.com/scriptlver/srvagas_bot.git
```

2. acesse a pasta do projeto:

```bash
cd srvagas_bot
```

3. instale as dependências:

```bash
npm install
```

4. configure as variáveis de ambiente e os recursos necessários no ambiente da cloudflare.

### publicação na cloudflare

para publicar uma nova versão do projeto, execute:

```bash
npx wrangler deploy
```

o comando envia o código atualizado para o cloudflare workers, disponibilizando a nova versão do bot na nuvem.

## 🌿 branches do projeto

o desenvolvimento do projeto é organizado em duas branches principais:

- **main:** versão principal do projeto, destinada a manter uma versão estável.
- **dev:** branch destinada ao desenvolvimento, implementação de funcionalidades e testes.

as alterações são desenvolvidas inicialmente na branch `dev` e, após validação, podem ser integradas à `main`.

## 📌 próximos passos do projeto

o sr. vagas está em desenvolvimento contínuo. algumas melhorias previstas incluem:

- integrar novas plataformas de recrutamento e seleção.
- expandir as fontes de coleta de oportunidades.
- aprimorar os filtros de busca.
- melhorar a identificação de vagas duplicadas.
- implementar novas opções de personalização pelo telegram.
- aprimorar o sistema de agendamento e envio automático.
- expandir as possibilidades de monitoramento das oportunidades.

## 💌 conclusão

o sr. vagas foi desenvolvido com o propósito de simplificar o acompanhamento de oportunidades profissionais por meio da automação.

a utilização de web scraping, integração com a telegram bot api e armazenamento em nuvem permite reunir oportunidades de diferentes plataformas e disponibilizá-las de maneira prática e organizada.

com o cloudflare workers e o cloudflare kv, o projeto conta com uma infraestrutura em nuvem capaz de executar o bot, processar solicitações e armazenar as preferências dos usuários.

o projeto continua em evolução, com a possibilidade de integrar novas fontes de vagas e ampliar suas funcionalidades.
