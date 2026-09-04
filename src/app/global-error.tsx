"use client";

/**
 * Fronteira de ultimo recurso: erro no proprio layout raiz.
 *
 * Substitui o documento inteiro, entao precisa dos proprios <html> e <body> e
 * nao recebe o CSS global (por isso o estilo vem inline). E a unica tela do
 * produto que nao pode depender de nada do app ter carregado.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="pt-BR">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          padding: "24px",
          textAlign: "center",
          fontFamily:
            "Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          color: "#2E3440",
          background: "#ffffff",
        }}
      >
        <title>Erro · Finort</title>

        <h1 style={{ fontSize: "20px", fontWeight: 600, margin: 0 }}>
          O Finort não conseguiu carregar
        </h1>
        <p style={{ margin: 0, color: "#6b7280", maxWidth: "28rem" }}>
          Tente de novo em instantes. Se continuar, avise o suporte informando o
          código abaixo.
        </p>

        {error.digest && (
          <code style={{ fontSize: "12px", color: "#6b7280" }}>
            {error.digest}
          </code>
        )}

        <button
          onClick={retry}
          style={{
            marginTop: "12px",
            cursor: "pointer",
            borderRadius: "6px",
            border: "none",
            background: "#1B2A4A",
            color: "#ffffff",
            padding: "10px 18px",
            fontSize: "14px",
            fontFamily: "inherit",
          }}
        >
          Tentar de novo
        </button>
      </body>
    </html>
  );
}
