// O pacote `server-only` resolve para a entrada de cliente fora do bundler do
// Next e lanca no import. Nos testes de integracao ja estamos em Node, entao
// substituimos por um modulo vazio.
export {};
