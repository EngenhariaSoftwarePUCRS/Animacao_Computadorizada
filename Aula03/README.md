# Aula 03 - Introdução e Técnicas de Animação

## Tradicional

A animação tradicional, também conhecida como animação 2D, é um método clássico de criação de animações onde cada quadro é desenhado à mão. Os animadores criam uma série de desenhos que, quando exibidos em sequência, dão a ilusão de movimento. Este processo pode ser demorado, mas permite um alto nível de controle artístico e detalhamento.

## Keyframing

Keyframing é uma técnica de animação onde o animador define pontos-chave (keyframes) em momentos específicos da animação. O software de animação então interpola os quadros entre esses keyframes para criar um movimento suave. Esta técnica é amplamente utilizada em animação digital, permitindo que os animadores criem movimentos complexos com menos esforço.

### Visemas (e fonemas)

Visemas são as formas visuais dos sons da fala. Eles representam os movimentos dos lábios, língua e mandíbula durante a produção de sons específicos. Na animação, os visemas são usados para sincronizar a fala dos personagens com os movimentos faciais, criando uma representação visual mais realista da fala.

## Performance-based

### Warping e Morphing

Warping é uma técnica de animação que envolve a distorção de uma imagem ou modelo para criar um efeito visual. Morphing, por outro lado, é um processo de transformação suave entre duas imagens ou modelos, onde um se transforma gradualmente no outro. Ambas as técnicas são amplamente utilizadas em animação para criar transições fluidas e efeitos visuais impressionantes.

Ex: Michael Jackson - Black or White

## Procedural

A animação procedural é um método onde os movimentos e comportamentos dos personagens ou objetos são gerados automaticamente por algoritmos, em vez de serem animados manualmente. Esta técnica é frequentemente usada para criar animações complexas e realistas, como simulações de multidões, fluidos ou tecidos, onde seria impraticável animar cada elemento individualmente.

### Sistemas de Particulas

Sistemas de partículas são uma técnica de animação procedural usada para simular fenômenos naturais como fogo, fumaça, chuva, neve e explosões. Eles consistem em um grande número de pequenas partículas que se movem e interagem de acordo com regras físicas, criando efeitos visuais dinâmicos e realistas.

Essencialmente um `for` criando milhares de particulas e outro aninhando gerando diversas posições estocasticamente randômicas.

### Comportamental

A animação comportamental é uma técnica onde os personagens ou objetos são animados com base em regras de comportamento, em vez de movimentos pré-definidos. Isso permite que os personagens reajam de maneira mais natural e realista ao ambiente e a outros personagens, criando uma experiência de animação mais dinâmica e envolvente. Esta técnica é frequentemente usada em jogos e simulações para criar personagens que podem tomar decisões e interagir de forma autônoma (ex: NPCs em jogos).

3 regras locais:

1. Separação: os agentes tentam evitar colisões com outros agentes próximos.
2. Alinhamento: os agentes tentam alinhar sua direção com a direção média dos agentes próximos.
3. Coesão: os agentes tentam se mover em direção à posição média dos agentes próximos.

### Física

- Partículas
- Corpos rígidos
- Corpos deformáveis
- Corpos articulados
