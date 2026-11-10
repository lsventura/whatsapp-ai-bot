# Teste com o número grátis da Meta

Objetivo: conversar com o bot pelo seu celular, usando o número de teste que a Meta dá de graça.
Seu número pessoal fica só como destinatário de teste. Ele não vira o número do bot.

Nomes de tela conferidos na doc da Meta em 10/11/2026 ("Get started" e "Create a webhook endpoint").
O painel pode estar em português no seu Facebook; os nomes abaixo estão em inglês, como na doc.

## 1. Criar o app (painel da Meta, com sua conta do Facebook)

1. Abra https://developers.facebook.com/apps e clique em **Create App**.
2. Nome do app (ex.: `bot-clinica-teste`) e seu email.
3. Use case: **Connect with customers through WhatsApp** > **Next**.
4. Escolha ou crie o business portfolio > **Next** > **Create app**.
5. Você cai em **Customize use case > Connect on WhatsApp > Quickstart**. Clique em **Start using the API**.

## 2. Pegar token e Phone number ID (tela API Setup)

1. Em **API Setup**, conecte uma conta de WhatsApp. Se não tiver, **Create a WhatsApp Business account**.
2. Clique em **Generate access token**. É o token temporário (dura poucas horas).
3. Em **From**, deixe o número de teste. Logo abaixo aparece o **Phone number ID** dele. Copie.
4. Em **To**, adicione o seu celular (+55 11 9xxxx-xxxx). A Meta manda um código no WhatsApp; digite pra confirmar.
   O número de teste só fala com até 5 números cadastrados assim.
5. Clique em **Send message**. Vai chegar o `hello_world` no seu celular. **Responda essa mensagem** (ex.: "oi"):
   isso abre a janela de 24h em que o bot pode responder.

## 3. Pegar o App Secret

Menu do app > **App settings > Basic** > **App secret** > Show. Serve pra validar a assinatura `X-Hub-Signature-256`.

## 4. Preencher o .env (no computador que vai rodar o bot)

O `.env` não vai pro Git (está no `.gitignore`). Nunca cole token em chat.

```
WHATSAPP_ACCESS_TOKEN=<token do passo 2>
WHATSAPP_PHONE_NUMBER_ID=<Phone number ID do passo 2>
WHATSAPP_APP_SECRET=<App secret do passo 3>
WHATSAPP_VERIFY_TOKEN=<qualquer texto seu; no box já está gerado>
WHATSAPP_API_VERSION=v27.0
```

`LLM_API_KEY` pode ficar vazio: o bot responde pelo FAQ com menu numerado.

## 5. Subir o bot e o túnel

```bash
cd whatsapp-ai-bot
npm install
npm run build && npm start        # terminal 1, porta 3000
npm run tunel                     # terminal 2, instala o cloudflared se faltar
```

O terminal 2 mostra uma URL `https://xxxx.trycloudflare.com`. Ela muda toda vez que o túnel reinicia.

Confere antes de ir pra Meta:

```bash
curl https://xxxx.trycloudflare.com/health                     # {"status":"ok"}
npm run simular -- "oi" 5511900000000 https://xxxx.trycloudflare.com
# esperado: GET 200 (challenge ok), POST 200, assinatura falsa 401
```

Atenção: o túnel não abre a partir do box do Grok Bot (a rede de lá bloqueia a porta 7844 do Cloudflare).
Rode os passos 4 e 5 no seu computador.

## 6. Configurar o webhook (painel da Meta)

1. Vá em **Use cases > Customize > Configuration** (ou **WhatsApp > Configuration**).
2. **Callback URL**: `https://xxxx.trycloudflare.com/webhook`
3. **Verify token**: o mesmo `WHATSAPP_VERIFY_TOKEN` do `.env`. Salve (a Meta faz o GET com `hub.challenge`; o bot responde sozinho).
4. Na lista de campos que aparece, assine **messages**.

## 7. Testar pelo celular

Mande pro número de teste:

- `oi` → menu numerado
- `1`, `2`... → resposta do FAQ
- `quanto custa a avaliação?` → resposta do FAQ
- `quero agendar` → coleta nome, email, telefone, serviço, data, confirma e preenche o formulário de demonstração
- `atendente` → bot silencia; `/bot` volta
- um áudio ou foto → pede pra escrever

Os logs no terminal 1 mostram "mensagem recebida" com o número mascarado.

## Problemas comuns

- **Erro 131030 (destinatário fora da lista)**: o webhook às vezes manda o celular BR sem o 9. O bot já reinsere
  o 9 (`WHATSAPP_BR_ADD_NINTH_DIGIT=true`). Se ainda der erro, confira o número cadastrado em **To**.
- **401 no log / Meta não entrega**: `WHATSAPP_APP_SECRET` errado.
- **Webhook não salva**: túnel caído, URL sem `/webhook`, ou verify token diferente.
- **Token expirou** (erro 190): gere outro em **Generate access token** e reinicie o bot.
  Pra produção, crie um System user em Business Settings e gere token permanente com
  `business_management` e `whatsapp_business_messaging`.
- Túnel reiniciou: a URL muda, atualize a **Callback URL**.
