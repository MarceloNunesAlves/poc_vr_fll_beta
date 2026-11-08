# 🦁🪄 Experiência VR — Aniversário do Luigi & da Letícia (Meta Quest 3)

Experiência imersiva em **WebXR (Three.js + Vite)** projetada para o **Meta Quest 3** com área retangular plana de **4,0m × 1,5m**, inspirada na sala de aula de bruxos de Hogwarts.

---

## 🚀 Como Rodar no Computador e no Meta Quest 3

### 1. Iniciar o servidor local (HTTPS ativado para WebXR)
No terminal, dentro desta pasta, execute:

```bash
npm run dev
```

O Vite mostrará dois endereços no terminal, por exemplo:
- **Local (Mac/PC):** `https://localhost:5173/`
- **Network (Para o Meta Quest 3 no mesmo Wi-Fi):** `https://192.168.X.X:5173/`

> **Nota sobre o certificado HTTPS local:** O Meta Quest 3 exige `https://` para liberar o modo VR em rede local. Na primeira vez que abrir o endereço `https://192.168.X.X:5173` no **Meta Quest Browser**, clique em **"Avançado" -> "Prosseguir / Continuar"** no aviso de certificado local e depois clique no botão **"🥽 Entrar no Modo VR (Meta Quest 3)"**.

---

## 🎮 Fluxo Completo da Experiência (Na Festa)

1. **Tela de Boas-Vindas (Início Fácil para a Fila):**
   - O convidado senta na cadeira física posicionada no início do espaço de **4,0m × 1,5m** e coloca o Meta Quest 3.
   - Basta apertar o **Botão [A]** no controle direito do Quest 3 (ou clicar em *Iniciar Experiência* / tecla `Espaço` no PC).
   - *Dica para o organizador:* Aperte o **Botão [B]** a qualquer momento para recalibrar a posição da cadeira.
2. **Cena 1 — Vídeo 360° Sentado (5 segundos):**
   - Enquanto o arquivo `/public/video/intro360.mp4` ainda não foi adicionado, exibe uma esfera 360° estrelada com um painel de **5 segundos** de contagem regressiva.
   - Assim que você gravar/produzir o vídeo 360°, basta salvá-lo como `public/video/intro360.mp4` e ele será reproduzido automaticamente!
3. **Transição no Escuro & Despertar na Sala de Bruxos:**
   - O vídeo 360° termina e fica **tudo escuro** (`fade to black`).
   - Aos poucos, as velas flutuantes acendem revelando a **Sala de Escola de Bruxos (4m × 1,5m)** com o convidado sentado na cadeira.
4. **Ir até o Final da Sala falar com a Letícia:**
   - Pegadas douradas no tapete guiam o convidado até o final dos 4 metros, onde está a **Letícia** ao lado da Mesa de Varinhas.
   - O convidado pode ir **andando fisicamente** pelo corredor de 4m × 1,5m ou usar o **analógico do controle** (`W A S D` no PC).
5. **Escolher uma Varinha Mágica:**
   - A Letícia pede para o convidado escolher uma das 3 varinhas mágicas na mesa ao lado dela.
   - Basta encostar a mão/controle na varinha (ou apertar o **Botão [A]** / **Gatilho**). A varinha vai direto para a mão do jogador com brilho e vibração!
6. **Voltar ao Início da Sala (Mesa da Professora & Luigi):**
   - A Letícia orienta o jogador a voltar para o início da sala, próximo à **Mesa da Professora**, onde está o **Luigi** e a **grande pena de pássaro branca**.
7. **Feitiço *"Wingardium Leviosa"* (Super Fácil!):**
   - O Luigi ensina o feitiço. Basta apontar a varinha e **levantar a mão** (ou segurar o **Botão [A]** / **Gatilho**).
   - Um feixe dourado conecta a varinha à grande pena branca, fazendo-a flutuar no ar com estrelas e música mágica!
8. **Finalização e Reset de 1 Botão para o Próximo Convidado:**
   - Após a comemoração, aparece o cartão final: basta apertar o **Botão [A]** para voltar imediatamente à tela de boas-vindas para a próxima criança da fila!

---

## 🧙‍♂️ Guia Passo a Passo: Como Criar os Modelos 3D (`.glb`) da Letícia e do Luigi a partir das Imagens

O projeto **já funciona imediatamente** usando as imagens enviadas ([public/assets/leticia.jpg](public/assets/leticia.jpg) e [public/assets/luigi.jpg](public/assets/luigi.jpg)) com recorte automático de fundo transparente em formato de Totem 3D iluminado.

Se você quiser transformá-los em **bonecos 3D completos (`.glb`)** gratuitamente usando Inteligência Artificial a partir das próprias imagens que você enviou, siga este passo a passo (leva menos de 3 minutos por personagem):

### Opção 1: Tripo3D (Gratuito e excelente para personagens de corpo inteiro)
1. Acesse **https://www.tripo3d.ai/** (ou `app.tripo3d.ai`) e crie uma conta gratuita.
2. Clique na aba **Image to 3D** (Imagem para 3D).
3. Faça upload da imagem da **Letícia** (`public/assets/leticia.jpg`) e clique em **Generate**.
4. Em cerca de 30 segundos o modelo 3D colorido estará pronto. Clique em **Download / Export** e escolha o formato **`GLB`**.
5. Renomeie o arquivo baixado para **`leticia.glb`** e coloque dentro da pasta:
   - `public/models/leticia.glb`
6. Repita o processo com a imagem do **Luigi** (`public/assets/luigi.jpg`), baixe como **`luigi.glb`** e coloque em:
   - `public/models/luigi.glb`

> **Pronto!** O código em [src/characters.js](src/characters.js) detecta automaticamente a presença de `public/models/leticia.glb` e `public/models/luigi.glb` e substitui os totens pelos modelos 3D na escala correta!

### Opção 2: Meshy.ai ou Hyper3D Rodin (Alternativas gratuitas Image-to-3D)
- **Meshy.ai (https://www.meshy.ai/):** Vá em *Image to 3D*, envie a foto do Luigi ou da Letícia, gere a malha e exporte em **`.glb`**.
- **Rodin / Hyper3D (https://hyper3d.ai/):** Excelente fidelidade de rosto e roupas de bruxo a partir de uma única imagem frontal; exporte em **`.glb`**.

---

## 🎙️ Opcional: Como Colocar a Voz Real Gravada pela Letícia e pelo Luigi

O projeto já fala automaticamente em português com síntese de voz + balões mágicos 3D. Se você quiser gravar a voz real deles pelo celular (em `.mp3`), basta salvar os arquivos na pasta `public/audio/` com estes nomes:
- `public/audio/leticia_1.mp3` — *(Chamando o convidado para o fundo da sala)*
- `public/audio/leticia_2.mp3` — *(Pedindo para escolher uma varinha na mesa)*
- `public/audio/leticia_3.mp3` — *(Mandando voltar até a mesa da professora onde está o Luigi)*
- `public/audio/luigi_1.mp3` — *(Ensinando a fazer o Wingardium Leviosa na pena branca)*
- `public/audio/luigi_2.mp3` — *(Comemorando quando a pena flutua)*

