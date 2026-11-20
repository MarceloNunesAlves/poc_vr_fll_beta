# Instruções para trabalhar neste projeto

## Projeto e pontos de entrada

Esta experiência usa JavaScript ES modules, Three.js e Vite. Ela roda em modo imersivo no Meta Quest 3 pelo Meta Quest Browser e em modo desktop com teclado, mouse e botões na tela. Preserve os dois modos e o texto da interface em português do Brasil.

- `index.html` contém o HUD do operador e carrega `src/main.js`. Mantenha os IDs do HTML e as referências no JavaScript em sincronia.
- `src/main.js` coordena a máquina de estados, os controles desktop e WebXR, a calibração, a mídia de abertura e o reset entre convidados.
- `src/trainCabin.js` monta a cabine. `src/classroom.js` monta a sala, a cadeira, as varinhas e a pena. `src/characters.js` carrega os personagens e gerencia os balões e a animação de fala. `src/audio.js` gerencia a reprodução e os efeitos sonoros.
- `src/qrFloorAnchors.js` gera os marcadores do chão e calcula o alinhamento WebXR. `public/qrcodes.html` contém a versão imprimível e uma cópia do gerador.
- Consulte `src/main.js`, `public/` e `package.json` para confirmar o comportamento e os comandos atuais. O trecho do `README.md` sobre `intro360.mp4` descreve uma abertura anterior.

## Comportamentos a preservar

- Mantenha o fluxo de boas-vindas na cabine → vídeo `Visao_Trem.mp4` na janela esquerda → escurecimento → vídeo `Porta.mp4` à frente → escurecimento → despertar na sala → Letícia → escolha de uma das três varinhas → Luigi → feitiço na pena → celebração → retorno às boas-vindas.
- Mantenha a ação principal compartilhada por A, gatilho e comandos equivalentes do desktop. Preserve o avanço manual dos vídeos (`P` ou botão no HUD), a recentralização (`B` ou botão no HUD) e o reset (`R` ou botão no HUD). No reset, confirme que a fala e a mídia anterior param, a cadeira e as varinhas reaparecem, a varinha equipada some e a pena volta à posição inicial.
- Mantenha o HTTPS de desenvolvimento, a referência WebXR `local-floor` e a abertura da sessão sem `image-tracking` quando o recurso estiver indisponível. A experiência deve iniciar e permitir recentralização sem marcadores físicos.
- Preserve a área de 1,5 m no eixo X por 4,0 m no eixo Z. A Letícia fica no sentido de `-Z` e o Luigi no de `+Z`. Ao alterar geometria ou locomoção, confira juntos os limites do jogador, o tapete, as posições de interação e os marcadores. Para mudanças de QR, mantenha o desenho, a ordem, as sementes e a orientação dos quatro marcadores consistentes entre o gerador WebXR e a página imprimível. Cada marcador mede 20 cm × 20 cm e aponta para `-Z`.
- Mantenha a inicialização de áudio e vídeo por interação do usuário e a proteção contra callbacks de mídia que chegam depois de uma transição ou reset. Preserve as alternativas de carregamento de modelo e voz. Para as chaves `leticia_1` a `leticia_3` e `luigi_1` a `luigi_2`, o código tenta MP3 e WAV e pode recorrer à síntese de voz.

## Build e arquivos versionados

- Use as versões do `package-lock.json` ao instalar dependências. Se precisar usar `npm ci`, prefira uma cópia de trabalho isolada, pois ele recria `node_modules/` e esse diretório está versionado. Revise alterações no lockfile junto com qualquer mudança de dependência.
- Faça alterações de código e mídia na origem (`src/`, `index.html`, `public/` ou configuração do Vite). Preserve a capitalização dos nomes em `public/`, pois URLs como `/video/Visao_Trem.mp4` e `/video/Porta.mp4` são sensíveis a maiúsculas no servidor. Quando a entrega incluir `dist/`, gere-o pelo Vite e confira se o HTML aponta para o bundle gerado.
- Para validar mudanças de código, configuração ou mídia, gere o build em um diretório temporário a partir da raiz do projeto.

  ```sh
  vr_build_dir=$(mktemp -d) && npm run build -- --outDir "$vr_build_dir"
  ```

- Use `npm run dev` para testar em desktop e, no Meta Quest 3 na mesma rede, abra o endereço HTTPS de rede exibido pelo Vite. Confira `git status --short` ao final, inclusive por alterações incidentais em `dist/` ou `node_modules/`.

## Validação funcional

O `package.json` atual não define scripts de teste ou lint. O build valida o empacotamento. Para mudanças de comportamento, execute os cenários abaixo conforme as áreas afetadas.

- **Desktop** — inicie com Espaço ou pelo HUD. Confira os dois vídeos e a opção de pulá-los. Use WASD ou setas para caminhar. Pegue uma varinha, lance o feitiço e volte às boas-vindas. Inicie uma segunda rodada para conferir o reset de áudio, vídeos, objetos e diálogo.
- **Meta Quest 3** — entre no modo imersivo pelo HTTPS. Confira A, B, gatilho, analógico e o movimento físico dentro da área. Verifique orientação dos vídeos, áudio, alinhamento da sala e rastreamento da varinha na mão ativa. Teste sem marcadores. Se alterar a calibração por QR, teste também a impressão em escala real e o alinhamento com os marcadores em um navegador que ofereça `image-tracking`.
- Informe na entrega quais verificações foram executadas e quais ficaram pendentes, incluindo teste em headset quando a mudança afetar WebXR e o dispositivo estiver indisponível.
