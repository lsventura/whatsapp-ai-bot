# ProfitChart (Nelogica) — regras de coloração em NTSL

Exemplos de **Regra de Coloração** (função `PaintBar`) baseada em fluxo de mercado, escritos em **NTSL**
(*Nelogica Trading System Language*).

| Arquivo | Dados usados | Requisito |
|---|---|---|
| [`coloracao_fluxo_agressao.ntsl`](coloracao_fluxo_agressao.ntsl) | Volume de **agressão** compradora × vendedora (`AgressionVolBuy` / `AgressionVolSell`) | Plugin TR (Pro), Ultra ou módulo Scalper |
| [`coloracao_volume_preco.ntsl`](coloracao_volume_preco.ntsl) | Quantidade vs. média + posição do fechamento no candle | Todas as versões |

## O que foi verificado (e como)

Todas as funções, constantes de cor e construções de sintaxe usadas foram conferidas no
**Manual NTSL oficial da Nelogica** ([PDF](https://downloadserver-cdn.nelogica.com.br/content/profit/manual_ntsl/ManualNTSL.pdf)):

- `PaintBar(Cor: Integer)` — seção 19.18; cores `clVerde`, `clVermelho`, `clAmarelo`, `clCinza` — lista de constantes de cor;
- `AgressionVolBuy()`, `AgressionVolSell()`, `AgressionVolBalance()` — seções 20.7 a 20.9 (disponíveis nos produtos Pro com Plugin TR, Ultra ou módulo Scalper);
- `Media(Periodo, Serie)` — seção 25.8; séries `Quantity`, `High`, `Low`, `Close` — seção 4.2;
- blocos `input` / `var` / `begin … end`, atribuição `:=`, `if … then … else`, comentários `//` — exemplos do próprio manual.

## Limitações — leia antes de usar

- **Não consegui compilar estes arquivos dentro do ProfitChart** (software Windows proprietário, sem acesso no
  ambiente onde o repositório foi criado). A sintaxe foi validada contra os exemplos do manual, mas o primeiro
  passo ao usar é compilar no *Editor de Estratégias* e, se aparecer algum erro, ajustar.
- O manual descreve `AgressionVolBuy/Sell` apenas como o indicador "TR - Volume de Agressão - Compra/Venda"
  (exemplo: `Plot(AgressionVolBuy)`). Antes de confiar na coloração, plote `AgressionVolBuy`, `AgressionVolSell`
  e `AgressionVolBalance` no mesmo gráfico para confirmar que os valores se comportam **por candle**, como você espera.
- Isto é código educacional de exemplo, **não é recomendação de investimento**. Teste/ajuste os parâmetros no
  seu ativo e timeframe (os valores padrão são só ponto de partida).
